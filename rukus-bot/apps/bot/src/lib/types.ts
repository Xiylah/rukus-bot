import type {
  ChatInputCommandInteraction,
  MessageContextMenuCommandInteraction,
  ContextMenuCommandBuilder,
  SlashCommandBuilder,
  SlashCommandOptionsOnlyBuilder,
  SlashCommandSubcommandsOnlyBuilder,
  Client,
  ClientEvents,
} from "discord.js";

/** A slash command module: its builder definition + execute handler. */
export interface Command {
  data:
    | SlashCommandBuilder
    | SlashCommandOptionsOnlyBuilder
    | SlashCommandSubcommandsOnlyBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

/** A message context-menu command (right-click a message → Apps → ...). */
export interface MessageContextCommand {
  data: ContextMenuCommandBuilder;
  execute: (
    interaction: MessageContextMenuCommandInteraction,
  ) => Promise<void>;
}

/** Either kind of registerable application command. */
export type AnyCommand = Command | MessageContextCommand;

/** Type guard: is this a context-menu command module? */
export function isContextCommand(
  cmd: AnyCommand,
): cmd is MessageContextCommand {
  // ContextMenuCommandBuilder has a numeric `type`; slash builders don't.
  return typeof (cmd.data as { type?: unknown }).type === "number";
}

/** A gateway event handler module. */
export interface EventHandler<K extends keyof ClientEvents = keyof ClientEvents> {
  name: K;
  once?: boolean;
  execute: (...args: ClientEvents[K]) => Promise<void> | void;
}

/** Client augmented with our command registries. */
export type BotClient = Client & {
  commands: Map<string, Command>;
  contextCommands: Map<string, MessageContextCommand>;
};
