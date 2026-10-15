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

export function decodeStatCard(text: string, now = Date.now()): StatCard {
  const normalized = text.replace(/\r/g, "");
  const lines = normalized.split("\n").map((line) => line.trim());
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
