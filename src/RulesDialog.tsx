import {
  useId,
  type ReactEventHandler,
  type ReactNode,
  type RefObject,
} from "react";

type RulesDialogProps = {
  dialogRef: RefObject<HTMLDialogElement | null>;
  title: ReactNode;
  titleId?: string;
  eyebrow?: string;
  className?: string;
  actionLabel?: string;
  onClose?: ReactEventHandler<HTMLDialogElement>;
  onCancel?: ReactEventHandler<HTMLDialogElement>;
  children: ReactNode;
};

/** Native dialog keeps focus/escape handling in the browser; game timing stays outside. */
export function RulesDialog({
  dialogRef,
  title,
  titleId,
  eyebrow,
  className = "",
  actionLabel = "Понятно",
  onClose,
  onCancel,
  children,
}: RulesDialogProps) {
  const generatedTitle = useId();
  const headingId = titleId ?? generatedTitle;
  const close = () => dialogRef.current?.close();
  return (
    <dialog
      ref={dialogRef}
      className={`rules-dialog ${className}`.trim()}
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={onCancel}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        )
          close();
      }}
    >
      <div className="dialog-top">
        <div className="rules-dialog-heading">
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={headingId}>{title}</h2>
        </div>
        <button
          type="button"
          className="close-button"
          aria-label="Закрыть правила"
          onClick={close}
        >
          ×
        </button>
      </div>
      <div
        className="rules-dialog-content"
        tabIndex={0}
        role="region"
        aria-label="Текст правил"
      >
        {children}
      </div>
      <div className="rules-dialog-actions">
        <button type="button" className="primary" onClick={close}>
          {actionLabel}
        </button>
      </div>
    </dialog>
  );
}
