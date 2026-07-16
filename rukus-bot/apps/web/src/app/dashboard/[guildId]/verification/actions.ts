"use server";

import { revalidatePath } from "next/cache";
import { getVerificationConfig, setVerificationConfig } from "@rukus/supabase";
import { verificationConfigSchema, hexToInt } from "@rukus/shared";
import { requireGuildAccess } from "@/lib/guard";
import { postChannelMessage, editChannelMessage } from "@/lib/discord";

/**
 * Server actions for the verification gate.
 *
 * These live next to the page rather than in the shared actions.ts because the
 * publish step posts a panel over REST and must build the exact same message the
 * bot's /verification post builds, so the two never drift.
 */

type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveVerificationConfig(
  guildId: string,
  payload: unknown,
): Promise<ActionResult> {
  await requireGuildAccess(guildId);
  const parsed = verificationConfigSchema.safeParse(payload);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue ? `${issue.path.join(".")}: ${issue.message}` : "Invalid input",
    };
  }

  // The publish action owns where the live panel message lives. A form opened
  // before the last publish would send back a stale null and orphan the posted
  // panel, so carry the stored tracking fields across every save.
  const current = await getVerificationConfig(guildId);
  parsed.data.panelChannelId = current.panelChannelId;
  parsed.data.panelMessageId = current.panelMessageId;

  await setVerificationConfig(guildId, parsed.data);
  revalidatePath(`/dashboard/${guildId}/verification`);
  revalidatePath(`/dashboard/${guildId}`);
  return { ok: true };
}

/**
 * The verify panel payload. Kept in lock-step with the bot's
 * features/verification/panel.ts buildVerifyPanelPayload so "Post from the
 * dashboard" and /verification post produce the identical message.
 */
function buildPayload(config: {
  panelTitle: string;
  panelDescription: string;
  buttonLabel: string;
}): object {
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
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: (config.buttonLabel || "Verify").slice(0, 80),
            custom_id: "vrf:go",
            emoji: { name: "✅" },
          },
        ],
      },
    ],
  };
}

/**
 * Post the verify panel to its channel, or edit the live message in place when
 * it is still there, so re-publishing never litters the channel with duplicates.
 */
export async function publishVerificationPanel(
  guildId: string,
): Promise<ActionResult & { updated?: boolean }> {
  await requireGuildAccess(guildId);

  const config = await getVerificationConfig(guildId);
  if (!config.channelId) {
    return { ok: false, error: "Pick a channel for the panel first." };
  }
  if (!config.verifiedRoleId) {
    return { ok: false, error: "Pick a verified role first, or members can't be verified." };
  }

  const payload = buildPayload(config);

  if (config.panelMessageId && config.panelChannelId === config.channelId) {
    const edited = await editChannelMessage(
      config.channelId,
      config.panelMessageId,
      payload,
    );
    if (edited) {
      revalidatePath(`/dashboard/${guildId}/verification`);
      return { ok: true, updated: true };
    }
    // Message was deleted; fall through and post a fresh one.
  }

  const posted = await postChannelMessage(config.channelId, payload);
  if (!posted.ok) return { ok: false, error: posted.error };

  await setVerificationConfig(guildId, {
    ...config,
    panelChannelId: config.channelId,
    panelMessageId: posted.messageId,
  });

  revalidatePath(`/dashboard/${guildId}/verification`);
  return { ok: true, updated: false };
}
