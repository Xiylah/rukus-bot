import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  ChannelType,
  MessageFlags,
  TextChannel,
  type ChatInputCommandInteraction,
  type GuildMember,
} from "discord.js";
import { getFormsConfig } from "@rukus/db";
import { canManageGuild } from "../lib/perms.js";
import { formPanelMessage } from "../features/forms/ui.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("form")
    .setDescription("Manage the forms / applications system")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("panel")
        .setDescription("Post the forms panel with a button for each form")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post (defaults to here)")
            .addChannelTypes(ChannelType.GuildText),
        ),
    )
    .addSubcommand((s) =>
      s.setName("list").setDescription("List the forms configured for this server"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    if (!canManageGuild(interaction.member as GuildMember)) {
      await interaction.reply({
        content: "You need **Manage Server** to manage forms.",
        ...ephemeral,
      });
      return;
    }

    const config = await getFormsConfig(interaction.guildId);
    const sub = interaction.options.getSubcommand();

    if (sub === "list") {
      if (config.forms.length === 0) {
        await interaction.reply({
          content:
            "No forms configured yet. Create them in the dashboard, then run " +
            "`/form panel`.",
          ...ephemeral,
        });
        return;
      }
      const lines = config.forms.map(
        (f) =>
          `• **${f.name}** (\`${f.id}\`) - ${f.fields.length} field(s), ` +
          `review: ${f.reviewChannelId ? `<#${f.reviewChannelId}>` : "_none_"}`,
      );
      await interaction.reply({ content: lines.join("\n"), ...ephemeral });
      return;
    }

    if (sub === "panel") {
      if (!config.enabled || config.forms.length === 0) {
        await interaction.reply({
          content:
            "Forms aren't enabled or none are configured. Set them up in the " +
            "dashboard first.",
          ...ephemeral,
        });
        return;
      }
      const target =
        (interaction.options.getChannel("channel") as TextChannel | null) ??
        (interaction.channel as TextChannel);
      await target.send(formPanelMessage(config));
      await interaction.reply({
        content: `Forms panel posted in <#${target.id}>.`,
        ...ephemeral,
      });
      return;
    }
  },
};

export default command;
