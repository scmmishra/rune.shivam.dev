export type EnemyKind = "basic" | "heavy" | "boss" | "finalBoss";
type Position = readonly [number, number, EnemyKind?];
type Wave = { at: number; name: string; formation: readonly Position[] };
export type Sector = { enemySpeed: number; maxUpgrade: number; waves: readonly Wave[] };

export const ENEMY_TYPES = {
  basic: { health: 1, scale: 2, points: 100, fireInterval: 3, boss: false },
  heavy: { health: 15, scale: 4, points: 500, fireInterval: 1, boss: false },
  boss: { health: 40, scale: 6, points: 4000, fireInterval: 3, boss: true },
  finalBoss: { health: 500, scale: 8, points: 10000, fireInterval: 2, boss: true },
} as const;

export const LEVEL_ONE = {
  enemySpeed: 40,
  maxUpgrade: 0,
  waves: [
    {
      at: 1,
      name: "ARROWHEAD",
      formation: [[75, -90], [125, -60], [175, -30], [225, 0], [275, 0], [325, -30], [375, -60], [425, -90]],
    },
    {
      at: 17,
      name: "TWIN COLUMNS",
      formation: [[150, 0], [350, 0], [150, -40], [350, -40], [150, -80], [350, -80], [150, -120], [350, -120], [150, -160], [350, -160]],
    },
    {
      at: 34,
      name: "WIDE WING",
      formation: [[81.25, 0], [193.75, 0], [306.25, 0], [418.75, 0], [81.25, -50], [193.75, -50], [306.25, -50], [418.75, -50], [81.25, -100], [193.75, -100], [306.25, -100], [418.75, -100]],
    },
  ],
} as const;

export const LEVEL_ENEMY_COUNT = LEVEL_ONE.waves.reduce((total, wave) => total + wave.formation.length, 0);

const basicWave = (pattern: number, at: number): Wave => ({ ...LEVEL_ONE.waves[pattern], at });

function extendedSector(waveCount: number, boss: EnemyKind, enemySpeed: number): Sector {
  const waves: Wave[] = Array.from({ length: waveCount - 1 }, (_, i) => {
    const base = basicWave(i % LEVEL_ONE.waves.length, 1 + i * 18);
    if (i < 3) return base;
    const heavies: Position[] = i < 6 ? [[250, -160, "heavy"]] : [[125, -160, "heavy"], [375, -160, "heavy"]];
    return { ...base, name: `HEAVY ${base.name}`, formation: [...base.formation, ...heavies] };
  });
  waves.push({ at: 1 + (waveCount - 1) * 18, name: boss === "finalBoss" ? "FINAL COMMAND" : "COMMAND ESCORT", formation: [[250, 0, boss], [125, -50, "heavy"], [375, -50, "heavy"], [68.75, -100], [431.25, -100], [68.75, -150], [431.25, -150]] });
  return { enemySpeed, maxUpgrade: 5, waves };
}

export const SECTORS: readonly Sector[] = [
  LEVEL_ONE,
  {
    enemySpeed: 40,
    maxUpgrade: 1,
    waves: [
      basicWave(0, 1), basicWave(1, 17), basicWave(2, 34),
      { at: 51, name: "HEAVY ESCORT", formation: [[100, 0], [175, -40], [250, -60, "heavy"], [325, -40], [400, 0], [100, -80], [400, -80]] },
      { at: 69, name: "HEAVY FLIGHT", formation: [[125, -40, "heavy"], [250, 0, "heavy"], [375, -40, "heavy"]] },
    ],
  },
  {
    enemySpeed: 42,
    maxUpgrade: 5,
    waves: [
      basicWave(0, 1), basicWave(1, 17), basicWave(2, 34),
      { at: 51, name: "HEAVY ARROWHEAD", formation: [...LEVEL_ONE.waves[0].formation, [250, -120, "heavy"]] },
      { at: 68, name: "HEAVY WING", formation: [...LEVEL_ONE.waves[2].formation, [137.5, -150, "heavy"], [362.5, -150, "heavy"]] },
      { at: 85, name: "HEAVY ESCORT", formation: [[100, 0], [175, -40], [250, -60, "heavy"], [325, -40], [400, 0]] },
      { at: 103, name: "HEAVY FLIGHT", formation: [[125, -40, "heavy"], [250, 0, "heavy"], [375, -40, "heavy"]] },
      { at: 121, name: "COMMAND ESCORT", formation: [[250, 0, "boss"], [125, -30, "heavy"], [375, -30, "heavy"], [75, -60], [425, -60], [75, -110], [425, -110]] },
    ],
  },
  extendedSector(12, "boss", 42),
  extendedSector(16, "finalBoss", 44),
];

export function sectorMaxScore(sector: Sector) {
  return sector.waves.reduce((total, wave) => total + wave.formation.reduce((sum, [, , kind = "basic"]) => sum + ENEMY_TYPES[kind].points, 0), 0);
}
