# Build A House Leaderboard

`/leaderboard` opens **Build A House Leaderboard** exclusively in Discord server
`700382994946588814`. In every other server, the existing XP handler remains in use.
The target server does not need Discord leveling enabled to use this leaderboard.

The existing optional `page` argument is supported. A selector switches between
collection, home value, playtime, and total money earned. Only the person who opened
the view can change its selection or page; controls expire after five minutes.
Rankings use the latest submitted stats and show each submission's age.

The target server has a **Build A House Leaderboard** dashboard page with a
submission-channel picker. Other servers do not see it, and the server action
rejects writes for other guilds. The selected channel is stored under the
`buildahouse` feature config. A future screenshot handler must read that setting;
changing it does not require a code edit or redeployment.

## Deployment

Generate the Prisma client and apply the additive schema change to the bot's
`rukus` schema using the existing database deployment procedure, then deploy the
bot. No commands or live database changes have been deployed by this change.
The bot requires the new `BuildAHouseStats` table before it can display rankings.
Existing XP data and the shared database's `public` schema are unaffected.

## Submission integration still required

This change implements server routing, storage, and the leaderboard view. It does
**not** implement the in-game stat card, screenshot decoding and identity checks,
validation, or new lifetime counters. Until that submission flow is implemented,
the leaderboard has no entries. Do not import arbitrary screenshots as verified
player data.

The intended flow is: open the in-game card, capture it, and upload it to the
Discord bot, with no separate code-entry step. The card should carry a versioned
machine-readable payload and readable stat labels. Corner markers can help image
alignment but cannot prove authenticity. A checksum can detect damaged captures,
but cannot stop an edited or forged card. Screenshot ownership and Epic account
ownership must not be treated as equivalent.

The submission flow should upsert one row per `(guildId, userId)` after decoding
and applying the chosen validation and moderation rules. `homeValue` must
come from the game's existing home-value calculation. Store full integer values,
not rounded HUD abbreviations. `playtimeSeconds`, `homeValue`, and
`totalMoneyEarned` use Postgres bigint; collection uses an integer. Reject negative
values and out-of-range values before saving. Set `submittedAt` server-side.

Test the pure routing and formatting rules with:

```sh
pnpm --filter @rukus/bot exec tsx --test tests/build-a-house.test.ts
```
