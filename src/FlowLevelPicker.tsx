import {
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { FLOW_LEVELS } from "./flow";

const CHAPTER_SIZE = 12;
const CHAPTER_NAMES = ["Первый рейс", "Цветные маршруты", "Мастера потока"];
const chapterFor = (level: number) =>
  Math.max(0, Math.min(2, Math.floor((level - 1) / CHAPTER_SIZE)));

export function FlowStars({ count }: { count: number }) {
  return (
    <span className="flow-stars" aria-label={`${count} из 3 звёзд`}>
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={i < count ? "is-earned" : ""}
          aria-hidden="true"
        >
          ★
        </span>
      ))}
    </span>
  );
}

function pageOffset(track: HTMLDivElement, page: number) {
  const first = track.children[0] as HTMLElement | undefined;
  const target = track.children[page] as HTMLElement | undefined;
  return first && target ? target.offsetLeft - first.offsetLeft : 0;
}

export function FlowLevelPicker({
  unlocked,
  records,
  totalStars,
  onSelect,
}: {
  unlocked: number;
  records: Record<string, { stars: number }>;
  totalStars: number;
  onSelect: (level: number) => void;
}) {
  const id = useId();
  const [chapter, setChapter] = useState(() => chapterFor(unlocked));
  const track = useRef<HTMLDivElement>(null);
  const currentPage = useRef(chapter);
  const interacted = useRef(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectPage = (page: number) => {
    currentPage.current = page;
    setChapter(page);
  };
  useLayoutEffect(() => {
    const element = track.current;
    if (!element) return;
    const align = () =>
      element.scrollTo({
        left: pageOffset(element, currentPage.current),
        behavior: "instant",
      });
    align();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(align);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    // A delayed account response must not interrupt an ongoing swipe.
    if (interacted.current) return;
    const page = chapterFor(unlocked);
    currentPage.current = page;
    setChapter(page);
    track.current?.scrollTo({
      left: pageOffset(track.current, page),
      behavior: "instant",
    });
  }, [unlocked]);
  useLayoutEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  function goTo(page: number) {
    const element = track.current;
    if (!element) return;
    const next = Math.max(0, Math.min(CHAPTER_NAMES.length - 1, page));
    interacted.current = true;
    if (settleTimer.current) clearTimeout(settleTimer.current);
    selectPage(next);
    element.scrollTo({
      left: pageOffset(element, next),
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "instant"
        : "smooth",
    });
  }
  function onScroll() {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    // Keep the title stable during a swipe or an interrupted smooth scroll.
    settleTimer.current = setTimeout(() => {
      const element = track.current;
      if (!element) return;
      let closest = 0;
      for (let page = 1; page < CHAPTER_NAMES.length; page++) {
        if (
          Math.abs(element.scrollLeft - pageOffset(element, page)) <
          Math.abs(element.scrollLeft - pageOffset(element, closest))
        )
          closest = page;
      }
      selectPage(closest);
    }, 120);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const next =
      event.key === "ArrowRight"
        ? currentPage.current + 1
        : event.key === "ArrowLeft"
          ? currentPage.current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? CHAPTER_NAMES.length - 1
              : null;
    if (next === null) return;
    event.preventDefault();
    goTo(next);
  }
  return (
    <div className="flow-level-picker">
      <div className="flow-selection-heading">
        <div className="flow-level-title">
          <h2 id="flow-selection-title" aria-live="polite" aria-atomic="true">
            {CHAPTER_NAMES[chapter]}
          </h2>
          <span className="flow-star-total">
            ★ {totalStars}
            <small> / 108</small>
          </span>
        </div>
        <div
          className="flow-level-navigation"
          role="group"
          aria-label="Листать уровни"
        >
          <button
            type="button"
            aria-label="Предыдущие уровни"
            aria-controls={id}
            disabled={chapter === 0}
            onClick={() => goTo(currentPage.current - 1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m14 6-6 6 6 6" />
            </svg>
          </button>
          <button
            type="button"
            aria-label="Следующие уровни"
            aria-controls={id}
            disabled={chapter === CHAPTER_NAMES.length - 1}
            onClick={() => goTo(currentPage.current + 1)}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="m10 6 6 6-6 6" />
            </svg>
          </button>
        </div>
      </div>
      <div
        id={id}
        ref={track}
        className="flow-level-pages"
        role="region"
        aria-label="Уровни"
        aria-roledescription="карусель"
        tabIndex={0}
        onScroll={onScroll}
        onKeyDown={onKeyDown}
        onPointerDownCapture={() => {
          interacted.current = true;
        }}
        onWheelCapture={() => {
          interacted.current = true;
        }}
      >
        {CHAPTER_NAMES.map((name, page) => (
          <div
            key={name}
            className="flow-level-page"
            role="group"
            aria-label={`Уровни ${page * 12 + 1}–${Math.min(FLOW_LEVELS, (page + 1) * 12)}`}
            inert={page !== chapter}
          >
            <div className="flow-level-grid">
              {Array.from(
                { length: CHAPTER_SIZE },
                (_, i) => page * CHAPTER_SIZE + i + 1,
              ).map((level) => {
                const record = records[`level:${level}`];
                return (
                  <button
                    type="button"
                    key={level}
                    className={`flow-level${level === unlocked ? " is-next" : ""}${record ? " is-done" : ""}`}
                    disabled={level > unlocked}
                    onClick={() => onSelect(level)}
                    aria-current={level === unlocked ? "step" : undefined}
                    aria-label={`Уровень ${level}${level > unlocked ? ". Сначала пройди предыдущий" : record ? `. ${record.stars} из 3 звёзд` : ". Играть"}`}
                  >
                    <strong>
                      {level > unlocked ? (
                        <span className="flow-lock">
                          <svg
                            width="20"
                            height="20"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.7"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <rect x="5" y="10" width="14" height="11" rx="3" />
                            <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 5v2" />
                          </svg>
                        </span>
                      ) : (
                        level
                      )}
                    </strong>
                    <FlowStars count={record?.stars ?? 0} />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
