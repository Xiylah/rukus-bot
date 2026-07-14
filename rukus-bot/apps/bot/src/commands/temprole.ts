import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type Role,
  type ChatInputCommandInteraction,
} from "discord.js";
import { parseDuration, formatDuration } from "@rukus/shared";
import { addTempRole } from "../features/roles/state.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("temprole")
    .setDescription("Give a member a role that expires on its own")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addUserOption((o) =>
      o.setName("user").setDescription("Who").setRequired(true),
    )
    .addRoleOption((o) =>
      o.setName("role").setDescription("Which role").setRequired(true),
    )
    .addStringOption((o) =>
      o
        .setName("duration")
        .setDescription('How long, e.g. "2h30m", "7d", "1w"')
        .setRequired(true),
    )
    .addStringOption((o) =>
      o.setName("reason").setDescription("Why").setMaxLength(400),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const user = interaction.options.getUser("user", true);
    const role = interaction.options.getRole("role", true) as Role;
    const durationRaw = interaction.options.getString("duration", true);
    const reason = interaction.options.getString("reason") ?? "no reason";

    const seconds = parseDuration(durationRaw);
    if (seconds === null) {
      await interaction.reply({
        content: `I couldn't read "${durationRaw}" as a duration. Try \`2h30m\`, \`7d\`, or \`1w\`.`,
        ...ephemeral,
      });
      return;
    }

    const me = interaction.guild.members.me;
    if (!me || role.managed || role.position >= me.roles.highest.position) {
      await interaction.reply({
        content: `⛔ I can't manage **${role.name}** (it's managed, or above my highest role).`,
        ...ephemeral,
      });
      return;
    }
    // Same escalation guard as /role: a moderator must not be able to grant a
    // role they do not themselves outrank, temporary or not.
    if (
      !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
      role.position >= interaction.member.roles.highest.position
    ) {
      await interaction.reply({
        content: `⛔ **${role.name}** is not below your own highest role.`,
        ...ephemeral,
      });
      return;
    }

    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (!member) {
      await interaction.reply({
        content: "That user isn't in the server.",
        ...ephemeral,
      });
      return;
    }

    const added = await member.roles
      .add(role, `/temprole by ${interaction.user.tag}: ${reason}`)
      .then(() => true)
      .catch(() => false);
    if (!added) {
      await interaction.reply({
        content: "Discord refused that. I'm probably missing **Manage Roles**.",
        ...ephemeral,
      });
      return;
    }

    const expiresAt = Date.now() + seconds * 1000;
    await addTempRole(interaction.guildId, {
      userId: user.id,
      roleId: role.id,
      expiresAt,
      moderatorId: interaction.user.id,
    });

    await interaction.reply({
      content:
        `✅ Gave ${user} **${role.name}** for ${formatDuration(seconds)}. ` +
        `It comes off <t:${Math.floor(expiresAt / 1000)}:R>.`,
    });
  },
};

export default command;
