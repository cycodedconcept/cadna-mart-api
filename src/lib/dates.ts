export const TIME_ZONE = 'Africa/Lagos';
export function lagosDateKey(value: Date): string {
  if (!Number.isFinite(value.getTime())) throw new RangeError('Invalid date');
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(value);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}
export const formatLagosDate = (value: Date) =>
  new Intl.DateTimeFormat('en-NG', {
    timeZone: TIME_ZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(value);
