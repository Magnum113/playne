import { useEffect, useRef, type ButtonHTMLAttributes } from "react";
import { attachButtonFire } from "./buttonFire";
import "./fire-button.css";

export default function FireButton({
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const button = useRef<HTMLButtonElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!disabled && button.current && canvas.current) {
      return attachButtonFire(button.current, canvas.current);
    }
  }, [disabled]);
  return (
    <button
      {...props}
      ref={button}
      type={type}
      disabled={disabled}
      className={`secondary-button fire-button ${className}`.trim()}
    >
      <canvas className="fire-button-effect" ref={canvas} aria-hidden="true" />
      <span className="fire-button-label">{children}</span>
    </button>
  );
}
