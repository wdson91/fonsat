import { expect, it, vi } from "vitest";
import {
  createSynchronizer,
  type QueueEvent,
  type QueueScope,
} from "../src/lib/queue-sync";
const a = { companyId: 1, userId: 10 },
  b = { companyId: 2, userId: 20 };
const event = (id: string, scope = a): QueueEvent => ({
  id,
  ...scope,
  shiftId: "shift",
  siteId: 1,
  kind: "in",
  occurredAt: "2026-10-16T08:00:00Z",
});
function fixture(initial: QueueEvent[]) {
  let rows = [...initial];
  const store = {
    list: vi.fn(async (scope: QueueScope) =>
      rows.filter(
        (row) =>
          row.companyId === scope.companyId && row.userId === scope.userId,
      ),
    ),
    acknowledge: vi.fn(async (scope: QueueScope, ids: string[]) => {
      rows = rows.filter(
        (row) =>
          !(
            ids.includes(row.id) &&
            row.companyId === scope.companyId &&
            row.userId === scope.userId
          ),
      );
    }),
    invalidate: vi.fn(async () => {}),
  };
  return { store, rows: () => rows };
}
it("fixa a identidade antes de operações assíncronas e ignora confirmações alheias", async () => {
  const f = fixture([event("a"), event("b", b)]);
  const mutable = { ...a };
  let release!: (rows: QueueEvent[]) => void;
  f.store.list.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const send = vi.fn(async () => ({
    results: [
      { id: "a", accepted: true },
      { id: "b", accepted: true },
    ],
  }));
  const flush = createSynchronizer(f.store, send);
  const pending = flush(mutable);
  mutable.userId = b.userId;
  mutable.companyId = b.companyId;
  release([event("a")]);
  await pending;
  expect(send.mock.calls[0]).toEqual([a, [event("a")]]);
  expect(f.rows()).toEqual([event("b", b)]);
});
it("trocar de pessoa interrompe novos lotes e confirma o pedido já iniciado na fila original", async () => {
  const f = fixture([
    ...Array.from({ length: 101 }, (_, i) => event(String(i))),
    event("other", b),
  ]);
  let respond!: (value: {
    results: { id: string; accepted: boolean }[];
  }) => void;
  const send = vi.fn(
    () =>
      new Promise<{ results: { id: string; accepted: boolean }[] }>(
        (resolve) => {
          respond = resolve;
        },
      ),
  );
  const flush = createSynchronizer(f.store, send),
    controller = new AbortController();
  const pending = flush(a, controller.signal);
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  controller.abort();
  respond({
    results: Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      accepted: true,
    })),
  });
  await pending;
  expect(send).toHaveBeenCalledTimes(1);
  expect(f.rows()).toEqual([event("100"), event("other", b)]);
});
it("cancelar durante a leitura local não inicia qualquer envio", async () => {
  const f = fixture([event("a")]),
    c = new AbortController();
  f.store.list.mockImplementationOnce(async () => {
    c.abort();
    return [event("a")];
  });
  const send = vi.fn();
  await createSynchronizer(f.store, send)(a, c.signal);
  expect(send).not.toHaveBeenCalled();
  expect(f.rows()).toHaveLength(1);
});
it("resposta perdida conserva UUIDs e reenvia os mesmos eventos", async () => {
  const f = fixture([event("a")]);
  const send = vi
    .fn()
    .mockRejectedValueOnce(new Error("Resposta perdida"))
    .mockResolvedValueOnce({ results: [{ id: "a", accepted: true }] });
  const flush = createSynchronizer(f.store, send);
  await expect(flush(a)).rejects.toThrow("Resposta perdida");
  expect(f.rows()).toHaveLength(1);
  await flush(a);
  expect(f.rows()).toHaveLength(0);
  expect(send.mock.calls[0]).toEqual(send.mock.calls[1]);
});
it("identidade recusada mantém a fila e invalida apenas o contexto correspondente", async () => {
  const f = fixture([event("a"), event("b", b)]);
  await expect(
    createSynchronizer(f.store, async () => {
      throw { status: 401 };
    })(a),
  ).rejects.toMatchObject({ status: 401 });
  expect(f.rows()).toHaveLength(2);
  expect(f.store.invalidate).toHaveBeenCalledWith(a);
});
it("só elimina confirmações positivas de itens enviados", async () => {
  const f = fixture([event("a"), event("rejected")]);
  const result = await createSynchronizer(f.store, async () => ({
    results: [
      { id: "a", accepted: true },
      { id: "rejected", accepted: false, message: "Rever obra" },
      { id: "invented", accepted: true },
    ],
  }))(a);
  expect(result).toEqual({ pending: 1, message: "Rever obra" });
  expect(f.rows().map((row) => row.id)).toEqual(["rejected"]);
});
