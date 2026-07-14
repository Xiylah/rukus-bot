import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import { levelProgress } from "@rukus/shared";
import type { Command } from "../lib/types.js";
import { canManageGuild } from "../lib/perms.js";
import { levelingConfig } from "../lib/configCache.js";
import { addXp, setXp, getRank, applyRoleRewards } from "../features/leveling/service.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("xp")
    .setDescription("Adjust a member's XP")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Add XP to a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who to give XP to").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("How much XP to add")
            .setMinValue(1)
            .setMaxValue(1_000_000)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("take")
        .setDescription("Remove XP from a member")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who to take XP from").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("How much XP to remove")
            .setMinValue(1)
            .setMaxValue(1_000_000)
            .setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set a member's XP to an exact number")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose XP to set").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("The new total XP")
            .setMinValue(0)
            .setMaxValue(100_000_000)
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // setDefaultMemberPermissions is only a default that admins can override, so
    // the authority is re-checked here.
    if (!canManageGuild(interaction.member)) {
      await interaction.reply({
        content: "You need Manage Server to do that.",
        ...ephemeral,
      });
      return;
    }

    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);

    if (user.bot) {
      await interaction.reply({ content: "Bots don't have XP.", ...ephemeral });
      return;
    }

    await interaction.deferReply(ephemeral);

    const config = await levelingConfig(interaction.guildId);

    if (sub === "give") {
      await addXp(interaction.guildId, user.id, amount);
    } else if (sub === "take") {
      // addXp with a negative delta could drive the row below zero, and a
      // negative XP total breaks every curve lookup downstream. Clamp at zero
      // by reading the current total and setting the floor explicitly.
      const current = await getRank(interaction.guildId, user.id);
      const next = Math.max(0, (current?.row.xp ?? 0) - amount);
      await setXp(interaction.guildId, user.id, next);
    } else {
      await setXp(interaction.guildId, user.id, amount);
    }

    const after = await getRank(interaction.guildId, user.id);
    const total = after?.row.xp ?? 0;
    const p = levelProgress(total);

    // The reward ladder has to follow a manual change, or /xp set becomes a way
    // to hand out a level without the role that is supposed to come with it.
    // Downwards too: applyRoleRewards honours removeRoleOnLevelDown, so /xp take
    // can demote someone out of a role they no longer qualify for.
    const member = await interaction.guild.members.fetch(user.id).catch(() => null);
    if (member) await applyRoleRewards(member, config, p.level);

    await interaction.editReply({
      content:
        `✅ ${user} is now **level ${p.level}** with **${total.toLocaleString()} XP** ` +
        `(${p.currentXp.toLocaleString()}/${p.neededXp.toLocaleString()} to level ${p.level + 1}).`,
    });
  },
};

export default command;
