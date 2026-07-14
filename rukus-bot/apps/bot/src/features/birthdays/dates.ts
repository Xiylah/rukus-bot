/**
 * Date helpers for birthdays. Pure, so the awkward parts (leap days, "what day
 * is it in Tokyo") are obvious and testable.
 *
 * No timezone library. Intl.DateTimeFormat already knows every IANA zone, so
 * asking it to format "now" in the guild's zone tells us the guild's local date
 * and hour without pulling in a megabyte of tz data.
 */

/** A calendar day in some timezone: the only thing the sweeper actually needs. */
export interface LocalDay {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
}

/** True if the string is an IANA zone this runtime actually knows. */
export function isValidTimezone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
    return true;
  } catch {
    return false;
  }
}

/**
 * What the calendar says right now in `timezone`.
 *
 * An unknown zone must not take the sweeper down, so we fall back to UTC rather
 * than throwing: announcing at the wrong hour beats never announcing at all.
 */
export function localNow(timezone: string, now: Date = new Date()): LocalDay {
  const zone = isValidTimezone(timezone) ? timezone : "UTC";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: zone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);

  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? "0";
    return Number.parseInt(raw, 10);
  };

  // hour12:false still yields "24" at midnight in some ICU versions.
  const hour = get("hour") % 24;
  return { year: get("year"), month: get("month"), day: get("day"), hour };
}

/** Days in a month, honouring leap years. Month is 1-12. */
export function daysInMonth(month: number, year: number): number {
  // Day 0 of the next month is the last day of this one.
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Is this a real calendar date? Feb 30 is not, and 29 February is only allowed
 * when no year is given (a leap-year baby still has a birthday every year) or
 * when the year they were born really was a leap year.
 */
export function isRealDate(
  day: number,
  month: number,
  year?: number | null,
): boolean {
  if (!Number.isInteger(day) || !Number.isInteger(month)) return false;
  if (month < 1 || month > 12 || day < 1) return false;
  // Without a year, judge against a leap year so 29 Feb stays legal.
  return day <= daysInMonth(month, year ?? 2024);
}

/**
 * Does today count as this person's birthday?
 *
 * 29 February is the interesting case: in a non-leap year that date never
 * arrives, and a leap-year baby who is silently skipped three years in four is
 * exactly the kind of small cruelty that makes people distrust a bot. We treat
 * 28 February as their day when February has no 29th.
 */
export function isBirthdayToday(
  birthday: { day: number; month: number },
  today: LocalDay,
): boolean {
  if (birthday.month === today.month && birthday.day === today.day) return true;

  const leapling = birthday.month === 2 && birthday.day === 29;
  const noLeapDay = daysInMonth(2, today.year) === 28;
  return leapling && noLeapDay && today.month === 2 && today.day === 28;
}

/**
 * How many days until this birthday next comes round, counting today as 0.
 * Used only to order /birthday list, so an approximate leap-day answer is fine.
 */
export function daysUntil(
  birthday: { day: number; month: number },
  today: LocalDay,
): number {
  const start = Date.UTC(today.year, today.month - 1, today.day);
  // Clamp so 29 Feb lands on a real date in a non-leap year.
  const clamp = (year: number): number =>
    Math.min(birthday.day, daysInMonth(birthday.month, year));

  for (const year of [today.year, today.year + 1]) {
    const target = Date.UTC(year, birthday.month - 1, clamp(year));
    if (target >= start) {
      return Math.round((target - start) / 86_400_000);
    }
  }
  return 0;
}

/** "3 March", the only way we ever render a birthday. Never the year. */
export function formatDayMonth(day: number, month: number): string {
  const name = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(2024, month - 1, 1)));
  return `${day} ${name}`;
}
