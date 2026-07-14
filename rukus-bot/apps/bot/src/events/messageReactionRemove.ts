import {
  Events,
  type MessageReaction,
  type PartialMessageReaction,
  type User,
  type PartialUser,
} from "discord.js";
import type { EventHandler } from "../lib/types.js";
import { handleStarReaction } from "../features/starboard/starboard.js";

/**
 * Un-starring has to be handled or a message that briefly crossed the threshold
 * would stay on the board forever. handleStarReaction recounts from scratch, so
 * add and remove are literally the same call.
 */
const handler: EventHandler<Events.MessageReactionRemove> = {
  name: Events.MessageReactionRemove,
  execute: async (
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ) => {
    await handleStarReaction(reaction, user);
  },
};

export default handler;
