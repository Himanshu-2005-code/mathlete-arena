"use client";

interface Props<T extends string | number> {
  legend: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}

export function Choices<T extends string | number>({ legend, name, value, options, onChange }: Props<T>) {
  return (
    <fieldset className="field-group">
      <legend>{legend}</legend>
      <div className="choices">
        {options.map((o) => (
          <label key={String(o.value)} className="choice">
            <input
              type="radio"
              name={name}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
