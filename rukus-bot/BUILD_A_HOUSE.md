# Build A House Leaderboard

`/leaderboard` opens **Build A House Leaderboard** only in server `700382994946588814`. Other servers retain XP rankings. The selector offers collection, home value, playtime, and **Gold Balance**. Gold is the existing saved `Money` balance. Candy, tickets, tokens, pizza-specific stats, and lifetime earnings are not ranked as gold. Spending gold can lower the ranking.

## Player flow

1. Open **Leaderboard Stat Card** using the new button in the island.
2. Capture the whole card in a clear screenshot or upright photo.
3. Upload one PNG or JPEG to the dashboard's selected stat-card channel.
4. The bot reads the card, saves a snapshot, and replies. Run `/leaderboard`.

No code-entry step is needed. A persistent random card identity is linked to the submitting Discord user on first upload. A card cannot be claimed by two Discord accounts, and an account cannot silently switch identities. Incorrect first claims require moderator review and a database correction.

## Dashboard and deployment

Only the target server has the **Build A House Leaderboard** dashboard page. Choose a dedicated text channel where the bot can view messages, read history, and reply. The existing Message Content intent must be enabled. Leave the channel unset to disable uploads. Settings refresh within five seconds; queued jobs recheck the setting before saving.

Before deploying:

1. Back up the bot database and apply `packages/db/prisma/build_a_house.sql`. It creates only the bot's `rukus` table and does not change the shared `public` schema.
2. Run `pnpm db:generate` and deploy the bot and dashboard through the existing process.
3. Select the submission channel in the dashboard.
4. Push/launch the matching UEFN changes and submit a real in-game screenshot.

The additive SQL also supports the earlier unreleased prototype. A legacy `totalMoneyEarned` column, if present, is retained with a default so old data is not dropped. The current code uses `goldBalance` only.

OCR uses the already-installed Tesseract library; no paid OCR service or new bot credentials are needed. Its host needs outbound HTTPS to download Discord attachments and English recognition data on first use. Language data is cached in the OS temporary directory. Images are processed in memory, not stored in the repository or stats table. The original upload remains in Discord.

## Island and card contract

The native Verse card is implemented in `LeaderboardCard.verse`. The placed `leaderboard_card_device` references the existing PropPlacer and a new button. Their editor labels are **Build A House Stat Card Controller** and **Build A House - Open Stat Card**, in the `Leaderboard` folder.

The `BAH1` data lines carry `ID` (two nine-digit integers), `COLLECTION`, `HOME`, `PLAYTIME` in seconds, `GOLD`, `STAMP` (epoch seconds), and `CHECK`. Full integers are used instead of abbreviated HUD numbers. The checksum starts at 17 and folds the seven values in that order using `(check * 131 + value % 1000003) % 1000003`.

Home value uses PropPlacer's existing `LiveHomeValue`. Collection counts true saved entries from all seven variant books within the current furniture catalog; it does not change the collection-book UI. Playtime starts after this update, with no fabricated historical totals. It is checkpointed every 30 seconds and flushed when opening a card. Abrupt departures may lose the uncheckpointed interval. Offline time is excluded. Gold comes directly from the saved `Money` field. No earnings hook is added to `save_functions.verse`.

Cards expire after 24 hours. Duplicate/older captures, decreasing playtime, damaged checksums, malformed numbers, and out-of-range values are rejected. Gold, home value, and collection may decrease in a newer snapshot. Unique identity constraints and serializable transactions protect concurrent submissions. Each image is limited to 8 MB and 20 megapixels. At most four jobs are queued, with a 15-second per-user cooldown and a 30-second OCR timeout. Only direct Discord attachments are downloaded.

## Trust and validation limits

These are **screenshot-submitted stats**, not server-authenticated Fortnite data. The checksum detects reading damage but does not prevent intentional forgery. The card identity prevents reuse after first linking; it does not prove Epic account ownership. Suspicious entries need moderator review.

Validation performed: Verse compilation, all workspace typechecks, six routing/decoder/formatting tests, and a generated-image OCR test. A live Discord/database upload and a real Fortnite capture still require deployment/playtesting.

```sh
pnpm -r typecheck
pnpm --filter @rukus/bot exec tsx --test tests/build-a-house.test.ts tests/stat-card.test.ts
TEST_CARD_OCR=1 pnpm --filter @rukus/bot exec tsx --test tests/stat-card-ocr.test.ts
```
## Grouped card format (BAH2)

