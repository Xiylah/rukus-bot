import Link from "next/link";
import {
  getTicketConfig,
  getFormsConfig,
  getTranslationConfig,
  getAutoResponderConfig,
  getModerationConfig,
} from "@rukus/supabase";

export default async function GuildOverview({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [tickets, forms, translation, autoresponder, moderation] =
    await Promise.all([
      getTicketConfig(guildId),
      getFormsConfig(guildId),
      getTranslationConfig(guildId),
      getAutoResponderConfig(guildId),
      getModerationConfig(guildId),
    ]);

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
      detail: `${autoresponder.extraEventPhrases.length} custom phrase(s)`,
      on: autoresponder.enabled,
    },
    {
      href: `/dashboard/${guildId}/moderation`,
      title: "🛡️ Moderation",
      status: moderation.drugFilter ? "Filter on" : "Filter off",
      detail: moderation.imageOnlyChannelId ? "Image-only channel set" : "No image channel",
      on: moderation.drugFilter || !!moderation.imageOnlyChannelId,
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
