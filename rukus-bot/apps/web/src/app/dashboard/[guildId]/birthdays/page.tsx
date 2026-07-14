import { getBirthdaysConfig, getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { BirthdaysForm, type BirthdayRow } from "./BirthdaysForm";

export default async function BirthdaysPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  const [config, options, { data }] = await Promise.all([
    getBirthdaysConfig(guildId),
    loadGuildOptions(guildId),
    // Day and month ONLY. The birth year is stored so a server can work out an
    // age if it ever truly needs one, and selecting it here would put every
    // member's age on a screen any staff member can open. It is not selected.
    getSupabase()
      .from("Birthday")
      .select("userId, day, month")
      .eq("guildId", guildId)
      .order("month", { ascending: true })
      .order("day", { ascending: true })
      .limit(200),
  ]);

  const birthdays: BirthdayRow[] = (data ?? []).map((b) => ({
    userId: b.userId,
    day: b.day,
    month: b.month,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🎂 Birthdays</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Members save their birthday with /birthday set. Once a day, at the hour
        you pick, the bot posts a message for everyone whose birthday it is and
        gives them a role for the day.
      </p>
      <BirthdaysForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        roles={options.grantableRoles}
        birthdays={birthdays}
      />
    </div>
  );
}
