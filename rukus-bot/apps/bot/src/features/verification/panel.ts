import type {
  Guild,
  MessageCreateOptions,
  MessageEditOptions,
  TextChannel,
} from "discord.js";
import { hexToInt, type VerificationConfig } from "@rukus/shared";
import { VERIFY_CID } from "./ids.js";

/**
 * The verify panel: an embed plus one Verify button, mirroring the
 * reaction-roles panel post-and-track pattern (features/reactionroles/panel.ts).
 *
 * The payload is plain Discord API JSON so it drops straight into channel.send()
 * and channel.messages.edit(); the custom id carries no per-guild data because
 * the button handler reads the guild's config fresh on click.
 */

export function buildVerifyPanelPayload(
  config: VerificationConfig,
): MessageCreateOptions {
  return {
    embeds: [
      {
        title: config.panelTitle,
        description: config.panelDescription,
        color: hexToInt(undefined),
      },
    ],
    components: [
      {
        type: 1, // action row
        components: [
          {
            type: 2, // button
            style: 3, // success/green
            label: (config.buttonLabel || "Verify").slice(0, 80),
            custom_id: VERIFY_CID.verify,
            emoji: { name: "✅" },
          },
        ],
      },
    ],
  } as MessageCreateOptions;
}

/**
 * Post the panel, or edit the tracked message in place when it still exists, so
 * re-posting never litters the channel with duplicate panels. Returns the
 * message id so the caller can persist it.
 */
export async function publishVerifyPanel(
  channel: TextChannel,
  config: VerificationConfig,
): Promise<{ messageId: string; updated: boolean }> {
  const payload = buildVerifyPanelPayload(config);

  if (config.panelMessageId && config.panelChannelId === channel.id) {
    const existing = await channel.messages
      .fetch(config.panelMessageId)
      .catch(() => null);
    if (existing) {
      await existing.edit(payload as MessageEditOptions);
      return { messageId: existing.id, updated: true };
    }
  }

  const sent = await channel.send(payload);
  return { messageId: sent.id, updated: false };
}

/** Narrow a fetched channel to something the panel can be posted into. */
export function asTextChannel(
  guild: Guild,
  channelId: string | undefined,
): Promise<TextChannel | null> {
  if (!channelId) return Promise.resolve(null);
  return guild.channels
    .fetch(channelId)
    .then((c) => (c && c.isTextBased() ? (c as TextChannel) : null))
    .catch(() => null);
}
