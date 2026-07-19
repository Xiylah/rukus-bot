import {
  MessageFlags,
  type ButtonInteraction,
  type GuildMember,
  type StringSelectMenuInteraction,
} from "discord.js";
import {
  decideReactionRole,
  parseRrCustomId,
  type ReactionRolePanel,
  type ReactionRolesConfig,
  type RrDecision,
} from "@rukus/shared";
import { reactionRolesConfig } from "../../lib/configCache.js";
import { applyDecision, resultMessage } from "./apply.js";

/**
 * Button and dropdown panels, the modern alternative to emoji reactions.
 *
 * Every reply is ephemeral, so a busy self-role channel never fills up with
 * "you got the role" spam, and the member always gets told WHY nothing happened
 * when a mode refuses them (reactions can only silently do nothing).
 */

const ephemeral = { flags: MessageFlags.Ephemeral as const };

interface Resolved {
  config: ReactionRolesConfig;
  panel: ReactionRolePanel;
  member: GuildMember;
}

async function resolve(
  interaction: ButtonInteraction | StringSelectMenuInteraction,
  panelId: string,
): Promise<Resolved | null> {
  if (!interaction.inCachedGuild()) return null;
  const config = await reactionRolesConfig(interaction.guildId);
  if (!config.enabled) {
    await interaction.reply({
      content: "Self-roles aren't enabled in this server.",
      ...ephemeral,
    });
    return null;
  }
  const panel = config.panels.find((p) => p.id === panelId);
  if (!panel) {
    await interaction.reply({
      content: "This panel no longer exists. Ask an admin to repost it.",
      ...ephemeral,
    });
    return null;
  }
  return { config, panel, member: interaction.member };
}

export async function handleButton(interaction: ButtonInteraction) {
  const parsed = parseRrCustomId(interaction.customId);
  if (!parsed?.roleId) return;

  const resolved = await resolve(interaction, parsed.panelId);
  if (!resolved) return;
  const { panel, member } = resolved;

  const pair = panel.pairs.find((p) => p.roleId === parsed.roleId);
  if (!pair) {
    await interaction.reply({
      content: "That role isn't on this panel anymore.",
      ...ephemeral,
    });
    return;
  }

  await interaction.deferReply(ephemeral);

  const decision = decideReactionRole({
    panel,
    pair,
    memberRoleIds: [...member.roles.cache.keys()],
    source: "component",
  });
  const result = await applyDecision(member, decision);

  await interaction.editReply({ content: resultMessage(decision, result) });
}

export async function handleSelect(interaction: StringSelectMenuInteraction) {
  const parsed = parseRrCustomId(interaction.customId);
  if (!parsed) return;

  const resolved = await resolve(interaction, parsed.panelId);
  if (!resolved) return;
  const { panel, member } = resolved;

  await interaction.deferReply(ephemeral);

  if (interaction.values.length === 0) {
    await interaction.editReply({ content: "Nothing selected, nothing changed." });
    return;
  }

  // A dropdown pick is a toggle per option, exactly like the buttons. Each
  // choice is decided against the roles the member holds AFTER the previous
  // ones were applied, otherwise picking three options in a "limit 2" panel
  // would sail past the cap.
  const held = new Set(member.roles.cache.keys());
  const lines: string[] = [];

  for (const roleId of interaction.values) {
    const pair = panel.pairs.find((p) => p.roleId === roleId);
    if (!pair) continue;

    const decision: RrDecision = decideReactionRole({
      panel,
      pair,
      memberRoleIds: [...held],
      source: "component",
    });
    const result = await applyDecision(member, decision);

    for (const r of result.added) held.add(r);
    for (const r of result.removed) held.delete(r);

    const line = resultMessage(decision, result);
    if (line && line !== "Nothing changed.") lines.push(line);
  }

  await interaction.editReply({
    content: lines.length > 0 ? lines.join("\n") : "Nothing changed.",
  });
}
