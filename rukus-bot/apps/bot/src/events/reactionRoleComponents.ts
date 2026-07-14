import { Events, MessageFlags, type Interaction } from "discord.js";
import { RR_CID } from "@rukus/shared";
import type { EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import {
  handleButton,
  handleSelect,
} from "../features/reactionroles/interactions.js";

/**
 * Component router for reaction-role panels (custom ids under the "rr:"
 * namespace, see RR_CID).
 *
 * This is a second InteractionCreate listener rather than another branch inside
 * events/interactionCreate.ts: that file is edited by every feature at once, and
 * an extra listener is exactly equivalent at runtime. Non-"rr:" ids fall through
 * untouched, so the main router still sees everything it cares about.
 */
const handler: EventHandler<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    const customId =
      "customId" in interaction ? (interaction.customId as string) : "";
    if (!customId.startsWith("rr:")) return;

    try {
      if (interaction.isButton() && customId.startsWith(RR_CID.button)) {
        await handleButton(interaction);
        return;
      }
      if (
        interaction.isStringSelectMenu() &&
        customId.startsWith(RR_CID.select)
      ) {
        await handleSelect(interaction);
      }
    } catch (err) {
      log.error("Reaction roles interaction failed:", err);
      if (!interaction.isRepliable()) return;
      const payload = {
        content: "Something went wrong with that role. Please try again.",
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
