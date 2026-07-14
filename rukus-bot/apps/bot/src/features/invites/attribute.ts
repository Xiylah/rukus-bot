/**
 * Working out which invite somebody used.
 *
 * Discord never tells us. The only signal is that an invite's use count went up,
 * so we keep a snapshot of every invite's uses and diff it against a fresh list
 * the moment a member joins. That is the standard technique and it is genuinely
 * ambiguous in several situations, which this module's job is to name rather
 * than paper over. An invite tracker that confidently credits the WRONG person
 * is worse than one that admits it does not know: people get rewards, roles, and
 * bragging rights off these numbers.
 */

/** A snapshot of one invite: its code, who made it, and how many times it was used. */
export interface InviteSnapshot {
  code: string;
  uses: number;
  inviterId: string | null;
}

/** Why we could not name an inviter, in words we are willing to show a user. */
export type Unattributable =
  | "vanity"
  | "ambiguous"
  | "unknown";

export type Attribution =
  | { kind: "invite"; code: string; inviterId: string | null }
  | { kind: "none"; reason: Unattributable };

/**
 * Diff the cached invite list against the fresh one and decide who invited them.
 *
 * `before` is what we had cached; `after` is what Discord says now, fetched
 * immediately after the join. Exactly one invite should have gained a use.
 *
 * The honest failure modes:
 *
 *  - VANITY: a guild's vanity URL (discord.gg/mycoolserver) is not in the invite
 *    list at all, it has its own counter. If nothing in the list moved but the
 *    vanity counter did, they came in through the vanity URL and there is no
 *    inviter to credit.
 *
 *  - AMBIGUOUS: two or more invites gained a use since our snapshot. This is
 *    real: two people can join in the same instant, or we may have missed an
 *    update. We cannot tell which of them this member used, so we say so.
 *
 *  - UNKNOWN: nothing moved at all. Usually a single-use invite that hit its cap
 *    and was deleted by Discord before we could re-fetch (it vanishes from the
 *    list, so its "use" is invisible to the diff), or the bot lacked Manage
 *    Server when it took the snapshot. Either way: we do not know.
 *
 * A one-use invite that gets consumed and deleted is the one case we CAN often
 * still solve, because the invite disappears from `after` entirely while sitting
 * in `before` with uses one short of its cap. We do not have maxUses here on
 * purpose: an invite present in `before` and absent from `after` was either used
 * up or manually revoked, and guessing between those two is exactly the kind of
 * confident wrongness this module refuses to do. inviteDelete removes it from
 * the cache, so a REVOKED invite is already gone from `before` by the time we
 * run, which leaves "vanished" meaning "used up" in practice.
 */
export function attribute(
  before: InviteSnapshot[],
  after: InviteSnapshot[],
  vanity?: { before: number | null; after: number | null },
): Attribution {
  const beforeByCode = new Map(before.map((i) => [i.code, i]));
  const afterByCode = new Map(after.map((i) => [i.code, i]));

  // Invites whose use count went up.
  const grew = after.filter((inv) => {
    const old = beforeByCode.get(inv.code);
    // An invite we have never seen before, already showing uses, is a new invite
    // created and used between two of our snapshots: treat its uses as growth.
    return inv.uses > (old?.uses ?? 0);
  });

  // Invites we knew about that are simply gone. See the doc comment: because
  // inviteDelete evicts revoked invites from the cache, a code that is still in
  // `before` but missing from `after` was almost certainly consumed to its cap.
  const vanished = before.filter((inv) => !afterByCode.has(inv.code));

  const candidates = [...grew, ...vanished];

  if (candidates.length === 1) {
    const hit = candidates[0]!;
    return { kind: "invite", code: hit.code, inviterId: hit.inviterId };
  }

  if (candidates.length > 1) return { kind: "none", reason: "ambiguous" };

  // Nothing in the invite list moved. Did the vanity URL counter?
  if (
    vanity &&
    vanity.before !== null &&
    vanity.after !== null &&
    vanity.after > vanity.before
  ) {
    return { kind: "none", reason: "vanity" };
  }

  return { kind: "none", reason: "unknown" };
}

/** How we phrase each failure, in the log message. Plain, not cute. */
export const UNATTRIBUTABLE_TEXT: Record<Unattributable, string> = {
  vanity: "they used the server's vanity link, so there is no inviter to credit",
  ambiguous:
    "two invites were used at the same moment, so I could not tell which one they came through",
  unknown: "I could not tell who invited them",
};
