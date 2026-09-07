export const WEAPON_LADDER = [
  { shooters: 1, angled: false, missiles: 0 },
  { shooters: 2, angled: false, missiles: 0 },
  { shooters: 3, angled: false, missiles: 0 },
  { shooters: 3, angled: true, missiles: 0 },
  { shooters: 3, angled: true, missiles: 1 },
  { shooters: 3, angled: true, missiles: 2 },
] as const;

export function playerVolley(upgrade: number) {
  const loadout = WEAPON_LADDER[upgrade];
  const shots = Array.from({ length: loadout.shooters }, (_, i) => ({ offset: (i - (loadout.shooters - 1) / 2) * 10, vx: 0, vy: -420 }));
  if (loadout.angled) {
    const angle = Math.PI / 6;
    for (const side of [-1, 1]) shots.push({ offset: side * 17, vx: side * Math.sin(angle) * 420, vy: -Math.cos(angle) * 420 });
  }
  return shots;
}
