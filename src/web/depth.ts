import { TIERS } from "../shared/types";
import { t } from "./language";

/** The depth in metres at which each of the real ocean zones begins, from the surface down. */
export const ZONES = [0, 200, 1000, 4000, 6000];

export function zoneAt(depth: number): string {
  return t().dive.zones[ZONES.findLastIndex((from) => depth >= from)]!.name;
}

/** How a correct answer is described, by the points of its tier. */
export function lightOf(rarity: number): string {
  return t().dive.lights[Object.values(TIERS).findIndex((points) => rarity <= points)]!;
}

export function formatMeters(meters: number): string {
  return t().meters(meters);
}
