import { randomUUID, createHash } from "node:crypto";
import { readFileSync, mkdirSync, statfsSync, statSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Store } from "./store.ts";
import { loadConfig, type Config } from "./config.ts";
import { today, type Command, type Context } from "./types.ts";

export interface HarnessOptions {
  config?: Partial<Config> | Record<string, unknown>;
  env?: NodeJS.ProcessEnv;
  adapters?: Record<string, any>;
  clock?: () => Date;
  random?: () => number;
}
export function createHarness(options: HarnessOptions = {}) {
  const config = loadConfig(options.config, options.env);
  const store = new Store(config.storage.databasePath);
  mkdirSync(config.storage.mediaDirectory, { recursive: true });
  const missionText = readFileSync(new URL("../docs/mission.md", import.meta.url), "utf8");
  const adapters = {
    storage: {
      freeBytes: async () => {
        const fs = statfsSync(config.storage.mediaDirectory);
        return fs.bavail * fs.bsize;
      },
    },
    ...options.adapters,
  };
  const ctx: Context = {
    store,
    config,
    adapters,
    now: options.clock ?? (() => new Date()),
    random: options.random ?? Math.random,
    id: randomUUID,
    mission: { text: missionText, version: createHash("sha256").update(missionText).digest("hex") },
    async notify(event) {
      const { enqueueNotification } = await import("./notifications.ts");
      await enqueueNotification(ctx, event);
    },
  };
  function safeConfig() {
    const value = structuredClone(config);
    delete value.integrations;
    return value;
  }
  function snapshot() {
    return store.transaction(() => {
      const date = today(ctx);
      const previous = store.get("plans", date);
      if (previous?.snapshotSealed) return previous;
      return store.put("plans", {
        ...previous,
        id: date,
        date,
        config: safeConfig(),
        snapshotSealed: true,
        createdAt: ctx.now().toISOString(),
      });
    });
  }
  async function dispatch(command: Command): Promise<any> {
    if (!command || typeof command.type !== "string") throw new Error("A command type is required");
    switch (command.type) {
      case "service-cycle": {
        const { serviceCycle } = await import("./service.ts");
        return serviceCycle(ctx, execute);
      }
      case "drain-notifications": {
        const { drainNotifications } = await import("./notifications.ts");
        return drainNotifications(ctx);
      }
      case "config":
        return safeConfig();
      case "daily-snapshot":
        return snapshot();
      case "status":
        return Object.fromEntries(
          [
            "artifacts",
            "posts",
            "plans",
            "sources",
            "jobs",
            "tasks",
            "meta",
            "notifications",
            "reviews",
            "segments",
            "keywords",
            "matches",
          ].map((name) => [name, store.all(name)])
        );
      case "pending-sources":
        return store.all("sources").filter((s) => !s.permission);
      case "artifact": {
        const artifact = store.get("artifacts", command.artifactId);
        if (!artifact) throw new Error("Artifact not found");
        return artifact;
      }
      case "storage":
      case "cleanup-preview": {
        const files: Array<{ path: string; bytes: number }> = [];
        function walk(path: string) {
          for (const entry of readdirSync(path, { withFileTypes: true })) {
            const file = join(path, entry.name);
            if (entry.isDirectory()) walk(file);
            else if (entry.isFile()) files.push({ path: file, bytes: statSync(file).size });
          }
        }
        walk(config.storage.mediaDirectory);
        const fs = statfsSync(config.storage.mediaDirectory);
        return {
          files,
          totalBytes: files.reduce((sum, f) => sum + f.bytes, 0),
          freeBytes: fs.bavail * fs.bsize,
          deletionEnabled: false,
        };
      }
      case "doctor":
      case "backup": {
        const { maintenance } = await import("./maintenance.ts");
        return maintenance(ctx, command);
      }
      case "request":
      case "tick": {
        const coordinator = await import("./coordinator.ts");
        return command.type === "request"
          ? coordinator.request(ctx, command, execute)
          : coordinator.tick(ctx, command, execute);
      }
      case "discover":
      case "register-source":
      case "produce":
      case "retry-artifact": {
        const { production } = await import("./production.ts");
        if (command.origin === "daily") {
          const plan = snapshot();
          return production(
            { ...ctx, config: plan.config },
            { ...command, date: plan.date, topic: plan.config.topic }
          );
        }
        return production(ctx, command);
      }
      case "plan":
      case "coverage":
      case "publish":
      case "reconcile":
      case "cancel":
      case "pause":
      case "export-queue":
      case "rebuild-plans":
      case "schedule-custom": {
        const { planning } = await import("./planning.ts");
        return planning(ctx, command);
      }
      default:
        throw new Error(`Unknown command: ${command.type}`);
    }
  }
  async function execute(command: Command): Promise<any> {
    if (!command.commandId) return dispatch(command);
    if (typeof command.commandId !== "string" || command.commandId.length > 200)
      throw new Error("Invalid command identity");
    const fingerprint = createHash("sha256").update(JSON.stringify(command)).digest("hex");
    const id = `command:${command.commandId}`;
    const existing = store.transaction(() => {
      const previous = store.get("tasks", id);
      if (previous) {
        if (previous.fingerprint !== fingerprint)
          throw new Error("Identity belongs to a different command");
        return previous;
      }
      store.put("tasks", {
        id,
        fingerprint,
        status: "running",
        createdAt: ctx.now().toISOString(),
      });
      return undefined;
    });
    if (existing) {
      if (existing.status === "complete") {
        if (command.commandId.startsWith("telegram:"))
          await ctx.notify({
            type: "command-result",
            commandId: command.commandId,
            result: existing.result,
          });
        return existing.result;
      }
      if (existing.status === "failed") throw new Error(existing.error);
      return {
        status: "uncertain",
        commandId: command.commandId,
        message: "Command already accepted; inspect state before an explicit retry",
      };
    }
    try {
      const result = await dispatch({
        ...command,
        requestId: command.requestId ?? command.commandId,
      });
      store.put("tasks", { id, fingerprint, status: "complete", result: result ?? null });
      if (command.commandId.startsWith("telegram:"))
        await ctx.notify({ type: "command-result", commandId: command.commandId, result });
      return result;
    } catch (error) {
      store.put("tasks", { id, fingerprint, status: "failed", error: String(error) });
      throw error;
    }
  }
  return { execute, close: () => store.close() };
}
