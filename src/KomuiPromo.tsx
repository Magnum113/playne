import { useEffect, useRef, useState, type PointerEvent } from "react";
import "./komui-promo.css";

const products = [
  {
    id: "hashirama",
    name: "Хаширама",
    detail: "Наруто · футболка-варёнка",
    slug: "futbolka-varenka-naruto-hashirama-senju-chb-print-seraya",
  },
  {
    id: "gojo",
    name: "Сатору Годжо",
    detail: "Магическая битва · варёнка",
    slug: "futbolka-varenka-jujutsu-kaisen-satoru-gojo-print-seraya",
  },
  {
    id: "akatsuki",
    name: "Akatsuki",
    detail: "Наруто · футболка с вышивкой",
    slug: "futbolka-naruto-akatsuki-vyshivka-belaya",
  },
  {
    id: "itachi",
    name: "Итачи Учиха",
    detail: "Наруто · футболка с вышивкой",
    slug: "futbolka-naruto-itachi-uchiha-vyshivka-chernaya",
  },
];

export default function KomuiPromo() {
  const card = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerId: number; x: number; y: number } | null>(null);
  const [selected, setSelected] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [onscreen, setOnscreen] = useState(false);
  const [mouseOver, setMouseOver] = useState(false);
  const [focused, setFocused] = useState(false);
  const product = products[selected];

  useEffect(() => {
    const element = card.current;
    if (!element || typeof IntersectionObserver === "undefined") return;
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    let visible = false;
    const update = () => setOnscreen(visible && !document.hidden && !motion.matches);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.intersectionRatio >= 0.45;
      update();
    }, { threshold: 0.45 });
    observer.observe(element);
    motion.addEventListener("change", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, []);

  useEffect(() => {
    if (!onscreen || mouseOver || focused || dragging) return;
    const timer = window.setTimeout(() => {
      setSelected((index) => (index + 1) % products.length);
    }, 6500);
    return () => window.clearTimeout(timer);
  }, [onscreen, mouseOver, focused, dragging, selected]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (!event.isPrimary || event.button !== 0 || drag.current) return;
    drag.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  }

  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const width = event.currentTarget.clientWidth;
    const offset = Math.max(-width, Math.min(width, event.clientX - start.x));
    event.currentTarget.style.setProperty("--komui-drag-x", `${offset}px`);
  }

  function endDrag(event: PointerEvent<HTMLDivElement>) {
    const start = drag.current;
    if (!start || event.pointerId !== start.pointerId) return;
    const threshold = Math.min(60, event.currentTarget.clientWidth * 0.25);
    drag.current = null;
    setDragging(false);
    event.currentTarget.style.removeProperty("--komui-drag-x");

    const distance = event.clientX - start.x;
    if (event.type !== "pointerup" || Math.abs(distance) < threshold ||
        Math.abs(distance) <= Math.abs(event.clientY - start.y)) return;
    const step = distance < 0 ? 1 : -1;
    setSelected((index) => (index + step + products.length) % products.length);
  }

  return (
    <aside
      className="komui-promo"
      id="komui-merch"
      ref={card}
      aria-label="Реклама. Аниме-мерч KOMUI"
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setMouseOver(true);
      }}
      onPointerLeave={() => setMouseOver(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false);
      }}
    >
      <div className="komui-promo-brand">
        <img src="/art/komui-wordmark.png" width="100" height="17" alt="KOMUI" loading="lazy" />
        <span>Реклама</span>
      </div>

      <div
        className={`komui-promo-photo${dragging ? " is-dragging" : ""}`}
        aria-hidden="true"
        onPointerDown={startDrag}
        onPointerMove={moveDrag}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onLostPointerCapture={endDrag}
      >
        {products.map((item, index) => {
          const position = (index - selected + products.length) % products.length;
          return (
            <img
              key={item.id}
              data-position={position}
              src={`/art/komui-${item.id}.png`}
              alt=""
              loading="lazy"
              decoding="async"
              draggable={false}
            />
          );
        })}
      </div>

      <div className="komui-promo-copy" aria-live={focused ? "polite" : "off"}>
        <h2>Аниме-мерч</h2>
        <p className="komui-promo-name">{product.name}</p>
        <p className="komui-promo-detail">{product.detail}</p>
      </div>

      <a
        className="komui-promo-link"
        href={`https://komui.ru/p/${product.slug}?utm_source=playne&utm_medium=referral&utm_campaign=komui_home&utm_content=${product.id}`}
        target="_blank"
        rel="noopener"
        aria-label={`Смотреть ${product.name} на KOMUI, откроется в новой вкладке`}
      >
        Смотреть <span aria-hidden="true">↗</span>
      </a>

      <div className="komui-promo-controls" role="group" aria-label="Футболки KOMUI">
        {products.map((item, index) => (
          <button
            className="komui-promo-page"
            key={item.id}
            type="button"
            aria-label={item.name}
            aria-pressed={selected === index}
            onClick={() => setSelected(index)}
          >
            <span aria-hidden="true" />
          </button>
        ))}
      </div>
    </aside>
  );
}
