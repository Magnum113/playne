import type { Pool } from "pg";
import { SHADE_SCORE_VERSION, shadeScore, validHSV } from "../src/colorfle";

// Rescore from original choices, preserving party IDs, ownership and timestamps.
// Backup rows follow game/account deletion through their foreign key.
export async function migrateShadeScores(pool: Pool) {
  const client = await pool.connect();
  let updated = 0,
    skipped = 0;
  try {
    await client.query("BEGIN");
    const { rows } = await client.query(
      "SELECT id,challenge,answers,version,score_units FROM playne_games WHERE game='colorfle' AND version<$1 ORDER BY id FOR UPDATE",
      [SHADE_SCORE_VERSION],
    );
    for (const row of rows) {
      const targets = row.challenge?.targets;
      if (
        !Array.isArray(targets) ||
        targets.length !== 5 ||
        !targets.every(validHSV) ||
        !Array.isArray(row.answers) ||
        row.answers.length > 5 ||
        !row.answers.every(
          (a: any) =>
            validHSV(a?.choice) || (a?.choice === null && a.timedOut === true),
        )
      ) {
        skipped++;
        continue;
      }
      const answers = row.answers.map((a: any, i: number) => ({
        ...a,
        score: a.choice === null ? 0 : shadeScore(a.choice, targets[i]),
      }));
      const units =
        row.score_units === null
          ? null
          : answers.reduce((sum: number, a: any) => sum + a.score, 0) * 10;
      await client.query(
        "INSERT INTO playne_color_score_backups(game_id,version,answers,score_units) VALUES($1,$2,$3,$4) ON CONFLICT(game_id) DO NOTHING",
        [row.id, row.version, JSON.stringify(row.answers), row.score_units],
      );
      await client.query(
        "UPDATE playne_games SET version=$1,answers=$2,score_units=$3 WHERE id=$4",
        [SHADE_SCORE_VERSION, JSON.stringify(answers), units, row.id],
      );
      updated++;
    }
    await client.query("COMMIT");
    return { updated, skipped };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
