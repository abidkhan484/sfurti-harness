import { AdapterError, isRecord, type OperationAdapter } from "./process.ts";
import { readFile, statSync } from "node:fs";
import { promisify } from "node:util";
import { basename } from "node:path";
import { resolveSecretFile } from "../deployment/secrets.ts";
import type { Store, RecordData } from "../store.ts";

const readFileAsync = promisify(readFile);

const hostedLimitBytes = 50 * 1024 * 1024;
export type TelegramHttp = (request: {
  url: string;
  body: FormData;
  signal?: AbortSignal;
}) => Promise<{ status: number; body: unknown }>;
/** Built-in private delivery with durable uncertainty instead of duplicate resend. */
export class TelegramDelivery {
  private readonly options: {
    operatorUserId: string;
    tokenFile: string;
    store: Store;
    request: TelegramHttp;
    endpoint?: string;
  };
  constructor(options: {
    operatorUserId: string;
    tokenFile: string;
    store: Store;
    request: TelegramHttp;
    endpoint?: string;
  }) {
    if (!/^[1-9]\d*$/.test(options.operatorUserId))
      throw new AdapterError("configuration", "Telegram requires a positive operator user ID");
    this.options = options;
  }
  async send(
    input: { text: string; artifactPaths?: string[] },
    requestId: string,
    signal?: AbortSignal
  ) {
    const existing = this.options.store.get<RecordData>(
      "operation_journals",
      `telegram:${requestId}`
    );
    if (existing?.phase === "confirmed") return existing.result;
    if (existing?.uncertainty)
      throw new AdapterError(
        "transient",
        "Telegram delivery is held for explicit reconciliation",
        true
      );
    const paths = input.artifactPaths ?? [];
    for (const path of paths)
      if (!statSync(path).isFile() || statSync(path).size > hostedLimitBytes)
        throw new AdapterError(
          "rejected",
          "Telegram hosted Bot API attachment exceeds the 50 MiB limit"
        );
    const token = resolveSecretFile({ tokenFile: this.options.tokenFile }, "Telegram");
    this.options.store.put("operation_journals", {
      id: `telegram:${requestId}`,
      operationId: `telegram:${requestId}`,
      destinationIdentity: this.options.operatorUserId,
      selectedArtifactHash: paths.join(","),
      phase: "intent",
      requestFingerprint: requestId,
      attempt: (existing?.attempt ?? 0) + 1,
      remoteIds: [],
      lastConfirmedState: "none",
      uncertainty: false,
    });
    const body = new FormData();
    body.set("chat_id", this.options.operatorUserId);
    body.set("caption", input.text.slice(0, 1024));
    for (const [index, path] of paths.entries()) {
      const contents = await readFileAsync(path);
      body.append(index ? `document${index}` : "document", new Blob([contents]), basename(path));
    }
    let response: {
      status: number;
      body: { ok?: boolean; result?: { message_id?: number; document?: { file_id?: string } } };
    };
    try {
      response = (await this.options.request({
        url: `${this.options.endpoint ?? "https://api.telegram.org"}/bot${token}/${paths.length ? "sendDocument" : "sendMessage"}`,
        body,
        signal,
      })) as {
        status: number;
        body: { ok?: boolean; result?: { message_id?: number; document?: { file_id?: string } } };
      };
    } catch {
      this.options.store.put("operation_journals", {
        id: `telegram:${requestId}`,
        ...this.options.store.get<RecordData>("operation_journals", `telegram:${requestId}`),
        phase: "unknown",
        uncertainty: true,
        lastConfirmedState: "unknown",
      });
      throw new AdapterError(
        "transient",
        "Telegram response was lost; do not resend automatically",
        true
      );
    }
    if (response.status === 429)
      throw new AdapterError("rate_limit", "Telegram rate limited delivery", false);
    if (response.status < 200 || response.status >= 300 || response.body?.ok !== true)
      throw new AdapterError("transient", "Telegram rejected delivery", false);
    const result = {
      messageId: response.body.result?.message_id,
      fileId: response.body.result?.document?.file_id,
    };
    this.options.store.put("operation_journals", {
      id: `telegram:${requestId}`,
      ...this.options.store.get<RecordData>("operation_journals", `telegram:${requestId}`),
      phase: "confirmed",
      uncertainty: false,
      remoteIds: [String(result.messageId ?? "")].filter(Boolean),
      lastConfirmedState: "sent",
      result,
    });
    return result;
  }
}
export interface ApplicationCommands {
  execute(command: { type: string; [key: string]: unknown }): Promise<unknown>;
}
export interface OperatorDelivery {
  deliver(message: { text: string; artifactPaths?: string[] }): Promise<void>;
}
export class TelegramOperator implements OperatorDelivery {
  operatorUserId: string;
  app: ApplicationCommands;
  transport?: OperationAdapter;
  constructor(options: {
    operatorUserId: string;
    app: ApplicationCommands;
    transport?: OperationAdapter;
  }) {
    if (!/^[1-9]\d*$/.test(options.operatorUserId))
      throw new AdapterError("configuration", "Telegram requires a positive operator user ID");
    this.operatorUserId = options.operatorUserId;
    this.app = options.app;
    this.transport = options.transport;
  }
  async dispatch(update: unknown): Promise<unknown> {
    if (!isRecord(update) || !isRecord(update.message)) return undefined;
    const message = update.message;
    if (
      !isRecord(message.from) ||
      !isRecord(message.chat) ||
      message.chat.type !== "private" ||
      String(message.from.id) !== this.operatorUserId ||
      String(message.chat.id) !== this.operatorUserId ||
      message.from.is_bot === true
    )
      return undefined;
    if (typeof message.text !== "string" || message.text.length > 16_384)
      throw new AdapterError("protocol", "Operator request must be a bounded JSON command");
    let command: unknown;
    try {
      command = JSON.parse(message.text);
    } catch {
      throw new AdapterError("protocol", "Operator request must be a JSON command with a type");
    }
    if (!isRecord(command) || typeof command.type !== "string")
      throw new AdapterError("protocol", "Operator request must include a command type");
    if (!Number.isSafeInteger(update.update_id) || Number(update.update_id) < 0)
      throw new AdapterError(
        "protocol",
        "Telegram update ID is required for durable deduplication"
      );
    return this.app.execute({
      ...command,
      type: command.type,
      commandId: `telegram:${update.update_id}`,
    });
  }
  async deliver(message: { text: string; artifactPaths?: string[] }): Promise<void> {
    if (!this.transport)
      throw new AdapterError("configuration", "Telegram delivery transport is not configured");
    await this.transport.call("telegram.deliver", { chatId: this.operatorUserId, ...message });
  }
}
