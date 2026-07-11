import { Events, MessageFlags, type Interaction } from "discord.js";
import { CID } from "@rukus/shared";
import type { BotClient, EventHandler } from "../lib/types.js";
import { log } from "../lib/logger.js";
import * as tickets from "../features/tickets/interactions.js";
import * as forms from "../features/forms/interactions.js";

/**
 * Central interaction router.
 *
 * Slash commands dispatch by name via the client's command registry. Component
 * and modal interactions dispatch by their custom-id prefix (see CID in
 * @rukus/shared). Every branch is wrapped so a thrown handler replies with a
 * friendly error instead of leaving the user with a spinning "thinking…".
 */
const handler: EventHandler<Events.InteractionCreate> = {
  name: Events.InteractionCreate,
  execute: async (interaction: Interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const client = interaction.client as BotClient;
        const command = client.commands.get(interaction.commandName);
        if (!command) {
          log.warn(`No handler for command: ${interaction.commandName}`);
          return;
        }
        await command.execute(interaction);
        return;
      }

      if (interaction.isMessageContextMenuCommand()) {
        const client = interaction.client as BotClient;
        const command = client.contextCommands.get(interaction.commandName);
        if (!command) {
          log.warn(`No handler for context command: ${interaction.commandName}`);
          return;
        }
        await command.execute(interaction);
        return;
      }

      // Component + modal interactions carry a custom_id we namespace-route on.
      const customId =
        "customId" in interaction ? (interaction.customId as string) : "";

      if (interaction.isButton()) {
        if (customId.startsWith(CID.ticketOpen))
          return void (await tickets.handleOpenButton(interaction));
        if (customId.startsWith(CID.ticketClaim))
          return void (await tickets.handleClaimButton(interaction));
        // Order matters: "tkt:closeconfirm" startsWith "tkt:close", so the
        // confirm branch must be checked FIRST or Confirm would just re-open
        // the confirmation prompt forever.
        if (customId.startsWith(CID.ticketCloseConfirm))
          return void (await tickets.handleCloseConfirm(interaction));
        if (customId.startsWith(CID.ticketClose))
          return void (await tickets.handleCloseButton(interaction));
        if (customId.startsWith(CID.ticketReopen))
          return void (await tickets.handleReopen(interaction));
        if (customId.startsWith(CID.ticketDelete))
          return void (await tickets.handleDelete(interaction));
        if (customId.startsWith(CID.formOpen))
          return void (await forms.handleOpenButton(interaction));
        if (customId.startsWith(CID.formApprove))
          return void (await forms.handleApprove(interaction));
        if (customId.startsWith(CID.formDeny))
          return void (await forms.handleDeny(interaction));
      }

      if (interaction.isStringSelectMenu()) {
        // The multi-type ticket panel is a dropdown; each value is a type id.
        if (customId.startsWith(CID.ticketOpen))
          return void (await tickets.handleOpenSelect(interaction));
      }

      if (interaction.isModalSubmit()) {
        if (customId.startsWith(CID.formModal))
          return void (await forms.handleModalSubmit(interaction));
      }
    } catch (err) {
      log.error("Interaction handler error:", err);
      await replyError(interaction);
    }
  },
};

/** Best-effort error reply that works whether or not we've already deferred. */
async function replyError(interaction: Interaction) {
  if (!interaction.isRepliable()) return;
  const payload = {
    content: "Something went wrong handling that. Please try again.",
    flags: MessageFlags.Ephemeral as const,
  };
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(payload);
    } else {
      await interaction.reply(payload);
    }
  } catch {
    /* interaction may have expired; nothing more we can do */
  }
}

export default handler;
