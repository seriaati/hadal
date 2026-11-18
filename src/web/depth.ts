import { t } from "./language";

/** The depth in metres at which each of the real ocean zones begins, from the surface down. */
export const ZONES = [0, 200, 1000, 4000, 6000];

export function zoneAt(depth: number): string {
  return t().dive.zones[ZONES.findLastIndex((from) => depth >= from)]!.name;
}

/** How a correct answer's rarity (1-100) is described: five tiers of 20 points each. */
export function lightOf(rarity: number): string {
  return t().dive.lights[Math.ceil(rarity / 20) - 1]!;
}

export function formatMeters(meters: number): string {
  return t().meters(meters);
}
