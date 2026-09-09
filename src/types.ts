import type { Store } from "./store.ts";
import type { Config } from "./config.ts";

/** Serialized application commands are shared by the CLI, coordinator, and Hermes. */
export interface Command {
  type: string;
  [key: string]: any;
}
export interface Context {
  store: Store;
  config: Config;
  adapters: Record<string, any>;
  now(): Date;
  random(): number;
  id(): string;
  mission: { version: string; text: string };
  notify(event: unknown): Promise<void>;
}
export function today(ctx: Context): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ctx.config.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ctx.now());
}
