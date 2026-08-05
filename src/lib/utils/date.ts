import { format, formatDistanceToNowStrict, isToday, isTomorrow } from "date-fns";

/** "Today, 7:30 PM" / "Tomorrow, 1:00 PM" / "Sat, Aug 2 · 4:15 PM" */
export function formatGameTime(iso: string): string {
  const date = new Date(iso);
  const time = format(date, "h:mm a");
  if (isToday(date)) return `Today, ${time}`;
  if (isTomorrow(date)) return `Tomorrow, ${time}`;
  return `${format(date, "EEE, MMM d")} · ${time}`;
}

export function formatRelativeTime(iso: string): string {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}
