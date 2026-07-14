import {
  SlashCommandBuilder,
  MessageFlags,
  EmbedBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { COLORS } from "@rukus/shared";
import { utilityConfig } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Regional-indicator A..J. Discord renders these as 🇦 🇧 ..., one per option. */
const LETTERS = ["🇦", "🇧", "🇨", "🇩", "🇪", "🇫", "🇬", "🇭", "🇮", "🇯"] as const;

const YES_NO = ["✅", "❌"] as const;

const builder = new SlashCommandBuilder()
  .setName("poll")
  .setDescription("Post a reaction poll")
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
  .setDMPermission(false)
  .addStringOption((o) =>
    o
      .setName("question")
      .setDescription("What you're asking")
      .setRequired(true)
      .setMaxLength(240),
  );

// Ten optional choices. Discord has no variadic option type, so they are
// declared one by one; anything past 10 stops fitting the lettered emoji set.
for (let i = 1; i <= LETTERS.length; i++) {
  builder.addStringOption((o) =>
    o
      .setName(`option${i}`)
      .setDescription(`Choice ${i}`)
      .setMaxLength(100),
  );
}

const command: Command = {
  data: builder,

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    const config = await utilityConfig(interaction.guildId);
    if (!config.enabled || !config.polls) {
      await interaction.reply({
        content: "Polls are turned off in this server.",
        ...ephemeral,
      });
      return;
    }

    const question = interaction.options.getString("question", true);
    const options: string[] = [];
    for (let i = 1; i <= LETTERS.length; i++) {
      const value = interaction.options.getString(`option${i}`);
      if (value) options.push(value);
    }

    // No options given: a yes/no poll is what people mean, and asking them to
    // type "Yes" and "No" every time is friction for nothing.
    const yesNo = options.length === 0;
    if (options.length === 1) {
      await interaction.reply({
        content: "A poll with one option isn't a poll. Give at least two, or none for yes/no.",
        ...ephemeral,
      });
      return;
    }

    const emojis: readonly string[] = yesNo ? YES_NO : LETTERS.slice(0, options.length);
    const body = yesNo
      ? `${YES_NO[0]} Yes\n${YES_NO[1]} No`
      : options.map((o, i) => `${LETTERS[i]} ${o}`).join("\n");

    const embed = new EmbedBuilder()
      .setColor(COLORS.primary)
      .setTitle(`📊 ${question}`)
      .setDescription(body)
      .setFooter({ text: `Poll by ${interaction.user.tag}` })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
    const message = await interaction.fetchReply();

    // Sequential on purpose: Discord orders reactions by arrival, and firing
    // them in parallel would shuffle the letters out of order.
    for (const emoji of emojis) {
      await message.react(emoji).catch(() => {});
    }
  },
};

export default command;
