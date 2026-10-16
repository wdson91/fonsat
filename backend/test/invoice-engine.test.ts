import { describe, expect, it } from "vitest";
import {
  computeInvoice,
  type FinancialEntry,
  type PostedLine,
} from "../src/invoices/invoice-engine";

const entry = (overrides: Partial<FinancialEntry> = {}): FinancialEntry => ({
  id: "entry-1",
  version: 1,
  clientId: 10,
  clientName: "Cliente A",
  siteId: 20,
  siteName: "Obra",
  tradeId: 30,
  tradeName: "Pedreiro",
  rateId: 40,
  rateCents: 100,
  rateStartsOn: "2026-01-01",
  workerId: 50,
  workerName: "João",
  workedOn: "2026-01-10",
  startAt: "2026-01-10T08:00:00Z",
  endAt: "2026-01-10T09:00:00Z",
  minutes: 60,
  reason: null,
  status: "closed",
  ...overrides,
});
function issue(
  entries: FinancialEntry[],
  history: PostedLine[] = [],
  clientId = 10,
  period = "2026-01",
) {
  const result = computeInvoice({ entries, history, clientId, period });
  expect(result.problems).toEqual([]);
  return result.lines.map((line) => ({
    ...line,
    invoiceId: `invoice-${history.length + 1}`,
    invoiceNumber: `FT 2026/${history.length + 1}`,
  }));
}

