import {
  createCanvas,
  loadImage,
  GlobalFonts,
  type SKRSContext2D,
  type Image,
} from "@napi-rs/canvas";
import type { LevelingConfig } from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * The /rank image.
 *
 * Everything here runs on server-supplied input (a background URL anyone with
 * Manage Server can set) and on a user avatar we do not control, so nothing in
 * this file is allowed to throw: a bad image must degrade to a flat colour, and
 * a broken canvas must degrade to the old embed. `renderRankCard` returns null
 * rather than rejecting so the caller can make that choice without a try/catch.
 */

const WIDTH = 934;
const HEIGHT = 282;

/** Remote images are attacker-shaped input: bound the time and the bytes. */
const FETCH_TIMEOUT_MS = 5_000;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

/**
 * Whether image rendering is available at all. The native canvas binding can
 * fail to load on an unsupported host; when it does we never try again, we just
 * let the caller keep using the embed.
 */
export const CARD_RENDERING_AVAILABLE = probeCanvas();

function probeCanvas(): boolean {
  try {
    createCanvas(1, 1).getContext("2d").fillRect(0, 0, 1, 1);
    return true;
  } catch (err) {
    log.warn(`Rank cards disabled, canvas unavailable: ${String(err)}`);
    return false;
  }
}

export interface RankCardOptions {
  username: string;
  /** Legacy #1234 tag. Omitted for migrated accounts. */
  discriminator?: string;
  avatarUrl: string;
  level: number;
  rank: number;
  xpInLevel: number;
  xpForLevel: number;
  totalXp: number;
  voiceMinutes?: number;
  card: LevelingConfig["card"];
}

/**
 * Draw the card. Returns null when rendering is impossible, which tells the
 * caller to fall back to the embed instead of showing the member an error.
 */
export async function renderRankCard(
  opts: RankCardOptions,
): Promise<Buffer | null> {
  if (!CARD_RENDERING_AVAILABLE) return null;

  try {
    return await draw(opts);
  } catch (err) {
    log.warn(`Rank card render failed: ${String(err)}`);
    return null;
  }
}

async function draw(opts: RankCardOptions): Promise<Buffer> {
  const { card } = opts;
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  await paintBackground(ctx, card);

  const avatarSize = 168;
  const avatarX = 46;
  const avatarY = (HEIGHT - avatarSize) / 2;
  await paintAvatar(ctx, opts, avatarX, avatarY, avatarSize, card.accentColor);

  const textLeft = avatarX + avatarSize + 36;
  const textRight = WIDTH - 46;

  // The right block (RANK / LEVEL) is drawn first so we know how much room the
  // username has before it needs an ellipsis.
  const rightEdge = paintStanding(ctx, opts, textRight);

  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  ctx.fillStyle = card.textColor;
  ctx.font = `bold 40px ${SANS}`;
  const nameLimit = Math.max(120, rightEdge - textLeft - 24);
  const name = opts.discriminator
    ? `${opts.username}#${opts.discriminator}`
    : opts.username;
  ctx.fillText(truncate(ctx, name, nameLimit), textLeft, 118);

  paintProgress(ctx, opts, textLeft, textRight);

  return canvas.toBuffer("image/png");
}

/** A stack the native binding is guaranteed to resolve to something. */
const SANS = GlobalFonts.families.length
  ? `"${GlobalFonts.families[0]!.family}", sans-serif`
  : "sans-serif";

