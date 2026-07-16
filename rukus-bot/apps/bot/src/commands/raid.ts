import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getRaidConfig } from "@rukus/db";
import { canManageGuild } from "../lib/perms.js";
import { getRaidState } from "../features/raid/state.js";
import { liftRaid, triggerRaid } from "../features/raid/service.js";
import { recordJoin } from "../features/raid/tracker.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("raid")
    .setDescription("Inspect and control raid protection")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show raid protection status"),
    )
    .addSubcommand((s) =>
      s.setName("lift").setDescription("End raid mode now and undo its actions"),
    )
    .addSubcommand((s) =>
      s
        .setName("panic")
        .setDescription("Force raid mode ON right now (manual trip)"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const member = interaction.member as GuildMember;
    if (!canManageGuild(member)) {
      await interaction.reply({
        content: "You need **Manage Server** to use raid protection.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const config = await getRaidConfig(interaction.guildId);
    const state = await getRaidState(interaction.guildId);

    if (sub === "status") {
      const lines = [
        `**Raid protection** is ${config.enabled ? "✅ enabled" : "⛔ disabled"}.`,
        `Trigger: **${config.joinRateCount}** joins in **${config.joinRateSeconds}s**`,
        `Action: **${config.action}**`,
        `Alert channel: ${config.alertChannelId ? `<#${config.alertChannelId}>` : "_not set_"}`,
        `Auto-lift: ${config.autoLiftMinutes > 0 ? `${config.autoLiftMinutes} min` : "manual only"}`,
        "",
        state.active
          ? `🚨 Raid mode is **ACTIVE** (since <t:${Math.floor(state.startedAt / 1000)}:R>` +
            `${state.liftAt ? `, auto-lifts <t:${Math.floor(state.liftAt / 1000)}:R>` : ""})` +
            `${state.lockedChannels.length > 0 ? `, ${state.lockedChannels.length} channel(s) locked` : ""}.`
          : "Raid mode is **off** right now.",
      ];
      await interaction.reply({ content: lines.join("\n"), ...ephemeral });
      return;
    }

    if (sub === "lift") {
      if (!state.active) {
        await interaction.reply({
          content: "Raid mode isn't active, so there's nothing to lift.",
          ...ephemeral,
        });
        return;
      }
      await interaction.deferReply(ephemeral);
      await liftRaid(interaction.guild, config, `manual lift by ${interaction.user.tag}`);
      await interaction.editReply({ content: "✅ Raid mode lifted." });
      return;
    }

    // ---- panic: a manual, deliberate trip. Confirm first (it can lock every
    // channel), mirroring the /lockdown server confirmation. ----
    if (state.active) {
      await interaction.reply({
        content: "Raid mode is already active. Use `/raid status` or `/raid lift`.",
        ...ephemeral,
      });
      return;
    }

    const confirmId = `raid:panic:${interaction.id}`;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel("Yes, trip raid mode now")
        .setStyle(ButtonStyle.Danger),
    );
    // Spell out what each action will actually do to real members. panic is
    // deliberate, but "kick-new" acts on whoever joined in the last window, and
    // during a false alarm that is ordinary members, so say so before the click
    // rather than after.
    const consequence =
      config.action === "lockdown"
        ? " It locks every channel."
        : config.action === "kick-new"
          ? ` It KICKS everyone who joined in the last ${config.joinRateSeconds}s, which during a false alarm means ordinary members.`
          : config.action === "quarantine"
            ? ` It quarantines everyone who joined in the last ${config.joinRateSeconds}s.`
            : " It only posts an alert.";

    const prompt = await interaction.reply({
      content:
        `⚠️ This forces raid mode ON with the **${config.action}** action.` +
        consequence +
        " Confirm within 30 seconds.",
      components: [row],
      withResponse: true,
      ...ephemeral,
    });
    const click = await prompt
      .resource!.message!.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: 30_000,
        filter: (i) => i.user.id === interaction.user.id && i.customId === confirmId,
      })
      .catch(() => null);
    if (!click) {
      await interaction.editReply({
        content: "Cancelled (no confirmation).",
        components: [],
      });
      return;
    }
    await click.deferUpdate();

    // Manual panic has no join spike to point at, so seed the action with the
    // most recent joins we tracked in-window (empty is fine for lockdown/alert).
    const window = recordJoin(interaction.guildId, interaction.user.id, config.joinRateSeconds);
    // Drop the admin's own id: they are not a raider.
    const spikeIds = window.ids.filter((id) => id !== interaction.user.id);
    await triggerRaid(interaction.guild, config, spikeIds);

    await interaction.editReply({
      content: "🚨 Raid mode is now **ON**. Use `/raid lift` to end it.",
      components: [],
    });
  },
};

export default command;
