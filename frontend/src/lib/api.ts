export type Role = "worker" | "foreman" | "admin" | "client";
export interface DemoUser {
  id: number;
  name: string;
  role: Role;
  company_id: number;
  company_name: string;
}
export interface CurrentUser extends DemoUser {
  brand_color: string;
  time_zone: string;
}
export interface Site {
  id: number;
  name: string;
}
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
// A identidade pertence ao pedido. Nunca é relida de estado global após um await.
export async function api<T>(
  path: string,
  userId?: number,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api${path}`, {
      headers: userId ? { "X-User-Id": String(userId) } : {},
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "name" in error &&
      error.name === "AbortError"
    )
      throw error;
    throw new ApiError(
      0,
      "Não foi possível ligar ao servidor. Tente novamente.",
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      response.status,
      typeof body?.message === "string"
        ? body.message
        : "Não foi possível carregar os dados.",
    );
  if (body === null)
    throw new ApiError(0, "Não foi possível ler a resposta do servidor.");
  return body as T;
}
export const listDemoUsers = (signal?: AbortSignal) =>
  api<DemoUser[]>("/demo-users", undefined, signal);
export const getMe = (id: number, signal?: AbortSignal) =>
  api<CurrentUser>("/me", id, signal);
export const getSites = (id: number, signal?: AbortSignal) =>
  api<Site[]>("/sites", id, signal);