describe("Ajustes financeiros por origem e valores efetivamente faturados", () => {
  it("arredonda uma vez por grupo, com cêntimos e minutos inteiros", () => {
    const result = computeInvoice({
      entries: [entry({ minutes: 1 }), entry({ id: "entry-2", minutes: 1 })],
      history: [],
      clientId: 10,
      period: "2026-01",
    });
    expect(result.lines).toHaveLength(1);
    expect(result.totalCents).toBe(3);
    expect(result.lines[0].after).toHaveLength(2);
  });
  it("calcula a diferença dos totais arredondados, não o preço dos minutos de diferença", () => {
    const original = entry({ minutes: 1, rateCents: 1 });
    const history = issue([original]);
    const corrected = entry({
      minutes: 30,
      rateCents: 1,
      version: 2,
      reason: "Corrigir saída",
    });
    const result = computeInvoice({
      entries: [corrected],
      history,
      clientId: 10,
      period: "2026-02",
    });
    expect(result.totalCents).toBe(1);
    expect(result.lines[0]).toMatchObject({
      billedCents: 0,
      targetCents: 1,
      amountCents: 1,
      roundingEffectCents: 1,
    });
  });
  it("não repete ajustes em meses sucessivos e aceita uma segunda correção", () => {
    const original = entry();
    const first = issue([original]);
    const secondEntry = entry({
      version: 2,
      minutes: 90,
      reason: "Saída esquecida",
    });
    const second = issue([secondEntry], first, 10, "2026-02");
    expect(second[0].amountCents).toBe(50);
    const thirdEntry = entry({ version: 3, minutes: 120, reason: "Revisão" });
    const third = issue([thirdEntry], [...first, ...second], 10, "2026-03");
    expect(third[0].amountCents).toBe(50);
    expect(
      computeInvoice({
        entries: [thirdEntry],
        history: [...first, ...second, ...third],
        clientId: 10,
        period: "2026-04",
      }).lines,
    ).toEqual([]);
  });
  it("desfazer uma correção já faturada repõe apenas a diferença", () => {
    const original = entry();
    const first = issue([original]);
    const second = issue(
      [entry({ version: 2, minutes: 90 })],
      first,
      10,
      "2026-02",
    );
    const result = computeInvoice({
      entries: [entry({ version: 3 })],
      history: [...first, ...second],
      clientId: 10,
      period: "2026-03",
    });
    expect(result.totalCents).toBe(-50);
  });
  it("mudança de ofício retira o grupo anterior e acrescenta o novo", () => {
    const history = issue([entry()]);
    const result = computeInvoice({
      entries: [
        entry({
          version: 2,
          tradeId: 31,
          tradeName: "Pintor",
          rateId: 41,
          rateCents: 200,
        }),
      ],
      history,
      clientId: 10,
      period: "2026-02",
    });
    expect(
      result.lines.map((line) => line.amountCents).sort((a, b) => a - b),
    ).toEqual([-100, 200]);
    expect(result.totalCents).toBe(100);
    expect(
      result.lines.find((line) => line.amountCents < 0)?.before[0].tradeName,
    ).toBe("Pedreiro");
  });
  it.each([10, 11])(
    "emitir primeiro o cliente %i preserva o saldo do outro lado da transferência",
    (firstClient) => {
      const original = issue([entry()]);
      const moved = entry({
        clientId: 11,
        clientName: "Cliente B",
        siteId: 21,
        siteName: "Outra obra",
        version: 2,
        rateCents: 200,
        rateId: 41,
        reason: "Transferência",
      });
      const first = issue([moved], original, firstClient, "2026-02");
      const secondClient = firstClient === 10 ? 11 : 10;
      const result = computeInvoice({
        entries: [moved],
        history: [...original, ...first],
        clientId: secondClient,
        period: "2026-02",
      });
      expect(result.totalCents).toBe(secondClient === 10 ? -100 : 200);
      const second = issue(
        [moved],
        [...original, ...first],
        secondClient,
        "2026-02",
      );
      for (const clientId of [10, 11]) {
        expect(
          computeInvoice({
            entries: [moved],
            history: [...original, ...first, ...second],
            clientId,
            period: "2026-03",
          }).lines,
        ).toEqual([]);
      }
      expect(
        [...first, ...second]
          .flatMap((line) => line.references)
          .every(
            (ref) =>
              ref.clientId ===
              [...first, ...second].find((line) =>
                line.references.includes(ref),
              )?.clientId,
          ),
      ).toBe(true);
    },
  );
  it("agrupa correções do mesmo grupo original antes de arredondar", () => {
    const entries = [
      entry({ minutes: 1, rateCents: 1 }),
      entry({ id: "entry-2", minutes: 1, rateCents: 1 }),
    ];
    const history = issue(entries);
    const result = computeInvoice({
      entries: entries.map((item) => ({ ...item, version: 2, minutes: 15 })),
      history,
      clientId: 10,
      period: "2026-02",
    });
    expect(result.totalCents).toBe(1);
    expect(result.lines).toHaveLength(1);
  });
  it("mantém os dados emitidos e explica versões retiradas e acrescentadas", () => {
    const history = issue([entry()]);
    const saved = structuredClone(history);
    const result = computeInvoice({
      entries: [
        entry({
          version: 2,
          minutes: 90,
          workerName: "Novo nome",
          reason: "Acerto",
        }),
      ],
      history,
      clientId: 10,
      period: "2026-02",
    });
    expect(history).toEqual(saved);
    expect(result.lines[0].before[0]).toMatchObject({
      version: 1,
      workerName: "João",
    });
    expect(result.lines[0].after[0]).toMatchObject({
      version: 2,
      workerName: "Novo nome",
      reason: "Acerto",
    });
  });
  it("registo futuro que já foi faturado não gera crédito antecipado", () => {
    const history = issue([entry()]);
    const result = computeInvoice({
      entries: [entry({ version: 2, workedOn: "2026-04-10" })],
      history,
      clientId: 10,
      period: "2026-02",
    });
    expect(result.problems).toContainEqual(
      expect.objectContaining({ entryId: "entry-1" }),
    );
  });
  it("bloqueia preço ausente e registo incompleto em vez de os perder", () => {
    const result = computeInvoice({
      entries: [
        entry({ rateId: null, rateCents: null }),
        entry({ id: "entry-2", status: "incomplete", endAt: null }),
      ],
      history: [],
      clientId: 10,
      period: "2026-01",
    });
    expect(result.problems).toHaveLength(2);
  });
  it("inclui registos tardios anteriores e ignora trabalho futuro ainda não faturado", () => {
    const result = computeInvoice({
      entries: [entry(), entry({ id: "future", workedOn: "2026-03-01" })],
      history: [],
      clientId: 10,
      period: "2026-02",
    });
    expect(result.totalCents).toBe(100);
    expect(result.lines[0].kind).toBe("adjustment");
  });
  it("recusa períodos e números não inteiros ou fora do intervalo seguro", () => {
    expect(() =>
      computeInvoice({
        entries: [entry()],
        history: [],
        clientId: 10,
        period: "2026-13",
      }),
    ).toThrow();
    expect(() =>
      computeInvoice({
        entries: [entry({ minutes: 1.5 })],
        history: [],
        clientId: 10,
        period: "2026-01",
      }),
    ).toThrow();
    expect(() =>
      computeInvoice({
        entries: [
          entry({
            minutes: Number.MAX_SAFE_INTEGER,
            rateCents: Number.MAX_SAFE_INTEGER,
          }),
        ],
        history: [],
        clientId: 10,
        period: "2026-01",
      }),
    ).toThrow();
  });
  it("anular e depois repor trabalho faturado liquida cada diferença uma vez", () => {
    const first = issue([entry()]);
    const voided = entry({ version: 2, status: "void", reason: "Anular" });
    const credit = issue([voided], first, 10, "2026-02");
    expect(credit[0].amountCents).toBe(-100);
    expect(credit[0].changes[0]).toMatchObject({
      version: 2,
      reason: "Anular",
    });
    expect(credit[0].after).toEqual([]);
    const restored = issue(
      [entry({ version: 3 })],
      [...first, ...credit],
      10,
      "2026-03",
    );
    expect(restored[0].amountCents).toBe(100);
  });
  it("sequências de correções e transferências fecham ao cêntimo em todos os grupos", () => {
    for (let scenario = 0; scenario < 12; scenario++) {
      let entries = [
        entry({ id: "a", minutes: 1, rateCents: 1 }),
        entry({ id: "b", minutes: 1, rateCents: 1 }),
        entry({ id: "c", minutes: 1, rateCents: 1 }),
      ];
      const history = issue(entries);
      for (let step = 0; step < 8; step++) {
        const index = (scenario + step) % 3;
        entries = entries.map((item, i) =>
          i === index
            ? {
                ...item,
                version: item.version + 1,
                clientId: (scenario + step) % 2 ? 10 : 11,
                siteId: (scenario + step) % 2 ? 20 : 21,
                minutes: (scenario * 19 + step * 29) % 121,
                rateCents: 1 + ((scenario + step) % 3),
                reason: "Acerto sucessivo",
              }
            : item,
        );
        const period = `2026-${String(step + 2).padStart(2, "0")}`;
        for (const clientId of step % 2 ? [10, 11] : [11, 10])
          history.push(...issue(entries, history, clientId, period));
        for (const clientId of [10, 11]) {
          const buckets = new Map<string, { minutes: number; rate: number }>();
          for (const item of entries.filter(
            (row) => row.clientId === clientId,
          )) {
            const key = JSON.stringify([
              item.siteId,
              item.tradeId,
              item.rateId,
              item.rateCents,
            ]);
            const bucket = buckets.get(key) ?? {
              minutes: 0,
              rate: item.rateCents!,
            };
            bucket.minutes += item.minutes;
            buckets.set(key, bucket);
          }
          const expected = [...buckets.values()].reduce(
            (total, bucket) =>
              total + Math.floor((bucket.minutes * bucket.rate + 30) / 60),
            0,
          );
          const actual = history
            .filter((line) => line.clientId === clientId)
            .reduce((total, line) => total + line.amountCents, 0);
          expect(actual).toBe(expected);
          expect(
            computeInvoice({ entries, history, clientId, period }).lines,
          ).toEqual([]);
        }
      }
    }
  });
});
