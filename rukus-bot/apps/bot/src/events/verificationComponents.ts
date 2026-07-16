import { Events, MessageFlags, type Interaction } from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import {
  handleVerifyButton,
  handleVerifyModal,
} from "../features/verification/interactions.js";
import { VERIFY_CID } from "../features/verification/ids.js";

/**
 * Component router for the verify panel (custom ids under the "vrf:" namespace).
 *
 * A second InteractionCreate listener rather than another branch in the shared
 * events/interactionCreate.ts, the same approach reaction roles takes: that file
 * is edited by every feature at once, and an extra listener is equivalent at
 * runtime. Non-"vrf:" ids fall through untouched.
 */
const handler: EventHandler<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    const customId =
      "customId" in interaction ? (interaction.customId as string) : "";
    if (!customId.startsWith("vrf:")) return;

    try {
      if (interaction.isButton() && customId === VERIFY_CID.verify) {
        await handleVerifyButton(interaction);
        return;
      }
      if (interaction.isModalSubmit() && customId === VERIFY_CID.modal) {
        await handleVerifyModal(interaction);
      }
    } catch (err) {
      log.error("Verification interaction failed:", err);
      if (!interaction.isRepliable()) return;
      const payload = {
        content: "Something went wrong verifying you. Please try again.",
        flags: MessageFlags.Ephemeral as const,
      };
      try {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
        } else {
          await interaction.reply(payload);
        }
      } catch {
        /* interaction expired; nothing more we can do */
      }
    }
  },
};

export default handler;
