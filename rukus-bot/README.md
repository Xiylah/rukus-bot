# Rukus Bot - all-in-one Discord bot + dashboard

A TypeScript monorepo containing **one all-in-one bot** plus a dashboard:

- **`apps/bot`** - a discord.js v14 bot with:
  - 🎫 **Tickets** - button panels, private channels, transcripts
  - 📝 **Forms** - modal applications with approve/deny review
  - 🌐 **Translation** - auto-translate, flag-reactions, `/translate`, context
    menus (DeepL preferred, Google fallback)
  - 💬 **Auto-responder** - replies to "when's the next event?" / "I lost my
    items" via keyword matching
  - 🛡️ **Moderation** - drug-term filter, image-only channel enforcement
- **`apps/web`** - a Next.js dashboard (Discord OAuth login) to configure every
  feature, MEE6 / Ticket Tool style.
- **`packages/db`** - Prisma schema + client (Postgres / Supabase).
- **`packages/shared`** - shared types, constants, and Zod schemas.

> This **replaces** the old Python bot (`main.py`, since removed - see git
> history). Its translation and event/lost-item responder were ported here, with
> one deliberate change: the responder now uses **keyword matching** rather than
> the Python sentence-transformer model, so it no longer auto-learns new
> phrasings - add server-specific wording on the dashboard's Auto-responder page
> instead. One bot, one token.

---

## Prerequisites

- **Node 20+** and **pnpm 10+** (`npm i -g pnpm`)
- A **Supabase** project (free tier is fine) → gives you Postgres
- A **second Discord application** for this bot (see below)

---

## 1. Create the Discord application

