import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  EmbedBuilder,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import {
  addNote,
  listNotes,
  removeNote,
  clearNotes,
  MAX_NOTE_LENGTH,
} from "../features/moderation/notes.js";
import { resolvedMention } from "../lib/mentions.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/**
 * Private staff notes about a member. These are NOT warnings: they never DM the
 * member and never appear in /history. They are context staff leave for each
 * other ("known alt of X", "was helpful in #build"), so every reply is
 * ephemeral and the member is never notified.
 */
const command: Command = {
  data: new SlashCommandBuilder()
    .setName("note")
    .setDescription("Private staff notes about a member")
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("add")
        .setDescription("Add a private note about a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who the note is about").setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("text")
            .setDescription("The note")
            .setRequired(true)
            .setMaxLength(MAX_NOTE_LENGTH),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("list")
        .setDescription("Show the private notes on a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose notes").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("remove")
        .setDescription("Remove a single note by its id")
        .addStringOption((o) =>
          o
            .setName("id")
            .setDescription("The note id (shown by /note list)")
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("clear")
        .setDescription("Remove every note on a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose notes to wipe").setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // Defence in depth: the default-member-permissions gate can be overridden by
    // server admins in the integrations UI, so re-check in code (house rule 7).
    if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      await interaction.reply({
        content: "You need the Moderate Members permission to manage notes.",
        ...ephemeral,
      });
      return;
    }

    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();

    if (sub === "add") {
      const target = interaction.options.getUser("user", true);
      const text = interaction.options.getString("text", true);
      await addNote(guildId, target.id, interaction.user.id, text);
      await interaction.reply({
        content: `📝 Note added for ${target}. Only staff can see it; they were not notified.`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "list") {
      const target = interaction.options.getUser("user", true);
      const notes = await listNotes(guildId, target.id);
      if (notes.length === 0) {
        await interaction.reply({
          content: `No notes on ${target.tag}.`,
          ...ephemeral,
        });
        return;
      }
      const lines = await Promise.all(
        notes.map(async (n) => {
          const who = await resolvedMention(interaction.guild, n.authorId);
          const when = `<t:${Math.floor(n.createdAt.getTime() / 1000)}:R>`;
          return `**•** ${n.note}\n${who} ${when} · \`${n.id}\``;
        }),
      );
      const embed = new EmbedBuilder()
        .setColor(COLORS.primary)
        .setTitle(`Staff notes: ${target.tag}`)
        .setThumbnail(target.displayAvatarURL({ size: 64 }))
        .setDescription(lines.join("\n\n").slice(0, 4000))
        .setFooter({ text: "Private to staff. Remove one with /note remove <id>." });
      await interaction.reply({ embeds: [embed], ...ephemeral });
      return;
    }

    if (sub === "remove") {
      const id = interaction.options.getString("id", true).trim();
      const removed = await removeNote(guildId, id);
      await interaction.reply({
        content: removed
          ? "🗑️ Note removed."
          : "No note with that id in this server.",
        ...ephemeral,
      });
      return;
    }

    // clear
    const target = interaction.options.getUser("user", true);
    const count = await clearNotes(guildId, target.id);
    await interaction.reply({
      content: count > 0
        ? `🗑️ Removed ${count} note(s) on ${target.tag}.`
        : `No notes on ${target.tag}.`,
      ...ephemeral,
    });
  },
};

export default command;
