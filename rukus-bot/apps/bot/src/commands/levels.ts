import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { canManageGuild } from "../lib/perms.js";
import { levelingConfig } from "../lib/configCache.js";
import {
  resetMember,
  resetGuild,
  applyRoleRewards,
} from "../features/leveling/service.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** How long the reset-all confirmation stays clickable. */
const CONFIRM_MS = 30_000;

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("levels")
    .setDescription("Manage the server's XP data")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("reset")
        .setDescription("Wipe one member's XP, level and stats")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose XP to wipe").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("reset-all")
        .setDescription("Wipe EVERY member's XP in this server"),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // setDefaultMemberPermissions is a default: an admin can override it per
    // role in Server Settings, so the real gate has to be here too.
    if (!canManageGuild(interaction.member)) {
      await interaction.reply({
        content: "You need Manage Server to do that.",
        ...ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const config = await levelingConfig(guildId);

    if (interaction.options.getSubcommand() === "reset") {
      const user = interaction.options.getUser("user", true);
      await interaction.deferReply(ephemeral);

      const had = await resetMember(guildId, user.id);
      if (!had) {
        await interaction.editReply({ content: `${user} has no XP to reset.` });
        return;
      }

      // Back to level 0, so every reward role has to go with the XP that earned
      // it, or a wiped member keeps the colour that says otherwise.
      const member = await interaction.guild.members
        .fetch(user.id)
        .catch(() => null);
      if (member) await applyRoleRewards(member, config, 0);

      await interaction.editReply({
        content: `🗑️ Reset ${user}'s XP, level and stats.`,
      });
      return;
    }

    // ---- reset-all ----
    const confirmId = `levels:resetall:${interaction.id}`;
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(confirmId)
        .setLabel("Yes, wipe every level")
        .setStyle(ButtonStyle.Danger),
    );

    const prompt = await interaction.reply({
      content:
        "⚠️ This deletes the XP, level, message count and voice minutes of " +
        "**every member** in this server. It cannot be undone. Confirm within " +
        "30 seconds.",
      components: [row],
      withResponse: true,
      ...ephemeral,
    });

    const click = await prompt
      .resource!.message!.awaitMessageComponent({
        componentType: ComponentType.Button,
        time: CONFIRM_MS,
        filter: (i) =>
          i.user.id === interaction.user.id && i.customId === confirmId,
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

    const wiped = await resetGuild(guildId);
    await interaction.editReply({
      content: `🗑️ Wiped the XP of **${wiped.toLocaleString()}** member(s). Reward roles they already hold are left alone; remove those manually if you want a clean slate.`,
      components: [],
    });
  },
};

export default command;
