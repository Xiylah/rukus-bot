"use client";

import { useState, useTransition } from "react";
import type {
  EconomyConfig,
  ShopConfig,
  ShopItem,
  ShopItemKind,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveShopConfig } from "./actions";

function emptyItem(): ShopItem {
  return {
    id: `i_${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    name: "New item",
    description: "",
    price: 100,
    kind: "custom",
    roleId: undefined,
    roleDurationHours: 0,
    boostMultiplier: 2,
    boostHours: 24,
    extraEntries: 1,
    stock: 0,
    perUserLimit: 0,
    requiredRoleIds: [],
  };
}

const KIND_LABELS: Record<ShopItemKind, string> = {
  role: "Give a role",
  xpboost: "XP boost",
  contest_entry: "Extra contest entries",
  giveaway_entry: "Extra giveaway entries",
  custom: "Custom (staff fulfil by hand)",
};

const KIND_HELP: Record<ShopItemKind, string> = {
  role: "The bot adds the role as soon as they buy. Your bot's own role must sit ABOVE the role you pick, or the purchase is refused before anyone is charged.",
  xpboost:
    "Multiplies the XP and currency they earn for a while. Stacked boosts do not multiply together: the highest one wins.",
  contest_entry:
    "Extra entries in contests, on top of the one everybody gets for entering.",
  giveaway_entry: "Extra entries in giveaways, improving their odds.",
  custom:
    "The bot takes payment and posts the order in your fulfil channel. Staff mark it done with /shop fulfil <id>.",
};

export function ShopForm({
  guildId,
  initial,
  economy,
  channels,
  roles,
  grantableRoles,
}: {
  guildId: string;
  initial: ShopConfig;
  economy: EconomyConfig;
  channels: Option[];
  roles: Option[];
  grantableRoles: Option[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [fulfilChannelId, setFulfilChannelId] = useState(initial.fulfilChannelId);
  const [logChannelId, setLogChannelId] = useState(initial.logChannelId);
  const [items, setItems] = useState<ShopItem[]>(initial.items);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initial.items[0]?.id,
  );
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ii = items.findIndex((i) => i.id === selectedId);
  const item = ii >= 0 ? items[ii] : undefined;

  function update(patch: Partial<ShopItem>) {
    setItems((is) => is.map((i, n) => (n === ii ? { ...i, ...patch } : i)));
  }
  function addItem() {
    const i = emptyItem();
    setItems((is) => [...is, i]);
    setSelectedId(i.id);
  }
  function removeItem() {
    setItems((is) => {
      const next = is.filter((i) => i.id !== selectedId);
      setSelectedId(next[0]?.id);
      return next;
    });
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveShopConfig(guildId, {
        enabled,
        items,
        fulfilChannelId,
        logChannelId,
      });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  const hasCustom = items.some((i) => i.kind === "custom");

  return (
    <div className="space-y-5">
      <div className="card space-y-4">
        <Toggle label="Enable the shop" checked={enabled} onChange={setEnabled} />
        <Select
          label="Order channel"
          hint={
            hasCustom
              ? "Where custom orders are posted for staff to fulfil. Required while you sell custom items, or nobody will know an order came in."
              : "Where custom orders are posted for staff. Only needed if you sell custom items."
          }
          value={fulfilChannelId}
          onChange={setFulfilChannelId}
          options={channels}
          prefix="#"
        />
        <Select
          label="Purchase log channel"
          hint="Optional. Every purchase is logged here."
          value={logChannelId}
          onChange={setLogChannelId}
          options={channels}
          prefix="#"
        />
      </div>

      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || undefined)}
          >
            {items.length === 0 && (
              <option value="">No items yet, add one →</option>
            )}
            {items.map((i, n) => (
              <option key={i.id} value={i.id}>
                {n + 1} | {i.enabled ? "" : "(off) "}
                {i.name} - {i.price}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addItem}
            disabled={items.length >= 100}
          >
            + New item
          </button>
        </div>
      </div>

      {item && ii >= 0 && (
        <>
          <div className="card space-y-4">
            <div className="flex items-center justify-end">
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={removeItem}
              >
                Delete this item
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Item name</label>
                <input
                  className="input"
                  maxLength={100}
                  value={item.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
                <p className="mt-1 text-xs text-zinc-500">
                  What members type after <code>/buy</code>.
                </p>
              </div>
              <div>
                <label className="label">
                  Price ({economy.currencyName})
                </label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={item.price}
                  onChange={(e) =>
                    update({ price: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
              </div>
            </div>

            <div>
              <label className="label">Description</label>
              <textarea
                className="input min-h-20"
                maxLength={500}
                placeholder="Shown under the item in /shop."
                value={item.description}
                onChange={(e) => update({ description: e.target.value })}
              />
            </div>

            <Toggle
              label="Item is for sale"
              checked={item.enabled}
              onChange={(v) => update({ enabled: v })}
            />
          </div>

          {/* What buying it does */}
          <div className="card space-y-4">
            <div className="font-medium text-white">What buying it does</div>
            <div>
              <label className="label">Item type</label>
              <select
                className="input"
                value={item.kind}
                onChange={(e) =>
                  update({ kind: e.target.value as ShopItemKind })
                }
              >
                {(Object.keys(KIND_LABELS) as ShopItemKind[]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
              <p className="mt-1 text-xs text-zinc-500">{KIND_HELP[item.kind]}</p>
            </div>

            {item.kind === "role" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Select
                  label="Role to give"
                  value={item.roleId}
                  onChange={(v) => update({ roleId: v })}
                  options={grantableRoles}
                  prefix="@"
                />
                <div>
                  <label className="label">Hours they keep it</label>
                  <input
                    type="number"
                    min={0}
                    max={8760}
                    className="input"
                    value={item.roleDurationHours}
                    onChange={(e) =>
                      update({
                        roleDurationHours: Math.max(
                          0,
                          Number(e.target.value) || 0,
                        ),
                      })
                    }
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    0 keeps it forever.
                  </p>
                </div>
              </div>
            )}

            {item.kind === "xpboost" && (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="label">Multiplier</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    step={0.5}
                    className="input"
                    value={item.boostMultiplier}
                    onChange={(e) =>
                      update({ boostMultiplier: Number(e.target.value) || 1 })
                    }
                  />
                </div>
                <div>
                  <label className="label">Hours it lasts</label>
                  <input
                    type="number"
                    min={1}
                    max={720}
                    className="input"
                    value={item.boostHours}
                    onChange={(e) =>
                      update({ boostHours: Number(e.target.value) || 1 })
                    }
                  />
                </div>
              </div>
            )}

            {(item.kind === "contest_entry" ||
              item.kind === "giveaway_entry") && (
              <div>
                <label className="label">Extra entries granted</label>
                <input
                  type="number"
                  min={1}
                  max={20}
                  className="input max-w-32"
                  value={item.extraEntries}
                  onChange={(e) =>
                    update({ extraEntries: Number(e.target.value) || 1 })
                  }
                />
              </div>
            )}

            {item.kind === "custom" && !fulfilChannelId && (
              <p className="rounded border border-amber-500/40 bg-amber-500/10 p-2 text-xs text-amber-300">
                Set an order channel above, or nobody will be told when someone
                buys this.
              </p>
            )}
          </div>

          {/* Limits */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Limits</div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Total stock</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={item.stock}
                  onChange={(e) =>
                    update({ stock: Math.max(0, Number(e.target.value) || 0) })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">
                  0 is unlimited. Counts every purchase ever made.
                </p>
              </div>
              <div>
                <label className="label">Limit per member</label>
                <input
                  type="number"
                  min={0}
                  className="input"
                  value={item.perUserLimit}
                  onChange={(e) =>
                    update({
                      perUserLimit: Math.max(0, Number(e.target.value) || 0),
                    })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">0 is unlimited.</p>
              </div>
            </div>
            <MultiSelect
              label="Only these roles may buy it"
              hint="Leave empty to let anyone buy it."
              values={item.requiredRoleIds}
              onChange={(v) => update({ requiredRoleIds: v })}
              options={roles}
              prefix="@"
            />
          </div>
        </>
      )}

      {/* Preview */}
      <div className="card space-y-3">
        <div className="font-medium text-white">Preview of /shop</div>
        <DiscordPreview
          title="🛒 Server shop"
          description={
            items.filter((i) => i.enabled).length === 0
              ? "There's nothing for sale yet."
              : items
                  .filter((i) => i.enabled)
                  .slice(0, 5)
                  .map(
                    (i) =>
                      `✅ **${i.name} - ${economy.currencySymbol} ${i.price}**\n${
                        i.description || "*No description*"
                      }`,
                  )
                  .join("\n\n")
          }
          select={{
            placeholder: "Buy an item...",
            options: items
              .filter((i) => i.enabled)
              .slice(0, 5)
              .map((i) => ({
                label: i.name,
                description: String(i.price),
              })),
          }}
        />
        <p className="text-xs text-zinc-500">
          Members see five items per page, with ✅ / 🔒 / ❌ showing whether they
          can afford each one and what is sold out.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn-primary"
          onClick={onSave}
          disabled={pending}
        >
          {pending ? "Saving..." : "Save changes"}
        </button>
        {msg && (
          <span
            className={msg.ok ? "text-sm text-green-400" : "text-sm text-red-400"}
          >
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
