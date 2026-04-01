/** Local calendar date as YYYY-MM-DD (for `<input type="date" />`). */
export function formatLocalDateYYYYMMDD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function localTodayYYYYMMDD(): string {
  return formatLocalDateYYYYMMDD(new Date());
}
