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
import { panelForms, buildFormPanelPayload } from "@rukus/shared";
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
        .setDescription("Post a forms panel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Where to post (defaults to here)")
            .addChannelTypes(ChannelType.GuildText),
        )
        .addStringOption((o) =>
          o
            .setName("form")
            .setDescription(
              "Name of one form, to post its own panel. Empty = the shared panel.",
            ),
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
          `review: ${f.reviewChannelId ? `<#${f.reviewChannelId}>` : "_none_"}` +
          (f.showOnPanel ? "" : " - hidden from panel (ticket form)"),
      );
      await interaction.reply({ content: lines.join("\n"), ...ephemeral });
      return;
    }

    if (sub === "panel") {
      if (!config.enabled) {
        await interaction.reply({
          content:
            "Forms aren't enabled. Turn them on in the dashboard first.",
          ...ephemeral,
        });
        return;
      }

      const target =
        (interaction.options.getChannel("channel") as TextChannel | null) ??
        (interaction.channel as TextChannel);

      // A specific form: post that form's own panel, one button, its own embed.
      const wanted = interaction.options.getString("form")?.trim().toLowerCase();
      if (wanted) {
        // Match on name OR id: staff read names, the dashboard shows ids.
        const form = config.forms.find(
          (f) => f.name.toLowerCase() === wanted || f.id.toLowerCase() === wanted,
        );
        if (!form) {
          const names = config.forms.map((f) => `**${f.name}**`).join(", ");
          await interaction.reply({
            content:
              `I couldn't find a form called "${wanted}".` +
              (names ? ` Try one of: ${names}` : " No forms exist yet."),
            ...ephemeral,
          });
          return;
        }
        await target.send(buildFormPanelPayload(form) as never);
        await interaction.reply({
          content: `Posted the **${form.name}** panel in <#${target.id}>.`,
          ...ephemeral,
        });
        return;
      }

      // Otherwise the shared panel, listing every form that isn't on its own.
      if (panelForms(config).length === 0) {
        await interaction.reply({
          content:
            "No forms are on the shared panel. Either add one, or post a " +
            "specific form's panel with `/form panel form:<name>`.",
          ...ephemeral,
        });
        return;
      }
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
