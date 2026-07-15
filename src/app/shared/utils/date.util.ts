/** Local 'YYYY-MM-DD' for a Date (avoids UTC off-by-one from toISOString). */
export function toLocalDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Local 'HH:MM'. */
export function toLocalTime(d: Date = new Date()): string {
  const h = `${d.getHours()}`.padStart(2, '0');
  const m = `${d.getMinutes()}`.padStart(2, '0');
  return `${h}:${m}`;
}

/** Add (or subtract) days to a date key, returning a new key. */
export function addDays(dateKey: string, delta: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(y, m - 1, d + delta);
  return toLocalDateKey(date);
}

/** Active language for date formatting; kept in sync by LanguageService. */
let dateLang: 'es' | 'en' = 'es';
export function setDateLang(lang: 'es' | 'en'): void {
  dateLang = lang;
}

/** Human label: Today / Yesterday / weekday dd mmm, in the active language. */
export function friendlyDate(dateKey: string): string {
  const today = toLocalDateKey();
  if (dateKey === today) return dateLang === 'en' ? 'Today' : 'Hoy';
  if (dateKey === addDays(today, -1)) return dateLang === 'en' ? 'Yesterday' : 'Ayer';
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(
    dateLang === 'en' ? 'en-US' : 'es-ES',
    { weekday: 'long', day: 'numeric', month: 'short' },
  );
}
