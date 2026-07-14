import Link from "next/link";
import {
  getTicketConfig,
  getFormsConfig,
  getTranslationConfig,
  getAutoResponderConfig,
  getModerationConfig,
  getWelcomeConfig,
  getCustomCommandsConfig,
  getReactionRolesConfig,
  getLoggingConfig,
  getLevelingConfig,
  getStarboardConfig,
  getSuggestionsConfig,
  getGiveawaysConfig,
  getAutoRolesConfig,
  getRemindersConfig,
  getHighlightsConfig,
  getUtilityConfig,
} from "@rukus/supabase";

export default async function GuildOverview({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [
    tickets,
    forms,
    translation,
    autoresponder,
    moderation,
    welcome,
    custom,
    reactionroles,
    logging,
    leveling,
    starboard,
    suggestions,
    giveaways,
    autoroles,
    reminders,
    highlights,
    utility,
  ] = await Promise.all([
    getTicketConfig(guildId),
    getFormsConfig(guildId),
    getTranslationConfig(guildId),
    getAutoResponderConfig(guildId),
    getModerationConfig(guildId),
    getWelcomeConfig(guildId),
    getCustomCommandsConfig(guildId),
    getReactionRolesConfig(guildId),
    getLoggingConfig(guildId),
    getLevelingConfig(guildId),
    getStarboardConfig(guildId),
    getSuggestionsConfig(guildId),
    getGiveawaysConfig(guildId),
    getAutoRolesConfig(guildId),
    getRemindersConfig(guildId),
    getHighlightsConfig(guildId),
    getUtilityConfig(guildId),
  ]);

  // The logging card counts only the event toggles, so the destination and
  // scope keys (which are not booleans, or are not events) must not inflate it.
  const loggingEventCount = [
    logging.messageDelete,
    logging.messageEdit,
    logging.messageBulkDelete,
    logging.memberJoin,
    logging.memberLeave,
    logging.memberBan,
    logging.memberUnban,
    logging.memberKick,
    logging.memberRoleChange,
    logging.memberNickChange,
    logging.memberAvatarChange,
    logging.channelCreate,
    logging.channelDelete,
    logging.channelUpdate,
    logging.roleCreate,
    logging.roleDelete,
    logging.roleUpdate,
    logging.emojiUpdate,
    logging.serverUpdate,
    logging.inviteCreate,
    logging.inviteDelete,
    logging.voiceJoin,
    logging.voiceLeave,
    logging.voiceMove,
  ].filter(Boolean).length;

  const cards = [
    {
      href: `/dashboard/${guildId}/tickets`,
      title: "🎫 Tickets",
      status: tickets.enabled ? "Enabled" : "Disabled",
      detail: `${tickets.supportRoleIds.length} support role(s)`,
      on: tickets.enabled,
    },
    {
      href: `/dashboard/${guildId}/forms`,
      title: "📝 Forms",
      status: forms.enabled ? "Enabled" : "Disabled",
      detail: `${forms.forms.length} form(s)`,
      on: forms.enabled,
    },
    {
      href: `/dashboard/${guildId}/translation`,
      title: "🌐 Translation",
      status: translation.autoTranslate ? "Auto on" : "Auto off",
      detail: translation.flagReactions ? "Flag reactions on" : "Flag reactions off",
      on: translation.autoTranslate || translation.flagReactions,
    },
    {
      href: `/dashboard/${guildId}/autoresponder`,
      title: "💬 Auto-responder",
      status: autoresponder.enabled ? "Enabled" : "Disabled",
      detail: `${autoresponder.rules.length} rule(s)`,
      on: autoresponder.enabled,
    },
    {
      href: `/dashboard/${guildId}/welcome`,
      title: "👋 Welcome",
      status: welcome.enabled ? "Enabled" : "Disabled",
      detail: `${welcome.joinRoleIds.length} auto-role(s)`,
      on: welcome.enabled || welcome.joinRoleIds.length > 0,
    },
    {
      href: `/dashboard/${guildId}/commands`,
      title: "⌨️ Custom Commands",
      status: custom.enabled ? "Enabled" : "Disabled",
      detail: `${custom.commands.length} command(s)`,
      on: custom.enabled,
    },
    {
      href: `/dashboard/${guildId}/moderation`,
      title: "🛡️ Moderation",
      status: moderation.drugFilter ? "Filter on" : "Filter off",
      detail: moderation.imageOnlyChannelId ? "Image-only channel set" : "No image channel",
      on: moderation.drugFilter || !!moderation.imageOnlyChannelId,
    },
    {
      href: `/dashboard/${guildId}/reactionroles`,
      title: "🎭 Reaction Roles",
      status: reactionroles.enabled ? "Enabled" : "Disabled",
      detail: `${reactionroles.panels.length} panel(s)`,
      on: reactionroles.enabled,
    },
    {
      href: `/dashboard/${guildId}/logging`,
      title: "📜 Logging",
      status: logging.enabled ? "Enabled" : "Disabled",
      detail: logging.defaultChannelId
        ? `${loggingEventCount} event(s) logged`
        : "No log channel set",
      on: logging.enabled && !!logging.defaultChannelId,
    },
    {
      href: `/dashboard/${guildId}/leveling`,
      title: "📈 Leveling",
      status: leveling.enabled ? "Enabled" : "Disabled",
      detail: `${leveling.xpPerMessageMin}-${leveling.xpPerMessageMax} XP per message`,
      on: leveling.enabled,
    },
    {
      href: `/dashboard/${guildId}/starboard`,
      title: "⭐ Starboard",
      status: starboard.enabled ? "Enabled" : "Disabled",
      detail: `${starboard.emoji} x${starboard.threshold} to reach the board`,
      on: starboard.enabled && !!starboard.channelId,
    },
    {
      href: `/dashboard/${guildId}/suggestions`,
      title: "💡 Suggestions",
      status: suggestions.enabled ? "Enabled" : "Disabled",
      detail: suggestions.channelId ? "Channel set" : "No channel set",
      on: suggestions.enabled && !!suggestions.channelId,
    },
    {
      href: `/dashboard/${guildId}/giveaways`,
      title: "🎉 Giveaways",
      status: giveaways.enabled ? "Enabled" : "Disabled",
      detail:
        giveaways.hostRoleIds.length > 0
          ? `${giveaways.hostRoleIds.length} host role(s)`
          : "Manage Server only",
      on: giveaways.enabled,
    },
    {
      href: `/dashboard/${guildId}/autoroles`,
      title: "🏷️ Auto-roles",
      status: autoroles.enabled ? "Enabled" : "Disabled",
      detail: `${autoroles.joinRoleIds.length} join role(s), ${autoroles.timedRoles.length} timed`,
      on: autoroles.enabled,
    },
    {
      href: `/dashboard/${guildId}/reminders`,
      title: "⏰ Reminders",
      status: reminders.enabled ? "Enabled" : "Disabled",
      detail: `${reminders.maxPerUser} per member`,
      on: reminders.enabled,
    },
    {
      href: `/dashboard/${guildId}/highlights`,
      title: "🔔 Highlights",
      status: highlights.enabled ? "Enabled" : "Disabled",
      detail: `${highlights.maxPerUser} word(s) per member`,
      on: highlights.enabled,
    },
    {
      href: `/dashboard/${guildId}/utility`,
      title: "🔧 Utility",
      status: utility.enabled ? "Enabled" : "Disabled",
      detail: `Polls ${utility.polls ? "on" : "off"}, embed builder ${
        utility.embedBuilder ? "on" : "off"
      }`,
      on: utility.enabled,
    },
  ];

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-white">Overview</h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <Link key={c.href} href={c.href} className="card hover:border-blurple">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-white">{c.title}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                  c.on ? "bg-green-500/20 text-green-300" : "bg-zinc-600/30 text-zinc-400"
                }`}
              >
                {c.status}
              </span>
            </div>
            <p className="mt-2 text-sm text-zinc-400">{c.detail}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
