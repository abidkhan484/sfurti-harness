import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RecordData {
  id: string;
  // Legacy JSON collections remain dynamically shaped. New research callers
  // use typed repository records rather than this compatibility fallback.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}
const collections = [
  "plans",
  "jobs",
  "tasks",
  "keywords",
  "keyword_batches",
  "sources",
  "matches",
  "permissions",
  "segments",
  "artifacts",
  "reviews",
  "posts",
  "meta",
  "notifications",
  "manual_retries",
  "triage_sources",
  "research_search_runs",
  "research_search_matches",
  "research_documents",
  "triage_items",
  "research_topics",
  "research_findings",
  "research_syntheses",
  "research_claims",
  "evidence_reviews",
  "content_briefs",
  "content_dependencies",
  "memory_jobs",
  "feedback_items",
  "research_events",
  "correction_cases",
];

/** One writer transaction owns decisions; external work must occur outside transaction(). */
export class Store {
  private db: DatabaseSync;
  private depth = 0;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA synchronous=FULL;");
    this.db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY)");
    for (const table of collections) {
      this.db.exec(
        `CREATE TABLE IF NOT EXISTS ${table} (id TEXT PRIMARY KEY, data TEXT NOT NULL CHECK(json_valid(data)))`
      );
    }
    this.db.exec("INSERT OR IGNORE INTO schema_migrations VALUES (1)");
    // v2 is additive so opening an existing v1 library leaves each legacy JSON row untouched.
    this.db.exec(
      "CREATE UNIQUE INDEX IF NOT EXISTS research_search_match_identity ON research_search_matches(json_extract(data, '$.queryId'), json_extract(data, '$.provider'), json_extract(data, '$.canonicalUrl'));" +
        "CREATE UNIQUE INDEX IF NOT EXISTS memory_job_entity_operation ON memory_jobs(json_extract(data, '$.entityVersionId'), json_extract(data, '$.dataset'), json_extract(data, '$.operation'));" +
        "CREATE INDEX IF NOT EXISTS research_dependency_claim ON content_dependencies(json_extract(data, '$.claimVersionId'));" +
        "CREATE INDEX IF NOT EXISTS research_claim_status ON research_claims(json_extract(data, '$.status'));" +
        "CREATE INDEX IF NOT EXISTS memory_job_due ON memory_jobs(json_extract(data, '$.status'), json_extract(data, '$.nextRunAt'));" +
        "INSERT OR IGNORE INTO schema_migrations VALUES (2);"
    );
  }
  private table(collection: string): string {
    if (!collections.includes(collection)) throw new Error(`Unknown collection: ${collection}`);
    return collection;
  }
  get<T = RecordData>(collection: string, id: string): T | undefined {
    const row = this.db.prepare(`SELECT data FROM ${this.table(collection)} WHERE id=?`).get(id);
    return row ? JSON.parse(String(row.data)) : undefined;
  }
  all<T = RecordData>(collection: string): T[] {
    return this.db
      .prepare(`SELECT data FROM ${this.table(collection)} ORDER BY rowid`)
      .all()
      .map((row) => JSON.parse(String(row.data)));
  }
  list<T = RecordData>(collection: string, offset = 0, limit = 50): T[] {
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1)
      throw new Error("Invalid pagination");
    return this.db
      .prepare(`SELECT data FROM ${this.table(collection)} ORDER BY rowid LIMIT ? OFFSET ?`)
      .all(limit, offset)
      .map((row) => JSON.parse(String(row.data)));
  }
  put<T extends { id: string }>(collection: string, value: T): T {
    if (!value.id) throw new Error("Record ID is required");
    this.db
      .prepare(
        `INSERT INTO ${this.table(collection)}(id,data) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data`
      )
      .run(value.id, JSON.stringify(value));
    return value;
  }
  remove(collection: string, id: string): void {
    this.db.prepare(`DELETE FROM ${this.table(collection)} WHERE id=?`).run(id);
  }
  transaction<T>(body: () => T): T {
    if (this.depth) return body();
    this.db.exec("BEGIN IMMEDIATE");
    this.depth++;
    try {
      const result = body();
      if (result instanceof Promise)
        throw new Error("Transactions cannot contain asynchronous work");
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    } finally {
      this.depth--;
    }
  }
  async backup(path: string): Promise<void> {
    await backup(this.db, path);
  }
  checkpoint(): void {
    this.db.exec("PRAGMA wal_checkpoint(FULL)");
  }
  close(): void {
    this.db.close();
  }
}
