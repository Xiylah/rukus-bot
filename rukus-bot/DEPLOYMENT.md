# Deploying Rukus (bot + dashboard)

Two pieces deploy to two places:

| Piece         | Runs on          | Data access                    |
| ------------- | ---------------- | ------------------------------ |
| **Bot**       | Railway (Node)   | Prisma → Postgres              |
| **Dashboard** | Cloudflare Pages | Supabase JS → PostgREST (edge) |

Both read/write the **same Supabase database**, just through different doors.

---

## Prerequisites checklist

- [ ] Supabase project (you have this)
- [ ] Discord application with bot token + OAuth client secret
- [ ] Railway account (you have this)
- [ ] Cloudflare account + a domain on it (you have this)
- [ ] Your Rukus server ID

---

## Step 1 — Fill in `.env` and create the database tables

`.env` lives at `rukus-bot/.env` (already created for you). Fill in every value
— see the table in the main [README](README.md#3-configure-environment) plus
these two dashboard-only ones:

```
SUPABASE_URL="https://ycsygssnegqrvtdnbpzk.supabase.co"     # your project URL
SUPABASE_SERVICE_ROLE_KEY="..."                             # Settings → API → service_role
```

The `DATABASE_URL` / `DIRECT_URL` are the **Postgres** strings (start with
`postgresql://`), found under **Supabase → Connect → ORMs / Connection string**.
They are NOT the `https://...supabase.co` URL.

Then create the tables (run once, from your machine):

```bash
cd rukus-bot
pnpm install
pnpm db:generate
pnpm db:push          # creates the bot's tables in the `rukus` schema
```

> Do this from your PC. It uses the direct Postgres connection, which needs no
> special hosting.

### ⚠️ Shared database — the bot uses its own `rukus` schema

This Supabase database is **shared with your Roblox game** (its tables live in
`public`: `leaderboard`, `saves`, `ratings`, `rc_scores`). To keep them 100%
separate, **all bot tables live in a dedicated `rukus` Postgres schema**. Prisma
only ever manages `rukus`, so it can never drop or alter the game's tables.

**One required Supabase setting for the dashboard:** Supabase's REST API only
exposes the `public` schema by default. The dashboard reads config through that
API, so you must expose `rukus`:

1. Supabase → **Project Settings → API → Data API**.
2. Under **"Exposed schemas"**, add `rukus` (keep `public` too).
3. Save. (No effect on the bot — it connects via Postgres directly, not the API.)

Without this, the dashboard will load but show empty/erroring settings while the
bot works fine.

---

## Step 2 — Deploy the BOT to Railway

1. Push this repo to GitHub (see [main README](README.md) if it isn't a repo
   yet).
2. Railway → **New Project → Deploy from GitHub repo** → pick the repo.
3. **Settings → Root Directory:** `rukus-bot`
4. **Settings → Build Command:** `pnpm install && pnpm db:generate`
5. **Settings → Start Command:** `pnpm --filter @rukus/bot start`
6. **Variables:** add everything from `.env` EXCEPT the two `SUPABASE_*` dashboard
   vars (the bot doesn't need them). It DOES need `DATABASE_URL`, `DIRECT_URL`,
   `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_GUILD_ID`, and optionally
   `DEEPL_API_KEY`.
7. Deploy. Then register the slash commands once (from your PC, or a Railway
   one-off shell):
   ```bash
   pnpm bot:deploy-commands
   ```

Check the Railway logs for `Logged in as <bot>#0000.`

---

## Step 3 — Deploy the DASHBOARD to Cloudflare Pages

> **Important:** the Cloudflare build runs on Cloudflare's Linux servers, not
> your PC. The local `pnpm --filter @rukus/web pages:build` command does **not**
> work reliably on Windows (a known `@cloudflare/next-on-pages` limitation) — you
> don't need it. Just connect the repo and let Cloudflare build.

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick this repo.
3. **Build settings:**
   - **Framework preset:** none / custom
   - **Root directory:** `rukus-bot/apps/web`
   - **Build command:**
     ```
     npx @cloudflare/next-on-pages@1
     ```
   - **Build output directory:** `.vercel/output/static`
   - **Environment variables** (Settings → Environment variables — mark the
     secrets as **encrypted**):
     ```
     SUPABASE_URL              = https://....supabase.co
     SUPABASE_SERVICE_ROLE_KEY = <service_role key>   (secret)
     DISCORD_CLIENT_ID         = <app id>
     DISCORD_CLIENT_SECRET     = <oauth secret>        (secret)
     DISCORD_BOT_TOKEN         = <bot token>           (secret)
     DISCORD_GUILD_ID          = <your server id>
     AUTH_SECRET               = <openssl rand -base64 32>  (secret)
     NEXTAUTH_URL              = https://your-pages-url.pages.dev
     ```
   - **Compatibility flags:** add `nodejs_compat` (Settings → Functions →
     Compatibility flags, for both production and preview).
4. Deploy. Cloudflare gives you a `*.pages.dev` URL.

### Point your Cloudflare domain at it

Pages → your project → **Custom domains → Set up a custom domain** →
`dashboard.yourdomain.com`. Because the domain is already on Cloudflare, DNS is
one click. Then update:

- `NEXTAUTH_URL` → `https://dashboard.yourdomain.com`
- Discord → OAuth2 → Redirects → add
  `https://dashboard.yourdomain.com/api/auth/callback/discord`

Redeploy the Pages project so the new `NEXTAUTH_URL` takes effect.

---

## Step 4 — Let your admins/mods in

1. Log in yourself first (you have Manage Server) at your dashboard URL.
2. Open your server → **🔑 Access**.
3. Add your staff **role IDs** (Discord Developer Mode → right-click role → Copy
   ID). Anyone with those roles can now log in and edit settings.
   - Only **Manage Server** users can see/change the Access page itself, so staff
     can't grant themselves more power.
4. Share the dashboard URL with your staff. They click **Sign in with Discord**
   and land straight on the server settings.

---

## How access control works (so you can trust it)

- Every dashboard page/action runs a server-side guard before reading or writing
  anything.
- A user gets into a guild's dashboard if they have **Manage Server**, hold a
  configured **staff role**, or are on the **allow-list**.
- Staff roles are checked by asking Discord for the member's roles using the bot
  token (OAuth alone doesn't expose roles). The service-role Supabase key is only
  ever used server-side, after that check — it never reaches the browser.

---

## Troubleshooting

| Symptom                                   | Fix                                                                 |
| ----------------------------------------- | ------------------------------------------------------------------- |
| `db:push` fails with auth error           | Wrong DB password in `DATABASE_URL` — reset it in Supabase.         |
| Dashboard login loops / callback error    | `NEXTAUTH_URL` or the Discord OAuth **redirect URL** don't match.   |
| "Couldn't create ticket" in Discord       | Bot missing **Manage Channels**, or the category ID is wrong.       |
| Staff can log in but see no server        | They're not in the guild, or their role isn't in **Access**.        |
| Cloudflare build fails on `nodejs_compat` | Add the `nodejs_compat` compatibility flag (Step 3).               |
