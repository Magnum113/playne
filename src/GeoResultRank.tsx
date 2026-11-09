import { useEffect, useState } from "react";
import { api } from "./account";
import { geoModeName, geoPoints, type GeoMode } from "./geo";

type Rank = { place: number; projected: boolean };

export function useGeoResultRank(runId?: string, viewerId?: string) {
  const key = runId ? `${runId}:${viewerId ?? "guest"}` : undefined;
  const [result, setResult] = useState<{ key: string; rank: Rank | null }>();
  useEffect(() => {
    if (!runId || !key) return;
    let active = true;
    api<Rank | null>(`/games/${encodeURIComponent(runId)}/geo-rank`)
      .then((rank) => {
        if (active) setResult({ key, rank });
      })
      .catch(() => {
        if (active) setResult({ key, rank: null });
      });
    return () => {
      active = false;
    };
  }, [key, runId]);
  return key && result?.key === key ? result.rank : null;
}

export function GeoResultRank({
  rank,
  mode,
  href,
}: {
  rank: Rank;
  mode: GeoMode;
  href?: string;
}) {
  const content = (
    <>
      <span className="geo-result-place">
        {rank.projected ? (
          <>{geoPoints(rank.place)}<span>-е</span></>
        ) : (
          <><span aria-hidden="true">№</span> {geoPoints(rank.place)}</>
        )}
      </span>
      <span className="geo-result-rank-label">
        <strong>{rank.projected ? "место в рейтинге!" : "Твоё место в рейтинге"}</strong>
        <small>{mode === "daily" ? "Рейтинг маршрута дня" : geoModeName(mode)}</small>
      </span>
    </>
  );
  return href ? (
    <a href={href} className="geo-result-rank" data-geo-result-action="leaderboard">
      {content}
      <span className="geo-result-rank-arrow" aria-hidden="true">↗</span>
    </a>
  ) : (
    <div className="geo-result-rank">{content}</div>
  );
}
