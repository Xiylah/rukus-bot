import { getLoggingConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { LoggingForm } from "./LoggingForm";

export default async function LoggingPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  const [config, options] = await Promise.all([
    getLoggingConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">📜 Server Logging</h1>
      <p className="mb-6 text-sm text-zinc-400">
        A permanent record of what happened in your server: deleted messages,
        edits, bans, role changes, and more. Give the bot <b>View Audit Log</b>{" "}
        and log entries will also name the moderator who did it.
      </p>
      <LoggingForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
      />
    </div>
  );
}
