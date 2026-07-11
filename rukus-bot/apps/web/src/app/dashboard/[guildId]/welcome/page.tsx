import { getWelcomeConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { WelcomeForm } from "./WelcomeForm";

export default async function WelcomePage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getWelcomeConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">👋 Welcome & Leave</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Greet new members, give them roles automatically, and say goodbye when
        they leave. Templates: {"{user}"} mentions them, {"{username}"} is their
        name, {"{server}"} and {"{memberCount}"} fill in automatically.
      </p>
      <WelcomeForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.grantableRoles}
      />
    </div>
  );
}
