import { useEffect, useRef, type ReactNode } from "react";
import "./game-about.css";

export default function GameAbout({
  children,
  label = "Правила и вопросы об игре",
}: {
  children: ReactNode;
  label?: string;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const revealLinkedSection = () => {
      let id: string;
      try {
        id = decodeURIComponent(window.location.hash.slice(1));
      } catch {
        return;
      }
      const target = document.getElementById(id);
      const root = disclosure.current;
      if (!target || !root?.contains(target)) return;

      // Keep existing links to rules usable after React mounts, too.
      for (
        let node: HTMLElement | null = target;
        node && root.contains(node);
        node = node.parentElement
      ) {
        if (node instanceof HTMLDetailsElement) node.open = true;
      }
      target.scrollIntoView({ block: "start" });
    };
    revealLinkedSection();
    window.addEventListener("hashchange", revealLinkedSection);
    return () => window.removeEventListener("hashchange", revealLinkedSection);
  }, []);

  return (
    <details className="game-about" ref={disclosure}>
      <summary>
        {label}
        <span aria-hidden="true">+</span>
      </summary>
      {children}
    </details>
  );
}
