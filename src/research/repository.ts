import type { ClaimVersion, ContentDependency, MemoryJob, ResearchEvent } from "./contracts.ts";
import type { Store } from "../store.ts";

export class ResearchRepository {
  private readonly store: Store;
  constructor(store: Store) {
    this.store = store;
  }

  saveDraft<T extends { id: string; status?: string; revision?: number }>(
    collection: string,
    record: T,
    expectedRevision?: number
  ): T {
    return this.store.transaction(() => {
      const prior = this.store.get<T>(collection, record.id);
      if (expectedRevision !== undefined && prior?.revision !== expectedRevision)
        throw new Error(`Optimistic revision conflict for ${record.id}`);
      return this.store.put(collection, record);
    });
  }

  transition<T extends { id: string; status?: string }>(
    collection: string,
    id: string,
    toState: string,
    event: Omit<
      ResearchEvent,
      "id" | "schemaVersion" | "createdAt" | "updatedAt" | "entityId" | "fromState" | "toState"
    >
  ): T {
    return this.store.transaction(() => {
      const prior = this.store.get<T>(collection, id);
      if (!prior || !prior.status) throw new Error(`No transitionable record: ${id}`);
      const allowed: Record<string, string[]> = {
        draft: ["approved", "qualified", "deferred", "rejected", "superseded"],
        approved: ["expired", "withdrawn", "superseded"],
        qualified: ["expired", "withdrawn", "superseded"],
        pending: ["running", "failed"],
        running: ["ready", "failed", "pending"],
      };
      if (!allowed[prior.status]?.includes(toState))
        throw new Error(`Illegal transition ${prior.status} -> ${toState}`);
      const next = { ...prior, status: toState } as T;
      this.store.put(collection, next);
      this.store.put("research_events", {
        id: `event:${id}:${toState}:${event.actorTaskId}`,
        schemaVersion: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        entityType: event.entityType,
        entityId: id,
        fromState: prior.status,
        toState,
        reason: event.reason,
        actorTaskId: event.actorTaskId,
        policyVersion: event.policyVersion,
      });
      return next;
    });
  }

  saveClaimWithMemoryJob(claim: ClaimVersion, job: MemoryJob): void {
    this.store.transaction(() => {
      this.store.put("research_claims", claim);
      this.store.put("memory_jobs", job);
    });
  }

  dueTasks(now: string, limit = 50): MemoryJob[] {
    return this.store
      .all<MemoryJob>("memory_jobs")
      .filter((job) => job.status === "pending" && job.nextRunAt <= now)
      .sort((a, b) => a.nextRunAt.localeCompare(b.nextRunAt) || a.id.localeCompare(b.id))
      .slice(0, limit);
  }
  dependentsOfClaim(claimVersionId: string): ContentDependency[] {
    return this.store
      .all<ContentDependency>("content_dependencies")
      .filter((dependency) => dependency.claimVersionId === claimVersionId);
  }
  sourceVersions(sourceId: string) {
    return this.store
      .all<{ sourceId: string; fetchedAt: string }>("research_documents")
      .filter((document) => document.sourceId === sourceId)
      .sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  }
  list<T>(
    collection: string,
    cursor?: string,
    limit = 50
  ): { items: T[]; nextCursor: string | null } {
    const offset = cursor ? Number(cursor) : 0;
    const items = this.store.list<T>(collection, offset, limit);
    return { items, nextCursor: items.length === limit ? String(offset + items.length) : null };
  }
}
