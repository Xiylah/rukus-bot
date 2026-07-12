"use client";

import { useState, useTransition, useMemo } from "react";
import {
  evaluateAll,
  migrateLegacyRules,
  type AutoResponderConfig,
  type AutoRule,
  type MatchMode,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, type Option } from "@/components/Pickers";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveAutoResponderConfig } from "../actions";

function shortId() {
  return `r_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyRule(): AutoRule {
  return {
    id: shortId(),
    enabled: true,
    name: "New rule",
    triggers: [],
    exclusions: [],
    matchMode: "fuzzy",
    threshold: 60,
    questionsOnly: false,
    minLength: 8,
    responseText: "",
    useEmbed: true,
    embedTitle: "",
    embedColor: "#5865f2",
    replyToUser: true,
    deleteAfterSec: 0,
    channelIds: [],
    ignoredChannelIds: [],
    ignoredRoleIds: [],
    cooldownSec: 30,
  };
}

const MODE_HELP: Record<MatchMode, string> = {
  fuzzy:
    "Scores how closely a message matches your trigger phrases, tolerating typos and extra words. Use the threshold slider to tune how strict it is.",
  contains: "Fires when the message contains a trigger phrase anywhere.",
  word: "Fires only on whole-word matches, so 'scam' won't match 'scamper'.",
  regex: "Advanced: each trigger is a regular expression.",
};

export function AutoResponderForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: AutoResponderConfig;
  channels: Option[];
  roles: Option[];
}) {
  // Legacy event/lost-item settings become editable rules on first load.
  const migrated = useMemo(() => migrateLegacyRules(initial), [initial]);

  const [enabled, setEnabled] = useState(migrated.enabled);
  const [rules, setRules] = useState<AutoRule[]>(migrated.rules);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    migrated.rules[0]?.id,
  );
  const [testText, setTestText] = useState("");
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const ri = rules.findIndex((r) => r.id === selectedId);
  const rule = ri >= 0 ? rules[ri] : undefined;

  function update(patch: Partial<AutoRule>) {
    setRules((rs) => rs.map((r, i) => (i === ri ? { ...r, ...patch } : r)));
  }
  function addRule() {
    const r = emptyRule();
    setRules((rs) => [...rs, r]);
    setSelectedId(r.id);
  }
  function removeRule() {
    setRules((rs) => {
      const next = rs.filter((r) => r.id !== selectedId);
      setSelectedId(next[0]?.id);
      return next;
    });
  }

  // The tester runs the SAME engine the bot uses, so it never lies.
  const test = useMemo(() => {
    if (!testText.trim()) return null;
    return evaluateAll({ ...migrated, enabled, rules }, testText, {});
  }, [testText, rules, enabled, migrated]);

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveAutoResponderConfig(guildId, {
        ...migrated,
        enabled,
        rules,
      });
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      <div className="card">
        <Toggle
          label="Enable auto-responder"
          hint="Master switch. Individual rules can also be turned on and off."
          checked={enabled}
          onChange={setEnabled}
        />
      </div>

      {/* Rule selector */}
      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedId ?? ""}
            onChange={(e) => setSelectedId(e.target.value || undefined)}
          >
            {rules.length === 0 && (
              <option value="">No rules yet, add one →</option>
            )}
            {rules.map((r, i) => (
              <option key={r.id} value={r.id}>
                {i + 1} | {r.enabled ? "" : "(off) "}
                {r.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addRule}
            disabled={rules.length >= 50}
          >
            + New rule
          </button>
        </div>
      </div>

      {rule && ri >= 0 && (
        <>
          {/* Matching */}
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-xs text-zinc-500">
                Editing rule {ri + 1} of {rules.length}
              </span>
              <button
                type="button"
                className="text-sm text-red-400 hover:underline"
                onClick={removeRule}
              >
                Delete this rule
              </button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Rule name</label>
                <input
                  className="input"
                  maxLength={80}
                  value={rule.name}
                  onChange={(e) => update({ name: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Toggle
                  label="Rule enabled"
                  checked={rule.enabled}
                  onChange={(v) => update({ enabled: v })}
                />
              </div>
            </div>

            <div>
              <label className="label">
                Trigger phrases ({rule.triggers.length}) - one per line
              </label>
              <textarea
                className="input min-h-28 font-mono text-xs"
                placeholder={"when is the next event\nany upcoming events\nevent schedule"}
                value={rule.triggers.join("\n")}
                onChange={(e) =>
                  update({
                    triggers: e.target.value
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
              <p className="mt-1 text-xs text-zinc-500">
                Add every way people phrase it. More phrasings = better matching.
              </p>
            </div>

            <div>
              <label className="label">
                Never respond if the message contains ({rule.exclusions.length})
              </label>
              <textarea
                className="input min-h-20 font-mono text-xs"
                placeholder={"that event was fun\nthe event already ended"}
                value={rule.exclusions.join("\n")}
                onChange={(e) =>
                  update({
                    exclusions: e.target.value
                      .split("\n")
                      .map((t) => t.trim())
                      .filter(Boolean),
                  })
                }
              />
              <p className="mt-1 text-xs text-zinc-500">
                Stops false positives, e.g. people talking ABOUT events rather
                than asking about them.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="label">Match mode</label>
                <select
                  className="input"
                  value={rule.matchMode}
                  onChange={(e) =>
                    update({ matchMode: e.target.value as MatchMode })
                  }
                >
                  <option value="fuzzy">Fuzzy (recommended)</option>
                  <option value="contains">Contains phrase</option>
                  <option value="word">Whole word</option>
                  <option value="regex">Regex (advanced)</option>
                </select>
                <p className="mt-1 text-xs text-zinc-500">
                  {MODE_HELP[rule.matchMode]}
                </p>
              </div>
              {rule.matchMode === "fuzzy" && (
                <div>
                  <label className="label">
                    Match sensitivity: {rule.threshold}%
                  </label>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    step={5}
                    className="w-full accent-blurple"
                    value={rule.threshold}
                    onChange={(e) =>
                      update({ threshold: Number(e.target.value) })
                    }
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    Lower = catches more (risk of false positives). Higher =
                    stricter. Use the tester below to tune it.
                  </p>
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Toggle
                label="Only reply to questions"
                hint="Requires a '?' or a question word. Turn OFF for statements like 'I lost my items'."
                checked={rule.questionsOnly}
                onChange={(v) => update({ questionsOnly: v })}
              />
              <div>
                <label className="label">Ignore messages shorter than</label>
                <input
                  type="number"
                  min={0}
                  max={200}
                  className="input"
                  value={rule.minLength}
                  onChange={(e) =>
                    update({ minLength: Number(e.target.value) || 0 })
                  }
                />
              </div>
            </div>
          </div>

          {/* Response */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Response</div>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-3">
                <Toggle
                  label="Send as an embed"
                  checked={rule.useEmbed}
                  onChange={(v) => update({ useEmbed: v })}
                />
                {rule.useEmbed && (
                  <>
                    <div>
                      <label className="label">Embed title</label>
                      <input
                        className="input"
                        maxLength={256}
                        value={rule.embedTitle}
                        onChange={(e) => update({ embedTitle: e.target.value })}
                      />
                    </div>
                    <div>
                      <label className="label">Embed color</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                          value={rule.embedColor}
                          onChange={(e) =>
                            update({ embedColor: e.target.value })
                          }
                        />
                        <span className="text-sm text-zinc-400">
                          {rule.embedColor}
                        </span>
                      </div>
                    </div>
                  </>
                )}
                <div>
                  <label className="label">Response text</label>
                  <textarea
                    className="input min-h-24"
                    maxLength={2000}
                    placeholder="Anything about events gets posted in {channel}."
                    value={rule.responseText}
                    onChange={(e) => update({ responseText: e.target.value })}
                  />
                  <p className="mt-1 text-xs text-zinc-500">
                    {"{user}"} mentions them, {"{server}"} is the server name,{" "}
                    {"{channel}"} is where they posted. Use{" "}
                    <code className="rounded bg-panel px-1">
                      {"<#channelid>"}
                    </code>{" "}
                    to link a channel.
                  </p>
                </div>
              </div>

              <div>
                <label className="label">Preview</label>
                {rule.useEmbed ? (
                  <DiscordPreview
                    color={rule.embedColor}
                    title={rule.embedTitle || "(no title)"}
                    description={rule.responseText || "(no text)"}
                  />
                ) : (
                  <div className="rounded-lg border border-edge bg-[#313338] p-4 text-sm text-zinc-200">
                    {rule.responseText || "(no text)"}
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Toggle
                label="Reply to the member"
                hint="Off = post as a normal message."
                checked={rule.replyToUser}
                onChange={(v) => update({ replyToUser: v })}
              />
              <div>
                <label className="label">Cooldown (seconds)</label>
                <input
                  type="number"
                  min={0}
                  max={86400}
                  className="input"
                  value={rule.cooldownSec}
                  onChange={(e) =>
                    update({ cooldownSec: Number(e.target.value) || 0 })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">
                  Per channel. Stops repeat spam.
                </p>
              </div>
              <div>
                <label className="label">Auto-delete after (seconds)</label>
                <input
                  type="number"
                  min={0}
                  max={3600}
                  className="input"
                  value={rule.deleteAfterSec}
                  onChange={(e) =>
                    update({ deleteAfterSec: Number(e.target.value) || 0 })
                  }
                />
                <p className="mt-1 text-xs text-zinc-500">0 = keep forever.</p>
              </div>
            </div>
          </div>

          {/* Scoping */}
          <div className="card space-y-4">
            <div className="font-medium text-white">Where this rule applies</div>
            <MultiSelect
              label="Only these channels (optional)"
              hint="Leave empty to run everywhere."
              values={rule.channelIds}
              onChange={(v) => update({ channelIds: v })}
              options={channels}
              prefix="#"
              emptyText="Every channel"
            />
            <MultiSelect
              label="Never in these channels"
              values={rule.ignoredChannelIds}
              onChange={(v) => update({ ignoredChannelIds: v })}
              options={channels}
              prefix="#"
              emptyText="None"
            />
            <MultiSelect
              label="Ignore members with these roles"
              hint="Handy for staff, who usually don't need the canned answer."
              values={rule.ignoredRoleIds}
              onChange={(v) => update({ ignoredRoleIds: v })}
              options={roles}
              prefix="@"
              emptyText="Nobody ignored"
            />
            <p className="text-xs text-zinc-500">
              Tickets are always excluded, so the bot never answers over staff
              who are already helping someone.
            </p>
          </div>
        </>
      )}

      {/* Tester */}
      <div className="card space-y-3 border-blurple/30">
        <div>
          <div className="font-medium text-white">Test a message</div>
          <p className="mt-1 text-sm text-zinc-400">
            Type what a member might say and see exactly which rule fires. This
            runs the same matching code as the bot.
          </p>
        </div>
        <input
          className="input"
          placeholder="e.g. hey guys when is the next event?"
          value={testText}
          onChange={(e) => setTestText(e.target.value)}
        />
        {test && (
          <div className="space-y-2">
            <div
              className={`rounded-md border p-3 text-sm ${
                test.best
                  ? "border-green-500/30 bg-green-500/10 text-green-200"
                  : "border-edge bg-panel text-zinc-400"
              }`}
            >
              {test.best ? (
                <>
                  ✅ <strong>{test.best.rule.name}</strong> would reply (matched
                  &quot;{test.best.trigger}&quot; at {test.best.score}%)
                </>
              ) : (
                "❌ No rule would reply to this message."
              )}
            </div>
            <div className="space-y-1">
              {test.evaluations.map((e) => (
                <div
                  key={e.rule.id}
                  className="flex items-center justify-between rounded border border-edge bg-panel px-3 py-1.5 text-xs"
                >
                  <span className="text-zinc-300">{e.rule.name}</span>
                  <span
                    className={e.matched ? "text-green-400" : "text-zinc-500"}
                  >
                    {e.matched
                      ? `matched ${e.score}%`
                      : e.skip === "no-trigger-matched"
                        ? `${e.score}% (needs ${e.rule.threshold}%)`
                        : e.skip}
                  </span>
                </div>
              ))}
            </div>
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
