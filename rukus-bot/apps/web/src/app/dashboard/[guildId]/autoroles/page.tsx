import { getAutoRolesConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { AutoRolesForm } from "./AutoRolesForm";

export default async function AutoRolesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getAutoRolesConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🎭 Auto-roles</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Hand out roles the moment someone joins, on a delay, or give a returning
        member back what they had. Only roles below the bot&apos;s own role can be
        granted.
      </p>
      <AutoRolesForm
        guildId={guildId}
        initial={config}
        roles={options.grantableRoles}
        allRoles={options.roles}
      />
    </div>
  );
}
