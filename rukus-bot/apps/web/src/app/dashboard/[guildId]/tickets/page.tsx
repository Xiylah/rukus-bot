import { getTicketConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { TicketSettingsForm } from "./TicketSettingsForm";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getTicketConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🎫 Tickets</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Configure how support tickets work. After saving, run{" "}
        <code className="rounded bg-panel px-1">/ticket panel</code> in Discord to
        post the button.
      </p>
      <TicketSettingsForm
        guildId={guildId}
        initial={config}
        categories={options.categories}
        channels={options.channels}
        roles={options.roles}
      />
    </div>
  );
}
