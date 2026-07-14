import { getSocialAlertsConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { SocialAlertsForm } from "./SocialAlertsForm";

export default async function SocialPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getSocialAlertsConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📡 Social alerts</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Announce new YouTube uploads, Twitch streams going live, and posts from
        any RSS feed. The bot checks every 5 minutes. When you add a feed it
        quietly records what is already there, so you never get flooded with a
        backlog.
      </p>
      <SocialAlertsForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />
    </div>
  );
}
