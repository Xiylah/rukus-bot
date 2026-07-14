import {
  Events,
  type MessageReaction,
  type PartialMessageReaction,
  type PartialUser,
  type User,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { handleReactionEvent } from "../features/reactionroles/reactions.js";
import { log } from "../lib/logger.js";

/**
 * Reaction-role listener for reactions being ADDED.
 *
 * A separate module from messageReactionAdd.ts (flag translations) on purpose:
 * the loader wires every event file, discord.js allows several listeners per
 * event, and keeping them apart means a slow translation call can never delay a
 * role grant. Partials.Reaction is enabled in index.ts, so this fires for panels
 * posted long before the bot last restarted.
 */
const handler: EventHandler<Events.MessageReactionAdd> = {
  name: Events.MessageReactionAdd,
  execute: async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => {
    try {
      await handleReactionEvent(reaction, user, "add");
    } catch (err) {
      log.error("Reaction roles (add) failed:", err);
    }
  },
};

export default handler;
