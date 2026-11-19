export function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let left = days;
  while (left > 0) {
    d.setDate(d.getDate() + 1);
    const wd = d.getDay();
    if (wd !== 0 && wd !== 6) left--;
  }
  return d;
}

/** Live animals ship Monday–Wednesday so they never sit in a depot over a weekend. */
export function nextLiveShipDay(from: Date): Date {
  const d = new Date(from);
  while (![1, 2, 3].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d;
}

export function shortDate(iso: string | Date) {
  return new Date(iso).toLocaleDateString("en-CA", { weekday: "short", month: "short", day: "numeric" });
}

export function timeAgo(iso: string | Date) {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
