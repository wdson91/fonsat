/** Financial inputs are resolved by the server, never accepted from the browser. */
export interface FinancialEntry {
  id: string;
  version: number;
  clientId: number;
  clientName: string;
  siteId: number;
  siteName: string;
  tradeId: number;
  tradeName: string;
  rateId: number | null;
  rateCents: number | null;
  rateStartsOn: string | null;
  workerId: number;
  workerName: string;
  workedOn: string;
  startAt: string | null;
  endAt: string | null;
  minutes: number;
  status: "closed" | "incomplete" | "void";
  reason: string | null;
  correctedBy?: string | null;
  correctedAt?: string | null;
}

export interface InvoiceReference {
  invoiceId: string;
  invoiceNumber: string;
  clientId: number;
}

export interface FinancialLine {
  origin: string;
  bucket: string;
  clientId: number;
  siteId: number;
  siteName: string;
  tradeId: number;
  tradeName: string;
  rateId: number;
  rateCents: number;
  rateStartsOn: string;
  kind: "regular" | "adjustment";
  minutes: number;
  amountCents: number;
  targetMinutes: number;
  billedMinutes: number;
  targetCents: number;
  billedCents: number;
  roundingEffectCents: number;
  before: FinancialEntry[];
  after: FinancialEntry[];
  references: InvoiceReference[];
  changes: {
    entryId: string;
    version: number;
    reason: string | null;
    correctedBy: string | null;
    correctedAt: string | null;
  }[];
}

export interface PostedLine extends FinancialLine {
  invoiceId: string;
  invoiceNumber: string;
}

export interface InvoiceComputation {
  lines: FinancialLine[];
  problems: { entryId: string; message: string }[];
  totalMinutes: number;
  totalCents: number;
}

export const ROUNDING_RULE =
  "Total corrigido arredondado menos total acumulado já faturado; arredondamento por grupo de origem, obra, ofício e preço, meio cêntimo para longe de zero.";

function integer(value: number): bigint {
  if (!Number.isSafeInteger(value))
    throw new Error("São necessários inteiros seguros.");
  return BigInt(value);
}

function safe(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result))
    throw new Error("Valor financeiro fora do intervalo seguro.");
  return result;
}

export function amountFor(minutes: number, rateCents: number): number {
  const numerator = integer(minutes) * integer(rateCents);
  const absolute = numerator < 0n ? -numerator : numerator;
  return safe(((absolute + 30n) / 60n) * (numerator < 0n ? -1n : 1n));
}

function sum(values: number[]): number {
  return safe(values.reduce((total, value) => total + integer(value), 0n));
}

function bucketFor(entry: FinancialEntry): string {
  return JSON.stringify([
    entry.clientId,
    entry.siteId,
    entry.tradeId,
    entry.rateId,
    entry.rateCents,
    entry.rateStartsOn,
  ]);
}

function validDay(day: string): boolean {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(day) &&
    !Number.isNaN(Date.parse(day)) &&
    new Date(day).toISOString().slice(0, 10) === day
  );
}

/** Pure calculation. History contains ONLY issued lines, in issue order, for the company.
 * A financial origin is the group of entries first billed together. It remains stable
 * across changes of client, trade or price. Money already paid is accumulated per
 * origin/client/bucket, so settling one client cannot settle another client's debt.
 */
