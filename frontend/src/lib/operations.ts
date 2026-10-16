import { api } from './api';
export interface Named { id: number; name: string; active: boolean }
export interface Worker extends Named { tradeId: number; userId: number | null }
export interface WorkSite extends Named { clientId: number | null; location: string }
export interface Client extends Named { taxId: string; userId: number|null }
export interface Catalog { workers: Worker[]; trades: Named[]; sites: WorkSite[]; clients: Client[]; users: { id: number; name: string; role: string }[]; responsibilities: { id: number; siteId: number; userId: number; startsOn: string; endsOn: string | null }[] }
export interface Allocation { id: number; workerId: number; siteId: number; tradeId: number | null; day: string }
export const command = <T>(id: number, path: string, method: string, body: unknown) => api<T>(path, id, undefined, { method, body: JSON.stringify(body) });
export function companyDay(zone: string) { return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()); }
export function addDays(day: string, amount: number) { return new Date(Date.parse(day + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10); }
export function monday(day: string) { const weekday = new Date(day + 'T00:00:00Z').getUTCDay(); return addDays(day, -(weekday === 0 ? 6 : weekday - 1)); }
