import { api } from "./api";
import { deviceRead, deviceWrite } from "./device-db";
import { invalidateWorkerContext } from "./offline-context";
import {
  createSynchronizer,
  scopeKey,
  type QueueScope,
  type QueueEvent,
} from "./queue-sync";
export type LocalEvent = QueueEvent;
export interface ActiveShift {
  shiftId: string;
  siteId: number;
  startAt: string;
}
export const queuedEvents = (scope: QueueScope) =>
  deviceRead<LocalEvent[]>("events", (store) =>
    store.index("scope").getAll(scopeKey(scope)),
  );
export const readShift = (scope: QueueScope) =>
  deviceRead<{ active: ActiveShift | null } | undefined>(
    "scopedSessions",
    (store) => store.get(scopeKey(scope)),
  );
export const saveShift = (scope: QueueScope, active: ActiveShift | null) =>
  deviceWrite(["scopedSessions"], (tx) => {
    tx.objectStore("scopedSessions").put({
      key: scopeKey(scope),
      ...scope,
      active,
    });
  });
export function enqueue(event: LocalEvent, active: ActiveShift | null) {
  return deviceWrite(["events", "scopedSessions"], (tx) => {
    tx.objectStore("events").add({ ...event, scope: scopeKey(event) });
    tx.objectStore("scopedSessions").put({
      key: scopeKey(event),
      companyId: event.companyId,
      userId: event.userId,
      active,
    });
  });
}
export function enqueuePeriod(events: [LocalEvent, LocalEvent]) {
  return deviceWrite(["events"], (tx) => {
    for (const event of events)
      tx.objectStore("events").add({ ...event, scope: scopeKey(event) });
  });
}
export const flushQueue = createSynchronizer(
  {
    list: queuedEvents,
    invalidate: invalidateWorkerContext,
    acknowledge: (scope, ids) =>
      deviceWrite(["events"], (tx) => {
        const store = tx.objectStore("events");
        for (const id of ids) {
          const request = store.get(id);
          request.onsuccess = () => {
            const event = request.result as LocalEvent | undefined;
            if (
              event?.userId === scope.userId &&
              event.companyId === scope.companyId
            )
              store.delete(id);
          };
        }
      }),
  },
  (scope, events) =>
    api("/attendance/sync", scope.userId, undefined, {
      method: "POST",
      body: JSON.stringify({
        events: events.map((event) => ({
          id: event.id,
          shiftId: event.shiftId,
          siteId: event.siteId,
          kind: event.kind,
          occurredAt: event.occurredAt,
        })),
      }),
    }),
);

/** Adopt v1 rows only after online verification of the worker and company sites. */
export async function adoptLegacyQueue(scope: QueueScope, siteIds: number[]) {
  await deviceWrite(["events", "sessions", "scopedSessions"], (tx) => {
    const events = tx.objectStore("events"),
      legacy = events.index("userId").getAll(scope.userId);
    legacy.onsuccess = () => {
      for (const event of legacy.result)
        if (event.companyId === undefined && siteIds.includes(event.siteId))
          events.put({ ...event, ...scope, scope: scopeKey(scope) });
    };
    const scoped = tx.objectStore("scopedSessions"),
      existing = scoped.get(scopeKey(scope));
    existing.onsuccess = () => {
      if (existing.result) return;
      const previous = tx.objectStore("sessions").get(scope.userId);
      previous.onsuccess = () => {
        const session = previous.result;
        if (
          session &&
          (!session.active || siteIds.includes(session.active.siteId))
        )
          scoped.put({
            key: scopeKey(scope),
            ...scope,
            active: session.active,
          });
      };
    };
  });
}
