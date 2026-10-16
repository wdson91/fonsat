export interface QueueScope {
  companyId: number;
  userId: number;
}
export interface QueueEvent extends QueueScope {
  id: string;
  shiftId: string;
  siteId: number;
  kind: "in" | "out" | "break_in" | "break_out";
  occurredAt: string;
}
export interface QueueStore {
  list(scope: QueueScope): Promise<QueueEvent[]>;
  acknowledge(scope: QueueScope, ids: string[]): Promise<void>;
  invalidate(scope: QueueScope): Promise<void>;
}
interface Confirmation {
  results: { id: string; accepted: boolean; message?: string }[];
}
type Result = { pending: number; message: string };
export const scopeKey = (scope: QueueScope) =>
  `${scope.companyId}:${scope.userId}`;
export function createSynchronizer(
  store: QueueStore,
  send: (scope: QueueScope, events: QueueEvent[]) => Promise<Confirmation>,
) {
  const running = new Map<
    string,
    { signal?: AbortSignal; promise: Promise<Result> }
  >();
  function flush(context: QueueScope, signal?: AbortSignal): Promise<Result> {
    const scope = Object.freeze({
      companyId: context.companyId,
      userId: context.userId,
    });
    const key = scopeKey(scope),
      existing = running.get(key);
    if (existing) {
      if (existing.signal?.aborted && !signal?.aborted)
        return existing.promise
          .catch(() => undefined)
          .then(() => flush(scope, signal));
      return existing.promise.then(() => flush(scope, signal));
    }
    const promise = (async () => {
      const events = await store.list(scope);
      let message = "";
      for (
        let offset = 0;
        offset < events.length && !signal?.aborted;
        offset += 100
      ) {
        const batch = events.slice(offset, offset + 100);
        let response: Confirmation;
        try {
          // The lease stops new batches. A request already sent keeps its original
          // identity and can acknowledge only its own queue after a user switch.
          response = await send(scope, batch);
        } catch (error) {
          if ((error as { status?: number })?.status === 401)
            await store.invalidate(scope);
          throw error;
        }
        const sentIds = new Set(batch.map((event) => event.id));
        await store.acknowledge(
          scope,
          response.results
            .filter((result) => result.accepted && sentIds.has(result.id))
            .map((result) => result.id),
        );
        message = response.results
          .filter((result) => !result.accepted && sentIds.has(result.id))
          .map((result) => result.message ?? "Marcação por confirmar.")
          .join(" ");
      }
      return { pending: (await store.list(scope)).length, message };
    })().finally(() => running.delete(key));
    running.set(key, { signal, promise });
    return promise;
  }
  return flush;
}
