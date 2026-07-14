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

/** Reaction-role listener for reactions being REMOVED (un-reacting). */
const handler: EventHandler<Events.MessageReactionRemove> = {
  name: Events.MessageReactionRemove,
  execute: async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => {
    try {
      await handleReactionEvent(reaction, user, "remove");
    } catch (err) {
      log.error("Reaction roles (remove) failed:", err);
    }
  },
};

export default handler;
