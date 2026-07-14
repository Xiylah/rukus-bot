"use client";

import { useState, useTransition } from "react";
import {
  type TranslationConfig,
  TRANSLATION_LANGS,
  DEFAULT_SLANG,
} from "@rukus/shared";
import { Toggle } from "@/components/Toggle";
import { MultiSelect, type Option } from "@/components/Pickers";
import { saveTranslationConfig, testTranslation } from "../actions";

/** Split a textarea into a trimmed, de-duplicated list. */
function lines(v: string): string[] {
  return [...new Set(v.split("\n").map((s) => s.trim()).filter(Boolean))];
}

type TestResult = {
  translate: boolean;
  reason: string;
  detail: string;
  core: string;
  detected: { lang: string | null; confidence: number };
};

export function TranslationSettingsForm({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: TranslationConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [config, setConfig] = useState<TranslationConfig>(initial);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [sample, setSample] = useState("bruh that ez clap was lowkey insane");
  const [result, setResult] = useState<TestResult | null>(null);
  const [testing, startTest] = useTransition();

  function set<K extends keyof TranslationConfig>(
    key: K,
    value: TranslationConfig[K],
  ) {
    setConfig((c) => ({ ...c, [key]: value }));
  }

  function onSave() {
    setMsg(null);
    startTransition(async () => {
      const res = await saveTranslationConfig(guildId, config);
      setMsg(res.ok ? { ok: true, text: "Saved." } : { ok: false, text: res.error });
    });
  }

  function onTest() {
    setResult(null);
    startTest(async () => {
      const res = await testTranslation(guildId, config, sample);
      if (res.ok) setResult(res);
      else setMsg({ ok: false, text: res.error });
    });
  }

  return (
    <div className="space-y-5">
      {/* ---------------- Basics ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Basics</div>
        <Toggle
          label="Auto-translate messages"
          hint="Reply with a translation when someone posts in another language."
          checked={config.autoTranslate}
          onChange={(v) => set("autoTranslate", v)}
        />
        <Toggle
          label="Flag-reaction translations"
          hint="React with a country flag to translate a message. Always works, even if the rules below would skip it."
          checked={config.flagReactions}
          onChange={(v) => set("flagReactions", v)}
        />
        <div>
          <label className="label">Translate into</label>
          <select
            className="input"
            value={config.targetLang}
            onChange={(e) => set("targetLang", e.target.value)}
          >
            {TRANSLATION_LANGS.map(([name, code]) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* ---------------- Accuracy ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Accuracy</div>
        <p className="text-sm text-zinc-400">
          These control the mistake where English slang gets &quot;translated&quot; from
          some other language. Language detection is a guess, and short or slangy
          English is what it guesses wrong most. Raise the confidence to make the
          bot stay quiet when it isn&apos;t sure.
        </p>

        <div>
          <label className="label">
            Detection confidence required: {config.detectConfidence}%
          </label>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            className="w-full"
            value={config.detectConfidence}
            onChange={(e) => set("detectConfidence", Number(e.target.value))}
          />
          <div className="flex justify-between text-xs text-zinc-500">
            <span>0 = translate anything (noisy)</span>
            <span>100 = only when certain (quiet)</span>
          </div>
          <p className="mt-1 text-xs text-zinc-500">
            70% is a good starting point. If English still gets translated, raise
            it. If real foreign messages get missed, lower it.
          </p>
        </div>

        <Toggle
          label="Stay quiet when detection isn't confident"
          hint="Strongly recommended. With this off, the bot acts on shaky guesses, which is the usual cause of misfires."
          checked={config.requireConfidentDetect}
          onChange={(v) => set("requireConfidentDetect", v)}
        />

        <div>
          <label className="label">Minimum message length</label>
          <input
            type="number"
            min={1}
            max={500}
            className="input max-w-32"
            value={config.minLength}
            onChange={(e) => set("minLength", Number(e.target.value) || 1)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Characters, counted after links, mentions and emoji are removed.
            Short messages are the least reliable to detect.
          </p>
        </div>

        <div>
          <label className="label">Only translate FROM these languages</label>
          <MultiSelect
            label=""
            hint="Leave empty to translate from any language. Use this if your members only ever post in one or two other languages."
            values={config.sourceLangs}
            onChange={(v) => set("sourceLangs", v)}
            options={TRANSLATION_LANGS.filter(
              ([, code]) => code !== config.targetLang,
            ).map(([name, code]) => ({ id: code, name }))}
            emptyText="Any language"
          />
        </div>
      </div>

      {/* ---------------- Word lists ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Words and phrases</div>

        <Toggle
          label="Skip messages that are only slang"
          checked={config.skipSlang}
          onChange={(v) => set("skipSlang", v)}
        />

        {config.skipSlang && (
          <div>
            <div className="flex items-center justify-between">
              <label className="label">
                Slang words ({config.slangWords.length}) - one per line
              </label>
              <button
                type="button"
                className="text-xs text-blurple hover:underline"
                onClick={() => set("slangWords", [...DEFAULT_SLANG])}
              >
                Load the {DEFAULT_SLANG.length} common defaults
              </button>
            </div>
            <textarea
              className="input min-h-32 font-mono text-sm"
              placeholder={"bruh\nez\nlol\nngl"}
              value={config.slangWords.join("\n")}
              onChange={(e) => set("slangWords", lines(e.target.value))}
            />
            <p className="mt-1 text-xs text-zinc-500">
              A message made up entirely of these is never translated. Matched as
              whole words, so &quot;ez&quot; will not match &quot;ezreal&quot;.
            </p>
          </div>
        )}

        <div>
          <label className="label">
            Never translate messages containing ({config.neverTranslate.length})
          </label>
          <textarea
            className="input min-h-24 font-mono text-sm"
            placeholder={"gg wp\nbuild a house\nour clan tag"}
            value={config.neverTranslate.join("\n")}
            onChange={(e) => set("neverTranslate", lines(e.target.value))}
          />
          <p className="mt-1 text-xs text-zinc-500">
            The direct fix for a specific misfire: paste the phrase that got
            wrongly translated. Multi-word phrases must appear together.
          </p>
        </div>

        <div>
          <label className="label">
            Always translate messages containing ({config.alwaysTranslate.length})
          </label>
          <textarea
            className="input min-h-24 font-mono text-sm"
            placeholder={"¿\nhola\nbonjour"}
            value={config.alwaysTranslate.join("\n")}
            onChange={(e) => set("alwaysTranslate", lines(e.target.value))}
          />
          <p className="mt-1 text-xs text-zinc-500">
            Forces a translation, skipping every other check. If a phrase is on
            both lists, &quot;never&quot; wins.
          </p>
        </div>
      </div>

      {/* ---------------- Scope ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">Where it runs</div>
        <MultiSelect
          label="Never translate in these channels"
          hint="Leave empty to run everywhere."
          values={config.ignoreChannelIds}
          onChange={(v) => set("ignoreChannelIds", v)}
          options={channels}
          prefix="#"
          emptyText="Every channel"
        />
        <MultiSelect
          label="Never translate these roles"
          hint="Useful for staff or bot roles."
          values={config.ignoreRoleIds}
          onChange={(v) => set("ignoreRoleIds", v)}
          options={roles}
          prefix="@"
          emptyText="No roles ignored"
        />
        <Toggle
          label="Ignore other bots"
          checked={config.ignoreBots}
          onChange={(v) => set("ignoreBots", v)}
        />
        <Toggle
          label="Ignore messages with code blocks"
          hint="Code is not language, and translating it mangles it."
          checked={config.ignoreCodeBlocks}
          onChange={(v) => set("ignoreCodeBlocks", v)}
        />
        <div>
          <label className="label">Ignore messages starting with</label>
          <input
            className="input"
            placeholder="! / ? . -"
            value={config.ignoreCommandPrefixes.join(" ")}
            onChange={(e) =>
              set(
                "ignoreCommandPrefixes",
                e.target.value.split(/\s+/).filter(Boolean).slice(0, 20),
              )
            }
          />
          <p className="mt-1 text-xs text-zinc-500">
            Separate with spaces. Stops other bots&apos; commands being translated.
          </p>
        </div>
      </div>

      {/* ---------------- Output ---------------- */}
      <div className="card space-y-4">
        <div className="font-medium text-white">How it looks</div>
        <Toggle
          label="Show translations as an embed"
          hint="Turn off for a plain text reply."
          checked={config.useEmbed}
          onChange={(v) => set("useEmbed", v)}
        />
        {config.useEmbed && (
          <div>
            <label className="label">Embed color</label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                value={config.embedColor}
                onChange={(e) => set("embedColor", e.target.value)}
              />
              <span className="text-sm text-zinc-400">{config.embedColor}</span>
            </div>
          </div>
        )}
        <div>
          <label className="label">Delete the translation after (seconds)</label>
          <input
            type="number"
            min={0}
            max={3600}
            className="input max-w-32"
            value={config.deleteAfterSec}
            onChange={(e) => set("deleteAfterSec", Number(e.target.value) || 0)}
          />
          <p className="mt-1 text-xs text-zinc-500">
            0 keeps it forever. Useful to stop busy channels filling with
            translation replies.
          </p>
        </div>
      </div>

      {/* ---------------- Tester ---------------- */}
      <div className="card space-y-3 border-blurple/40">
        <div className="font-medium text-white">Test a message</div>
        <p className="text-sm text-zinc-400">
          Paste a message that behaved wrongly. This runs the exact same checks
          the bot runs and tells you what it would do and why. It does not post
          anything to Discord.
        </p>
        <textarea
          className="input min-h-20"
          value={sample}
          onChange={(e) => setSample(e.target.value)}
        />
        <button
          type="button"
          className="btn-secondary"
          onClick={onTest}
          disabled={testing || !sample.trim()}
        >
          {testing ? "Testing…" : "Test this message"}
        </button>

        {result && (
          <div
            className={`rounded-lg border p-4 ${
              result.translate
                ? "border-amber-500/40 bg-amber-500/10"
                : "border-green-500/40 bg-green-500/10"
            }`}
          >
            <div className="font-semibold text-white">
              {result.translate
                ? "🌐 Would be translated"
                : "🤐 Would be left alone"}
            </div>
            <p className="mt-1 text-sm text-zinc-300">{result.detail}</p>
            <div className="mt-3 space-y-1 text-xs text-zinc-400">
              <div>
                <span className="text-zinc-500">Detected language: </span>
                {result.detected.lang
                  ? `${result.detected.lang} (${result.detected.confidence}% confident)`
                  : "could not tell"}
              </div>
              <div>
                <span className="text-zinc-500">Text the bot would send: </span>
                {result.core || "(nothing)"}
              </div>
            </div>
            {result.translate && (
              <p className="mt-3 text-xs text-amber-200/90">
                If this is English and should be left alone: raise the detection
                confidence, or paste a distinctive word from it into the
                never-translate list above.
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
