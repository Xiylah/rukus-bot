import { ContextMenuCommandBuilder, ApplicationCommandType } from "discord.js";
import type { MessageContextCommand } from "../lib/types.js";
import { contextTranslate } from "../features/translation/contextHelpers.js";

const command: MessageContextCommand = {
  data: new ContextMenuCommandBuilder()
    .setName("Translate to English")
    .setType(ApplicationCommandType.Message),
  execute: (interaction) => contextTranslate(interaction, "en"),
};

export default command;
