import { getReactionRolesConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { ReactionRolesForm } from "./ReactionRolesForm";

export default async function ReactionRolesPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getReactionRolesConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🎭 Reaction Roles</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Let members give themselves roles. Post a panel of buttons, a dropdown,
        or classic reactions, and pick exactly how it behaves.
      </p>
      <ReactionRolesForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />
    </div>
  );
}
