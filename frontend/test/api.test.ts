import { afterEach, expect, it, vi } from "vitest";
import { api, ApiError } from "../src/lib/api";
afterEach(() => vi.unstubAllGlobals());
it("usa a identidade explícita do pedido, independentemente da seleção global", async () => {
  localStorage.setItem("fonsat.userId", "2");
  const fetcher = vi
    .fn()
    .mockResolvedValue({ ok: true, json: async () => ({ id: 1 }) });
  vi.stubGlobal("fetch", fetcher);
  expect(await api("/me", 1)).toEqual({ id: 1 });
  expect(fetcher).toHaveBeenCalledWith(
    "/api/me",
    expect.objectContaining({
      headers: { "X-User-Id": "1" },
      cache: "no-store",
    }),
  );
});
it("mantém pedidos públicos sem cabeçalho de identidade", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => [] });
  vi.stubGlobal("fetch", fetcher);
  await api("/demo-users");
  expect(fetcher).toHaveBeenCalledWith(
    "/api/demo-users",
    expect.objectContaining({ headers: {} }),
  );
});
it("distingue identidade inválida de falha de rede", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({ message: "Escolha novamente." }),
      }),
  );
  await expect(api("/me", 99)).rejects.toMatchObject({
    status: 401,
    message: "Escolha novamente.",
  });
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
  await expect(api("/me", 1)).rejects.toBeInstanceOf(ApiError);
});
it("propaga o cancelamento para descartar pedidos da seleção anterior", async () => {
  const abort = new DOMException("cancelado", "AbortError");
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abort));
  await expect(api("/me", 1, new AbortController().signal)).rejects.toBe(abort);
});
