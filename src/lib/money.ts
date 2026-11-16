export function kobo(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new RangeError('Money must be non-negative safe integer kobo');
  return value;
}
export function nairaToKobo(value: string): number {
  if (!/^\d+(\.\d{1,2})?$/.test(value))
    throw new RangeError(
      'Expected a non-negative decimal with at most two places',
    );
  const [whole, fraction = ''] = value.split('.');
  return kobo(Number(BigInt(whole!) * 100n + BigInt(fraction.padEnd(2, '0'))));
}
export const addKobo = (...values: number[]) =>
  kobo(values.reduce((total, value) => kobo(total + kobo(value)), 0));
export function multiplyKobo(value: number, quantity: number): number {
  if (!Number.isSafeInteger(quantity) || quantity < 0)
    throw new RangeError('Invalid quantity');
  return kobo(kobo(value) * quantity);
}
export const formatNaira = (value: number) =>
  new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN' }).format(
    kobo(value) / 100,
  );
