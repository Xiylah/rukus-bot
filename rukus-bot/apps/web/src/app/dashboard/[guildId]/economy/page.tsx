import { getEconomyConfig } from "@rukus/supabase";
import { loadGuildOptions } from "@/lib/guildOptions";
import { fetchGuildChannels, CHANNEL_TYPE } from "@/lib/discord";
import { resolveMemberNames } from "@/lib/memberNames";
import { EconomyForm } from "./EconomyForm";
import { BalanceTable, type NamedBalanceRow } from "./BalanceTable";
import { getBalanceRows } from "./balances";

export default async function EconomyPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  // loadGuildOptions only exposes text channels; the ignore list covers voice
  // earning too, so those are pulled here (the fetch is deduped by Next).
  const [config, options, allChannels, rows] = await Promise.all([
    getEconomyConfig(guildId),
    loadGuildOptions(guildId),
    fetchGuildChannels(guildId),
    getBalanceRows(guildId, 100),
  ]);

  // 13 is a stage channel, which CHANNEL_TYPE does not name; the bot pays out
  // in stages too, so they belong in the ignore picker.
  const STAGE = 13;
  const voiceChannels = allChannels
    .filter((c) => c.type === CHANNEL_TYPE.voice || c.type === STAGE)
    .map((c) => ({ id: c.id, name: c.name }));

  // One batched member fetch names the whole table, so it can show and search by
  // name instead of a raw id.
  const names = await resolveMemberNames(
    guildId,
    rows.map((r) => r.userId),
  );
  // BigInt does not survive the server-to-client boundary, so the amounts cross
  // as decimal strings and are formatted there.
  const namedRows: NamedBalanceRow[] = rows.map((r) => ({
    userId: r.userId,
    amount: r.amount.toString(),
    lifetime: r.lifetime.toString(),
    dailyStreak: r.dailyStreak,
    name: names.get(r.userId) ?? r.userId,
  }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🪙 Economy</h1>
      <p className="mb-6 text-sm text-zinc-400">
        A server currency members earn by talking, sitting in voice and claiming
        a daily. They check themselves with /balance, send it with /pay, and see
        the standings with /richest. Every movement is written to an audit trail,
        so staff can always answer where an amount came from.
      </p>

      <EconomyForm
        guildId={guildId}
        initial={config}
        channels={options.channels}
        voiceChannels={voiceChannels}
        roles={options.roles}
      />

      <h2 className="mb-1 mt-10 text-lg font-semibold text-white">
        {config.currencySymbol} Balances
      </h2>
      <p className="mb-4 text-sm text-zinc-400">
        The top 100 members by balance, live from the bot. &ldquo;Earned all
        time&rdquo; never goes down when someone spends, so it stays meaningful
        after the shop opens.
      </p>
      <BalanceTable
        rows={namedRows}
        symbol={config.currencySymbol}
        currencyName={config.currencyName}
      />
    </div>
  );
}
