import { EmbedBuilder } from "discord.js";
import { COLORS } from "@rukus/shared";

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

/** Randomized "check the events channel" embed. */
export function eventEmbed(eventChannelId?: string): EmbedBuilder {
  const ref = eventChannelId ? `<#${eventChannelId}>` : "the events channel";
  const options: [string, string][] = [
    ["📅 Check the Events Channel", `Anything related to events or updates gets posted in ${ref}.`],
    ["👀 Events are posted here!", `Head over to ${ref} for the latest event info.`],
    ["🗓️ Event info this way →", `Keep an eye on ${ref} for upcoming events and schedules.`],
    ["🔔 Stay in the loop", `All event announcements and updates are in ${ref}!`],
  ];
  const [title, desc] = pick(options);
  return new EmbedBuilder()
    .setColor(COLORS.primary)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: "Automated response" });
}

/** Randomized "open a support ticket" embed for lost items. */
export function supportEmbed(supportChannelId?: string): EmbedBuilder {
  const ref = supportChannelId ? `<#${supportChannelId}>` : "the support channel";
  const options: [string, string][] = [
    ["🎫 Need help?", `Open a support ticket in ${ref} and the team will sort you out!`],
    ["🛠️ Lost something?", `File a ticket in ${ref} and we'll look into it for you.`],
    ["📬 We've got you", `Head to ${ref} and open a ticket — we'll get it resolved.`],
    ["🆘 Let's get this fixed", `Submit a support ticket in ${ref} and we'll help you out!`],
  ];
  const [title, desc] = pick(options);
  return new EmbedBuilder()
    .setColor(COLORS.danger)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: "Automated response" });
}
