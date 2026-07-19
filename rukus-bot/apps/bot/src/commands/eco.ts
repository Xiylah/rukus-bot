import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  type ChatInputCommandInteraction,
} from "discord.js";
import type { Command } from "../lib/types.js";
import { canManageGuild } from "../lib/perms.js";
import { economyConfig } from "../lib/configCache.js";
import {
  addCoins,
  getBalance,
  setBalance,
  takeCoins,
} from "../features/economy/service.js";
import { money } from "../features/economy/ui.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("eco")
    .setDescription("Adjust a member's balance")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("give")
        .setDescription("Add to a member's balance")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who to pay").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("How much to add")
            .setMinValue(1)
            .setMaxValue(1_000_000_000)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Why, for the audit log")
            .setMaxLength(200),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("take")
        .setDescription("Remove from a member's balance")
        .addUserOption((o) =>
          o.setName("user").setDescription("Who to take from").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("How much to remove")
            .setMinValue(1)
            .setMaxValue(1_000_000_000)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Why, for the audit log")
            .setMaxLength(200),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("set")
        .setDescription("Set a member's balance to an exact number")
        .addUserOption((o) =>
          o.setName("user").setDescription("Whose balance to set").setRequired(true),
        )
        .addIntegerOption((o) =>
          o
            .setName("amount")
            .setDescription("The new balance")
            .setMinValue(0)
            .setMaxValue(1_000_000_000)
            .setRequired(true),
        )
        .addStringOption((o) =>
          o
            .setName("reason")
            .setDescription("Why, for the audit log")
            .setMaxLength(200),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;

    // setDefaultMemberPermissions is only a default that admins can override,
    // so the authority is re-checked here.
    if (!canManageGuild(interaction.member)) {
      await interaction.reply({
        content: "You need Manage Server to do that.",
        ...ephemeral,
      });
      return;
    }

    const config = await economyConfig(interaction.guildId);
    const sub = interaction.options.getSubcommand();
    const user = interaction.options.getUser("user", true);
    const amount = interaction.options.getInteger("amount", true);
    const reason = interaction.options.getString("reason") ?? "Staff adjustment";

    if (user.bot) {
      await interaction.reply({
        content: `Bots can't hold ${config.currencyName}.`,
        ...ephemeral,
      });
      return;
    }

    await interaction.deferReply(ephemeral);

    const guildId = interaction.guildId;
    const actorId = interaction.user.id;

    if (sub === "give") {
      // The actor is stamped into the ledger reason, so an audit of a suspicious
      // balance shows which staff member granted it and why.
      const balance = await addCoins(
        guildId,
        user.id,
        amount,
        `${reason} (by <@${actorId}>)`,
        "admin",
      );
      await interaction.editReply({
        content: `Gave ${money(config, amount)} to ${user}. They now have ${money(config, balance)}.`,
      });
      return;
    }

    if (sub === "take") {
      const taken = await takeCoins(guildId, user.id, amount, reason, actorId);
      const after = await getBalance(guildId, user.id);
      if (taken === 0n) {
        await interaction.editReply({
          content: `${user} has nothing to take.`,
        });
        return;
      }
      await interaction.editReply({
        content:
          taken < BigInt(amount)
            ? `${user} only had ${money(config, taken)}, so that is what was taken. They now have ${money(config, after.amount)}.`
            : `Took ${money(config, taken)} from ${user}. They now have ${money(config, after.amount)}.`,
      });
      return;
    }

    const balance = await setBalance(
      guildId,
      user.id,
      amount,
      reason,
      actorId,
    );
    await interaction.editReply({
      content: `Set ${user} to ${money(config, balance)}.`,
    });
  },
};

export default command;
