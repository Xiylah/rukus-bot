import type { GuildMember } from "discord.js";
import { raidConfig } from "../../lib/configCache.js";
import { getRaidState } from "./state.js";
import { recordJoin } from "./tracker.js";
import { triggerRaid } from "./service.js";
import { ensureRaidSweeper } from "./sweeper.js";

/**
 * The join detector: run once per join from guildMemberAdd, additively.
 *
 * It records the join in the bounded window and, when the rate trips and no raid
 * is already active, fires the configured action. Everything is best-effort and
 * swallows its own errors so it can never break the join event.
 */
export async function onJoinForRaid(member: GuildMember): Promise<void> {
  const config = await raidConfig(member.guild.id);
  if (!config.enabled) return;

  // Enabled here means auto-lift could become pending, so make sure the sweep
  // that ends timed raids is running. Idempotent, so calling it per join is fine.
  ensureRaidSweeper(member.client);

  const window = recordJoin(
    member.guild.id,
    member.id,
    config.joinRateSeconds,
  );
  if (window.count < config.joinRateCount) return;

  // Already in raid mode: the trigger is idempotent, but skip the state read on
  // the common path where nothing has tripped.
  const state = await getRaidState(member.guild.id);
  if (state.active) return;

  await triggerRaid(member.guild, config, window.ids);
}
