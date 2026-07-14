import {
  SlashCommandBuilder,
  PermissionFlagsBits,
  MessageFlags,
  ChannelType,
  type GuildBasedChannel,
  type Guild,
  type ChatInputCommandInteraction,
} from "discord.js";
import { parseDuration, formatDuration } from "@rukus/shared";
import {
  listLockedChannels,
  setLockedChannels,
  type LockedChannel,
} from "../features/roles/state.js";
import type { Command } from "../lib/types.js";

const ephemeral = { flags: MessageFlags.Ephemeral as const };

/** Channels a lockdown can meaningfully apply to (things people talk in). */
const LOCKABLE = [
  ChannelType.GuildText,
  ChannelType.GuildAnnouncement,
  ChannelType.GuildForum,
] as const;

/** Text-ish guild channels carry permissionOverwrites; threads and the rest don't. */
type LockableChannel = Extract<
  GuildBasedChannel,
  { permissionOverwrites: unknown; type: (typeof LOCKABLE)[number] }
>;

function isLockable(channel: GuildBasedChannel): channel is LockableChannel {
  return (LOCKABLE as readonly ChannelType[]).includes(channel.type);
}

/**
 * Read @everyone's current SendMessages override so /unlockdown can put it back
 * exactly as it was. "neutral" (no explicit override, inherited from the
 * category) is a real, distinct state: restoring it as "allow" would open a
 * channel that was only ever readable.
 */
function currentState(guild: Guild, channel: GuildBasedChannel): LockedChannel["previous"] {
  if (!("permissionOverwrites" in channel)) return "neutral";
  const overwrite = channel.permissionOverwrites.cache.get(guild.roles.everyone.id);
  if (!overwrite) return "neutral";
  if (overwrite.deny.has(PermissionFlagsBits.SendMessages)) return "deny";
  if (overwrite.allow.has(PermissionFlagsBits.SendMessages)) return "allow";
  return "neutral";
}

/** Deny @everyone SendMessages. Returns the pre-lock state for the record. */
async function lockChannel(
  guild: Guild,
  channel: GuildBasedChannel,
  reason: string,
): Promise<LockedChannel["previous"] | null> {
  if (!isLockable(channel)) return null;
  const before = currentState(guild, channel);
  const ok = await channel.permissionOverwrites
    .edit(guild.roles.everyone, { SendMessages: false }, { reason })
    .then(() => true)
    .catch(() => false);
  return ok ? before : null;
}

const command: Command = {
  data: new SlashCommandBuilder()
    .setName("lockdown")
    .setDescription("Stop @everyone posting in a channel (or the whole server)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels)
    .setDMPermission(false)
    .addSubcommand((s) =>
      s
        .setName("channel")
        .setDescription("Lock one channel")
        .addChannelOption((o) =>
          o
            .setName("channel")
            .setDescription("Which channel (defaults to this one)")
            .addChannelTypes(...LOCKABLE),
        )
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription('Unlock automatically after, e.g. "30m" or "2h"'),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Shown in the audit log").setMaxLength(400),
        ),
    )
    .addSubcommand((s) =>
      s
        .setName("server")
        .setDescription("Lock EVERY text channel at once")
        .addStringOption((o) =>
          o
            .setName("duration")
            .setDescription('Unlock automatically after, e.g. "30m" or "2h"'),
        )
        .addStringOption((o) =>
          o.setName("reason").setDescription("Shown in the audit log").setMaxLength(400),
        ),
    ),

  execute: async (interaction: ChatInputCommandInteraction) => {
    if (!interaction.inCachedGuild()) return;
    const guild = interaction.guild;
    const sub = interaction.options.getSubcommand();
    const reasonText = interaction.options.getString("reason") ?? "no reason given";
    const durationRaw = interaction.options.getString("duration");

    let expiresAt: number | null = null;
    if (durationRaw) {
      const seconds = parseDuration(durationRaw);
      if (seconds === null) {
        await interaction.reply({
          content: `I couldn't read "${durationRaw}" as a duration. Try \`30m\` or \`2h\`.`,
          ...ephemeral,
        });
        return;
      }
      expiresAt = Date.now() + seconds * 1000;
    }

    const auditReason = `Lockdown by ${interaction.user.tag}: ${reasonText}`;
    const existing = await listLockedChannels(guild.id);

    await interaction.deferReply();

    const targets: GuildBasedChannel[] =
      sub === "server"
        ? [...guild.channels.cache.values()].filter(isLockable)
        : [
            (interaction.options.getChannel("channel") ??
              interaction.channel) as GuildBasedChannel,
          ];

    const locked: LockedChannel[] = [];
    for (const channel of targets) {
      // Already locked by us: leave the recorded "previous" alone, or a second
      // /lockdown would overwrite it with "deny" and we'd never unlock properly.
      if (existing.some((e) => e.channelId === channel.id)) continue;
      const before = await lockChannel(guild, channel, auditReason);
      if (before !== null) {
        locked.push({ channelId: channel.id, previous: before, expiresAt });
      }
    }

    if (locked.length === 0) {
      await interaction.editReply({
        content:
          targets.length === 0
            ? "Nothing lockable there."
            : "Already locked, or I'm missing **Manage Channels** there.",
      });
      return;
    }

    await setLockedChannels(guild.id, [...existing, ...locked]);

    await interaction.editReply({
      content:
        `🔒 Locked **${locked.length}** channel(s). Reason: ${reasonText}` +
        (expiresAt
          ? `\nUnlocks automatically <t:${Math.floor(expiresAt / 1000)}:R>` +
            ` (${formatDuration(Math.round((expiresAt - Date.now()) / 1000))}).`
          : "\nUse `/unlockdown` to reopen."),
    });
  },
};

export default command;
