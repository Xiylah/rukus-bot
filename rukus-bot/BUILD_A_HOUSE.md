# Build A House Leaderboard

Available only in Discord server `700382994946588814`. Other servers retain their XP leaderboard.

## Current categories

- Collection: owned entries across the seven saved furniture variants in the current catalog.
- Home value: the existing live house-value total.
- House likes: saved `LifetimeLikes` received by the house, not spendable LikeTickets.
- Gold balance: current saved `Money`, not lifetime earnings or other currencies.

## Deploy the house-likes update

1. In the bot database's SQL editor run `packages/db/prisma/house_likes.sql` before deploying. It adds a nullable houseLikes column and its ranking index, and supplies a default for the retained old playtime column. Existing stats and account links are preserved. It only touches `rukus.BuildAHouseStats`.
2. Generate Prisma and deploy both bot and dashboard. For first-time installations, use the full `packages/db/prisma/build_a_house.sql` instead.
3. Build/push the updated Verse card, then open a fresh card in-game. Existing BAH1/BAH2 playtime cards are rejected; their playtime values are never converted into likes.
4. Players with older submissions stay on the other three leaderboards. They appear in House likes after submitting a new BAH3 card, including players whose actual likes are zero. Unknown older likes remain NULL and are excluded from that category.
5. Use **Refresh leaderboard now** to update the existing four embeds, and republish the submission panel if you want its instructions to say house likes.

No live database migration was run during development. No Discord messages were posted.

## Card format

BAH3 retains the centered username, three grouped letter/number rows and the native black/cream data strip. The eight fields are two nine-digit saved identity parts, collection, home value, house likes, gold balance, capture epoch seconds and checksum. Fixed base-32 widths are 6, 6, 4, 13, 7, 13, 7, 4, totaling 60 symbols. Each digit at global position p is shifted by (7p + 11) mod 32. The alphabet is `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`.

The strip contains the four-symbol BAH3 marker followed by the 60 encoded symbols, with five binary cells per symbol, most significant bit first. The bot locates the cream panel, reads the strip and checks bounds, checksum and freshness. OCR reads the username and provides a text fallback. The internal BAH3DATA text representation labels the likes field LIKES; it is never interpreted as playtime.

The checksum starts at 17 and folds each preceding integer with `(check * 131 + value % 1000003) % 1000003`. Cards expire after 24 hours, allowing five minutes of future clock skew. This is reversible encoding and an error-detection checksum, not encryption, proof of ownership, or reliable protection against forged screenshots.

## Uploads and limits

Choose separate submission and weekly leaderboard channels in the Build A House dashboard, save, then **Publish submission panel**. Its green **Submit Stat Card** button opens a private Discord file-upload modal. Direct channel uploads also work. Both paths share one bounded OCR queue, a short 15-second anti-spam guard, and an 8 MB/20 MP PNG/JPEG limit. Downloads allow regular and ephemeral attachment paths on Discord CDN hosts, preserve signed URLs, reject redirects, and verify image bytes.

One successful update per Discord account is allowed every rolling 24 hours, measured from the stored server submission time. Failed uploads do not consume the allowance. The limit is checked before OCR and again inside the serializable save transaction. Identity is bound to the submitting Discord user, and another user's bound card cannot be claimed. Updates must have a newer capture timestamp. House likes, gold, home value and collection may decrease; no retired playtime baseline is checked.

**Reset submission limits for everyone** only clears existing daily waits using a persistent cutoff; it preserves stats and links. Each next successful update starts a new 24-hour wait.

**Replace my linked card** authorizes the signed-in dashboard Discord account to replace a blank playtest identity once within 15 minutes. The grant is tied to the exact old card ID and submission time, and validated again during save. Old stats remain until replacement succeeds. It does not allow a card already owned by a different Discord user. Both controls require dashboard authorization and are restricted to this server.

## Leaderboard refreshes

`/leaderboard` queries latest submitted data immediately. The separate channel has one message containing four top-10 embeds, with clickable Discord user mentions and notifications disabled. It initially posts within a minute after configuration, then updates Sunday at 12 AM Central time. The footer uses CST/CDT automatically when rendered. Scheduling uses America/Chicago internally for daylight-saving transitions. Totals do not reset.

**Refresh leaderboard now** queues an on-demand refresh of the same message within a minute while the bot is online. It does not submit cards or change daily limits. Persistent requests and message state survive restarts; a PostgreSQL advisory lock prevents overlapping refreshes. Failures retry, and old-channel requests are ignored. Deleted weekly messages are recreated on the next due refresh.

## Verse integration

The existing card device references PropPlacer and its open button. PropPlacer reads saved LifetimeLikes along with the other stats when the player opens the card. The retired leaderboard-specific 30-second playtime save loop has been removed. The old persisted LeaderboardPlaytime field and constructor copy are retained for published-save compatibility, but are no longer updated or exported.