1. Go to <https://discord.com/developers/applications> → **New Application**
   (or reuse your existing bot's application).
2. **Bot** tab → **Reset Token** → copy it → this is `DISCORD_BOT_TOKEN`.
3. **Bot** tab → enable **both** privileged intents:
   - **Server Members Intent** (role granting on form approval)
   - **Message Content Intent** (translation, auto-responder, and the drug
     filter all read message text)
4. **General Information** → copy **Application ID** → this is
   `DISCORD_CLIENT_ID`.
5. **OAuth2** tab → copy **Client Secret** → this is `DISCORD_CLIENT_SECRET`.
6. **OAuth2 → Redirects** → add:
   `http://localhost:3000/api/auth/callback/discord`
   (and later your production URL, e.g.
   `https://your-dashboard.up.railway.app/api/auth/callback/discord`).
7. Invite the bot to your server with this URL (replace `CLIENT_ID`):
   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=268528656&scope=bot%20applications.commands
   ```
   The permission integer grants Manage Channels, Manage Roles, Send Messages,
   Embed Links, Attach Files, Read History, and Manage Messages.

---

## 2. Get your Supabase database URLs

Supabase → **Project Settings → Database → Connection string**:

- **`DATABASE_URL`** - the **Session pooler** URI (port `6543`), used by the app.
- **`DIRECT_URL`** - the **Direct connection** URI (port `5432`), used by Prisma
  for migrations.

Both go in `.env` (see below).

---

## 3. Configure environment

```bash
cd rukus-bot
cp .env.example .env
```

Fill in `.env`:

| Variable                | Where it comes from                                  |
| ----------------------- | ---------------------------------------------------- |
| `DATABASE_URL`          | Supabase Session pooler URI (6543)                   |
| `DIRECT_URL`            | Supabase Direct connection URI (5432)                |
| `DISCORD_BOT_TOKEN`     | Discord → Bot → Token                                |
| `DISCORD_CLIENT_ID`     | Discord → Application ID                             |
| `DISCORD_CLIENT_SECRET` | Discord → OAuth2 → Client Secret                     |
| `DISCORD_GUILD_ID`      | Your server ID (Dev Mode → right-click → Copy ID)    |
| `NEXTAUTH_URL`          | `http://localhost:3000` in dev                       |
| `AUTH_SECRET`           | run `openssl rand -base64 32`                        |

---

## 4. Install + set up the database

```bash
pnpm install
pnpm db:generate      # generate the Prisma client
pnpm db:push          # create the tables in Supabase
```

`db:push` is fine for getting started. For versioned migrations later, use
`pnpm db:migrate`.

---

## 5. Register the slash commands

Slash commands must be registered with Discord once (and after any command
change). This registers them to your guild for **instant** availability:

```bash
pnpm bot:deploy-commands
```

You should see `Successfully registered N command(s).`

---

## 6. Run it (development)

Two terminals:

```bash
pnpm bot:dev      # starts the Discord bot (hot-reload)
```

```bash
pnpm web:dev      # starts the dashboard at http://localhost:3000
```

Then:

1. Open <http://localhost:3000>, sign in with Discord.
2. Pick your server → configure **Tickets** and **Forms** → **Save**.
3. In Discord, run `/ticket panel` and `/form panel` to post the buttons.

---

## How the pieces talk to each other

```
Dashboard (Cloudflare Pages, edge)          Bot (Railway, Node)
   │  @rukus/supabase                           │  @rukus/db
   │  Supabase JS / PostgREST                    │  Prisma
   ▼                                             ▼
        ┌──────────── Supabase Postgres ────────────┐
        │   Guild · FeatureConfig · Ticket · ...     │
        └────────────────────────────────────────────┘
```

- Both apps talk to the **same database**, through different clients:
  - the **bot** (Node on Railway) uses **Prisma** (`@rukus/db`)
  - the **dashboard** (edge on Cloudflare Pages) uses the **Supabase JS client**
    (`@rukus/supabase`) - Prisma's raw Postgres connection doesn't run on the
    edge, so the dashboard goes through Supabase's REST layer instead.
- Both validate config with the **same Zod schemas** (`@rukus/shared`), so they
  always agree on shape.
- The dashboard **writes** config; the bot **reads** it on each interaction
  (cached ~15s). The database is the contract - no direct RPC.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the full hosting walkthrough.

## Who can use the dashboard

Access to a server's settings is granted when a logged-in user either:
1. has **Manage Server** on that server, or
2. holds one of the **staff roles** you configure on the dashboard's **🔑 Access**
   page, or
3. is on that page's explicit **allow-list**.

Only Manage-Server users can change the Access page itself, so staff can't
escalate their own access.

---

## Feature reference

### Tickets

- `/ticket setup` - quick-enable + set category / support role / transcript
  channel from Discord (also editable in the dashboard).
- `/ticket panel [channel]` - post the "Open a ticket" button.
- Opening creates a private channel; **Claim** / **Close** buttons live inside.
- Closing generates an HTML transcript (posted to the transcript channel if set)
  and shows **Reopen** / **Delete** to staff.

### Forms

- Build forms in the dashboard (max **5 questions** each - a hard Discord modal
  limit).
- `/form panel [channel]` - post a button per form.
- Submissions open a modal; answers are posted to the form's review channel with
  **Approve** / **Deny**. Approval can auto-grant a role and DMs the applicant.

### Translation

- Configure in the dashboard: **auto-translate** (reply to foreign messages),
  **flag-reactions** (react with 🇫🇷/🇪🇸/etc. to translate), and the auto-translate
  **target language**.
- `/translate <text> [to]` - translate on demand.
- Right-click a message → **Apps** → *Translate to English / French / Spanish*
  or *Detect Language*.
- Uses **DeepL** when `DEEPL_API_KEY` is set, otherwise **Google**. Results are
  cached and short/slang messages are skipped - same logic as the old bot.

### Auto-responder

- Enable it and set your **events channel** and **support channel** in the
  dashboard.
- Replies to event questions ("when's the next event/admin abuse?") and
  lost-item statements ("my items are gone") with a channel pointer.
- Add server-specific phrasings in the dashboard. Note: this uses **keyword +
  fuzzy matching**, not the Python ML model - it catches common phrasings but
  won't match every paraphrase the old bot could.

### Moderation

- **Drug filter** - deletes messages containing drug/substance terms and posts a
  short family-friendly reminder.
- **Image-only channel** - deletes text-only messages in the configured channel
  (e.g. a furniture/showcase channel).

---

## Deploying to Railway

Two services from this one repo:

**Bot service**
- Root directory: `rukus-bot`
- Build: `pnpm install && pnpm db:generate`
- Start: `pnpm --filter @rukus/bot start`
- Add all the `.env` vars. Run `pnpm bot:deploy-commands` once (Railway shell or
  locally) after deploy.

**Dashboard service**
- Root directory: `rukus-bot`
- Build: `pnpm install && pnpm db:generate && pnpm --filter @rukus/web build`
- Start: `pnpm --filter @rukus/web start`
- Set `NEXTAUTH_URL` to the service's public URL, and add that URL's
  `/api/auth/callback/discord` to the Discord OAuth redirects.

---

## Known limitations / next steps

- **Channel & role pickers** in the dashboard are currently **ID inputs**
  (enable Discord Developer Mode → right-click → Copy ID). A dropdown picker
  needs a small bot-side API that lists the guild's channels/roles - a good next
  addition.
- **Advanced moderation** (warn/mute/ban/timeout, mod-log, case history) is not
  built yet - only the basic drug filter + image-only channel are ported. The
  schema and dashboard are structured to add the rest as a feature module.
- The auto-responder uses **keyword matching**, not the ML semantic model the
  Python bot used. If you find it misses phrasings, add them in the dashboard's
  auto-responder "extra event phrasings" box.
- Config is keyed by `guildId` throughout, so going **multi-server** (public
  bot) later is mostly removing the single-guild gate in
  `apps/web/src/app/dashboard/page.tsx` and registering commands globally.
```
