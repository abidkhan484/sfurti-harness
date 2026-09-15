import type { Command, Context } from "./types.ts";
import { TelegramOperator } from "./adapters/telegram.ts";

/** Each lifecycle progresses even if an unrelated integration is unavailable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serviceCycle(ctx: Context, execute: (command: Command) => Promise<any>) {
  const errors: Record<string, string> = {};
  const results: Record<string, unknown> = {};
  const attempt = async (name: string, work: () => Promise<unknown>) => {
    try {
      results[name] = await work();
    } catch (error) {
      errors[name] = String(error);
    }
  };
  const telegram = ctx.adapters.telegram;
  if (telegram?.transport)
    await attempt("telegram", async () => {
      const operator = new TelegramOperator({ ...telegram, app: { execute } });
      const updates = await telegram.transport.call("telegram.poll", {});
      if (!Array.isArray(updates) || updates.length > 100)
        throw new Error("Telegram poll must return at most 100 updates");
      // Receipt precedes processing/offset acknowledgement so a crash cannot lose an operator command.
      for (const update of updates) {
        const id = Number((update as Record<string, unknown>)?.update_id);
        if (!Number.isSafeInteger(id) || id < 0)
          throw new Error("Telegram update requires a nonnegative integer ID");
        ctx.store.transaction(() => {
          if (!ctx.store.get("telegram_updates", String(id)))
            ctx.store.put("telegram_updates", {
              id: String(id),
              updateId: id,
              update,
              status: "received",
              receivedAt: ctx.now().toISOString(),
            });
        });
      }
      for (const update of updates) {
        const id = String((update as Record<string, unknown>).update_id);
        const receipt = ctx.store.get("telegram_updates", id);
        if (receipt?.status === "processed" || receipt?.status === "ignored") continue;
        try {
          await operator.dispatch(update);
          ctx.store.put("telegram_updates", {
            id,
            ...receipt,
            status: "processed",
            processedAt: ctx.now().toISOString(),
          });
        } catch (error) {
          errors[`telegram:${update?.update_id}`] = String(error);
          ctx.store.put("telegram_updates", {
            id,
            ...receipt,
            status: "held",
            lastError: String(error),
          });
        }
      }
    });
  if (ctx.config.deployment?.profile === "pi-free") {
    // Independent bounded local phases: failures are recorded without starving
    // production, reconciliation, or notifications.
    await attempt("intake", () => execute({ type: "intake-scan" }));
    if (ctx.adapters.discovery)
      await attempt("discovery", () => execute({ type: "discover", topic: ctx.config.topic }));
    const pending = ctx.store
      .all("sources")
      .find((source) => source.status === "imported" || source.status === "cleared");
    if (pending)
      await attempt("qualification", () =>
        execute({
          type: "qualify-source",
          sourceId: pending.id,
          requestId: `service-qualify:${pending.id}`,
        })
      );
  }
  await attempt("production", () => execute({ type: "tick" }));
  // Preview progresses local work and read-only reconciliation, never a write.
  await attempt("publication", () =>
    execute(
      ctx.config.deployment?.executionMode === "preview"
        ? { type: "reconcile" }
        : { type: "publish" }
    )
  );
  await attempt("notifications", () => execute({ type: "drain-notifications" }));
  return { results, errors };
}
