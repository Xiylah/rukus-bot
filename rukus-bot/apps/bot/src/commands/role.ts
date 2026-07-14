import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  type Role,
  type GuildMember,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * Can the bot actually hand this role out? Discord refuses a role at or above
 * the bot's own highest role, and managed roles (bot/integration/boost) can
 * never be assigned by anyone. Say so up front instead of letting the API throw
 * a 50013 that means nothing to staff.
 */
function roleBlocker(
  interaction: ChatInputCommandInteraction<"cached">,
  role: Role,
): string | null {
  const me = interaction.guild.members.me;
  if (!me) return "I can't see myself in this server.";
  if (role.managed) {
    return `**${role.name}** is managed by an integration, so nobody can assign it by hand.`;
  }
  if (role.id === interaction.guild.roles.everyone.id) {
    return "@everyone isn't a role you can grant.";
  }
  if (role.position >= me.roles.highest.position) {
    return `**${role.name}** is above my highest role, so I can't manage it. Move my role higher.`;
  }
  // The caller must also outrank it, or /role becomes a privilege-escalation
  // tool: a moderator could hand themselves an admin role they can't otherwise
  // touch. Administrators are exempt because they already have everything.
  if (
    !interaction.member.permissions.has(PermissionFlagsBits.Administrator) &&
    role.position >= interaction.member.roles.highest.position
  ) {
    return `**${role.name}** is not below your own highest role, so you can't hand it out.`;
  }
  return null;
}

