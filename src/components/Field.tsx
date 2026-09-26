import { useId, useState, type ReactNode } from "react";
import { Tip, type TipContent } from "./Tip";

interface FieldProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: "£" | "%" | "yrs" | "×";
  hint?: ReactNode;
  tip?: TipContent;
}

/** The field's label, with its explanation on hover when there is one. */
function Label({ htmlFor, label, tip }: { htmlFor?: string; label: string; tip?: TipContent }) {
  if (!tip) return htmlFor ? <label htmlFor={htmlFor}>{label}</label> : <span className="field-label">{label}</span>;
  return (
    <Tip tip={tip} className="field-label">
      {label}
    </Tip>
  );
}

/** A number box and a slider kept in sync. The box accepts values beyond the slider's range. */
export function Field({ label, value, onChange, min, max, step, unit, hint, tip }: FieldProps) {
  const id = useId();
  // Keep what the user is typing (e.g. an empty box) separate from the committed value.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const prefix = unit === "£" ? "£" : "";
  const suffix = unit && unit !== "£" ? unit : "";
  return (
    <div className="field">
      <div className="field-top">
        <Label htmlFor={id} label={label} tip={tip} />
        <span className="field-input">
          {prefix && <span className="affix">{prefix}</span>}
          <input
            id={id}
            aria-label={label}
            type="number"
            inputMode="decimal"
            value={shown}
            step={step}
            style={{ width: `${Math.max(5, shown.length + 2)}ch` }}
            onChange={(e) => {
              setDraft(e.target.value);
              const v = parseFloat(e.target.value);
              if (Number.isFinite(v)) onChange(v);
            }}
            onBlur={() => setDraft(null)}
          />
          {suffix && <span className="affix">{suffix}</span>}
        </span>
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, value))}
        onChange={(e) => {
          setDraft(null);
          onChange(parseFloat(e.target.value));
        }}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

interface SegmentedProps<T extends string> {
  label: string;
  tip?: TipContent;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (v: T) => void;
}

export function Segmented<T extends string>({ label, value, options, onChange, tip }: SegmentedProps<T>) {
  return (
    <div className="field">
      <Label label={label} tip={tip} />
      <div className="segmented" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            className={value === o.value ? "on" : ""}
            onClick={() => onChange(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Toggle({
  label,
  checked,
  onChange,
  hint,
  tip,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  hint?: ReactNode;
  tip?: TipContent;
}) {
  const id = useId();
  return (
    <div className="field">
      <div className="toggle">
        <input id={id} type="checkbox" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <Label htmlFor={id} label={label} tip={tip} />
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
