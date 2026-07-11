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
import { ticketConfig, invalidate } from "../lib/configCache.js";
import { canManageGuild, hasAnyRole } from "../lib/perms.js";
import { panelMessage } from "../features/tickets/ui.js";
import {
  closeTicketFlow,
} from "../features/tickets/interactions.js";
import {
  getTicketByChannel,
  claimTicket,
  allSupportRoleIds,
} from "../features/tickets/service.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("ticket")
    .setDescription("Manage tickets and the ticket system")
    // Visible to everyone: close/claim/add/remove are for support staff, who
    // usually lack Manage Server. Each subcommand gates itself in code.
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
      s.setName("close").setDescription("Close this ticket (staff)"),
    )
    .addSubcommand((s) =>
      s.setName("claim").setDescription("Claim this ticket (staff)"),
    )
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a user to this ticket (staff)")
        .addUserOption((o) =>
          o.setName("user").setDescription("User to add").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a user from this ticket (staff)")
        .addUserOption((o) =>
          o.setName("user").setDescription("User to remove").setRequired(true),
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
    const sub = interaction.options.getSubcommand();
    const guildId = interaction.guildId;
    const member = interaction.member as GuildMember;

    // ---- Staff subcommands (support role or admin, inside a ticket) ----
    if (sub === "close" || sub === "claim" || sub === "add" || sub === "remove") {
      const config = await ticketConfig(guildId);
      if (!hasAnyRole(member, allSupportRoleIds(config))) {
        await interaction.reply({
          content: "Only support staff can manage tickets.",
          ...ephemeral,
        });
        return;
      }
      const ticket = await getTicketByChannel(interaction.channelId);
      if (!ticket) {
        await interaction.reply({
          content: "This command only works inside a ticket channel.",
          ...ephemeral,
        });
        return;
      }
      const channel = interaction.channel as TextChannel;

      if (sub === "close") {
        await interaction.deferReply();
        const result = await closeTicketFlow(channel, config, interaction.user.id);
        await interaction.editReply({ content: result.message });
        return;
      }

      if (sub === "claim") {
        if (ticket.claimedBy) {
          await interaction.reply({
            content: `Already claimed by <@${ticket.claimedBy}>.`,
            ...ephemeral,
          });
          return;
        }
        await claimTicket(interaction.channelId, interaction.user.id);
        await interaction.reply({
          content: `🙋 Ticket claimed by <@${interaction.user.id}>.`,
        });
        return;
      }

      const user = interaction.options.getUser("user", true);
      if (sub === "add") {
        await channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true,
        });
        await interaction.reply({ content: `➕ Added ${user} to this ticket.` });
        return;
      }
      if (sub === "remove") {
        if (user.id === ticket.openerId) {
          await interaction.reply({
            content: "You can't remove the ticket opener. Close the ticket instead.",
            ...ephemeral,
          });
          return;
        }
        await channel.permissionOverwrites.edit(user.id, { ViewChannel: false });
        await interaction.reply({ content: `➖ Removed ${user} from this ticket.` });
        return;
      }
    }

    // ---- Admin subcommands (panel / setup) ----
    if (!canManageGuild(member)) {
      await interaction.reply({
        content: "You need **Manage Server** to configure tickets.",
        ...ephemeral,
      });
      return;
    }

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
