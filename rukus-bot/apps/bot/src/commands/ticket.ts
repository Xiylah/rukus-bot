import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  TextChannel,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getTicketConfig, setTicketConfig } from "@rukus/db";
import { invalidate } from "../lib/configCache.js";
import { canManageGuild } from "../lib/perms.js";
import { panelMessage } from "../features/tickets/ui.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage the ticket system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("panel")
        .setDescription("Post the ticket panel in a channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post the panel (defaults to here)")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("setup")
        .setDescription("Quick-configure tickets (also editable in the dashboard)")
        .addChannelOption((o) =>
          o
            .setName("category")
            .setDescription("Category new tickets are created under")
            .addChannelTypes(ChannelType.GuildCategory),
        )
        .addRoleOption((o) =>
          o.setName("support_role").setDescription("Role that can handle tickets"),
        )
        .addChannelOption((o) =>
          o
            .setName("transcript_channel")
            .setDescription("Where closed-ticket transcripts are posted")
            .addChannelTypes(ChannelType.GuildText),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    if (!canManageGuild(interaction.member as GuildMember)) {
      await interaction.reply({
        content: "You need **Manage Server** to configure tickets.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;

    if (sub === "panel") {
      const config = await getTicketConfig(guildId);
      if (!config.enabled) {
        await interaction.reply({
          content:
            "Tickets aren't enabled yet. Run `/ticket setup` (or enable them in " +
            "the dashboard) first.",
          ...ephemeral,
        });
        return;
      }
      const target =
        (interaction.options.getChannel("channel") as TextChannel | null) ??
        (interaction.channel as TextChannel);
      await target.send(panelMessage(config));
      await interaction.reply({
        content: `Panel posted in <#${target.id}>.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "setup") {
      const config = await getTicketConfig(guildId);
      const category = interaction.options.getChannel("category");
      const supportRole = interaction.options.getRole("support_role");
      const transcript = interaction.options.getChannel("transcript_channel");

      const next = {
        ...config,
        enabled: true,
        categoryId: category?.id ?? config.categoryId,
        transcriptChannelId: transcript?.id ?? config.transcriptChannelId,
        supportRoleIds: supportRole
          ? Array.from(new Set([...config.supportRoleIds, supportRole.id]))
          : config.supportRoleIds,
      };

      await setTicketConfig(guildId, next);
      invalidate(guildId);

      await interaction.reply({
        content:
          "✅ Tickets enabled.\n" +
          `• Category: ${next.categoryId ? `<#${next.categoryId}>` : "_none_"}\n` +
          `• Support roles: ${
            next.supportRoleIds.map((r) => `<@&${r}>`).join(", ") || "_none_"
          }\n` +
          `• Transcripts: ${
            next.transcriptChannelId ? `<#${next.transcriptChannelId}>` : "_none_"
          }\n\nNow run \`/ticket panel\` to post the button.`,
        ...ephemeral,
      });
      return;
    }
  },
};

export default command;
