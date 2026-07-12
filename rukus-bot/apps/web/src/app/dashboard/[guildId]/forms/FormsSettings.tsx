"use client";

import { useState, useTransition } from "react";
import type { FormsConfig, Form, FormField } from "@rukus/shared";
import { Select, type Option } from "@/components/Pickers";
import { Toggle } from "@/components/Toggle";
import { DiscordPreview } from "@/components/DiscordPreview";
import { saveFormsConfig } from "../actions";

/** Generate a short client-side id for new forms/fields (no crypto needed). */
function shortId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 8)}`;
}

function emptyField(): FormField {
  return {
    id: shortId("f"),
    label: "New question",
    style: "short",
    required: true,
  };
}

function emptyForm(): Form {
  return {
    id: shortId("form"),
    name: "New form",
    title: "Application",
    description: "",
    buttonLabel: "Apply",
    showOnPanel: true,
    fields: [emptyField()],
  };
}

export function FormsSettings({
  guildId,
  initial,
  channels,
  roles,
}: {
  guildId: string;
  initial: FormsConfig;
  channels: Option[];
  roles: Option[];
}) {
  const [enabled, setEnabled] = useState(initial.enabled);
  const [forms, setForms] = useState<Form[]>(initial.forms);
  const [panel, setPanel] = useState(initial.panel);
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // Edit ONE form at a time, picked from a dropdown, instead of stacking
  // every form's editor down the page.
  const [selectedFormId, setSelectedFormId] = useState<string | undefined>(
    initial.forms[0]?.id,
  );
  const fi = forms.findIndex((f) => f.id === selectedFormId);
  const form = fi >= 0 ? forms[fi] : undefined;

  function addForm() {
    const f = emptyForm();
    setForms((fs) => [...fs, f]);
    setSelectedFormId(f.id);
  }
  function removeSelectedForm() {
    setForms((fs) => {
      const next = fs.filter((f) => f.id !== selectedFormId);
      setSelectedFormId(next[0]?.id);
      return next;
    });
  }

  function updateForm(idx: number, patch: Partial<Form>) {
    setForms((fs) => fs.map((f, i) => (i === idx ? { ...f, ...patch } : f)));
  }
  function updateField(formIdx: number, fieldIdx: number, patch: Partial<FormField>) {
    setForms((fs) =>
      fs.map((f, i) =>
        i === formIdx
          ? {
              ...f,
              fields: f.fields.map((fld, j) =>
                j === fieldIdx ? { ...fld, ...patch } : fld,
              ),
            }
          : f,
      ),
    );
  }

  function onSave() {
    setMsg(null);
    const payload: FormsConfig = { enabled, forms, panel };
    startTransition(async () => {
      const res = await saveFormsConfig(guildId, payload);
      setMsg(
        res.ok
          ? { ok: true, text: "Saved. Re-run /form panel to refresh buttons." }
          : { ok: false, text: res.error },
      );
    });
  }

  return (
    <div className="space-y-5">
      <div className="card flex items-center justify-between">
        <div>
          <div className="font-medium text-white">Enable forms</div>
          <div className="text-sm text-zinc-400">Master switch for the feature.</div>
        </div>
        <button
          type="button"
          onClick={() => setEnabled((e) => !e)}
          className={`h-6 w-11 rounded-full transition-colors ${
            enabled ? "bg-blurple" : "bg-edge"
          }`}
        >
          <span
            className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
              enabled ? "translate-x-[22px]" : ""
            }`}
          />
        </button>
      </div>

      <div className="card">
        <div className="flex gap-2">
          <select
            className="input flex-1"
            value={selectedFormId ?? ""}
            onChange={(e) => setSelectedFormId(e.target.value || undefined)}
          >
            {forms.length === 0 && (
              <option value="">No forms yet, add one →</option>
            )}
            {forms.map((f, i) => (
              <option key={f.id} value={f.id}>
                {i + 1} | {f.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="btn-primary whitespace-nowrap"
            onClick={addForm}
          >
            + New form
          </button>
        </div>
      </div>

      {form && fi >= 0 && (
        <div className="card space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">
              Editing form {fi + 1} of {forms.length} ({form.id})
            </span>
            <button
              type="button"
              className="text-sm text-red-400 hover:underline"
              onClick={removeSelectedForm}
            >
              Delete this form
            </button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="label">Name (internal)</label>
              <input
                className="input"
                value={form.name}
                onChange={(e) => updateForm(fi, { name: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Modal title (shown to user)</label>
              <input
                className="input"
                maxLength={45}
                value={form.title}
                onChange={(e) => updateForm(fi, { title: e.target.value })}
              />
            </div>
            <div>
              <label className="label">Button label</label>
              <input
                className="input"
                value={form.buttonLabel}
                onChange={(e) => updateForm(fi, { buttonLabel: e.target.value })}
              />
            </div>
            <Select
              label="Review channel"
              hint="Submissions are posted here for approve/deny."
              value={form.reviewChannelId}
              onChange={(v) => updateForm(fi, { reviewChannelId: v })}
              options={channels}
              prefix="#"
              placeholder="None (submissions won't be posted)"
            />
            <Select
              label="Role granted on approval (optional)"
              value={form.approveRoleId}
              onChange={(v) => updateForm(fi, { approveRoleId: v })}
              options={roles}
              prefix="@"
              placeholder="Don't grant a role"
            />
            <div>
              <label className="label">Panel description</label>
              <input
                className="input"
                value={form.description}
                onChange={(e) => updateForm(fi, { description: e.target.value })}
              />
            </div>
          </div>

          <Toggle
            label="Show on the forms panel"
            hint="Turn OFF for forms that only exist as pre-ticket questions attached to a ticket type; they keep working in tickets but get no panel button."
            checked={form.showOnPanel}
            onChange={(v) => updateForm(fi, { showOnPanel: v })}
          />

          <div className="space-y-3">
            <div className="text-sm font-medium text-zinc-300">
              Questions ({form.fields.length}/5)
            </div>
            {form.fields.map((field, qi) => (
              <div
                key={field.id}
                className="rounded-md border border-edge bg-panel p-3"
              >
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="label">Question title</label>
                    <input
                      className="input"
                      placeholder="Question label"
                      maxLength={45}
                      value={field.label}
                      onChange={(e) =>
                        updateField(fi, qi, { label: e.target.value })
                      }
                    />
                  </div>
                  <div>
                    <label className="label">Answer style</label>
                    <select
                      className="input"
                      value={field.style}
                      onChange={(e) =>
                        updateField(fi, qi, {
                          style: e.target.value as FormField["style"],
                        })
                      }
                    >
                      <option value="short">Short answer</option>
                      <option value="paragraph">Paragraph</option>
                    </select>
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <label className="label">Question placeholder (optional)</label>
                    <input
                      className="input"
                      placeholder="e.g. Base - Gold - Galaxy - Rainbow - Diamond"
                      maxLength={100}
                      value={field.placeholder ?? ""}
                      onChange={(e) =>
                        updateField(fi, qi, {
                          placeholder: e.target.value || undefined,
                        })
                      }
                    />
                    <p className="mt-1 text-xs text-zinc-500">
                      Greyed-out hint text shown inside the empty answer box.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="label">Min length</label>
                      <input
                        type="number"
                        min={0}
                        max={4000}
                        className="input"
                        placeholder="0"
                        value={field.minLength ?? ""}
                        onChange={(e) =>
                          updateField(fi, qi, {
                            minLength:
                              e.target.value === ""
                                ? undefined
                                : Math.max(0, Number(e.target.value)),
                          })
                        }
                      />
                    </div>
                    <div>
                      <label className="label">Max length</label>
                      <input
                        type="number"
                        min={1}
                        max={4000}
                        className="input"
                        placeholder="4000"
                        value={field.maxLength ?? ""}
                        onChange={(e) =>
                          updateField(fi, qi, {
                            maxLength:
                              e.target.value === ""
                                ? undefined
                                : Math.min(4000, Number(e.target.value)),
                          })
                        }
                      />
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <label className="flex items-center gap-2 text-sm text-zinc-400">
                    <input
                      type="checkbox"
                      checked={field.required}
                      onChange={(e) =>
                        updateField(fi, qi, { required: e.target.checked })
                      }
                    />
                    Required
                  </label>
                  <button
                    type="button"
                    className="text-sm text-red-400 hover:underline"
                    onClick={() =>
                      updateForm(fi, {
                        fields: form.fields.filter((_, j) => j !== qi),
                      })
                    }
                    disabled={form.fields.length <= 1}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
            {form.fields.length < 5 && (
              <button
                type="button"
                className="btn-ghost text-sm"
                onClick={() =>
                  updateForm(fi, { fields: [...form.fields, emptyField()] })
                }
              >
                + Add question
              </button>
            )}
          </div>
        </div>
      )}

      <div className="card space-y-4">
        <div className="font-medium text-white">Panel appearance</div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <div>
              <label className="label">Panel title</label>
              <input
                className="input"
                maxLength={256}
                value={panel.title}
                onChange={(e) => setPanel((p) => ({ ...p, title: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Panel description</label>
              <textarea
                className="input min-h-20"
                placeholder="Leave blank to auto-list your forms."
                value={panel.description}
                onChange={(e) =>
                  setPanel((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
            <div>
              <label className="label">Embed color</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-12 cursor-pointer rounded border border-edge bg-panel"
                  value={panel.color}
                  onChange={(e) =>
                    setPanel((p) => ({ ...p, color: e.target.value }))
                  }
                />
                <span className="text-sm text-zinc-400">{panel.color}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Live preview</label>
            <DiscordPreview
              color={panel.color}
              title={panel.title}
              description={
                panel.description.trim() ||
                forms
                  .filter((f) => f.showOnPanel)
                  .map(
                    (f) => `• ${f.name}${f.description ? `: ${f.description}` : ""}`,
                  )
                  .join("\n") ||
                "No forms configured yet."
              }
              buttons={forms
                .filter((f) => f.showOnPanel)
                .map((f) => ({ emoji: "📝", label: f.buttonLabel }))}
            />
            <p className="mt-1 text-xs text-zinc-500">
              This is what /form panel will post. It updates as you type.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-3 border-t border-edge pt-5">
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
