import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  MessageFlags,
  type ButtonInteraction,
  type GuildTextBasedChannel,
  type Message,
} from "discord.js";
import {
  CID,
  runTagScript,
  type CustomCommand,
  type CustomCommandsConfig,
  type TagActions,
  type TagContext,
  type TagResult,
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

/**
 * Run a command's response, through TagScript when the command opts in.
 *
 * With tagscript off the old three-placeholder substitution still applies, so
 * responses that legitimately contain braces keep working untouched.
 */
function evaluateResponse(
  cmd: CustomCommand,
  ctx: TagContext,
  fallbackVars: { userId: string; serverName: string; channelId: string },
): TagResult {
  if (!cmd.tagscript) {
    return { content: render(cmd.response, fallbackVars), actions: {} };
  }
  return runTagScript(cmd.response, ctx);
}

function tagContext(message: Message<true>, cmd: CustomCommand): TagContext {
  // Everything after the command word itself.
  const words = message.content.trim().split(/\s+/);
  return {
    user: {
      id: message.author.id,
      name: message.member?.displayName ?? message.author.username,
      avatar: message.author.displayAvatarURL(),
      roleIds: message.member ? [...message.member.roles.cache.keys()] : [],
    },
    server: {
      id: message.guild.id,
      name: message.guild.name,
      memberCount: message.guild.memberCount,
      icon: message.guild.iconURL() ?? "",
    },
    channel: {
      id: message.channelId,
      name: message.channel.isTextBased() && "name" in message.channel ? message.channel.name : "",
    },
    args: words.slice(1),
    uses: cmd.uses,
  };
}

/** Turn a TagScript result into a discord.js message payload. */
/**
 * Mention policy for every custom-command send.
 *
 * A command's text is author-controlled (any staffer with dashboard access can
 * edit it) and TagScript passes "@everyone" through as literal text, so without
 * this a single command could mass-ping the whole server. Individual user
 * mentions stay allowed because "hey {user}" is the common, wanted case;
 * everyone/here and role pings are not, so they are never parsed.
 *
 * This lives in payloadFrom because every send path (reply, DM, redirect)
 * funnels through it, which makes it the one place the policy cannot be missed.
 */
const SAFE_MENTIONS = { parse: ["users"] as const, repliedUser: false };

function payloadFrom(cmd: CustomCommand, result: TagResult) {
  const embedSpec = result.embed;
  if (embedSpec) {
    const embed = new EmbedBuilder().setColor(
      hexToInt(embedSpec.color ?? cmd.embedColor),
    );
    if (embedSpec.title) embed.setTitle(embedSpec.title);
    if (embedSpec.description) embed.setDescription(embedSpec.description);
    return result.content
      ? {
          content: result.content,
          embeds: [embed],
          allowedMentions: SAFE_MENTIONS,
        }
      : { embeds: [embed], allowedMentions: SAFE_MENTIONS };
  }

  if (cmd.useEmbed) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor(hexToInt(cmd.embedColor))
          .setTitle(cmd.embedTitle || null)
          .setDescription(result.content || "​"),
      ],
      allowedMentions: SAFE_MENTIONS,
    };
  }
  return { content: result.content, allowedMentions: SAFE_MENTIONS };
}

/**
 * {require} and {blacklist} gate the command from inside the script itself,
 * on top of the dashboard's allowedRoleIds.
 */
function gatedOut(actions: TagActions, roleIds: Set<string>): boolean {
  if (actions.blockedRoleIds?.some((r) => roleIds.has(r))) return true;
  if (actions.requireRoleIds?.length && !actions.requireRoleIds.some((r) => roleIds.has(r))) {
    return true;
  }
  return false;
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

  const result = evaluateResponse(cmd, tagContext(message, cmd), {
    userId: message.author.id,
    serverName: message.guild.name,
    channelId: message.channelId,
  });
  const actions = result.actions;

  // The script's own {require}/{blacklist} gates. Checked before anything is
  // sent, and silently, so a gated command looks like it simply does not exist.
  const roleIds = new Set(message.member?.roles.cache.keys() ?? []);
  if (gatedOut(actions, roleIds)) return;

  try {
    for (const emoji of actions.react ?? []) {
      await message.react(emoji).catch(() => {});
    }

    // {dm} overrides the configured mode, and {silence} means the script ran
    // purely for its side effects.
    const mode = actions.dm ? "dm" : cmd.responseMode;
    const hasBody = Boolean(result.content || result.embed);

    if (actions.silence || !hasBody) {
      // Nothing to send.
    } else if (mode === "button") {
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
    } else if (mode === "dm") {
      const payload = payloadFrom(cmd, result);
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
      const payload = payloadFrom(cmd, result);
      // {redirect} sends the answer somewhere else, so it can't be a reply.
      const target = actions.redirectChannelId
        ? await resolveChannel(message, actions.redirectChannelId)
        : null;

      // payload already carries the safe mention policy; do not override it
      // here, or a command containing @everyone would ping the whole server.
      const sent = target
        ? await target.send(payload)
        : await message.reply(payload);

      if (mode === "autodelete") {
        setTimeout(() => {
          void sent.delete().catch(() => {});
          void message.delete().catch(() => {});
        }, cmd.deleteAfterSec * 1000);
      }
    }

    // Tidy the trigger message when asked (button/public modes keep it, since
    // the reply is attached to it). {delete} asks for the same thing from
    // inside the script.
    if (actions.delete || (cmd.deleteTrigger && mode !== "autodelete")) {
      await message.delete().catch(() => {});
    }
  } catch (err) {
    log.warn(`Custom command "${cmd.name}" failed: ${String(err)}`);
  }
}

/** A {redirect} target, but only inside this guild and only if we can post. */
async function resolveChannel(
  message: Message<true>,
  channelId: string,
): Promise<GuildTextBasedChannel | null> {
  const channel = await message.guild.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isTextBased()) return null;
  return channel;
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

  const fallbackVars = {
    userId: interaction.user.id,
    serverName: interaction.guild?.name ?? "this server",
    channelId: interaction.channelId,
  };

  // The reveal has no trigger message and no arguments, so the script's actions
  // (delete, react, redirect...) have nothing to act on and are ignored here.
  const result = evaluateResponse(
    cmd,
    {
      user: {
        id: interaction.user.id,
        name: interaction.user.username,
        avatar: interaction.user.displayAvatarURL(),
        roleIds: [],
      },
      server: {
        id: interaction.guild?.id ?? "",
        name: fallbackVars.serverName,
        memberCount: interaction.guild?.memberCount ?? 0,
        icon: interaction.guild?.iconURL() ?? "",
      },
      channel: { id: interaction.channelId, name: "" },
      args: [],
      uses: cmd.uses,
    },
    fallbackVars,
  );

  await interaction.reply({
    ...payloadFrom(cmd, result),
    flags: MessageFlags.Ephemeral,
  });
}
