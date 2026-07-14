import { env } from "../../env.js";
import { log } from "../../lib/logger.js";
import { fetchWithTimeout, type SocialItem } from "./types.js";

/**
 * Twitch live alerts via the Helix API.
 *
 * Twitch is the one provider that needs credentials. They are OPTIONAL: an
 * operator running only YouTube/RSS feeds should not have to register a Twitch
 * app, so when either var is missing we log once and skip Twitch feeds rather
 * than refusing to boot.
 *
 * Auth is the client-credentials ("app access token") flow: no user is involved,
 * the token is good for ~60 days, and it is the only thing helix/streams needs.
 */

const TOKEN_URL = "https://id.twitch.tv/oauth2/token";
const STREAMS_URL = "https://api.twitch.tv/helix/streams";

/** Cached app token. Refreshed a minute early so an in-flight call can't race the expiry. */
let token: { value: string; expiresAt: number } | null = null;
let warnedMissingCreds = false;

/** True when Twitch feeds can actually be polled. */
export function twitchConfigured(): boolean {
  return Boolean(env.TWITCH_CLIENT_ID && env.TWITCH_CLIENT_SECRET);
}

/** Log the "no credentials" notice at most once per process, not once per poll. */
export function warnIfUnconfigured(): void {
  if (twitchConfigured() || warnedMissingCreds) return;
  warnedMissingCreds = true;
  log.warn(
    "Twitch social feeds are configured but TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET are unset - skipping them. YouTube and RSS feeds are unaffected.",
  );
}

async function appToken(): Promise<string | null> {
  if (!twitchConfigured()) return null;
  if (token && token.expiresAt > Date.now()) return token.value;

  const body = new URLSearchParams({
    client_id: env.TWITCH_CLIENT_ID!,
    client_secret: env.TWITCH_CLIENT_SECRET!,
    grant_type: "client_credentials",
  });

  const res = await fetchWithTimeout(TOKEN_URL, { method: "POST", body });
  if (!res.ok) {
    // Bad credentials should not kill the poller: the other providers still work.
    log.error(`Twitch token request failed (${res.status}). Check TWITCH_CLIENT_ID/SECRET.`);
    return null;
  }

  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return null;

  token = {
    value: json.access_token,
    expiresAt: Date.now() + Math.max(60, (json.expires_in ?? 3600) - 60) * 1000,
  };
  return token.value;
}

interface HelixStream {
  id: string;
  user_login: string;
  user_name: string;
  title: string;
  game_name: string;
  thumbnail_url: string;
}

/** Strip a URL or an @handle down to the bare login name Helix expects. */
export function normalizeLogin(source: string): string {
  const value = source.trim().replace(/^@/, "");
  const fromUrl = /(?:twitch\.tv\/)([A-Za-z0-9_]{3,25})/.exec(value);
  return (fromUrl?.[1] ?? value).toLowerCase();
}

/**
 * Current stream for a login, or an explicitly-offline item.
 *
 * Unlike the other providers, "nothing new" and "they went offline" are
 * different outcomes here: the caller needs the offline signal to take the live
 * role back. So a null return means "could not check", not "not live".
 */
export async function currentStream(source: string): Promise<SocialItem | null> {
  const auth = await appToken();
  if (!auth) return null;

  const login = normalizeLogin(source);
  if (!login) return null;

  const res = await fetchWithTimeout(
    `${STREAMS_URL}?user_login=${encodeURIComponent(login)}`,
    {
      headers: {
        "client-id": env.TWITCH_CLIENT_ID!,
        authorization: `Bearer ${auth}`,
      },
    },
  );

  if (res.status === 401) {
    // The cached token was rejected (revoked or rotated). Drop it so the next
    // tick mints a fresh one instead of failing forever.
    token = null;
    throw new Error("Twitch rejected the app token");
  }
  if (!res.ok) throw new Error(`Twitch streams ${res.status} for ${login}`);

  const json = (await res.json()) as { data?: HelixStream[] };
  const stream = json.data?.[0];

  // An empty data array is Twitch's way of saying "not live".
  if (!stream) {
    return {
      id: `offline:${login}`,
      title: "",
      link: `https://twitch.tv/${login}`,
      live: false,
    };
  }

  return {
    id: stream.id,
    title: stream.title || `${stream.user_name} is live`,
    link: `https://twitch.tv/${stream.user_login}`,
    author: stream.user_name,
    thumbnail: stream.thumbnail_url
      .replace("{width}", "1280")
      .replace("{height}", "720"),
    description: stream.game_name ? `Playing ${stream.game_name}` : undefined,
    live: true,
  };
}
