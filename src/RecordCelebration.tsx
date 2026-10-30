import { useEffect, useState, type CSSProperties } from "react";
import { useAuth } from "./account";
import {
  RECORD_CELEBRATION_EVENT,
  RECORD_CELEBRATION_KEY,
  personalRecordHref,
  personalRecordLabel,
  personalRecordScore,
  takePersonalRecord,
  type PersonalRecord,
} from "./recordCelebrationState";
import "./record-celebration.css";

const example: PersonalRecord = {
  id: "00000000-0000-4000-8000-000000000001",
  game: "colorfle",
  mode: "classic",
  score: 487,
  completedAt: 0,
  ownerId: null,
};

export default function RecordCelebration({
  demo = false,
}: {
  demo?: boolean;
}) {
  const auth = useAuth();
  const [record, setRecord] = useState<PersonalRecord | null>(
    demo ? example : null,
  );
  const [replay, setReplay] = useState(0);
  useEffect(() => {
    if (demo || auth.loading || !auth.ready) return;
    const consume = () => {
      const next = takePersonalRecord(auth.user?.id ?? null);
      if (next) {
        setRecord(next);
        setReplay((n) => n + 1);
      }
    };
    const stored = (event: StorageEvent) => {
      if (event.key === RECORD_CELEBRATION_KEY) consume();
    };
    consume();
    window.addEventListener(RECORD_CELEBRATION_EVENT, consume);
    window.addEventListener("storage", stored);
    return () => {
      window.removeEventListener(RECORD_CELEBRATION_EVENT, consume);
      window.removeEventListener("storage", stored);
    };
  }, [demo, auth.loading, auth.ready, auth.user?.id]);
  return (
    <>
      {record &&
        (demo ||
          (!auth.loading &&
            auth.ready &&
            record.ownerId === (auth.user?.id ?? null))) && (
          <section
            className="record-celebration"
            aria-label="Новый личный рекорд"
          >
            <div className="record-celebration-mark" aria-hidden="true">
              <svg viewBox="0 0 40 40" width="36" height="36" fill="none">
                <path
                  d="m20 5 4 10 11 1-8 7 3 12-10-6-10 6 3-12-8-7 11-1Z"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
            <div className="record-celebration-copy" role="status">
              <strong>Новый рекорд!</strong>
              <span>
                {personalRecordLabel(record)}{" "}
                <b>{personalRecordScore(record)}</b>
              </span>
            </div>
            <a
              className="record-celebration-link"
              href={personalRecordHref(record)}
            >
              Ещё выше <span aria-hidden="true">→</span>
            </a>
            <button
              type="button"
              className="record-celebration-close"
              aria-label="Скрыть поздравление"
              onClick={() => setRecord(null)}
            >
              ×
            </button>
            <div
              className="record-celebration-particles"
              key={`${record.id}:${replay}`}
              aria-hidden="true"
            >
              {Array.from({ length: 9 }, (_, i) => (
                <i
                  key={i}
                  style={
                    {
                      "--particle-i": i,
                      "--particle-angle": `${i * 40}deg`,
                      "--particle-distance": `${40 + (i % 3) * 14}px`,
                    } as CSSProperties
                  }
                />
              ))}
            </div>
          </section>
        )}
      {demo && (
        <button
          className="secondary-button record-celebration-replay"
          type="button"
          onClick={() => {
            setRecord(example);
            setReplay((n) => n + 1);
          }}
        >
          Показать рекорд
        </button>
      )}
    </>
  );
}
