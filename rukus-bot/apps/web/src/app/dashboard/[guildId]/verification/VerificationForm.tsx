"use client";

import { useState, useTransition } from "react";
import type { VerificationConfig } from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { Select, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveVerificationConfig, publishVerificationPanel } from "./actions";

export function VerificationForm({
  guildId,
  initial,
  channels,
  roles,
  grantableRoles,
}: {
  guildId: string;
  initial: VerificationConfig;
  channels: Option[];
  roles: Option[];
  grantableRoles: Option[];
}) {
  const [config, setConfig] = useState<VerificationConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [publishing, startPublish] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pubMsg, setPubMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function set<K extends keyof VerificationConfig>(
    key: K,
    value: VerificationConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  async function persist(): Promise<boolean> {
    const res = await saveVerificationConfig(guildId, config);
    setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    return res.ok;
  }

  function onSave() {
    setMsg(null);
    startTransition(() => void persist());
  }

  function onPublish() {
    setPubMsg(null);
    if (!config.channelId) {
      setPubMsg({ ok: false, text: "Pick a panel channel first." });
      return;
    }
    startPublish(async () => {
      const saved = await persist();
      if (!saved) {
        setPubMsg({ ok: false, text: "Fix the errors above, then publish." });
        return;
      }
      const res = await publishVerificationPanel(guildId);
      setPubMsg(
        res.ok
          ? {
              ok: true,
              text: res.updated
                ? "Panel updated in place. Check Discord!"
                : "Panel posted. Check Discord!",
            }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-5">
      {/* ---------------- Basics ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Basics</div>
        <Toggle
          label="Enable verification"
          hint="The master switch. Off means the panel button does nothing and the join gate below is skipped."
          checked={config.enabled}
          onChange={(v) => set("enabled", v)}
        />
        {!config.enabled && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            Verification is off, so nothing below is running.
          </p>
        )}

        <div>
          <label className="label">Verification style</label>
          <select
            className="input"
            value={config.mode}
            onChange={(e) => set("mode", e.target.value as VerificationConfig["mode"])}
          >
            <option value="button">Button (one click to verify)</option>
            <option value="captcha">Captcha (type a short code back)</option>
          </select>
          <p className="mt-1 text-xs text-zinc-500">
            Captcha shows a random code in a popup and asks the member to type it
            back. No images, no external service.
          </p>
        </div>

        <Select
          label="Verified role"
          hint="Granted when a member passes verification. This is the role that unlocks the rest of your server."
          value={config.verifiedRoleId}
          onChange={(v) => set("verifiedRoleId", v)}
          options={grantableRoles}
          prefix="@"
          placeholder="Pick a role"
        />
        {config.enabled && !config.verifiedRoleId && (
          <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            No verified role set. Members will have nothing to gain from clicking
            Verify until you pick one.
          </p>
        )}

        <Select
          label="Quarantine role (optional)"
          hint="Held by new members until they verify, and removed the moment they do. Set your channel permissions so this role can only see the verify channel."
          value={config.unverifiedRoleId}
          onChange={(v) => set("unverifiedRoleId", v)}
          options={grantableRoles}
          prefix="@"
          placeholder="None"
        />
      </div>

      {/* ---------------- Panel ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">The verify panel</div>
        <Select
          label="Panel channel"
          hint="Where the verify panel is posted. Members who can only see this channel are gated until they verify."
          value={config.channelId}
          onChange={(v) => set("channelId", v)}
          options={channels}
          prefix="#"
          placeholder="Pick a channel"
        />
        <div>
          <label className="label">Panel title</label>
          <input
            className="input"
            maxLength={256}
            value={config.panelTitle}
            onChange={(e) => set("panelTitle", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Panel description</label>
          <textarea
            className="input min-h-24"
            maxLength={4000}
            value={config.panelDescription}
            onChange={(e) => set("panelDescription", e.target.value)}
          />
        </div>
        <div>
          <label className="label">Button label</label>
          <input
            className="input max-w-xs"
            maxLength={80}
            value={config.buttonLabel}
            onChange={(e) => set("buttonLabel", e.target.value)}
          />
        </div>

        <div>
          <label className="label">Preview</label>
          <DiscordPreview
            title={config.panelTitle}
            description={config.panelDescription}
            buttons={[{ emoji: "✅", label: config.buttonLabel || "Verify" }]}
          />
        </div>
      </div>

      {/* ---------------- Publish ---------------- */}
      <div className="card space-y-4 border-blurple/30">
        <div>
          <div className="font-medium text-white">Post to Discord</div>
          <p className="mt-1 text-sm text-zinc-400">
            Saves and publishes the panel to{" "}
            {config.channelId ? <>its channel</> : <>the channel you pick above</>}.
            You can also run <code className="rounded bg-panel px-1">/verification post</code>.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn-primary"
            onClick={onPublish}
            disabled={publishing}
          >
            {publishing
              ? "Publishing…"
              : config.panelMessageId
                ? "Save and update panel in Discord"
                : "Save and post panel to Discord"}
          </button>
          {pubMsg && (
            <span className={pubMsg.ok ? "text-green-400" : "text-red-400"}>
              {pubMsg.text}
            </span>
          )}
        </div>
        {config.panelMessageId && (
          <p className="text-xs text-zinc-500">
            The panel is already live. Publishing edits that same message.
          </p>
        )}
      </div>

      {/* ---------------- Join gate ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Join gate</div>
        <p className="text-sm text-zinc-400">
          Screen brand-new accounts the moment they join, the usual signature of
          throwaway raid accounts.
        </p>
        <div>
          <label className="label">
            Minimum account age: {config.minAccountAgeDays === 0 ? "off" : `${config.minAccountAgeDays} day(s)`}
          </label>
          <input
            type="range"
            min={0}
            max={365}
            step={1}
            className="w-full"
            value={config.minAccountAgeDays}
            onChange={(e) => set("minAccountAgeDays", Number(e.target.value))}
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>0 = allow any age</span>
            <span>365 days</span>
          </div>
        </div>
        {config.minAccountAgeDays > 0 && (
          <div>
            <label className="label">Action for too-new accounts</label>
            <select
              className="input"
              value={config.minAccountAgeAction}
              onChange={(e) =>
                set(
                  "minAccountAgeAction",
                  e.target.value as VerificationConfig["minAccountAgeAction"],
                )
              }
            >
              <option value="none">Nothing (gate them via the panel only)</option>
              <option value="quarantine">Quarantine (add the quarantine role)</option>
              <option value="kick">Kick (DM them why, then remove)</option>
            </select>
            {config.minAccountAgeAction === "quarantine" && !config.unverifiedRoleId && (
              <p className="mt-1 text-xs text-amber-400">
                Quarantine needs a quarantine role set above, or nothing happens.
              </p>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={onSave} disabled={pending}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {msg && (
          <span className={msg.ok ? "text-green-400" : "text-red-400"}>
            {msg.text}
          </span>
        )}
      </div>
    </div>
  );
}
