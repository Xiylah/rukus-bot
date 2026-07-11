"use client";

import { useState, useTransition } from "react";
import type { FormsConfig, Form, FormField } from "@rukus/shared";
import { Select, type Option } from "@/components/Pickers";
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
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

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
    const payload: FormsConfig = { enabled, forms };
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

      {forms.map((form, fi) => (
        <div key={form.id} className="card space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">Form id: {form.id}</span>
            <button
              type="button"
              className="text-sm text-red-400 hover:underline"
              onClick={() => setForms((fs) => fs.filter((_, i) => i !== fi))}
            >
              Delete form
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
              placeholder="— none (submissions won't be posted) —"
            />
            <Select
              label="Role granted on approval (optional)"
              value={form.approveRoleId}
              onChange={(v) => updateForm(fi, { approveRoleId: v })}
              options={roles}
              prefix="@"
              placeholder="— don't grant a role —"
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
                  <input
                    className="input"
                    placeholder="Question label"
                    maxLength={45}
                    value={field.label}
                    onChange={(e) =>
                      updateField(fi, qi, { label: e.target.value })
                    }
                  />
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
      ))}

      <button
        type="button"
        className="btn-ghost"
        onClick={() => setForms((fs) => [...fs, emptyForm()])}
      >
        + Add form
      </button>

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
