/** The real ocean zones, by the depth in metres at which each begins. */
export const ZONES = [
  { name: "Sunlight zone", from: 0 },
  { name: "Twilight zone", from: 200 },
  { name: "Midnight zone", from: 1000 },
  { name: "Abyssal zone", from: 4000 },
  { name: "Hadal zone", from: 6000 },
];

export function zoneAt(depth: number): string {
  return ZONES.findLast((zone) => depth >= zone.from)!.name;
}

const LIGHTS = ["A common light", "A familiar light", "An uncommon light", "A light seldom seen", "A light never seen"];

/** How a correct answer's rarity (1-100) is described: five tiers of 20 points each. */
export function lightOf(rarity: number): string {
  return LIGHTS[Math.ceil(rarity / 20) - 1]!;
}

export function formatMeters(meters: number): string {
  return `${Math.round(meters).toLocaleString("en-US")} m`;
}
