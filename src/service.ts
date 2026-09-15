import type { Command, Context } from "./types.ts";
import { TelegramOperator } from "./adapters/telegram.ts";

/** Each lifecycle progresses even if an unrelated integration is unavailable. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function serviceCycle(ctx: Context, execute: (command: Command) => Promise<any>) {
  const errors: Record<string, string> = {};
  const results: Record<string, unknown> = {};
  const attempt = async (
    name: string,
    work: () => Promise<unknown>,
    dueMs = 0,
    permits: string[] = []
  ) => {
    const id = `service:${name}`;
    const owner = ctx.id();
    const claim = ctx.store.transaction(() => {
      const previous = ctx.store.get("service_tasks", id);
      const now = ctx.now().getTime();
      if (previous?.status === "running" && Date.parse(previous.leaseUntil) > now)
        return false;
      if (previous?.nextRunAt && Date.parse(previous.nextRunAt) > now) return false;
      for (const permit of permits) {
        const holder = ctx.store.get("service_tasks", `permit:${permit}`);
        if (holder?.owner !== owner && Date.parse(holder?.leaseUntil ?? "") > now) return false;
      }
      ctx.store.put("service_tasks", {
        ...previous,
        id,
        phase: name,
        status: "running",
        owner,
        attempt: (previous?.attempt ?? 0) + 1,
        startedAt: ctx.now().toISOString(),
        leaseUntil: new Date(now + ctx.config.limits.leaseMs).toISOString(),
      });
      for (const permit of permits)
        ctx.store.put("service_tasks", {
          id: `permit:${permit}`,
          phase: "permit",
          permit,
          owner,
          leaseUntil: new Date(now + ctx.config.limits.leaseMs).toISOString(),
        });
      return true;
    });
    if (!claim) {
      results[name] = { status: "not-due-or-leased" };
      return;
    }
    let ownershipLost = false;
    const renew = () =>
      ctx.store.transaction(() => {
        const current = ctx.store.get("service_tasks", id);
        if (current?.owner !== owner) {
          ownershipLost = true;
          return;
        }
        const leaseUntil = new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString();
        ctx.store.put("service_tasks", { ...current, leaseUntil });
        for (const permit of permits) {
          const holder = ctx.store.get("service_tasks", `permit:${permit}`);
          if (holder?.owner !== owner) ownershipLost = true;
          else ctx.store.put("service_tasks", { ...holder, leaseUntil });
        }
      });
    const heartbeat = setInterval(renew, Math.max(100, Math.floor(ctx.config.limits.leaseMs / 3)));
    try {
      results[name] = await work();
      if (ownershipLost) throw new Error(`Service phase ${name} lost its lease`);
      ctx.store.transaction(() => {
        const current = ctx.store.get("service_tasks", id);
        if (current?.owner === owner)
          ctx.store.put("service_tasks", {
            ...current,
            status: "completed",
            completedAt: ctx.now().toISOString(),
            nextRunAt: new Date(ctx.now().getTime() + dueMs).toISOString(),
            result: results[name],
          });
      });
    } catch (error) {
      errors[name] = String(error);
      ctx.store.transaction(() => {
        const current = ctx.store.get("service_tasks", id);
        if (current?.owner === owner)
          ctx.store.put("service_tasks", {
            ...current,
            status: "deferred",
            lastError: String(error),
            nextRunAt: new Date(ctx.now().getTime() + ctx.config.limits.backoffMs).toISOString(),
          });
      });
    } finally {
      clearInterval(heartbeat);
      ctx.store.transaction(() => {
        for (const permit of permits) {
          const holder = ctx.store.get("service_tasks", `permit:${permit}`);
          if (holder?.owner === owner)
            ctx.store.put("service_tasks", {
              ...holder,
              owner: null,
              leaseUntil: ctx.now().toISOString(),
            });
        }
      });
    }
  };
  const phases: Array<Promise<void>> = [];
  const telegram = ctx.adapters.telegram;
  if (telegram?.transport)
    phases.push(attempt("telegram", async () => {
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
      const pendingUpdates = ctx.store
        .all("telegram_updates")
        .filter((receipt) => ["received", "held"].includes(receipt.status))
        .slice(0, 100);
      for (const receipt of pendingUpdates) {
        const update = receipt.update;
        try {
          await operator.dispatch(update);
          ctx.store.put("telegram_updates", {
            ...receipt,
            status: "processed",
            processedAt: ctx.now().toISOString(),
          });
        } catch (error) {
          errors[`telegram:${update?.update_id}`] = String(error);
          ctx.store.put("telegram_updates", {
            ...receipt,
            status: "held",
            lastError: String(error),
          });
        }
      }
    }, 0));
  if (ctx.config.deployment?.profile === "pi-free") {
    // Independent bounded local phases: failures are recorded without starving
    // production, reconciliation, or notifications.
    phases.push(
      attempt("intake", () => execute({ type: "intake-scan" }), ctx.config.deployment.intake.scanSeconds * 1000)
    );
    if (ctx.adapters.discovery)
      phases.push(
        attempt("discovery", () => execute({ type: "discover", topic: ctx.config.topic }), 60_000, ["codex"])
      );
    const pending = ctx.store
      .all("sources")
      .find((source) => source.status === "imported" || source.status === "cleared");
    if (pending)
      phases.push(attempt("qualification", () =>
        execute({
          type: "qualify-source",
          sourceId: pending.id,
          requestId: `service-qualify:${pending.id}`,
        }), 0, ["native-heavy", "codex"]));
  }
  phases.push(attempt("production", () => execute({ type: "tick" }), 0, ["native-heavy", "codex"]));
  // Preview progresses local work and read-only reconciliation, never a write.
  phases.push(attempt("publication", () =>
    execute(
      ctx.config.deployment?.executionMode === "preview"
        ? { type: "reconcile" }
        : { type: "publish" }
    )
  ));
  if (ctx.config.deployment?.executionMode !== "preview")
    phases.push(attempt("notifications", () => execute({ type: "drain-notifications" })));
  else results.notifications = { status: "queued-in-preview" };
  await Promise.all(phases);
  return { results, errors };
}
