import { DatabaseSync, backup } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export interface RecordData {
  id: string;
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
