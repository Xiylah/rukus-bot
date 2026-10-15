export interface StatCard {
  cardId: string;
  collection: number;
  homeValue: bigint;
  playtimeSeconds: bigint;
  goldBalance: bigint;
  capturedAt: Date;
  displayName: string | null;
}

export class CardError extends Error {}

export function cardChecksum(values: readonly bigint[]): bigint {
  return values.reduce((check, value) => (check * 131n + value % 1000003n) % 1000003n, 17n);
}

const CARD_SYMBOLS = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CARD_WIDTHS = [6, 6, 4, 13, 7, 13, 7, 4] as const;

export function encodeGroupedCard(values: readonly bigint[]): string {
  if (values.length !== CARD_WIDTHS.length) throw new CardError("Invalid card fields");
  let offset = 0;
  let raw = "";
  for (const [index, value] of values.entries()) {
    const width = CARD_WIDTHS[index]!;
    if (value < 0n || value >= 32n ** BigInt(width)) throw new CardError("Card field is too large");
    let remaining = value;
    let word = "";
    for (let place = width - 1; place >= 0; place--) {
      const digit = Number(remaining % 32n);
      word = CARD_SYMBOLS[(digit + (offset + place) * 7 + 11) % 32]! + word;
      remaining /= 32n;
    }
    raw += word;
    offset += width;
  }
  return ["BAH2", ...["A", "B", "C"].map((label, row) => `${label} ${Array.from({ length: 5 }, (_, group) => raw.slice(row * 20 + group * 4, row * 20 + group * 4 + 4)).join(" ")}`)].join("\n");
}

function decodeGroupedCard(lines: string[], now: number): StatCard {
  const headers = lines.flatMap((line, index) => /^BAH2$/i.test(line) ? [index] : []);
  if (headers.length !== 1 || lines.some((line) => /^BAH1$/i.test(line))) throw new CardError("Upload one whole stat card at a time.");
  let raw = "";
  for (const label of ["A", "B", "C"]) {
    const matches = lines.slice(headers[0]! + 1).flatMap((line) => {
      const match = line.match(new RegExp(`^${label}\\s*([2-9A-HJ-NP-Z ]+)$`, "i"));
      return match ? [match[1]!.replace(/ /g, "").toUpperCase()] : [];
    });
    if (matches.length !== 1 || matches[0]!.length !== 20) throw new CardError(`Couldn't read code row ${label}. Please upload a clearer screenshot.`);
    raw += matches[0];
  }
  let offset = 0;
  const values = CARD_WIDTHS.map((width) => {
    let value = 0n;
    for (let place = 0; place < width; place++) {
      const position = offset + place;
      const symbol = CARD_SYMBOLS.indexOf(raw[position]!);
      const digit = (symbol - (position * 7 + 11) % 32 + 32) % 32;
      value = value * 32n + BigInt(digit);
    }
    offset += width;
    return value;
  });
  const [idA, idB, collection, home, playtime, gold, stamp, check] = values;
  const possibleName = lines.slice(0, headers[0]).filter(Boolean).at(-1);
  const name = possibleName && !/BUILD A HOUSE|LEADERBOARD/i.test(possibleName) ? `PLAYER ${possibleName}\n` : "";
  return decodeStatCard(`${name}BAH1\nID ${idA} ${idB}\nCOLLECTION ${collection}\nHOME ${home}\nPLAYTIME ${playtime}\nGOLD ${gold}\nSTAMP ${stamp}\nCHECK ${check}`, now);
}

export function decodeStatCard(text: string, now = Date.now()): StatCard {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trim());
  if (lines.some((line) => /^BAH2$/i.test(line))) return decodeGroupedCard(lines, now);
  if (lines.filter((line) => /^BAH1$/i.test(line)).length !== 1) {
    throw new CardError("Couldn't find one Build A House card. Upload a clear screenshot of the whole card.");
  }
  const read = (label: string): string => {
    const matches = lines.flatMap((line) => {
      const found = line.match(new RegExp(`^${label}\\s+([0-9 ]+)$`, "i"));
      return found ? [found[1]!.replace(/ /g, "")] : [];
    });
    if (matches.length !== 1 || !matches[0]) throw new CardError(`Couldn't read ${label}. Take a sharper screenshot of the whole card.`);
    return matches[0];
  };
  const cardId = read("ID");
  if (!/^[1-9][0-9]{8}[1-9][0-9]{8}$/.test(cardId)) throw new CardError("Couldn't read the card identity. Please capture the card again.");
  const idA = BigInt(cardId.slice(0, 9));
  const idB = BigInt(cardId.slice(9));
  const keys = ["COLLECTION", "HOME", "PLAYTIME", "GOLD", "STAMP", "CHECK"];
  const numbers = keys.map((key) => {
    const value = read(key);
    if (value.length > 19) throw new CardError("A value is too large. Please capture the card again.");
    return BigInt(value);
  });
  const [collection, homeValue, playtimeSeconds, goldBalance, stamp, check] = numbers as [bigint, bigint, bigint, bigint, bigint, bigint];
  if (collection > 100000n || homeValue > 9223372036854775807n || goldBalance > 9223372036854775807n || playtimeSeconds > 3155760000n) {
    throw new CardError("The card contains an out-of-range stat.");
  }
  if (cardChecksum([idA, idB, collection, homeValue, playtimeSeconds, goldBalance, stamp]) !== check) {
    throw new CardError("The card didn't read correctly. Please upload a clear, unedited screenshot.");
  }
  const age = BigInt(Math.floor(now / 1000)) - stamp;
  if (age < -300n || age > 86400n) throw new CardError("This card has expired or has an invalid time. Open a new stat card in-game.");
  const nameLine = lines.find((line) => /^PLAYER\s+/i.test(line));
  return {
    cardId, collection: Number(collection), homeValue, playtimeSeconds, goldBalance,
    capturedAt: new Date(Number(stamp) * 1000),
    displayName: nameLine?.replace(/^PLAYER\s+/i, "").slice(0, 64) || null,
  };
}

export function validateCardUpdate(previous: {
  cardId: string | null; capturedAt: Date | null; playtimeSeconds: bigint; goldBalance: bigint;
} | null, card: StatCard): void {
  if (!previous) return;
  if (previous.cardId && previous.cardId !== card.cardId) throw new CardError("Your Discord account is already linked to another card identity. Contact a moderator.");
  if (previous.capturedAt && previous.capturedAt >= card.capturedAt) throw new CardError("You've already submitted this card or a newer one. Open a fresh card to update your stats.");
  if (card.playtimeSeconds < previous.playtimeSeconds) {
    throw new CardError("Playtime went backwards. Please open a fresh card or contact a moderator.");
  }
}
