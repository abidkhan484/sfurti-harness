import type { Store } from "../store.ts";
export function reserveStorage(
  store: Store,
  input: {
    id: string;
    bytes: number;
    freeBytes: number;
    managedBytes: number;
    minFreeBytes: number;
    ceilingBytes: number;
    now: Date;
    leaseMs: number;
  }
) {
  if (!Number.isSafeInteger(input.bytes) || input.bytes <= 0)
    throw new Error("Storage reservation bytes must be positive");
  const active = store
    .all<{ bytes?: number; status?: string }>("storage_reservations")
    .filter((item) => item.status === "active")
    .reduce((sum, item) => sum + (item.bytes ?? 0), 0);
  if (
    input.freeBytes - active - input.bytes < input.minFreeBytes ||
    input.managedBytes + active + input.bytes > input.ceilingBytes
  )
    throw new Error(`Storage admission rejected; needs ${input.bytes} bytes`);
  const record = {
    id: input.id,
    bytes: input.bytes,
    status: "active",
    leaseUntil: new Date(input.now.getTime() + input.leaseMs).toISOString(),
    createdAt: input.now.toISOString(),
  };
  store.put("storage_reservations", record);
  return record;
}
export function releaseStorage(store: Store, id: string, now: Date) {
  const old = store.get<Record<string, unknown> & { id: string }>("storage_reservations", id);
  if (old)
    store.put("storage_reservations", {
      ...old,
      status: "released",
      releasedAt: now.toISOString(),
    });
}
