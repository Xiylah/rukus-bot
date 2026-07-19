import { getShopConfig, getEconomyConfig } from "@rukus/supabase";
import { requireGuildAccess } from "@/lib/guard";
import { loadGuildOptions } from "@/lib/guildOptions";
import { ShopForm } from "./ShopForm";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ guildId: string }>;
}) {
  const { guildId } = await params;
  await requireGuildAccess(guildId);

  // The economy config is read only to label prices with the server's own
  // currency name and symbol: the shop spends that currency but does not own it.
  const [config, economy, options] = await Promise.all([
    getShopConfig(guildId),
    getEconomyConfig(guildId),
    loadGuildOptions(guildId),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">🛒 Shop</h1>
      <p className="mb-6 text-sm text-zinc-400">
        Sell roles, XP boosts, extra contest and giveaway entries, or anything
        your staff fulfil by hand. Members browse with{" "}
        <code className="rounded bg-panel px-1">/shop</code> and buy with{" "}
        <code className="rounded bg-panel px-1">/buy</code>. Prices are paid in{" "}
        {economy.currencyName}, which is configured on the Economy page.
      </p>
      <ShopForm
        guildId={guildId}
        initial={config}
        economy={economy}
        channels={options.channels}
        roles={options.roles}
        grantableRoles={options.grantableRoles}
      />
    </div>
  );
}