/** /role all: grant or strip a role across the whole member list. */
async function bulkRole(
  interaction: ChatInputCommandInteraction<"cached">,
  role: Role,
  mode: "add" | "remove",
): Promise<void> {
  const members = await interaction.guild.members.fetch();
  const targets = members.filter((m) =>
    mode === "add" ? !m.roles.cache.has(role.id) : m.roles.cache.has(role.id),
  );

  if (targets.size === 0) {
    await interaction.editReply({
      content: `Nothing to do: every member already ${mode === "add" ? "has" : "lacks"} **${role.name}**.`,
    });
    return;
  }

  // A bulk role change is thousands of API calls and cannot be undone with one
  // click, so it gets an explicit confirmation rather than a "are you sure?"
  // in the description that nobody reads.
  const confirmId = `roleall:${interaction.id}`;
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(confirmId)
      .setLabel(`Yes, ${mode} for ${targets.size} member(s)`)
      .setStyle(mode === "add" ? ButtonStyle.Success : ButtonStyle.Danger),
  );

  const prompt = await interaction.editReply({
    content:
      `This will ${mode} **${role.name}** ${mode === "add" ? "to" : "from"} ` +
      `**${targets.size}** member(s). Discord rate-limits this, so it can take ` +
      "a few minutes. Confirm within 30 seconds.",
    components: [row],
  });

  const click = await prompt
    .awaitMessageComponent({
      componentType: ComponentType.Button,
      time: 30_000,
      filter: (i) => i.user.id === interaction.user.id && i.customId === confirmId,
    })
    .catch(() => null);

  if (!click) {
    await interaction.editReply({ content: "Cancelled (no confirmation).", components: [] });
    return;
  }
  await click.deferUpdate();

  let done = 0;
  let failed = 0;
  let lastReport = Date.now();
  const reason = `/role all by ${interaction.user.tag}`;

  for (const member of targets.values()) {
    const ok = await (mode === "add"
      ? member.roles.add(role, reason)
      : member.roles.remove(role, reason)
    )
      .then(() => true)
      .catch(() => false);
    if (ok) done++;
    else failed++;

    // Progress, but not on every member: editing the reply 3000 times would
    // itself get us rate-limited.
    if (Date.now() - lastReport > 5000) {
      lastReport = Date.now();
      await interaction
        .editReply({
          content: `⏳ ${done + failed}/${targets.size} processed…`,
          components: [],
        })
        .catch(() => {});
    }
  }

  await interaction.editReply({
    content:
      `✅ ${mode === "add" ? "Granted" : "Removed"} **${role.name}**: ${done} member(s)` +
      (failed ? `, ${failed} failed (probably higher than me).` : "."),
    components: [],
  });
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Give, take, and inspect roles")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Give a member a role")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who").setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName("role").setDescription("Which role").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Take a role away from a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who").setRequired(true),
        )
        .addRoleOption((o) =>
          o.setName("role").setDescription("Which role").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("all")
        .setDescription("Give (or take) a role across every member")
        .addRoleOption((o) =>
          o.setName("role").setDescription("Which role").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("mode")
            .setDescription("Add to everyone, or remove from everyone")
            .addChoices(
              { name: "add", value: "add" },
              { name: "remove", value: "remove" },
            ),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("info")
        .setDescription("Details about a role")
        .addRoleOption((o) =>
          o.setName("role").setDescription("Which role").setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const sub = interaction.options.getSubcommand();
    const role = interaction.options.getRole("role", true) as Role;

    if (sub === "info") {
      const members = await interaction.guild.members.fetch();
      const holders = members.filter((m) => m.roles.cache.has(role.id)).size;
      const perms = role.permissions.toArray();

      const embed = new EmbedBuilder()
        .setColor(role.color || COLORS.neutral)
        .setTitle(`@${role.name}`)
        .addFields(
          { name: "Id", value: `\`${role.id}\``, inline: true },
          { name: "Members", value: String(holders), inline: true },
          { name: "Position", value: String(role.position), inline: true },
          {
            name: "Color",
            value: role.color ? `#${role.color.toString(16).padStart(6, "0")}` : "none",
            inline: true,
          },
          { name: "Hoisted", value: role.hoist ? "yes" : "no", inline: true },
          { name: "Mentionable", value: role.mentionable ? "yes" : "no", inline: true },
          {
            name: "Created",
            value: `<t:${Math.floor(role.createdTimestamp / 1000)}:D>`,
            inline: true,
          },
          {
            name: "Managed",
            value: role.managed ? "yes (integration owns it)" : "no",
            inline: true,
          },
          {
            name: `Permissions (${perms.length})`,
            value: perms.length ? perms.join(", ").slice(0, 1024) : "none",
          },
        );
      await interaction.reply({ embeds: [embed], ...ephemeral });
      return;
    }

    const blocked = roleBlocker(interaction, role);
    if (blocked) {
      await interaction.reply({ content: `⛔ ${blocked}`, ...ephemeral });
      return;
    }

    if (sub === "all") {
      const mode = (interaction.options.getString("mode") ?? "add") as "add" | "remove";
      await interaction.deferReply({ ...ephemeral });
      await bulkRole(interaction, role, mode);
      return;
    }

    // add / remove
    const user = interaction.options.getUser("user", true);
    const member: GuildMember | null = await interaction.guild.members
      .fetch(user.id)
      .catch(() => null);
    if (!member) {
      await interaction.reply({
        content: "That user isn't in the server.",
        ...ephemeral,
      });
      return;
    }

    const has = member.roles.cache.has(role.id);
    if (sub === "add" && has) {
      await interaction.reply({
        content: `${user} already has **${role.name}**.`,
        ...ephemeral,
      });
      return;
    }
    if (sub === "remove" && !has) {
      await interaction.reply({
        content: `${user} doesn't have **${role.name}**.`,
        ...ephemeral,
      });
      return;
    }

    const reason = `/role ${sub} by ${interaction.user.tag}`;
    const ok = await (sub === "add"
      ? member.roles.add(role, reason)
      : member.roles.remove(role, reason)
    )
      .then(() => true)
      .catch(() => false);

    await interaction.reply({
      content: ok
        ? `✅ ${sub === "add" ? "Gave" : "Removed"} **${role.name}** ${sub === "add" ? "to" : "from"} ${user}.`
        : "Discord refused that. I'm probably missing **Manage Roles**.",
      ...ephemeral,
    });
  },
};

export default command;
