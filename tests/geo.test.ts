import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseGeoRounds,
  distanceKm,
  geoBounds,
  geoDistance,
  geoScore,
  geoRemaining,
  geoClock,
  GEO_MAX_POINTS,
  readGeoStats,
  saveGeoStats,
} from "../src/geo";
import { geoLocations } from "../src/geoLocations";

afterEach(() => vi.unstubAllGlobals());
describe("geographical answers", () => {
  it("measures known distances and the shortest path across the date line", () => {
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.195,
      2,
    );
    expect(distanceKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 })).toBeCloseTo(
      222.39,
      2,
    );
    expect(distanceKm({ lat: 90, lng: 0 }, { lat: 90, lng: 170 })).toBeCloseTo(
      0,
      6,
    );
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 180 })).toBeCloseTo(
      20015.114,
      2,
    );
    expect(() =>
      distanceKm({ lat: NaN, lng: 0 }, { lat: 0, lng: 0 }),
    ).toThrow();
  });
  it("scores exact hits and gets lower as distance grows", () => {
    expect(geoScore(0.25)).toBe(5000);
    expect(geoScore(0.251)).toBe(4999);
    expect(geoScore(20015)).toBe(0);
    expect(geoScore(NaN)).toBe(0);
    let previous = 5000;
    for (let d = 0; d < 21000; d += 20) {
      expect(geoScore(d)).toBeLessThanOrEqual(previous);
      previous = geoScore(d);
    }
    expect(geoDistance(0.12)).toBe("120 м");
    expect(geoBounds({ lat: 0, lng: 179 }, { lat: 10, lng: -179 })).toEqual({
      south: 0,
      north: 10,
      west: 179,
      east: -179,
    });
  });
});
describe("geographical sessions", () => {
  it("selects five different regions and countries without repeating recent locations", () => {
    let recent: string[] = [];
    for (let i = 0; i < 300; i++) {
      const rounds = chooseGeoRounds(recent);
      expect(rounds).toHaveLength(5);
      expect(new Set(rounds.map((place) => place.region)).size).toBe(5);
      expect(new Set(rounds.map((place) => place.countryCode)).size).toBe(5);
      expect(rounds.every((place) => !recent.includes(place.id))).toBe(true);
      recent = rounds.map((place) => place.id);
    }
    expect(geoLocations).toHaveLength(100);
    expect(new Set(geoLocations.map((place) => place.id)).size).toBe(
      geoLocations.length,
    );
    for (const place of geoLocations)
      expect(() => distanceKm(place, place)).not.toThrow();
  });
  it("separates both mode records and preserves the previous scoring storage", () => {
    const storage = new Map<string, string>([
      ["playne:geo:v1", '{"best":427,"played":2,"recent":[]}'],
    ]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k),
      setItem: (k: string, v: string) => storage.set(k, v),
    });
    expect(readGeoStats().best).toBe(0);
    saveGeoStats({ best: 24000, played: 1, recent: [] }, "classic");
    saveGeoStats({ best: 19000, played: 2, recent: [] }, "timed");
    expect(readGeoStats("classic").best).toBe(24000);
    expect(readGeoStats("timed").best).toBe(19000);
    expect(JSON.parse(storage.get("playne:geo:v1")!).best).toBe(427);
    expect(GEO_MAX_POINTS).toBe(25000);
  });
  it("uses a deadline instead of interval ticks, including after a background tab resumes", () => {
    expect(geoRemaining(180000, 0)).toBe(180);
    expect(geoRemaining(180000, 75001)).toBe(105);
    expect(geoRemaining(180000, 300000)).toBe(0);
    expect(geoClock(180)).toBe("3:00");
    expect(geoClock(9)).toBe("0:09");
  });

  it("retains the record and filters corrupt or unknown recent locations", () => {
    const storage = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key),
      setItem: (key: string, value: string) => storage.set(key, value),
    });
    const stats = {
      best: 21427,
      played: 2,
      recent: [geoLocations[0].id, "missing"],
    };
    saveGeoStats(stats);
    expect(readGeoStats()).toEqual({ ...stats, recent: [geoLocations[0].id] });
    storage.set("playne:geo:v2:classic", '{"best":999999,"played":1}');
    expect(readGeoStats().best).toBe(0);
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => saveGeoStats(stats)).not.toThrow();
    expect(readGeoStats()).toEqual({ best: 0, played: 0, recent: [] });
  });
});
