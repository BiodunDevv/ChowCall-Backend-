type DaySchedule = {
  open?: boolean;
  from?: string;
  to?: string;
};

export const RESTAURANT_DAY_KEYS = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

export function normalizeOpeningHours(openingHours: unknown) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return {};

  const normalized: Record<string, DaySchedule> = {};
  for (const [key, value] of Object.entries(openingHours)) {
    const day = key.trim().toLowerCase();
    if (!RESTAURANT_DAY_KEYS.includes(day as (typeof RESTAURANT_DAY_KEYS)[number])) continue;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    normalized[day] = value as DaySchedule;
  }
  return normalized;
}

export function isRestaurantOpen(
  openingHours: unknown,
  now = new Date(),
  timeZone = "Africa/Lagos",
) {
  const schedule = normalizeOpeningHours(openingHours);
  if (!Object.keys(schedule).length) return true;

  const { dayIndex, minutes } = zonedClock(now, timeZone);
  const today = schedule[RESTAURANT_DAY_KEYS[dayIndex]];
  if (isOpenDuring(today, minutes)) return true;

  // A Friday 18:00-02:00 schedule remains open during early Saturday.
  const previous = schedule[RESTAURANT_DAY_KEYS[(dayIndex + 6) % 7]];
  return isPreviousOvernightOpen(previous, minutes);
}

function isOpenDuring(day: DaySchedule | undefined, currentMinutes: number) {
  if (!day?.open) return false;
  if (!day.from || !day.to) return true;
  const from = toMinutes(day.from);
  const to = toMinutes(day.to);
  if (from === null || to === null) return false;
  if (from === to) return true;
  return from < to
    ? currentMinutes >= from && currentMinutes < to
    : currentMinutes >= from;
}

function isPreviousOvernightOpen(day: DaySchedule | undefined, currentMinutes: number) {
  if (!day?.open || !day.from || !day.to) return false;
  const from = toMinutes(day.from);
  const to = toMinutes(day.to);
  return from !== null && to !== null && from > to && currentMinutes < to;
}

function zonedClock(now: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const weekday = parts.find((part) => part.type === "weekday")?.value.toLowerCase() ?? "sunday";
  return {
    dayIndex: Math.max(0, RESTAURANT_DAY_KEYS.indexOf(weekday as (typeof RESTAURANT_DAY_KEYS)[number])),
    minutes:
      Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 +
      Number(parts.find((part) => part.type === "minute")?.value ?? 0),
  };
}

function toMinutes(value: string) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return hour * 60 + minute;
}
