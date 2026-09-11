import {
  readFileSync,
  mkdirSync,
  openSync,
  writeFileSync,
  fsyncSync,
  closeSync,
  renameSync,
  unlinkSync,
} from "node:fs";
import { fileIntegrity, assertSourcePermission } from "./domain.ts";
import { dirname } from "node:path";
import { today, type Context, type Command } from "./types.ts";
import type { Config } from "./config.ts";

type Kind = "video" | "image" | "text";
export interface Post {
  id: string;
  artifactId: string;
  kind: Kind;
  origin: string;
  date: string;
  scheduledAt: string;
  status:
    | "planned"
    | "submitting"
    | "uncertain"
    | "scheduled"
    | "published"
    | "cancelling"
    | "cancelled"
    | "failed";
  remoteId?: string;
  publishedAt?: string;
  lastError?: string;
  cancelRequested?: boolean;
}
const kinds: Kind[] = ["video", "image", "text"];
const active = (p: Post) => !["cancelled", "failed"].includes(p.status);
function publicConfig(config: Config): Config {
  const result = structuredClone(config);
  delete result.integrations;
  return result;
}
function eligible(ctx: Context, artifact: any, scheduledAt?: string): boolean {
  try {
    if (!artifact || artifact.status !== "approved") return false;
    fileIntegrity(artifact.filePath, artifact.versions?.at(-1)?.integrity, true);
    const requiredAt = new Date(
      Math.max(ctx.now().getTime(), scheduledAt ? Date.parse(scheduledAt) : 0)
    );
    for (const id of artifact.sourceIds ?? []) {
      assertSourcePermission(ctx.store.get("sources", id), requiredAt, {
        requireStoredIntegrity: true,
      });
    }
    return true;
  } catch {
    return false;
  }
}
function dateAt(date: string, minute: number) {
  return new Date(Date.parse(`${date}T00:00:00+06:00`) + minute * 60000).toISOString();
}
function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}
function range(ctx: Context, command: Command) {
  const start = command.startDate ?? today(ctx),
    days = command.days ?? ctx.config.reserve.minimumDays;
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(start) ||
    Number.isNaN(Date.parse(start)) ||
    addDays(start, 0) !== start
  )
    throw new Error("Invalid planning date");
  if (!Number.isSafeInteger(days) || days < 1 || days > 3650)
    throw new Error("Planning days must be between 1 and 3650");
  return Array.from({ length: days }, (_, i) => addDays(start, i));
}
function quota(config: Config): Record<Kind, number> {
  return { video: config.daily.videos, image: config.daily.images, text: config.daily.texts };
}
function windows(config: Config): number[] {
  const saved =
    config.posting.windows ?? JSON.parse(readFileSync(config.posting.windowsFile, "utf8")).windows;
  const spacing = config.posting.minSpacingMinutes;
  if (!spacing || !Number.isFinite(spacing) || spacing <= 0)
    throw new Error("Posting spacing must be established during setup");
  if (!Array.isArray(saved) || !saved.length) throw new Error("Saved posting windows are required");
  const minutes = new Set<number>();
  for (const w of saved) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(w.start) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(w.end))
      throw new Error("Invalid posting window");
    const parse = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const start = parse(w.start),
      end = parse(w.end);
    if (end < start) throw new Error("Posting windows must end on the same day after their start");
    for (let m = start; m <= end; m++) minutes.add(m);
  }
  return [...minutes].sort((a, b) => a - b);
}
function slots(
  ctx: Context,
  config: Config,
  date: string,
  count: number,
  existing: Post[],
  earliest = ctx.now().getTime()
): string[] {
  if (!count) return [];
  const spacing = config.posting.minSpacingMinutes! * 60000;
  const available = windows(config)
    .map((m) => Date.parse(dateAt(date, m)))
    .filter(
      (t) =>
        t > earliest && existing.every((p) => Math.abs(t - Date.parse(p.scheduledAt)) >= spacing)
    );
  // Suffix capacity makes each random choice preserve room for the rest of the quota.
  const chosen: number[] = [];
  let candidates = available;
  while (chosen.length < count) {
    const needed = count - chosen.length,
      capacity: number[] = Array(candidates.length).fill(1);
    for (let i = candidates.length - 1; i >= 0; i--) {
      let low = i + 1,
        high = candidates.length;
      while (low < high) {
        const mid = Math.floor((low + high) / 2);
        if (candidates[mid] - candidates[i] < spacing) low = mid + 1;
        else high = mid;
      }
      capacity[i] = 1 + (capacity[low] ?? 0);
    }
    const viable = candidates.filter((_, i) => capacity[i] >= needed);
    if (!viable.length)
      throw new Error(`Posting window/spacing conflict on ${date}: cannot fit ${count} posts`);
    const t =
      viable[Math.min(viable.length - 1, Math.max(0, Math.floor(ctx.random() * viable.length)))];
    chosen.push(t);
    candidates = candidates.filter((v) => v - t >= spacing);
  }
  return chosen.map((t) => new Date(t).toISOString());
}
function coverage(ctx: Context, command: Command) {
  const posts = ctx.store.all<Post>("posts"),
    artifacts = ctx.store.all<any>("artifacts");
  const days = range(ctx, command).map((date) => {
    const config = ctx.store.get<any>("plans", date)?.config ?? ctx.config;
    const expected = quota(config),
      actual = { video: 0, image: 0, text: 0 },
      sources = new Set<string>();
    for (const p of posts.filter((p) => p.date === date && p.origin !== "custom" && active(p))) {
      const a = artifacts.find((a) => a.id === p.artifactId);
      if (!eligible(ctx, a, p.scheduledAt) || a.topic !== config.topic || !p.scheduledAt) continue;
      if (
        p.kind === "video" &&
        (!a.sourceIds?.length || a.sourceIds.some((s: string) => sources.has(s)))
      )
        continue;
      for (const s of a.sourceIds ?? []) sources.add(s);
      actual[p.kind]++;
    }
    const missing = {
      video: Math.max(0, expected.video - actual.video),
      image: Math.max(0, expected.image - actual.image),
      text: Math.max(0, expected.text - actual.text),
    };
    return { date, expected, actual, missing, complete: kinds.every((k) => missing[k] === 0) };
  });
  return { completeDays: days.filter((d) => d.complete).length, requiredDays: days.length, days };
}
function makePlans(ctx: Context, command: Command) {
  return ctx.store.transaction(() => {
    // Hoist: posting windows and spacing are global config — never change per date.
    const cachedWins = windows(ctx.config);
    const cachedSpacingMs = (ctx.config.posting.minSpacingMinutes ?? 0) * 60000;
    function cachedSlots(
      slotCtx: Context,
      config: Config,
      date: string,
      count: number,
      existing: Post[],
      earliest = slotCtx.now().getTime()
    ): string[] {
      if (!count) return [];
      const available = cachedWins
        .map((m) => Date.parse(dateAt(date, m)))
        .filter(
          (t) =>
            t > earliest &&
            existing.every((p) => Math.abs(t - Date.parse(p.scheduledAt)) >= cachedSpacingMs)
        );
      const chosen: number[] = [];
      let candidates = available;
      while (chosen.length < count) {
        const needed = count - chosen.length,
          capacity: number[] = Array(candidates.length).fill(1);
        for (let i = candidates.length - 1; i >= 0; i--) {
          let low = i + 1,
            high = candidates.length;
          while (low < high) {
            const mid = Math.floor((low + high) / 2);
            if (candidates[mid] - candidates[i] < cachedSpacingMs) low = mid + 1;
            else high = mid;
          }
          capacity[i] = 1 + (capacity[low] ?? 0);
        }
        const viable = candidates.filter((_, i) => capacity[i] >= needed);
        if (!viable.length)
          throw new Error(`Posting window/spacing conflict on ${date}: cannot fit ${count} posts`);
        const t =
          viable[
            Math.min(viable.length - 1, Math.max(0, Math.floor(slotCtx.random() * viable.length)))
          ];
        chosen.push(t);
        candidates = candidates.filter((v) => v - t >= cachedSpacingMs);
      }
      return chosen.map((t) => new Date(t).toISOString());
    }
    for (const date of range(ctx, command)) {
      const old = ctx.store.get<any>("plans", date);
      const config = old?.config ?? publicConfig(ctx.config);
      ctx.store.put("plans", { ...old, id: date, date, config });
      const posts = ctx.store.all<Post>("posts");
      const dayPosts = posts.filter((p) => p.date === date && p.origin !== "custom" && active(p));
      const allocated = new Set(
        posts.filter((p) => active(p) || p.publishedAt).map((p) => p.artifactId)
      );
      const sources = new Set<string>();
      for (const p of dayPosts)
        for (const s of ctx.store.get<any>("artifacts", p.artifactId)?.sourceIds ?? [])
          sources.add(s);
      const expected = quota(config),
        selected: any[] = [];
      // Configuration capacity is independent of how many approved artifacts exist.
      cachedSlots(
        { ...ctx, random: () => 0 },
        config,
        date,
        kinds.reduce((sum, k) => sum + expected[k], 0),
        [],
        -Infinity
      );
      const library = ctx.store
        .all<any>("artifacts")
        .filter(
          (a) =>
            eligible(ctx, a, dateAt(date, 1439)) &&
            a.origin !== "custom" &&
            a.topic === config.topic &&
            !allocated.has(a.id)
        )
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      for (const kind of kinds) {
        let remaining = Math.max(
          0,
          expected[kind] - dayPosts.filter((p) => p.kind === kind).length
        );
        while (remaining > 0) {
          const eligible = library.filter(
            (a) =>
              a.kind === kind &&
              !selected.includes(a) &&
              (kind !== "video" || (a.sourceIds?.length === 1 && !sources.has(a.sourceIds[0])))
          );
          const a =
            eligible.find((a) => !selected.some((s) => s.ageSegment === a.ageSegment)) ??
            eligible[0];
          if (!a) break;
          selected.push(a);
          for (const s of a.sourceIds ?? []) sources.add(s);
          remaining--;
        }
      }
      let times: string[] = [];
      while (selected.length) {
        try {
          times = cachedSlots(ctx, config, date, selected.length, posts.filter(active));
          break;
        } catch (error) {
          if (date !== today(ctx)) throw error;
          selected.pop();
        }
      }
      selected.forEach((a, i) =>
        ctx.store.put("posts", {
          id: ctx.id(),
          artifactId: a.id,
          kind: a.kind,
          origin: a.origin,
          date,
          scheduledAt: times[i],
          status: "planned",
        })
      );
    }
    return coverage(ctx, command);
  });
}
function exportQueue(ctx: Context) {
  return ctx.store.transaction(() => exportQueueLocked(ctx));
}
function exportQueueLocked(ctx: Context) {
  const target = ctx.config.posting.queueCsvPath,
    temp = `${target}.${ctx.id()}.tmp`;
  const header = [
    "queue_id",
    "artifact_id",
    "content_type",
    "topic",
    "age_segment",
    "file_path",
    "caption_or_text",
    "source_video_ids",
    "scheduled_at",
    "timezone",
    "status",
    "facebook_post_id",
    "published_at",
    "last_error",
  ];
  const quote = (value: unknown) => {
    const text = String(value ?? "");
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = ctx.store.all<Post>("posts").map((p) => {
    const a = ctx.store.get<any>("artifacts", p.artifactId) ?? {};
    return [
      p.id,
      p.artifactId,
      p.kind,
      a.topic,
      a.ageSegment,
      a.filePath,
      a.caption,
      (a.sourceIds ?? []).join(";"),
      p.scheduledAt,
      ctx.config.timezone,
      p.status,
      p.remoteId,
      p.publishedAt,
      p.lastError,
    ]
      .map(quote)
      .join(",");
  });
  try {
    mkdirSync(dirname(target), { recursive: true });
    const fd = openSync(temp, "wx", 0o600);
    try {
      writeFileSync(
        fd,
        header.join(",") + "\r\n" + rows.join("\r\n") + (rows.length ? "\r\n" : ""),
        "utf8"
      );
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    renameSync(temp, target);
    const dir = openSync(dirname(target), "r");
    try {
      fsyncSync(dir);
    } finally {
      closeSync(dir);
    }
    ctx.store.put("meta", {
      id: "queue-export",
      stale: false,
      exportedAt: ctx.now().toISOString(),
    });
    return { path: target, rows: rows.length, stale: false };
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch {}
    ctx.store.put("meta", { id: "queue-export", stale: true, lastError: String(error) });
    return { path: target, stale: true, lastError: String(error) };
  }
}
async function reconcile(ctx: Context) {
  const facebook = ctx.adapters.facebook;
  for (const p of ctx.store
    .all<Post>("posts")
    .filter((p) => ["submitting", "uncertain", "scheduled", "cancelling"].includes(p.status))) {
    if (!facebook?.reconcile) continue;
    try {
      const result = await facebook.reconcile(p);
      if (result.status === "absent" && ["submitting", "uncertain"].includes(p.status))
        ctx.store.put("posts", {
          ...p,
          status: p.cancelRequested ? "cancelled" : "planned",
          lastError: undefined,
        });
      else if (["scheduled", "published", "cancelled"].includes(result.status)) {
        if (result.status !== "cancelled" && !result.remoteId && !p.remoteId)
          throw new Error("Reconciliation omitted remote identity");
        ctx.store.put("posts", {
          ...p,
          remoteId: result.remoteId ?? p.remoteId,
          status: result.status,
          publishedAt: result.publishedAt ?? p.publishedAt,
          lastError: undefined,
        });
        if (result.status === "scheduled" && p.cancelRequested && facebook.cancel) {
          const cancelling = {
            ...p,
            remoteId: result.remoteId ?? p.remoteId,
            status: "cancelling" as const,
          };
          ctx.store.put("posts", cancelling);
          try {
            const cancelled = await facebook.cancel(cancelling);
            if (cancelled.status === "cancelled")
              ctx.store.put("posts", { ...cancelling, status: "cancelled" });
          } catch (error) {
            ctx.store.put("posts", { ...cancelling, lastError: String(error) });
          }
        }
      }
    } catch (error) {
      ctx.store.put("posts", { ...p, lastError: String(error) });
    }
  }
}
async function publish(ctx: Context) {
  await reconcile(ctx);
  if (ctx.store.get<any>("meta", "scheduling")?.paused) return { paused: true };
  const fb = ctx.adapters.facebook;
  if (!fb?.bounds || !fb?.submit) throw new Error("Facebook adapter is not configured");
  const bounds = await fb.bounds(ctx.now());
  if (
    !Number.isFinite(bounds.minLeadMinutes) ||
    bounds.minLeadMinutes < 0 ||
    !Number.isFinite(bounds.maxLeadDays) ||
    bounds.maxLeadDays * 1440 <= bounds.minLeadMinutes
  )
    throw new Error("Facebook scheduling bounds are unavailable");
  for (const post of ctx.store
    .all<Post>("posts")
    .filter((p) => p.status === "planned" && !p.cancelRequested)) {
    let p = post;
    const earliest = ctx.now().getTime() + bounds.minLeadMinutes * 60000;
    if (Date.parse(p.scheduledAt) <= earliest) {
      let moved = false;
      for (let i = 0; i < ctx.config.reserve.minimumDays; i++) {
        const date = addDays(today(ctx), i);
        try {
          const datePosts = ctx.store
            .all<Post>("posts")
            .filter((other) => other.id !== p.id && active(other));
          const config = ctx.store.get<any>("plans", date)?.config ?? ctx.config;
          if (
            p.origin !== "custom" &&
            datePosts.filter(
              (other) => other.date === date && other.kind === p.kind && other.origin !== "custom"
            ).length >= quota(config)[p.kind]
          )
            continue;
          const a = ctx.store.get<any>("artifacts", p.artifactId);
          if (p.origin !== "custom" && a?.topic !== config.topic) continue;
          if (
            p.kind === "video" &&
            datePosts.some(
              (other) =>
                other.date === date &&
                other.kind === "video" &&
                ctx.store
                  .get<any>("artifacts", other.artifactId)
                  ?.sourceIds?.some((s: string) => a?.sourceIds?.includes(s))
            )
          )
            continue;
          const [time] = slots(ctx, config, date, 1, datePosts, earliest);
          p = { ...p, date, scheduledAt: time };
          ctx.store.put("posts", p);
          moved = true;
          break;
        } catch {}
      }
      if (!moved) {
        ctx.store.put("posts", {
          ...p,
          lastError: "No feasible future slot; retained for later planning",
        });
        continue;
      }
    }
    if (Date.parse(p.scheduledAt) > ctx.now().getTime() + bounds.maxLeadDays * 86400000) continue;
    if (ctx.store.get<any>("meta", "scheduling")?.paused) break;
    const artifact = ctx.store.get<any>("artifacts", p.artifactId);
    if (!eligible(ctx, artifact, p.scheduledAt)) {
      ctx.store.put("posts", {
        ...p,
        status: "failed",
        lastError:
          "Artifact approval, integrity, or source permission no longer permits publication",
      });
      continue;
    }
    ctx.store.put("posts", { ...p, status: "submitting" });
    try {
      const result = await fb.submit({ id: p.id, artifact, scheduledAt: p.scheduledAt });
      if (!result.remoteId || !["scheduled", "published"].includes(result.status))
        throw new Error("Invalid Facebook submission response");
      ctx.store.put("posts", {
        ...p,
        status: result.status,
        remoteId: result.remoteId,
        publishedAt: result.publishedAt,
        lastError: undefined,
      });
    } catch (error) {
      ctx.store.put("posts", { ...p, status: "uncertain", lastError: String(error) });
      await ctx.notify({ type: "publication-uncertain", postId: p.id, error: String(error) });
    }
  }
  return { posts: ctx.store.all("posts") };
}
async function cancel(ctx: Context, command: Command) {
  const selected = ctx.store
    .all<Post>("posts")
    .filter(
      (p) =>
        (!command.postIds || command.postIds.includes(p.id)) &&
        active(p) &&
        p.status !== "published"
    );
  for (const p of selected) ctx.store.put("posts", { ...p, cancelRequested: true });
  await reconcile(ctx);
  for (const selectedPost of selected) {
    const p = ctx.store.get<Post>("posts", selectedPost.id)!;
    if (p.status === "planned") ctx.store.put("posts", { ...p, status: "cancelled" });
    else if (["scheduled", "cancelling"].includes(p.status) && ctx.adapters.facebook?.cancel) {
      ctx.store.put("posts", { ...p, status: "cancelling" });
      try {
        const result = await ctx.adapters.facebook.cancel(p);
        if (result.status === "cancelled") ctx.store.put("posts", { ...p, status: "cancelled" });
      } catch (error) {
        ctx.store.put("posts", { ...p, status: "cancelling", lastError: String(error) });
      }
    }
  }
  return { posts: ctx.store.all("posts") };
}
async function runPlanning(ctx: Context, command: Command): Promise<unknown> {
  if (command.type === "coverage") return coverage(ctx, command);
  if (command.type === "export-queue") return exportQueue(ctx);
  let result: unknown;
  switch (command.type) {
    case "plan": {
      const changed = ctx.store
        .all<any>("plans")
        .some(
          (p) =>
            p.date > today(ctx) &&
            (p.config.topic !== ctx.config.topic ||
              JSON.stringify(quota(p.config)) !== JSON.stringify(quota(ctx.config)))
        );
      if (changed)
        await runPlanning(ctx, {
          type: "rebuild-plans",
          startDate: command.startDate,
          days: command.days,
        });
      result = makePlans(ctx, command);
      break;
    }
    case "pause":
      if (typeof command.paused !== "boolean") throw new Error("paused must be boolean");
      result = ctx.store.put("meta", { id: "scheduling", paused: command.paused });
      break;
    case "publish":
      result = await publish(ctx);
      break;
    case "reconcile":
      await reconcile(ctx);
      result = { posts: ctx.store.all("posts") };
      break;
    case "cancel":
      result = await cancel(ctx, command);
      break;
    case "rebuild-plans": {
      await reconcile(ctx);
      if (
        ctx.store
          .all<Post>("posts")
          .some((p) => ["submitting", "uncertain", "cancelling"].includes(p.status))
      )
        throw new Error("Reconcile uncertain Facebook actions before rebuilding plans");
      ctx.store.transaction(() => {
        for (const p of ctx.store.all<Post>("posts"))
          if (p.date > today(ctx) && p.status === "planned" && p.origin !== "custom")
            ctx.store.put("posts", {
              ...p,
              status: "cancelled",
              lastError: "Superseded by configuration rebuild",
            });
        for (const plan of ctx.store.all<any>("plans"))
          if (plan.date > today(ctx))
            ctx.store.put("plans", { ...plan, config: publicConfig(ctx.config) });
      });
      result = makePlans(ctx, {
        ...command,
        startDate: command.startDate ?? addDays(today(ctx), 1),
      });
      break;
    }
    case "schedule-custom": {
      result = ctx.store.transaction(() => {
        const a = ctx.store.get<any>("artifacts", command.artifactId);
        if (!a || a.origin !== "custom" || !eligible(ctx, a))
          throw new Error("An approved custom artifact is required");
        const posts = ctx.store.all<Post>("posts");
        const existing = posts.find((p) => p.artifactId === a.id && active(p));
        if (existing) return existing;
        const date = range(ctx, { type: "plan", startDate: command.date, days: 1 })[0];
        const [time] = slots(ctx, ctx.config, date, 1, posts.filter(active));
        if (!eligible(ctx, a, time))
          throw new Error("Custom artifact permission does not cover the scheduled time");
        return ctx.store.put("posts", {
          id: ctx.id(),
          artifactId: a.id,
          kind: a.kind,
          origin: "custom",
          date,
          scheduledAt: time,
          status: "planned",
        });
      });
      break;
    }
    default:
      throw new Error(`Unknown planning command: ${command.type}`);
  }
  const exported = exportQueue(ctx);
  if (exported.stale) await ctx.notify({ type: "queue-export-stale", ...exported });
  return result;
}

/** Fence asynchronous external actions across coordinators; SQLite owns the lease. */
export async function planning(ctx: Context, command: Command): Promise<unknown> {
  if (["coverage", "export-queue", "pause"].includes(command.type))
    return runPlanning(ctx, command);
  const owner = ctx.id(),
    key = "planning-lease";
  ctx.store.transaction(() => {
    const previous = ctx.store.get<any>("meta", key);
    if (previous?.owner && Date.parse(previous.until) > ctx.now().getTime())
      throw new Error("Planning/publication cycle already owned by another worker");
    ctx.store.put("meta", {
      id: key,
      owner,
      until: new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString(),
    });
  });
  const owned = () => {
    if (ctx.store.get<any>("meta", key)?.owner !== owner)
      throw new Error("Planning/publication ownership lost");
  };
  // A proxy checks ownership both before and after each remote await, including errors.
  const facebook = ctx.adapters.facebook;
  const guarded = facebook
    ? Object.fromEntries(
        ["bounds", "submit", "reconcile", "cancel"]
          .filter((name) => typeof facebook[name] === "function")
          .map((name) => [
            name,
            async (...args: any[]) => {
              owned();
              try {
                const result = await facebook[name](...args);
                owned();
                return result;
              } catch (error) {
                owned();
                throw error;
              }
            },
          ])
      )
    : undefined;
  const guardedStore = new Proxy(ctx.store, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== "function") return value;
      return (...args: any[]) => {
        owned();
        return value.apply(target, args);
      };
    },
  });
  const timer = setInterval(
    () => {
      ctx.store.transaction(() => {
        if (ctx.store.get<any>("meta", key)?.owner === owner)
          ctx.store.put("meta", {
            id: key,
            owner,
            until: new Date(ctx.now().getTime() + ctx.config.limits.leaseMs).toISOString(),
          });
      });
    },
    Math.max(100, Math.floor(ctx.config.limits.leaseMs / 3))
  );
  timer.unref();
  try {
    return await runPlanning(
      { ...ctx, store: guardedStore, adapters: { ...ctx.adapters, facebook: guarded } },
      command
    );
  } finally {
    clearInterval(timer);
    ctx.store.transaction(() => {
      if (ctx.store.get<any>("meta", key)?.owner === owner)
        ctx.store.put("meta", { id: key, owner: null, until: ctx.now().toISOString() });
    });
  }
}
