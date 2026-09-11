import { AdapterError, isRecord, type OperationAdapter } from "./process.ts";
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
