import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  type ChatInputCommandInteraction,
} from "discord.js";
import { getAutoResponderConfig, setAutoResponderConfig } from "@rukus/db";
import { COLORS, evaluateAll, migrateLegacyRules } from "@rukus/shared";
import { invalidate } from "../lib/configCache.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("autoresponder")
    .setDescription("Auto-responder rules (build them on the dashboard)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("toggle")
        .setDescription("Turn the auto-responder on or off")
        .addBooleanOption((o) =>
          o.setName("enabled").setDescription("Enable it?").setRequired(true),
        ),
    )
    .addSubcommand((s) =>
      s.setName("rules").setDescription("List the configured rules"),
    )
    .addSubcommand((s) =>
      s
        .setName("test")
        .setDescription("See which rule a message would trigger")
        .addStringOption((o) =>
          o
            .setName("message")
            .setDescription("The message to test")
            .setRequired(true),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guildId = interaction.guildId;
    const sub = interaction.options.getSubcommand();
    const config = migrateLegacyRules(await getAutoResponderConfig(guildId));

    if (sub === "toggle") {
      const enabled = interaction.options.getBoolean("enabled", true);
      await setAutoResponderConfig(guildId, { ...config, enabled });
      invalidate(guildId);
      await interaction.reply({
        content: `✅ Auto-responder is now **${enabled ? "on" : "off"}** with ${config.rules.length} rule(s).`,
        ...ephemeral,
      });
      return;
    }

    if (sub === "rules") {
      if (config.rules.length === 0) {
        await interaction.reply({
          content: "No rules yet. Build them on the dashboard's Auto-responder page.",
          ...ephemeral,
        });
        return;
      }
      const lines = config.rules.map(
        (r) =>
          `${r.enabled ? "🟢" : "⚪"} **${r.name}** - ${r.matchMode}` +
          (r.matchMode === "fuzzy" ? ` @ ${r.threshold}%` : "") +
          `, ${r.triggers.length} trigger(s)` +
          (r.questionsOnly ? ", questions only" : ""),
      );
      await interaction.reply({
        content: `**Auto-responder** (${config.enabled ? "on" : "off"})\n${lines.join("\n")}`,
        ...ephemeral,
      });
      return;
    }

    // test
    const text = interaction.options.getString("message", true);
    const { evaluations, best } = evaluateAll(config, text, {
      channelId: interaction.channelId,
    });

    const embed = new EmbedBuilder()
      .setColor(best ? COLORS.success : COLORS.neutral)
      .setTitle(best ? `Would reply: ${best.rule.name}` : "No rule would fire")
      .setDescription(
        `Testing: "${text.slice(0, 200)}"` +
          (best ? `\nMatched trigger: "${best.trigger}" (${best.score}%)` : ""),
      );

    const detail = evaluations
      .slice(0, 10)
      .map((e) => {
        const status = e.matched
          ? `✅ ${e.score}%`
          : e.skip === "no-trigger-matched" && e.score > 0
            ? `❌ ${e.score}% (needs ${e.rule.threshold}%)`
            : `❌ ${e.skip}`;
        return `**${e.rule.name}**: ${status}`;
      })
      .join("\n");
    if (detail) embed.addFields({ name: "All rules", value: detail.slice(0, 1024) });

    await interaction.reply({ embeds: [embed], ...ephemeral });
  },
};

export default command;
