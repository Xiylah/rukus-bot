import { getRemindersConfig, getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { resolveMemberNames } from "@/lib/memberNames";
import { RemindersPanel, type ReminderRow } from "./RemindersPanel";

export default async function RemindersPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, { data }] = await Promise.all([
    getRemindersConfig(guildId),
    getSupabase()
      .from("Reminder")
      .select("id, userId, channelId, text, dueAt, repeatSec")
      .eq("guildId", guildId)
      .order("dueAt", { ascending: true })
      .limit(200),
  ]);

  const rows = data ?? [];
  // One batched member fetch names every reminder owner, no per-row lookup.
  const names = await resolveMemberNames(
    guildId,
    rows.map((r) => r.userId),
  );

  const reminders: ReminderRow[] = rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    userName: names.get(r.userId) ?? r.userId,
    channelId: r.channelId,
    text: r.text,
    dueAt: r.dueAt,
    repeatSec: r.repeatSec ?? null,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">⏰ Reminders</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Members set these with /remind me. The bot DMs them when one is due, and
        falls back to the channel with a ping if their DMs are closed.
      </p>
      <RemindersPanel guildId={guildId} initial={config} reminders={reminders} />
    </div>
  );
}
