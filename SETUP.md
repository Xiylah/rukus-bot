# Setup - step by step

Follow these in order. Each step says exactly what to click and what to paste.

---

## ✅ Already done for you

- Database tables created in Supabase (in an isolated `rukus` schema - your
  Roblox game's tables in `public` are untouched)
- `rukus-bot/.env` created, with the database URLs, Supabase URL, and a
  generated `AUTH_SECRET` already filled in
- Git repo initialized and committed (`.env` is git-ignored - your secrets will
  never reach GitHub)
- Railway build/start commands defined in `rukus-bot/package.json`

---

## Step 1 - Supabase: expose + grant the `rukus` schema  ✅ DONE

*(Recorded here in case you ever rebuild the database.)*

The bot's tables live in a `rukus` schema (isolated from your Roblox game's
`public` tables). Two separate things are needed for the **dashboard** to read
them - the bot doesn't need either, since it connects to Postgres directly.

**1a. Expose the schema to the API**
1. Supabase → **Settings** → **API** → **Data API** → **Exposed schemas**
2. Add **`rukus`** (keep `public`) → **click Save**

**1b. Grant the API roles permission on it**

Exposing only *routes* requests to the schema - it doesn't grant Postgres
privileges. Because Prisma (not Supabase) created `rukus`, Supabase never
applied its usual grants, so you'd get `permission denied for schema rukus`.

Fix - paste **[`rukus-bot/packages/db/prisma/grants.sql`](rukus-bot/packages/db/prisma/grants.sql)**
into Supabase → **SQL Editor** → Run. It only touches `rukus`, never `public`.

> `pnpm check-env` verifies both and tells you which one is missing.

---

## Step 2 - Get your 3 Discord values  ⏱️ 3 min

All three come from the **same Discord application your `main.py` bot uses**.

Open the [Discord Developer Portal](https://discord.com/developers/applications)
and click your bot's application.

| Value | Where | Paste into `.env` as |
| --- | --- | --- |
| **Bot token** | Old Railway project → your bot service → **Variables** → copy `TOKEN`.<br>(Or Dev Portal → **Bot** → **Reset Token** - but that breaks main.py until you update it.) | `DISCORD_BOT_TOKEN` |
| **Application ID** | Dev Portal → **General Information** → **Application ID** | `DISCORD_CLIENT_ID` |
| **Client secret** | Dev Portal → **OAuth2** → **Client Secret** → **Reset Secret** | `DISCORD_CLIENT_SECRET` |

Open `rukus-bot/.env` and paste each value between the quotes.

### Also enable the two privileged intents

Dev Portal → **Bot** → scroll to **Privileged Gateway Intents** → turn ON:
- ✅ **Server Members Intent** (for granting roles on form approval)
- ✅ **Message Content Intent** (for translation, auto-responder, drug filter)

### And add the OAuth redirect (for dashboard login)

Dev Portal → **OAuth2** → **Redirects** → **Add Redirect**:
```
http://localhost:3000/api/auth/callback/discord
```
(You'll add the production URL later, once the dashboard is deployed.)

---

## Step 3 - Verify everything works  ⏱️ 30 sec

```bash
cd rukus-bot
pnpm check-env
```

This checks every value AND actually calls Discord and Supabase to prove the
credentials work. Fix anything it flags, then re-run until you see:

```
✅ All required checks passed.
```

---

## Step 4 - Run it locally  ⏱️ 2 min

> ⚠️ **Stop your old main.py bot first.** A Discord token can only run one
> process at a time - if main.py is still running on Railway with the same
> token, the two bots will fight and keep disconnecting each other.

Register the slash commands (once, and after any command change):

```bash
pnpm bot:deploy-commands
```

Then, in two terminals:

```bash
pnpm bot:dev      # the Discord bot
```
```bash
pnpm web:dev      # the dashboard → http://localhost:3000
```

Try it: in Discord run `/ping`. Then open the dashboard, sign in, configure
**Tickets**, save, and run `/ticket panel` in Discord.

---

## Step 5 - Deploy the bot to a NEW Railway project  ⏱️ 5 min

1. **Push to GitHub.** Create a new empty repo on GitHub, then:
   ```bash
   git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
   git branch -M main
   git push -u origin main
   ```

2. **Railway** → **New Project** → **Deploy from GitHub repo** → select it.

3. **Settings → Root Directory:** `rukus-bot`
   *(Leave the build and start commands blank - the root `package.json` defaults
   to the bot. Only the dashboard service overrides the start command.)*

4. **Variables** → add these (copy the values from your local `.env`):

   ```
   DATABASE_URL
   DIRECT_URL
   DISCORD_BOT_TOKEN
   DISCORD_CLIENT_ID
   DISCORD_GUILD_ID
   ```
   Optional: `DEEPL_API_KEY`

   > The bot does **not** need `SUPABASE_*`, `AUTH_SECRET`, or
   > `DISCORD_CLIENT_SECRET` - those are dashboard-only.

5. **Deploy.** Watch the logs for:
   ```
   Logged in as YourBot#1234
   ```

6. **Turn off / delete the old main.py Railway project** so the two bots don't
   fight over the same token.

---

## Step 6 - Deploy the dashboard (a 2nd Railway service)  ⏱️ 10 min

The dashboard runs on **Railway** too, as a second service in the same project.
(Cloudflare Pages was ruled out: it requires Next's edge runtime, which breaks
React Server Components in this app. You can still use your **Cloudflare domain**
- just point a CNAME at the Railway service.)

Full walkthrough, including the custom-domain steps:
**[rukus-bot/DEPLOYMENT.md](rukus-bot/DEPLOYMENT.md#step-4--railway-the-dashboard-service)**

---

## Step 7 - Let your staff in  ⏱️ 2 min

1. Sign into the dashboard yourself (you have Manage Server).
2. Open your server → **🔑 Access**.
3. Paste your staff **role IDs** (Discord Developer Mode → right-click role →
   Copy ID).
4. Share the dashboard URL. Staff with those roles can now log in and configure
   the bot - but only Manage-Server users can change the Access page itself.

---

## Handy commands

| Command | What it does |
| --- | --- |
| `pnpm check-env` | Validates all credentials (live-tests Discord + Supabase) |
| `pnpm bot:dev` | Run the bot locally with hot-reload |
| `pnpm web:dev` | Run the dashboard at localhost:3000 |
| `pnpm bot:deploy-commands` | Register/refresh slash commands with Discord |
| `pnpm db:push` | Apply schema changes to the database |
| `pnpm db:studio` | Browse the database in a GUI |
