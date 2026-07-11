import { redirect } from "next/navigation";
import { getAccessConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { canManageGuild } from "@/lib/discord";
import { AccessForm } from "./AccessForm";

// Cloudflare Pages runs on the edge runtime.
export const runtime = "edge";

export default async function AccessPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // Only Manage-Server users may view/edit who has dashboard access.
  const { guild } = await requireGuildAccess(guildId);
  if (!canManageGuild(guild)) redirect(`/dashboard/${guildId}`);

  const config = await getAccessConfig(guildId);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🔑 Dashboard Access</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Anyone with <strong>Manage Server</strong> can always use the dashboard.
        Grant additional staff access by role or user ID below.
      </p>
      <AccessForm guildId={guildId} initial={config} />
    </div>
  );
}
