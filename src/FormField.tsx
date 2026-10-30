import { type InputHTMLAttributes, type ReactNode, type Ref } from "react";

type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  inputRef?: Ref<HTMLInputElement>;
};

/** One label/hint/error contract for product forms and their catalog examples. */
export function TextField({
  id,
  label,
  hint,
  error,
  inputRef,
  className = "",
  "aria-describedby": describedBy,
  ...input
}: TextFieldProps) {
  const description = [
    hint ? `${id}-hint` : undefined,
    error ? `${id}-error` : undefined,
    describedBy,
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <div className="ui-field">
      <label htmlFor={id}>{label}</label>
      <input
        {...input}
        ref={inputRef}
        id={id}
        className={`ui-input ${className}`.trim()}
        aria-invalid={error ? true : input["aria-invalid"]}
        aria-describedby={description || undefined}
      />
      {hint && (
        <p id={`${id}-hint`} className="ui-field-hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="error ui-field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function FieldFeedback({
  error,
  message,
  id,
}: {
  error?: string;
  message?: string;
  id?: string;
}) {
  return error ? (
    <p id={id} className="error ui-field-error" role="alert">
      {error}
    </p>
  ) : message ? (
    <p id={id} className="ui-field-message" role="status">
      {message}
    </p>
  ) : null;
}
