import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";
import { chooseRounds, legacyPairIds, objects, pairs } from "../src/data";
import { buildApp } from "../server/app";
import { makeChallenge, validateAnswer } from "../server/scoring";

describe("Naglaz catalogue compatibility", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  const origin = "https://test.playne.invalid";
  const query = vi.fn(async (sql: string) => {
    if (
      ["BEGIN", "COMMIT", "ROLLBACK"].includes(sql) ||
      sql.startsWith("SELECT pg_advisory") ||
      sql.startsWith("SELECT t.*") ||
      sql.startsWith("INSERT INTO playne_guest_trials") ||
      sql.startsWith("UPDATE playne_games")
    )
      return { rows: [] };
    if (sql.startsWith("DELETE FROM playne_")) return { rows: [] };
    if (sql.startsWith("SELECT challenge FROM playne_games"))
      return { rows: [] };
    if (sql.startsWith("INSERT INTO playne_games"))
      return { rows: [{ id: "11111111-1111-4111-8111-111111111111" }] };
    throw new Error("Unexpected database request: " + sql);
  });
  beforeAll(async () => {
    app = await buildApp(
      {
        query,
        connect: async () => ({ query, release: () => {} }),
      } as unknown as Pool,
      {
        origin,
        yandexId: "test-client",
        yandexSecret: "test-secret",
        redirect: origin + "/api/auth/yandex/callback",
        secure: true,
        revision: "test",
      },
    );
  });
  afterAll(async () => app?.close());

  it("keeps browsers without catalogue negotiation on the original comparisons", async () => {
    for (let i = 0; i < 15; i++) {
      const response = await app.inject({
        method: "POST",
        url: "/api/games",
        headers: { origin },
        payload: { game: "naglaz" },
      });
      expect(response.statusCode).toBe(200);
      const issued = response.json().challenge.pairIds as string[];
      expect(issued).toHaveLength(5);
      expect(issued.every((id) => legacyPairIds.includes(id))).toBe(true);
    }
  });

  it("issues only advertised known comparisons, even after they were recently played", async () => {
    const supported = chooseRounds([], legacyPairIds).map((pair) => pair.id);
    const response = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin },
      payload: { game: "naglaz", supportedPairIds: [...supported, "unknown"] },
    });
    expect(response.statusCode).toBe(200);
    expect(new Set(response.json().challenge.pairIds)).toEqual(
      new Set(supported),
    );
    expect(
      new Set(makeChallenge("naglaz", supported, "classic", supported).pairIds),
    ).toEqual(new Set(supported));
  });

  it.each([null, "current", [123], [], ["unknown"]])(
    "returns a clear client error for an unusable catalogue: %j",
    async (supportedPairIds) => {
      const response = await app.inject({
        method: "POST",
        url: "/api/games",
        headers: { origin },
        payload: { game: "naglaz", supportedPairIds },
      });
      expect(response.statusCode).toBe(400);
      expect(response.json().error).toBeTruthy();
    },
  );

  it("uses the expanded catalogue only when the browser advertises it", async () => {
    const supported = pairs
      .filter((pair) => !legacyPairIds.includes(pair.id))
      .map((pair) => pair.id);
    expect(supported.length).toBeGreaterThan(0);
    const response = await app.inject({
      method: "POST",
      url: "/api/games",
      headers: { origin },
      payload: { game: "naglaz", supportedPairIds: supported },
    });
    expect(response.statusCode).toBe(200);
    const challenge = response.json().challenge;
    expect(challenge.pairIds).toHaveLength(5);
    challenge.pairIds.forEach((id: string, index: number) => {
      expect(legacyPairIds).not.toContain(id);
      const pair = pairs.find((candidate) => candidate.id === id)!;
      expect(
        validateAnswer("naglaz", challenge, index, {
          guess: objects[pair.target].size,
        }),
      ).toEqual({ pairId: id, guess: objects[pair.target].size, score: 100 });
    });
  });
});
