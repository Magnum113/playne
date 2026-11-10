import { useSyncExternalStore, type ButtonHTMLAttributes } from "react";
import ElectricBorder from "./ElectricBorder";
import { useTheme } from "./theme";
import "./challenge-button.css";

const motionQuery = "(prefers-reduced-motion: reduce), (forced-colors: active)";
const staticBorder = () => window.matchMedia?.(motionQuery).matches ?? false;
const subscribe = (notify: () => void) => {
  const media = window.matchMedia?.(motionQuery);
  media?.addEventListener("change", notify);
  return () => media?.removeEventListener("change", notify);
};

export default function ChallengeButton({
  children,
  className = "",
  disabled,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { theme } = useTheme();
  const staticEffect = useSyncExternalStore(subscribe, staticBorder, () => true);
  return (
    <button
      {...props}
      type={type}
      disabled={disabled}
      className={`secondary-button challenge-button ${className}`.trim()}
    >
      {!disabled && !staticEffect && <ElectricBorder theme={theme === "dark" ? "dark" : "light"} />}
      <span className="challenge-button-label">{children}</span>
    </button>
  );
}
