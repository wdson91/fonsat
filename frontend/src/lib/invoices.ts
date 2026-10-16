import { ApiError } from "./api";

export interface EntryView {
  id: string;
  version: number;
  workerName: string;
  workedOn: string;
  minutes: number;
  reason: string | null;
  startAt?: string | null;
  endAt?: string | null;
}
export interface InvoiceLineView {
  kind: "regular" | "adjustment";
  siteName: string;
  tradeName: string;
  minutes: number;
  rateCents: number;
  amountCents: number;
  billedCents: number;
  targetCents: number;
  roundingEffectCents: number;
  rateStartsOn?: string;
  before: EntryView[];
  after: EntryView[];
  references: { invoiceId: string; invoiceNumber: string; clientId: number }[];
  changes: {
    entryId: string;
    version: number;
    reason: string | null;
    correctedBy: string | null;
    correctedAt: string | null;
  }[];
}
export interface InvoiceView {
  id: string;
  status: "draft" | "issued";
  number: string | null;
  reviewHash: string;
  period: string;
  company: { id: number; name: string; timeZone: string };
  client: { id: number; name: string };
  totalCents: number;
  totalMinutes: number;
  roundingRule: string;
  lines: InvoiceLineView[];
  problems: { entryId: string; message: string }[];
  issuedAt?: string;
  issuedByName?: string;
  exclusions?: {
    entryId: string;
    reason: string;
    authorName: string;
    createdAt: string;
  }[];
}

export async function invoiceRequest<T>(
  path: string,
  userId: number,
  signal: AbortSignal,
  body?: unknown,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "X-User-Id": String(userId),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new ApiError(
      0,
      "Não foi possível ligar ao servidor. Pode repetir o pedido.",
    );
  }
  const value = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof value?.message === "string"
        ? value.message
        : "Não foi possível consultar a faturação.",
    );
  if (value === null)
    throw new ApiError(0, "Não foi possível ler a resposta do servidor.");
  return value as T;
}
