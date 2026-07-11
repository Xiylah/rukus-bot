# Deploying Rukus (bot + dashboard)

Both pieces deploy to **Railway**, as two services from the same GitHub repo.

| Service       | Root dir  | What it is                        |
| ------------- | --------- | --------------------------------- |
| **bot**       | `rukus-bot` | discord.js bot (Prisma → Postgres) |
| **dashboard** | `rukus-bot` | Next.js web dashboard (Supabase JS) |

> **Why not Cloudflare Pages?** Cloudflare Pages requires Next's *edge runtime*,
> which breaks React Server Components in this app (every page 500s). Running on
> Railway under Node works correctly. You can still use your Cloudflare domain —
> just point a DNS record at the Railway service (see "Custom domain" below).

---

## Step 1 — Supabase (one time)

The bot's tables live in a `rukus` schema, isolated from your Roblox game's
`public` tables. The dashboard reads them through Supabase's REST API, which
needs **two** things:

1. **Expose the schema:** Supabase → **Settings → API → Data API → Exposed
   schemas** → add `rukus` (keep `public`) → **Save**.
2. **Grant the API roles:** paste
   [`packages/db/prisma/grants.sql`](packages/db/prisma/grants.sql) into Supabase
   → **SQL Editor** → Run. (Prisma created the schema, so Supabase never granted
   its API roles access — without this you get `permission denied for schema rukus`.)

Create the tables (from your PC, once):

```bash
cd rukus-bot
pnpm install && pnpm db:generate && pnpm db:push
```

Verify everything with `pnpm check-env`.

---

## Step 2 — Push to GitHub

```bash
git add -A && git commit -m "deploy" && git push
```

---

## Step 3 — Railway: the BOT service

> 🔴 **Delete or pause your old `main.py` Railway project first.** It uses the
> same Discord token, and two processes on one token knock each other offline.

1. Railway → **New Project → Deploy from GitHub repo** → `Xiylah/rukus-bot`
2. **Settings → Root Directory:** `rukus-bot`
3. Build/start commands are read automatically from `rukus-bot/railway.json`.
4. **Variables:**
   ```
   DATABASE_URL
   DIRECT_URL
   DISCORD_BOT_TOKEN
   DISCORD_CLIENT_ID
   DISCORD_GUILD_ID
   DEEPL_API_KEY          (optional)
   ```
5. Deploy. Logs should show:
   ```
   Logged in as Rukus#1886
   Registered 8 command(s) to guild ...
   ```

Slash commands register themselves on boot — no separate step.

---

## Step 4 — Railway: the DASHBOARD service

In the **same Railway project**, click **New → GitHub Repo** → same repo. Then:

1. **Settings → Root Directory:** `rukus-bot`
2. **Settings → Build Command** (override):
   ```
   pnpm install --frozen-lockfile=false && pnpm --filter @rukus/db exec prisma generate && pnpm --filter @rukus/web build
   ```
3. **Settings → Start Command** (override):
   ```
   pnpm --filter @rukus/web start
   ```
4. **Settings → Networking → Generate Domain** (gives you a public URL).
5. **Variables:**
   ```
   SUPABASE_URL
   SUPABASE_SERVICE_ROLE_KEY
   DISCORD_CLIENT_ID
   DISCORD_CLIENT_SECRET
   DISCORD_BOT_TOKEN          (used to check staff roles)
   DISCORD_GUILD_ID
   AUTH_SECRET
   NEXTAUTH_URL               = the public URL from step 4
   ```
6. **Discord Dev Portal → OAuth2 → Redirects** → add:
   ```
   https://YOUR-DASHBOARD-URL/api/auth/callback/discord
   ```
7. Redeploy, then open the URL and sign in.

---

## Custom domain (use your Cloudflare domain)

1. Railway → dashboard service → **Settings → Networking → Custom Domain** →
   enter `dashboard.yourdomain.com`. Railway shows a CNAME target.
2. Cloudflare → your domain → **DNS** → add a **CNAME** record pointing
   `dashboard` at that target. (Proxy on/orange-cloud is fine.)
3. Update `NEXTAUTH_URL` to `https://dashboard.yourdomain.com` and add the same
   `/api/auth/callback/discord` redirect in the Discord portal.

---

## Step 5 — Let your staff in

1. Sign in yourself (you have Manage Server).
2. Your server → **🔑 Access** → paste your staff **role IDs**.
3. Share the URL. Those roles can now configure the bot; only Manage-Server users
   can change the Access page itself.

---

## Troubleshooting

| Symptom | Fix |
| --- | --- |
| **`Can't reach database server at db.<ref>.supabase.co`** (works locally, fails on Railway) | You're using Supabase's **direct** host, which is **IPv6-only** — Railway has no IPv6 egress. Switch `DATABASE_URL`/`DIRECT_URL` to the **pooler** host (`aws-N-<region>.pooler.supabase.com`, ports 6543 / 5432). Supabase → **Connect** → Transaction pooler. |
| `permission denied for schema rukus` | Run `packages/db/prisma/grants.sql` (Step 1.2). |
| `Invalid schema: rukus` | Expose `rukus` in Supabase Data API settings (Step 1.1) — and click **Save**. |
| Dashboard login loops / callback error | `NEXTAUTH_URL` must exactly match the site URL, and that URL + `/api/auth/callback/discord` must be in Discord's OAuth redirects. |
| Bot online but no slash commands | Check logs for "Registered N command(s)". Or run `pnpm bot:deploy-commands`. |
| Bot keeps disconnecting/reconnecting | The old `main.py` is still running on the same token. Stop it. |
| "Couldn't create ticket" | Bot lacks **Manage Channels**, or the category ID is wrong. |
