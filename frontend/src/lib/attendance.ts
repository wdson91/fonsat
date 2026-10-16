export interface EntryVersion {
  id: number;
  number: number;
  siteId: number;
  tradeId: number;
  startAt: string | null;
  endAt: string | null;
  workedOn: string;
  minutes: number | null;
  source: string;
  reason: string | null;
  createdAt: string;
  site: { id: number; name: string; clientId: number | null };
  trade: { id: number; name: string };
  author: { id: number; name: string };
}
export interface WorkEntry {
  activity?: "work" | "break";
  id: string;
  workerId: number;
  currentVersion: number;
  worker: { id: number; name: string };
  current: EntryVersion;
  versions: EntryVersion[];
  events: {
    id: string;
    kind: string;
    occurredAt: string;
    receivedAt: string;
    siteId: number;
  }[];
  alerts: string[];
  overtime: boolean;
}
