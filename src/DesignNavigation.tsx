import { useEffect, useId, useRef, useState, type MouseEvent } from "react";
import { componentInventory, designSections } from "./designCatalog";

export default function DesignNavigation() {
  const [active, setActive] = useState<string>(designSections[0][0]);
  const [query, setQuery] = useState("");
  const mobile = useRef<HTMLDetailsElement>(null);
  const searchId = useId();
  const term = query.trim().toLocaleLowerCase("ru");
  const matches = componentInventory.filter((row) =>
    row.join(" ").toLocaleLowerCase("ru").includes(term),
  );

  useEffect(() => {
    let frame = 0;
    const read = () => {
      frame = 0;
      let next: string = designSections[0][0];
      for (const [id] of designSections) {
        const section = document.getElementById(id);
        if (section && section.getBoundingClientRect().top <= 140) next = id;
      }
      setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  function select(
    id: string,
    isMobile: boolean,
    event: MouseEvent<HTMLAnchorElement>,
  ) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    setActive(id);
    if (isMobile && mobile.current) mobile.current.open = false;
    window.history.pushState(null, "", `#${id}`);
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: "instant", block: "start" });
    // Give keyboard users a useful next Tab stop after the contents closes.
    document.getElementById(`${id}-title`)?.focus({ preventScroll: true });
  }
  const content = (isMobile: boolean) => (
    <>
      <label className="ds-nav-label" htmlFor={`${searchId}-${isMobile}`}>
        Найти в системе
      </label>
      <input
        id={`${searchId}-${isMobile}`}
        className="ui-input ds-nav-search"
        type="search"
        value={query}
        placeholder="Название или файл"
        onChange={(event) => setQuery(event.target.value)}
      />
      {term && (
        <p className="ds-search-count" role="status">
          Найдено: {matches.length}
        </p>
      )}
      <nav
        aria-label={
          term ? "Результаты поиска компонентов" : "Разделы дизайн-системы"
        }
      >
        {term
          ? matches.map(([name, source, section]) => (
              <a
                key={name}
                href={`#${section}`}
                onClick={(event) => select(section, isMobile, event)}
              >
                <span className="ds-search-result">
                  <strong>{name}</strong>
                  <small>{source}</small>
                </span>
              </a>
            ))
          : designSections.map(([id, title], index) => (
              <a
                key={id}
                href={`#${id}`}
                aria-current={active === id ? "location" : undefined}
                onClick={(event) => select(id, isMobile, event)}
              >
                <span aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                {title}
              </a>
            ))}
      </nav>
      {term && !matches.length && (
        <p className="ds-search-empty">Попробуй название элемента или файла.</p>
      )}
      {term && (
        <button className="text-button" onClick={() => setQuery("")}>
          Сбросить поиск
        </button>
      )}
    </>
  );
  return (
    <aside className="ds-sidebar">
      <div className="ds-desktop-contents">{content(false)}</div>
      <details className="ds-mobile-contents" ref={mobile}>
        <summary>
          Разделы и поиск <span aria-hidden="true">⌄</span>
        </summary>
        <div className="ds-mobile-contents-body">{content(true)}</div>
      </details>
    </aside>
  );
}
