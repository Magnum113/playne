import { useId, type ReactNode } from "react";

export function RoundDots({
  current,
  completed,
  total = 5,
  className = "progress-dots",
}: {
  current: number;
  completed: number;
  total?: number;
  className?: string;
}) {
  return (
    <div className={className} aria-hidden="true">
      {Array.from({ length: total }, (_, i) => (
        <i
          key={i}
          className={
            i < completed ? "done" : i === current ? "active current" : ""
          }
        />
      ))}
    </div>
  );
}

export type ModeOption<T extends string> = {
  value: T;
  label: string;
  description: string;
};
export function ModeChoice<T extends string>({
  value,
  onChange,
  options,
  disabled = false,
  legend = "Режим игры",
  className = "shade-mode-choice",
}: {
  value: T;
  onChange: (value: T) => void;
  options: readonly ModeOption<T>[];
  disabled?: boolean;
  legend?: string;
  className?: string;
}) {
  const name = useId();
  return (
    <fieldset className={`mode-choice ${className}`} disabled={disabled}>
      <legend>{legend}</legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={value === option.value ? "selected" : ""}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span>
            <strong>{option.label}</strong>
            <small>{option.description}</small>
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function StatusMessage({
  tone = "info",
  title,
  children,
  live = true,
}: {
  tone?: "info" | "success" | "warning" | "danger";
  title: string;
  children?: ReactNode;
  live?: boolean;
}) {
  return (
    <div
      className={`ui-message ui-message-${tone}`}
      role={live ? (tone === "danger" ? "alert" : "status") : undefined}
    >
      <strong>{title}</strong>
      {children && <p>{children}</p>}
    </div>
  );
}
