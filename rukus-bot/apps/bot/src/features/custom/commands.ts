import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type Message,
} from "discord.js";
import {
  CID,
  type CustomCommand,
  type CustomCommandsConfig,
} from "@rukus/shared";
import { log } from "../../lib/logger.js";

/**
 * Custom prefix commands (!codes, !rules, ...).
 *
 * Note on privacy: Discord only permits ephemeral ("only you can see this")
 * replies in response to an INTERACTION, so a plain `!codes` message cannot
 * receive one directly. The "button" mode works around this: the bot posts a
 * button, and clicking it IS an interaction, so the reveal is genuinely
 * private to whoever clicked. That's the closest thing to what people expect.
 */

const cooldowns = new Map<string, number>();
const COOLDOWN_MAX = 5000;

function onCooldown(cmdId: string, userId: string, seconds: number): boolean {
  if (seconds <= 0) return false;
  const key = `${cmdId}:${userId}`;
  const now = Date.now();
  const until = cooldowns.get(key);
  if (until && until > now) return true;
  cooldowns.set(key, now + seconds * 1000);
  while (cooldowns.size > COOLDOWN_MAX) {
    const oldest = cooldowns.keys().next().value;
    if (oldest === undefined) break;
    cooldowns.delete(oldest);
  }
  return false;
}

function hexToInt(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  return Number.isNaN(n) ? 0x5865f2 : n;
}

function render(
  text: string,
  vars: { userId: string; serverName: string; channelId: string },
): string {
  return text
    .replace(/\{user\}/gi, `<@${vars.userId}>`)
    .replace(/\{server\}/gi, vars.serverName)
    .replace(/\{channel\}/gi, `<#${vars.channelId}>`);
}

/** Find the command a message invokes, or null. */
export function findCommand(
  config: CustomCommandsConfig,
  content: string,
): CustomCommand | null {
  if (!config.enabled) return null;
  const trimmed = content.trim();
  if (!trimmed.startsWith(config.prefix)) return null;

  const word = trimmed
    .slice(config.prefix.length)
    .split(/\s+/)[0]
    ?.toLowerCase();
  if (!word) return null;

  return (
    config.commands.find(
      (c) =>
        c.enabled &&
        (c.name.toLowerCase() === word ||
          c.aliases.some((a) => a.toLowerCase() === word)),
    ) ?? null
  );
}

/** Build the response payload (embed or plain text). */
function buildPayload(cmd: CustomCommand, message: Message<true>) {
  const text = render(cmd.response, {
    userId: message.author.id,
    serverName: message.guild.name,
    channelId: message.channelId,
  });
  return cmd.useEmbed
    ? {
        embeds: [
          new EmbedBuilder()
            .setColor(hexToInt(cmd.embedColor))
            .setTitle(cmd.embedTitle || null)
            .setDescription(text),
        ],
      }
    : { content: text };
}

/** Run a custom command in response to a prefix message. */
export async function runCustomCommand(
  message: Message<true>,
  config: CustomCommandsConfig,
  cmd: CustomCommand,
): Promise<void> {
  // Scoping.
  if (cmd.channelIds.length > 0 && !cmd.channelIds.includes(message.channelId)) {
    return;
  }
  if (
    cmd.allowedRoleIds.length > 0 &&
    !cmd.allowedRoleIds.some((r) => message.member?.roles.cache.has(r))
  ) {
    return;
  }
  if (onCooldown(cmd.id, message.author.id, cmd.cooldownSec)) return;

  try {
    if (cmd.responseMode === "button") {
      // Public button; the reveal is private to whoever clicks it.
      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`${CID.customReveal}:${cmd.id}`)
          .setLabel(cmd.buttonLabel || "Show me")
          .setStyle(ButtonStyle.Primary),
      );
      await message.reply({
        content: `${message.author}, click below (only you will see it):`,
        components: [row],
        allowedMentions: { repliedUser: false },
      });
    } else if (cmd.responseMode === "dm") {
      const payload = buildPayload(cmd, message);
      try {
        await message.author.send(payload);
        await message.react("📬").catch(() => {});
      } catch {
        // DMs closed: tell them, briefly, in-channel.
        await message.react("❌").catch(() => {});
        const warn = await message.channel
          .send({
            content: `${message.author} I couldn't DM you. Enable DMs from server members and try again.`,
          })
          .catch(() => null);
        if (warn) setTimeout(() => void warn.delete().catch(() => {}), 10_000);
      }
    } else {
      const payload = buildPayload(cmd, message);
      const sent = await message.reply({
        ...payload,
        allowedMentions: { repliedUser: false },
      });
      if (cmd.responseMode === "autodelete") {
        setTimeout(() => {
          void sent.delete().catch(() => {});
          void message.delete().catch(() => {});
        }, cmd.deleteAfterSec * 1000);
      }
    }

    // Tidy the trigger message when asked (button/public modes keep it, since
    // the reply is attached to it).
    if (cmd.deleteTrigger && cmd.responseMode !== "autodelete") {
      await message.delete().catch(() => {});
    }
  } catch (err) {
    log.warn(`Custom command "${cmd.name}" failed: ${String(err)}`);
  }
}

/**
 * Someone clicked a reveal button. The reply is ephemeral, so only they see
 * it, and several people can each click for their own private copy.
 */
export async function handleRevealButton(
  interaction: ButtonInteraction,
  config: CustomCommandsConfig,
): Promise<void> {
  const cmdId = interaction.customId.split(":")[2];
  const cmd = config.commands.find((c) => c.id === cmdId);
  if (!cmd || !cmd.enabled) {
    await interaction.reply({
      content: "That command no longer exists.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const text = render(cmd.response, {
    userId: interaction.user.id,
    serverName: interaction.guild?.name ?? "this server",
    channelId: interaction.channelId,
  });

  await interaction.reply({
    ...(cmd.useEmbed
      ? {
          embeds: [
            new EmbedBuilder()
              .setColor(hexToInt(cmd.embedColor))
              .setTitle(cmd.embedTitle || null)
              .setDescription(text),
          ],
        }
      : { content: text }),
    flags: MessageFlags.Ephemeral,
  });
}
