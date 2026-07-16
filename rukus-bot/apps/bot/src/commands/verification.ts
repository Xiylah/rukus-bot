import {
  SlashCommandBuilder,
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type GuildMember,
  type TextChannel,
} from "discord.js";
import { getVerificationConfig, setVerificationConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import { canManageGuild } from "../lib/perms.js";
import { asTextChannel, publishVerifyPanel } from "../features/verification/panel.js";
import { checkRoleGrantable } from "../features/verification/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("verification")
    .setDescription("Post and inspect the verification gate")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("post")
        .setDescription("Post the verify panel (or update it in place)"),
    )
    .addSubcommand((s) =>
      s.setName("status").setDescription("Show the current verification setup"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const member = interaction.member as GuildMember;
    if (!canManageGuild(member)) {
      await interaction.reply({
        content: "You need **Manage Server** to use verification.",
        ...ephemeral,
      });
      return;
    }

    // Read through the cache so an admin who just saved in the dashboard gets
    // what they saved, not a stale copy.
    const config = await getVerificationConfig(interaction.guildId);

    if (interaction.options.getSubcommand() === "status") {
      const grantable = checkRoleGrantable(interaction.guild, config.verifiedRoleId);
      const lines = [
        `**Verification** is ${config.enabled ? "✅ enabled" : "⛔ disabled"}.`,
        `Mode: **${config.mode}**`,
        `Verified role: ${config.verifiedRoleId ? `<@&${config.verifiedRoleId}>` : "_not set_"}`,
        `Quarantine role: ${config.unverifiedRoleId ? `<@&${config.unverifiedRoleId}>` : "_none_"}`,
        `Panel channel: ${config.channelId ? `<#${config.channelId}>` : "_not set_"}`,
        `Min account age: ${
          config.minAccountAgeDays > 0
            ? `${config.minAccountAgeDays} day(s) - action: **${config.minAccountAgeAction}**`
            : "off"
        }`,
        config.panelMessageId
          ? `Live panel: [posted](https://discord.com/channels/${interaction.guildId}/${config.panelChannelId}/${config.panelMessageId})`
          : "Live panel: not posted yet",
        grantable.ok
          ? "Role check: ✅ I can grant the verified role."
          : `⚠️ Role check: ${grantable.reason}`,
      ];
      await interaction.reply({ content: lines.join("\n"), ...ephemeral });
      return;
    }

    // ---- post ----
    if (!config.channelId) {
      await interaction.reply({
        content:
          "No panel channel is set. Pick one in the dashboard under **Verification** first.",
        ...ephemeral,
      });
      return;
    }

    const channel = await asTextChannel(interaction.guild, config.channelId);
    if (!channel) {
      await interaction.reply({
        content: "That panel channel is gone or I can't post there. Pick a new one.",
        ...ephemeral,
      });
      return;
    }

    // Surface a misconfigured role now, so the admin doesn't post a panel that
    // will only ever fail when a member clicks it.
    const grantable = checkRoleGrantable(interaction.guild, config.verifiedRoleId);
    if (!grantable.ok) {
      await interaction.reply({
        content: `I can't post that yet: ${grantable.reason}`,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);
    const posted = await publishVerifyPanel(channel as TextChannel, config);

    if (
      posted.messageId !== config.panelMessageId ||
      config.panelChannelId !== channel.id
    ) {
      await setVerificationConfig(interaction.guildId, {
        ...config,
        panelChannelId: channel.id,
        panelMessageId: posted.messageId,
      });
      invalidate(interaction.guildId);
    }

    await interaction.editReply({
      content: `${posted.updated ? "♻️ Updated" : "✅ Posted"} the verify panel in <#${config.channelId}>.`,
    });
  },
};

export default command;
