import { BadRequestException } from '@nestjs/common';
export function text(value: unknown, label = 'Nome'): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 500) throw new BadRequestException(`${label} é obrigatório (máximo 500 caracteres).`);
  return value.trim();
}
export function integer(value: unknown, label = 'Identificador', min = 1): number {
  if (!Number.isSafeInteger(value) || (value as number) < min || (value as number) > 2147483647) throw new BadRequestException(`${label} inválido.`);
  return value as number;
}
export function date(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Data inválida.');
  const d = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(+d) || d.toISOString().slice(0, 10) !== value) throw new BadRequestException('Data inválida.');
  return d;
}
export function dayInZone(value: Date, zone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}
export function instant(value: unknown): Date {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) throw new BadRequestException('Hora inválida: indique o fuso horário.');
  return new Date(value);
}
export function uuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) throw new BadRequestException('UUID inválido.');
  return value.toLowerCase();
}
