export function playOwnership(viewer: {
  userId?: string;
  browserHash: string;
}) {
  return {
    sql: viewer.userId
      ? "g.owner_id=$1"
      : `(g.owner_id IS NULL AND (g.id IN(SELECT run_id FROM playne_guest_trials WHERE browser_hash=$1) OR (g.browser_hash=$1 AND g.challenge->>'comparison'='true')))`,
    id: viewer.userId ?? viewer.browserHash,
  };
}