async function paintBackground(
  ctx: SKRSContext2D,
  card: LevelingConfig["card"],
): Promise<void> {
  ctx.fillStyle = card.backgroundColor;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  if (!card.backgroundUrl) return;

  const image = await fetchImage(card.backgroundUrl);
  if (!image) return;

  drawCover(ctx, image);

  // Whatever wallpaper they picked, the text on top of it has to stay legible.
  ctx.fillStyle = `rgba(0, 0, 0, ${card.opacity / 100})`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

/** object-fit: cover, so a wide or tall image is cropped rather than squashed. */
function drawCover(ctx: SKRSContext2D, image: Image): void {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

async function paintAvatar(
  ctx: SKRSContext2D,
  opts: RankCardOptions,
  x: number,
  y: number,
  size: number,
  ring: string,
): Promise<void> {
  const r = size / 2;
  const cx = x + r;
  const cy = y + r;

  const image = await fetchImage(opts.avatarUrl);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  if (image) {
    ctx.drawImage(image, x, y, size, size);
  } else {
    // No avatar: a plain disc with their initial still looks deliberate.
    ctx.fillStyle = ring;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = opts.card.textColor;
    ctx.font = `bold ${Math.round(size * 0.45)}px ${SANS}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initial(opts.username), cx, cy + 2);
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 3, 0, Math.PI * 2);
  ctx.strokeStyle = ring;
  ctx.lineWidth = 6;
  ctx.stroke();
  ctx.restore();
}

/** Right-aligned RANK / LEVEL. Returns the leftmost pixel the block used. */
function paintStanding(
  ctx: SKRSContext2D,
  opts: RankCardOptions,
  right: number,
): number {
  const { card } = opts;
  ctx.textAlign = "right";
  ctx.textBaseline = "alphabetic";

  let x = right;
  const baseline = 84;

  const value = (text: string, color: string, size: number) => {
    ctx.font = `bold ${size}px ${SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, baseline);
    x -= ctx.measureText(text).width + 12;
  };
  const label = (text: string, color: string) => {
    ctx.font = `bold 26px ${SANS}`;
    ctx.fillStyle = color;
    ctx.fillText(text, x, baseline);
    x -= ctx.measureText(text).width;
  };

  value(String(opts.level), card.accentColor, 46);
  label("LEVEL", card.subTextColor);

  if (card.showRank) {
    x -= 18;
    value(`#${format(opts.rank)}`, card.textColor, 46);
    label("RANK", card.subTextColor);
  }

  return x;
}

function paintProgress(
  ctx: SKRSContext2D,
  opts: RankCardOptions,
  left: number,
  right: number,
): void {
  const { card } = opts;
  const width = right - left;
  const height = 34;
  const y = 186;
  const radius = height / 2;

  const ratio =
    opts.xpForLevel > 0
      ? Math.min(1, Math.max(0, opts.xpInLevel / opts.xpForLevel))
      : 0;

  roundedRect(ctx, left, y, width, height, radius);
  ctx.fillStyle = card.barBackground;
  ctx.fill();

  // A sliver of fill still has to read as a pill, not as a sharp-edged chip.
  const fill = Math.max(ratio > 0 ? height : 0, width * ratio);
  if (fill > 0) {
    roundedRect(ctx, left, y, fill, height, radius);
    ctx.fillStyle = card.accentColor;
    ctx.fill();
  }

  if (card.showXpNumbers) {
    ctx.textBaseline = "alphabetic";
    ctx.font = `bold 24px ${SANS}`;
    ctx.fillStyle = card.subTextColor;
    ctx.textAlign = "right";
    ctx.fillText(
      `${format(opts.xpInLevel)} / ${format(opts.xpForLevel)} XP`,
      right,
      y - 14,
    );

    ctx.textAlign = "left";
    const totals =
      opts.voiceMinutes && opts.voiceMinutes > 0
        ? `${format(opts.totalXp)} XP total · ${format(opts.voiceMinutes)} voice min`
        : `${format(opts.totalXp)} XP total`;
    ctx.fillText(totals, left, y - 14);
  }
}

function roundedRect(
  ctx: SKRSContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.arcTo(x + w, y, x + w, y + radius, radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.arcTo(x + w, y + h, x + w - radius, y + h, radius);
  ctx.lineTo(x + radius, y + h);
  ctx.arcTo(x, y + h, x, y + h - radius, radius);
  ctx.lineTo(x, y + radius);
  ctx.arcTo(x, y, x + radius, y, radius);
  ctx.closePath();
}

/**
 * Load a remote image, or null.
 *
 * Never throws. The URL can be anything a server owner typed, so the request is
 * capped in time and in bytes and is only accepted if the server says it is an
 * image; a 2GB "background" must not be able to sit on the event loop or eat
 * the heap.
 */
/**
 * Refuse URLs that point back inside our own infrastructure.
 *
 * The bot is public, so this URL is typed by whoever owns some server we have
 * never met. Without this, "background image" is a request forgery primitive:
 * point it at 169.254.169.254 and the host's cloud metadata (credentials
 * included) gets fetched by our own process. We cannot see the response body
 * here, but a timing or error-shape oracle is still a leak, and there is no
 * legitimate reason for a rank-card background to live on a private address.
 *
 * Hostnames are checked, not resolved IPs, so a DNS name that resolves to a
 * private address still gets through. Closing that needs a resolve-then-pin
 * fetch, which Node's fetch cannot express; the literal forms below are what
 * actually get typed in practice.
 */
function isBlockedHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");

  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal")) {
    return true;
  }
  // IPv6 loopback and link-local.
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }

  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];

  return (
    a === 0 || // this network
    a === 127 || // loopback
    a === 10 || // private
    (a === 172 && b >= 16 && b <= 31) || // private
    (a === 192 && b === 168) || // private
    (a === 169 && b === 254) || // link-local, incl. the cloud metadata endpoint
    (a === 100 && b >= 64 && b <= 127) // carrier-grade NAT
  );
}

async function fetchImage(url: string): Promise<Image | null> {
  if (!/^https?:\/\//i.test(url)) return null;

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (isBlockedHost(parsed.hostname)) {
    log.warn(`Rank card background points at a private address, refusing: ${parsed.hostname}`);
    return null;
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), FETCH_TIMEOUT_MS);
  try {
    // redirect: "manual" would break legitimate CDNs, so redirects are followed,
    // but a redirect to a private address is re-checked below.
    const res = await fetch(url, { signal: abort.signal, redirect: "follow" });
    if (!res.ok || !res.body) return null;

    // A public URL can 302 to an internal one, which would sail past the check
    // above. res.url is the FINAL url after redirects.
    try {
      if (isBlockedHost(new URL(res.url).hostname)) {
        log.warn(`Rank card background redirected to a private address, refusing.`);
        return null;
      }
    } catch {
      return null;
    }

    const type = res.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("image/")) return null;

    const declared = Number(res.headers.get("content-length") ?? "0");
    if (declared > MAX_IMAGE_BYTES) return null;

    const bytes = await readCapped(res.body);
    if (!bytes) return null;

    return await loadImage(bytes);
  } catch (err) {
    log.debug(`Rank card image fetch failed for ${url}: ${String(err)}`);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Read the body but stop the moment it goes over the cap; a lying or absent
 *  Content-Length must not turn into unbounded memory. */
async function readCapped(
  body: ReadableStream<Uint8Array>,
): Promise<Buffer | null> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_IMAGE_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return size > 0 ? Buffer.concat(chunks) : null;
}

/** Shorten with an ellipsis until it fits `max` pixels in the current font. */
function truncate(ctx: SKRSContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) {
    cut = cut.slice(0, -1);
  }
  return `${cut}…`;
}

function initial(username: string): string {
  const ch = [...username.trim()][0];
  return ch ? ch.toUpperCase() : "?";
}

function format(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}