New cards display the username alone, centered, with the data shown as three
rows of five four-character groups. This is reversible base-32 encoding with a
position-dependent symbol shift, not secure encryption or a digital signature.
The alphabet is `23456789ABCDEFGHJKLMNPQRSTUVWXYZ` (no 0, 1, I, or O).
The eight field widths are `[6,6,4,13,7,13,7,4]`, for identity A, identity B,
collection, home value, playtime, saved gold balance, timestamp, and checksum.
Digits use most-significant-first order; the symbol at global position `p` is
`alphabet[(digit + p*7 + 11) % 32]`. The 60 symbols are grouped into rows A/B/C.
The existing numerical checksum still detects damaged OCR reads.

The bot accepts both BAH1 and BAH2 cards. Deploy the decoder update before
publishing the matching island card update. The BAH2 username is read from the
line above the version marker; unreadable names retain the Discord display-name
fallback. Account ownership remains unverified.
## Submission panel and Sunday top 10

In this server's dashboard, choose separate **Stat-card submission** and **Weekly top-10 leaderboard** channels, then save. Press **Publish submission panel** to post the green Submit Stat Card button; subsequent publishes edit the same panel. The button opens Discord's native modal with one required image upload, and results are private. Direct image uploads still work. Both paths share image limits, queue, cooldowns, ownership checks and decoder.

The weekly channel receives one message with four category embeds (Collection, Home value, Playtime, Gold balance), ten players each, using latest submitted totals. It initially publishes within a minute and edits that message every Sunday at midnight America/Chicago, with DST handled automatically. Totals do not reset. A persistent week/message record survives restarts and catches up on the next boot. A Postgres advisory lock prevents overlapping bot instances from publishing simultaneously. Deleted weekly messages are recreated on the next due refresh. Clear the channel setting to pause future updates. Bot needs View Channel, Send Messages, Embed Links and Read Message History. No Discord messages were posted during development.

## Machine-readable screenshot strip

New in-game cards retain the centered username and grouped BAH2 codes, and include a small black/cream data strip beneath the text. This avoids OCR confusing Fortnite's heavy code lettering. The strip carries a four-symbol BAH2 marker followed by the same 60 encoded payload symbols (five binary cells per symbol). The bot locates the cream panel, samples the strip and applies the existing checksum, bounds, identity and freshness validation. It still uses OCR for the username and supports older cards through text OCR, with an isolated-panel fallback. No encryption or anti-forgery guarantee is added. Deploy the bot update and open a fresh card after updating the Verse UI.

## Rolling 24-hour update limit

Each Discord player can successfully submit or update their stats once every 24 hours, measured from the persisted server-side `submittedAt` timestamp. This applies to every metric together and both direct uploads and the modal. Failed uploads do not consume the daily allowance. A precheck rejects early uploads before download/OCR, and the serializable save transaction rechecks the limit to prevent concurrent bypasses. The limit survives bot restarts and shows the next allowed update using Discord timestamps. The separate 15-second anti-spam guard remains. Existing successful submissions count toward the limit. No new migration is needed. Republish the submission panel to display the updated 24-hour footer.

## Manual leaderboard refresh

After saving the weekly leaderboard channel, press **Refresh leaderboard now** on the Build A House dashboard. An authorized dashboard user can queue an immediate refresh of the same four top-10 embeds from the latest saved player submissions. The online bot processes the request within a minute; queued requests survive restarts, and failures are retried. This does not submit new cards, reset stats, bypass the daily player submission limit, or change the Sunday schedule. Requests for an old channel are ignored after the channel changes. The bot acknowledges a request only after successfully posting/editing the message and saving its state. Deploy both bot and dashboard; no migration is needed.

## Reset all submission limits for testing

The dashboard's **Reset submission limits for everyone** button immediately releases all current 24-hour waits in this server. It writes a persistent reset timestamp in FeatureConfig; no saved stats, capture/submission history, or account links are changed. Both upload paths read it before OCR and again inside the save transaction. Each player's next successful submission starts the normal 24-hour wait again, including when its timestamp equals the reset boundary. Fresh-card, ownership, checksum and playtime checks remain, as does the short anti-spam cooldown. The button uses the existing server-side dashboard authorization and server restriction. Deploy bot and dashboard; no migration is needed.

## Replace a blank playtest card link

The admin dashboard's **Replace my linked card** button allows the signed-in Discord account to replace its existing card once within 15 minutes. The target comes from the authenticated session, not client input. The grant is bound to the exact current card ID and submission timestamp and is checked again inside the save transaction. It permits the new card identity and its different playtime baseline; the replacement must still be newer than the previous capture, pass normal decoding validation and not belong to another Discord user. Old stats remain until a successful replacement, which starts a new daily limit and invalidates the grant. Failed uploads do not consume it. Other accounts remain protected. Deploy bot and dashboard; no migration is needed.
