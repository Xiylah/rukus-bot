import { redirect } from "next/navigation";
import { getAccessConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { isGuildAdmin, fetchGuildMembers } from "@/lib/discord";
import { loadGuildOptions } from "@/lib/guildOptions";
import { AccessForm } from "./AccessForm";

export default async function AccessPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;

  // Granting dashboard access is effectively granting power over every other
  // setting, so this page is ADMINISTRATOR-only — stricter than the Manage
  // Server permission that gates the rest of the dashboard.
  const { guild } = await requireGuildAccess(guildId);
  if (!isGuildAdmin(guild)) redirect(`/dashboard/${guildId}`);

  const [config, options, members] = await Promise.all([
    getAccessConfig(guildId),
    loadGuildOptions(guildId),
    fetchGuildMembers(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🔑 Dashboard Access</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Choose who can log into this dashboard. Server{" "}
        <strong>Administrators</strong> always have access — and only they can see
        or change this page.
      </p>
      <AccessForm
        guildId={guildId}
        initial={config}
        roles={options.roles}
        members={members}
      />
    </div>
  );
}
