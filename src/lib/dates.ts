const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar date as YYYY-MM-DD (not UTC). */
export const ymd = (d: Date = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const addDays = (base: Date | string, n: number) => {
  const d = typeof base === 'string' ? new Date(`${base}T00:00:00`) : new Date(base);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

export const daysAgo = (n: number) => addDays(new Date(), -n);

export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00`) - Date.parse(`${a}T00:00:00`)) / 86_400_000);
