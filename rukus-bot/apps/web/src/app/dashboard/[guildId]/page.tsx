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
  getEmbedsConfig,
  getSocialAlertsConfig,
  getBirthdaysConfig,
  getInviteTrackerConfig,
  getTempVoiceConfig,
  getContestsConfig,
  getEconomyConfig,
  getShopConfig,
  getVerificationConfig,
  getRaidConfig,
} from "@rukus/supabase";
import { ModuleCard } from "@/components/ModuleCard";
import { MODULES, MODULE_CATEGORIES, type FeatureKey } from "@/components/modules";

/** What the grid needs to know about a module beyond its static definition. */
interface ModuleState {
  enabled: boolean;
  detail: string;
}

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
    embeds,
    social,
    birthdays,
    invites,
    tempvoice,
    contests,
    verification,
    raid,
    economy,
    shop,
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
    getEmbedsConfig(guildId),
    getSocialAlertsConfig(guildId),
    getBirthdaysConfig(guildId),
    getInviteTrackerConfig(guildId),
    getTempVoiceConfig(guildId),
    getContestsConfig(guildId),
    getVerificationConfig(guildId),
    getRaidConfig(guildId),
    getEconomyConfig(guildId),
    getShopConfig(guildId),
  ]);

  // Count only the event toggles: the destination and scope keys are not events
  // and would otherwise inflate the number staff see.
  const loggedEvents = [
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

  const moderationOn =
    moderation.drugFilter || moderation.bannedWordsEnabled || !!moderation.imageOnlyChannelId;

  const state: Record<FeatureKey, ModuleState> = {
    tickets: {
      enabled: tickets.enabled,
      detail: `${tickets.supportRoleIds.length} support role(s)`,
    },
    forms: { enabled: forms.enabled, detail: `${forms.forms.length} form(s)` },
    leveling: {
      enabled: leveling.enabled,
      detail: `${leveling.xpPerMessageMin}-${leveling.xpPerMessageMax} XP per message`,
    },
    starboard: {
      enabled: starboard.enabled,
      detail: starboard.channelId
        ? `${starboard.emoji} x${starboard.threshold} to reach the board`
        : "No channel set",
    },
    suggestions: {
      enabled: suggestions.enabled,
      detail: suggestions.channelId ? "Channel set" : "No channel set",
    },
    giveaways: {
      enabled: giveaways.enabled,
      detail:
        giveaways.hostRoleIds.length > 0
          ? `${giveaways.hostRoleIds.length} host role(s)`
          : "Manage Server only",
    },
    birthdays: {
      enabled: birthdays.enabled,
      detail: birthdays.channelId ? "Announcement channel set" : "No channel set",
    },
    moderation: {
      enabled: moderationOn,
      detail: moderationOn ? "Filters active" : "No filters on",
    },
    logging: {
      enabled: logging.enabled,
      detail: logging.defaultChannelId
        ? `${loggedEvents} event(s) logged`
        : "No log channel set",
    },
    autoresponder: {
      enabled: autoresponder.enabled,
      detail: `${autoresponder.rules.length} rule(s)`,
    },
    welcome: {
      enabled: welcome.enabled,
      detail: welcome.channelId ? "Welcome channel set" : "No channel set",
    },
    autoroles: {
      enabled: autoroles.enabled,
      detail: `${autoroles.joinRoleIds.length} join role(s), ${autoroles.timedRoles.length} timed`,
    },
    reactionroles: {
      enabled: reactionroles.enabled,
      detail: `${reactionroles.panels.length} panel(s)`,
    },
    invitetracker: {
      enabled: invites.enabled,
      detail: invites.logChannelId ? "Log channel set" : "No log channel set",
    },
    tempvoice: {
      enabled: tempvoice.enabled,
      detail: tempvoice.lobbyChannelId ? "Lobby channel set" : "No lobby set",
    },
    economy: {
      enabled: economy.enabled,
      detail: `${economy.perMessageMin}-${economy.perMessageMax} ${economy.currencyName} per message`,
    },
    shop: {
      enabled: shop.enabled,
      detail:
        shop.items.length > 0
          ? `${shop.items.length} item(s) for sale`
          : "No items yet",
    },
    contests: {
      enabled: contests.enabled,
      detail: `Votes with ${contests.voteEmoji}${
        contests.maxEntriesPerUser > 0
          ? `, ${contests.maxEntriesPerUser} entry/person`
          : ", unlimited entries"
      }`,
    },
    translation: {
      enabled: translation.autoTranslate || translation.flagReactions,
      detail: `Auto ${translation.autoTranslate ? "on" : "off"}, flags ${
        translation.flagReactions ? "on" : "off"
      }`,
    },
    customcommands: {
      enabled: custom.enabled,
      detail: `${custom.commands.length} command(s)`,
    },
    socialalerts: {
      enabled: social.enabled,
      detail: `${social.feeds.length} feed(s)`,
    },
    reminders: {
      enabled: reminders.enabled,
      detail: `${reminders.maxPerUser} per member`,
    },
    highlights: {
      enabled: highlights.enabled,
      detail: `${highlights.maxPerUser} word(s) per member`,
    },
    utility: {
      enabled: utility.enabled,
      detail: `Polls ${utility.polls ? "on" : "off"}, embed builder ${
        utility.embedBuilder ? "on" : "off"
      }`,
    },
    verification: {
      enabled: verification.enabled,
      detail: verification.verifiedRoleId
        ? `${verification.mode === "captcha" ? "Captcha" : "Button"} gate`
        : "No verified role set",
    },
    raid: {
      enabled: raid.enabled,
      detail: `${raid.joinRateCount} joins / ${raid.joinRateSeconds}s trips ${raid.action}`,
    },
    // Registered features that have no card of their own: AFK rides along with
    // Utility, and Access lives under Admin in the sidebar.
    afk: { enabled: false, detail: "" },
    access: { enabled: false, detail: "" },
    // Embeds is a builder, not a switch, so it reports a count via SLUG_STATE
    // below rather than an on/off. It still needs a key here because FeatureKey
    // is derived from the registered schemas.
    embeds: { enabled: false, detail: "" },
  };

  // Modules with no feature config of their own, keyed by slug. None is a
  // switch: Cases is a view over what moderation wrote, Premium is billing,
  // and Embeds is staff posting on purpose.
  const SLUG_STATE: Record<string, ModuleState> = {
    cases: { enabled: true, detail: "Browse the moderation history" },
    premium: { enabled: false, detail: "Subscription and usage" },
    embeds: {
      enabled: embeds.embeds.length > 0,
      detail: `${embeds.embeds.length} saved, ${embeds.embeds.filter((e) => e.messageId).length} live`,
    },
  };

  // Feature-less modules are not modules you can count as "on".
  const configurable = MODULES.flatMap((m) => (m.feature ? [m.feature] : []));
  const activeCount = configurable.filter((f) => state[f].enabled).length;

  return (
    <div>
      <div className="mb-8 border-b border-edge pb-5">
        <h1 className="text-2xl font-bold text-white">Overview</h1>
        <p className="mt-1 text-sm text-zinc-400">
          {activeCount} of {configurable.length} modules are on. Flip a switch to turn one
          on or off, or open it to tune the details.
        </p>
      </div>

      {MODULE_CATEGORIES.map((category) => {
        const mods = MODULES.filter((m) => m.category === category);
        if (mods.length === 0) return null;
        return (
          <section key={category} className="mb-8">
            <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              {category}
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {mods.map((m) => {
                // Feature-less modules (Cases, Premium) have no config to read,
                // so they get a static card keyed by slug rather than by
                // feature. Falling back to a fixed key would show one module's
                // detail line on every other feature-less card.
                const s: ModuleState = m.feature
                  ? state[m.feature]
                  : (SLUG_STATE[m.slug] ?? { enabled: false, detail: "" });
                return (
                  <ModuleCard
                    key={m.slug}
                    guildId={guildId}
                    slug={m.slug}
                    feature={m.feature}
                    icon={m.icon}
                    name={m.name}
                    description={m.description}
                    detail={s.detail}
                    enabled={s.enabled}
                    toggleable={m.toggleable}
                  />
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
