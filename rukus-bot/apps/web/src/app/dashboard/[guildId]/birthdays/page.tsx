import { getBirthdaysConfig, getSupabase } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { resolveMemberNames } from "@/lib/memberNames";
import { Pagination } from "@/components/Pagination";
import { BirthdaysForm, type BirthdayRow } from "./BirthdaysForm";

const PER_PAGE = 50;

export default async function BirthdaysPage({
  params,
  searchParams,
}: {
  params: Promise<{ guildId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { guildId } = await params;
  const { page: rawPage } = await searchParams;
  await requireGuildAccess(guildId);

  const page = Math.max(1, Number(rawPage) || 1);
  const offset = (page - 1) * PER_PAGE;

  const [config, options, { data, count }] = await Promise.all([
    getBirthdaysConfig(guildId),
    loadGuildOptions(guildId),
    // Day and month ONLY. The birth year is stored so a server can work out an
    // age if it ever truly needs one, and selecting it here would put every
    // member's age on a screen any staff member can open. It is not selected.
    getSupabase()
      .from("Birthday")
      .select("userId, day, month", { count: "exact" })
      .eq("guildId", guildId)
      .order("month", { ascending: true })
      .order("day", { ascending: true })
      .range(offset, offset + PER_PAGE - 1),
  ]);

  const rows = data ?? [];
  const total = count ?? rows.length;
  const lastPage = Math.max(1, Math.ceil(total / PER_PAGE));

  // One batched member fetch names everyone on this page, no per-row lookup.
  const names = await resolveMemberNames(
    guildId,
    rows.map((b) => b.userId),
  );

  const birthdays: BirthdayRow[] = rows.map((b) => ({
    userId: b.userId,
    name: names.get(b.userId) ?? b.userId,
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
        birthdayCount={total}
      />
      <Pagination
        basePath={`/dashboard/${guildId}/birthdays`}
        page={page}
        lastPage={lastPage}
        total={total}
        shown={birthdays.length}
        offset={offset}
        label="birthdays"
      />
    </div>
  );
}
