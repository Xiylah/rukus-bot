/**
 * Duration parsing and formatting, shared by the bot (/remind, /temprole,
 * /lockdown) and the dashboard (so a settings page can preview what a staff
 * member typed without re-implementing the grammar and drifting from it).
 *
 * Pure and dependency-free on purpose: this is the piece most likely to be
 * unit-tested, and it must behave identically on both sides.
 */

/** Seconds per unit. Weeks are the largest unit we accept: months and years
 *  are ambiguous in length and a reminder that far out is better expressed as
 *  a date, which the natural-language branch below handles. */
const UNIT_SECONDS: Record<string, number> = {
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
  w: 604_800,
  week: 604_800,
  weeks: 604_800,
};

/** One year. Anything longer is almost always a typo (e.g. "100000d"). */
export const MAX_DURATION_SEC = 31_536_000;

/** A `<number><unit>` chunk, e.g. "1d", "2 h", "30mins". */
const CHUNK = /(\d+(?:\.\d+)?)\s*([a-z]+)/g;

/**
 * Parse a relative duration into whole seconds.
 *
 * Accepts compound forms with or without separators: "1d2h3m", "2h 30m",
 * "1 hour 15 minutes", "90s". Returns null when the input contains no
 * recognisable chunk, or when a chunk uses an unknown unit: a silent partial
 * parse ("1d2x" quietly meaning one day) would set a timer nobody asked for.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  if (!text) return null;

  // A bare number is the friendliest possible shorthand, and minutes is what
  // people mean by it in every Discord bot they have used before.
  if (/^\d+$/.test(text)) {
    const minutes = Number(text);
    return clamp(minutes * 60);
  }

  let total = 0;
  let matched = 0;

  CHUNK.lastIndex = 0;
  for (let m = CHUNK.exec(text); m; m = CHUNK.exec(text)) {
    const value = Number(m[1]);
    const unit = UNIT_SECONDS[m[2]!];
    if (unit === undefined) return null; // unknown unit: refuse, do not guess
    total += value * unit;
    matched++;
  }

  if (matched === 0) return null;

  // Reject stray characters between the chunks ("1h banana 2m"): the leftovers
  // are usually the reminder text bleeding into the duration argument, and
  // dropping them silently would fire the reminder at the wrong time.
  const stripped = text.replace(/[\s,+]/g, "");
  const chunkChars =
    text
      .match(/\d+(?:\.\d+)?\s*[a-z]+/g)
      ?.join("")
      .replace(/\s/g, "").length ?? 0;
  if (stripped.length !== chunkChars) return null;

  return clamp(Math.round(total));
}

function clamp(seconds: number): number | null {
  if (!Number.isFinite(seconds) || seconds < 1) return null;
  if (seconds > MAX_DURATION_SEC) return null;
  return seconds;
}

/**
 * Parse either a relative duration OR a few natural-language shorthands people
 * actually type into a reminder box. Anything richer than this belongs to a
 * date library, and pulling one in for "tomorrow" is not worth the weight.
 *
 * `now` is injectable so the result is deterministic in tests.
 */
export function parseWhen(input: string, now: number = Date.now()): number | null {
  const text = input.trim().toLowerCase();

  const relative = parseDuration(text);
  if (relative !== null) return now + relative * 1000;

  const words: Record<string, number> = {
    tomorrow: 86_400,
    "next week": 604_800,
    tonight: 8 * 3600,
    "in an hour": 3600,
    "in a minute": 60,
  };
  const wordSec = words[text];
  if (wordSec !== undefined) return now + wordSec * 1000;

  // A plain clock time ("at 5pm", "17:30") resolves to the next occurrence.
  const clock = /^(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/.exec(text);
  if (clock) {
    let hour = Number(clock[1]);
    const minute = Number(clock[2] ?? 0);
    const suffix = clock[3];
    if (suffix === "pm" && hour < 12) hour += 12;
    if (suffix === "am" && hour === 12) hour = 0;
    if (hour > 23 || minute > 59) return null;

    const target = new Date(now);
    target.setHours(hour, minute, 0, 0);
    if (target.getTime() <= now) target.setDate(target.getDate() + 1);
    return target.getTime();
  }

  return null;
}

/** Human-readable seconds, e.g. 3725 -> "1h 2m 5s". Used in every reply. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return "0s";

  const parts: string[] = [];
  const units: [string, number][] = [
    ["d", 86_400],
    ["h", 3600],
    ["m", 60],
    ["s", 1],
  ];
  let rest = s;
  for (const [label, size] of units) {
    const n = Math.floor(rest / size);
    if (n > 0) {
      parts.push(`${n}${label}`);
      rest -= n * size;
    }
  }
  // Three parts is where it stops reading as a duration and starts reading as
  // a serial number.
  return parts.slice(0, 3).join(" ");
}
