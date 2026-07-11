"use client";

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <div className="font-medium text-white">{label}</div>
        {hint && <div className="text-sm text-zinc-400">{hint}</div>}
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={`h-6 w-11 flex-none rounded-full transition-colors ${
          checked ? "bg-blurple" : "bg-edge"
        }`}
        aria-pressed={checked}
      >
        <span
          className={`block h-5 w-5 translate-x-0.5 rounded-full bg-white transition-transform ${
            checked ? "translate-x-[22px]" : ""
          }`}
        />
      </button>
    </div>
  );
}
