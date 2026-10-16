import type { CurrentUser, DemoUser } from "./api";
import type { WorkEntry } from "./attendance";
import { deviceRead, deviceWrite } from "./device-db";
import { scopeKey, type QueueScope } from "./queue-sync";
export interface WorkerBootstrap {
  worker: { id: number; name: string };
  sites: { id: number; name: string; active: boolean }[];
  suggestedSiteId: number | null;
  allocations?: { day: string; siteId: number }[];
}
export interface WorkerContext {
  key: string;
  userId: number;
  companyId: number;
  valid: boolean;
  me: CurrentUser;
  bootstrap: WorkerBootstrap;
  entries: WorkEntry[];
  savedAt: string;
}
export async function saveWorkerContext(
  me: CurrentUser,
  bootstrap: WorkerBootstrap,
  entries: WorkEntry[],
) {
  const scope = { userId: me.id, companyId: me.company_id };
  const context: WorkerContext = {
    ...scope,
    key: scopeKey(scope),
    valid: true,
    me,
    bootstrap,
    entries: entries.map((entry) => ({ ...entry, versions: [], events: [] })),
    savedAt: new Date().toISOString(),
  };
  await deviceWrite(["contexts"], (tx) => {
    tx.objectStore("contexts").put(context);
  });
}
export async function workerContext(
  userId: number,
): Promise<WorkerContext | null> {
  const rows = await deviceRead<WorkerContext[]>("contexts", (store) =>
    store.index("userId").getAll(userId),
  );
  if (rows.length !== 1) return null;
  const row = rows[0];
  return row.valid &&
    row.me.id === userId &&
    row.me.role === "worker" &&
    row.companyId === row.me.company_id &&
    row.key === scopeKey(row)
    ? row
    : null;
}
export async function invalidateWorkerContext(scope: QueueScope) {
  await deviceWrite(["contexts"], (tx) => {
    const store = tx.objectStore("contexts"),
      request = store.get(scopeKey(scope));
    request.onsuccess = () => {
      if (request.result) store.put({ ...request.result, valid: false });
    };
  });
}
export async function invalidateUserContexts(userId: number) {
  await deviceWrite(["contexts"], (tx) => {
    const store = tx.objectStore("contexts"),
      request = store.index("userId").getAll(userId);
    request.onsuccess = () => {
      for (const row of request.result) store.put({ ...row, valid: false });
    };
  });
}
export async function saveDemoUsers(users: DemoUser[]) {
  await deviceWrite(["metadata"], (tx) => {
    tx.objectStore("metadata").put({ key: "demo-users", users });
  });
}
export async function cachedDemoUsers(): Promise<DemoUser[]> {
  return (
    (
      await deviceRead<{ users: DemoUser[] } | undefined>("metadata", (store) =>
        store.get("demo-users"),
      )
    )?.users ?? []
  );
}