export function computeInvoice(input: {
  entries: FinancialEntry[];
  history: PostedLine[];
  clientId: number;
  period: string;
}): InvoiceComputation {
  const { entries, history, clientId, period } = input;
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period))
    throw new Error("Período inválido; use AAAA-MM.");
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  if (byId.size !== entries.length)
    throw new Error("Registo de origem duplicado.");
  const origins = new Map<string, string>();
  for (const line of history) {
    for (const entry of [...line.before, ...line.after]) {
      const existing = origins.get(entry.id);
      if (existing && existing !== line.origin)
        throw new Error("Origem financeira inconsistente.");
      origins.set(entry.id, line.origin);
    }
  }

  const problems: InvoiceComputation["problems"] = [];
  const blocked = new Set<string>();
  const targets = new Map<
    string,
    { origin: string; bucket: string; entries: FinancialEntry[] }
  >();
  for (const entry of entries) {
    integer(entry.minutes);
    integer(entry.version);
    if (entry.minutes < 0 || entry.version < 1 || !validDay(entry.workedOn))
      throw new Error("Registo financeiro inválido.");
    const previousOrigin = origins.get(entry.id);
    const relevantHistory = history.some(
      (line) => line.clientId === clientId && line.origin === previousOrigin,
    );
    if (entry.clientId !== clientId && !relevantHistory) continue;
    const future = entry.workedOn.slice(0, 7) > period;
    let message: string | null = null;
    if (future && previousOrigin)
      message =
        "Registo já faturado transferido para data futura; requer revisão.";
    else if (future) continue;
    else if (entry.status === "incomplete") message = "Registo incompleto.";
    else if (
      entry.clientId === clientId &&
      entry.status === "closed" &&
      (entry.rateCents === null ||
        entry.rateId === null ||
        entry.rateStartsOn === null)
    )
      message = "Preço ausente.";
    if (message) {
      problems.push({ entryId: entry.id, message });
      if (previousOrigin) blocked.add(previousOrigin);
      continue;
    }
    if (entry.status === "void" || entry.clientId !== clientId) continue;
    if (
      entry.rateCents! < 0 ||
      !validDay(entry.rateStartsOn!) ||
      entry.rateStartsOn! > entry.workedOn
    )
      throw new Error("Preço inválido.");
    integer(entry.rateCents!);
    const bucket = bucketFor(entry);
    const origin = previousOrigin ?? JSON.stringify(["origin", period, bucket]);
    const key = JSON.stringify([origin, bucket]);
    const group = targets.get(key) ?? { origin, bucket, entries: [] };
    group.entries.push(structuredClone(entry));
    targets.set(key, group);
  }

  // Missing data is never interpreted as permission to credit a billed entry.
  for (const line of history.filter((item) => item.clientId === clientId)) {
    for (const entry of line.after) {
      if (!byId.has(entry.id) && !blocked.has(line.origin)) {
        problems.push({
          entryId: entry.id,
          message: "Origem faturada ausente; requer revisão.",
        });
        blocked.add(line.origin);
      }
    }
  }
  const postedGroups = new Map<string, PostedLine[]>();
  for (const line of history.filter((item) => item.clientId === clientId)) {
    const key = JSON.stringify([line.origin, line.bucket]);
    postedGroups.set(key, [...(postedGroups.get(key) ?? []), line]);
  }
  const lines: FinancialLine[] = [];
  for (const key of [
    ...new Set([...targets.keys(), ...postedGroups.keys()]),
  ].sort()) {
    const target = targets.get(key);
    const posted = postedGroups.get(key) ?? [];
    const latest = posted.at(-1);
    const origin = target?.origin ?? latest!.origin;
    if (blocked.has(origin)) continue;
    const after = (target?.entries ?? []).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const before = latest?.after ?? [];
    const sample = after[0];
    const rateCents = sample?.rateCents ?? latest!.rateCents;
    const targetMinutes = sum(after.map((item) => item.minutes));
    const targetCents = amountFor(targetMinutes, rateCents);
    const billedMinutes = sum(posted.map((line) => line.minutes));
    const billedCents = sum(posted.map((line) => line.amountCents));
    const minutes = sum([targetMinutes, -billedMinutes]);
    const amountCents = sum([targetCents, -billedCents]);
    if (minutes === 0 && amountCents === 0) continue;
    const references = new Map<string, InvoiceReference>();
    for (const line of history.filter(
      (item) => item.clientId === clientId && item.origin === origin,
    )) {
      references.set(line.invoiceId, {
        invoiceId: line.invoiceId,
        invoiceNumber: line.invoiceNumber,
        clientId,
      });
    }
    lines.push({
      origin,
      bucket: target?.bucket ?? latest!.bucket,
      clientId,
      siteId: sample?.siteId ?? latest!.siteId,
      siteName: sample?.siteName ?? latest!.siteName,
      tradeId: sample?.tradeId ?? latest!.tradeId,
      tradeName: sample?.tradeName ?? latest!.tradeName,
      rateId: sample?.rateId ?? latest!.rateId,
      rateCents,
      rateStartsOn: sample?.rateStartsOn ?? latest!.rateStartsOn,
      kind:
        references.size === 0 &&
        after.every((item) => item.workedOn.slice(0, 7) === period) &&
        !origins.has(after[0]?.id)
          ? "regular"
          : "adjustment",
      minutes,
      amountCents,
      targetMinutes,
      targetCents,
      billedMinutes,
      billedCents,
      roundingEffectCents: sum([amountCents, -amountFor(minutes, rateCents)]),
      before: structuredClone(before),
      after,
      references: [...references.values()],
      // A credit explains the correction without disclosing the new client's data.
      changes: [...new Set([...before, ...after].map((entry) => entry.id))]
        .sort()
        .flatMap((id) => {
          const current = byId.get(id);
          return current
            ? [
                {
                  entryId: id,
                  version: current.version,
                  reason: current.reason,
                  correctedBy: current.correctedBy ?? null,
                  correctedAt: current.correctedAt ?? null,
                },
              ]
            : [];
        }),
    });
  }
  return {
    lines,
    problems,
    totalMinutes: sum(lines.map((line) => line.minutes)),
    totalCents: sum(lines.map((line) => line.amountCents)),
  };
}
