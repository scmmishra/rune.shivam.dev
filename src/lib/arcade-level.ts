export type EnemyKind = "basic" | "heavy" | "boss";
type Position = readonly [number, number, EnemyKind?];
type Wave = { at: number; name: string; formation: readonly Position[] };
export type Sector = { enemySpeed: number; maxFire: number; waves: readonly Wave[] };

export const ENEMY_TYPES = {
  basic: { health: 1, scale: 2, points: 100, fireInterval: 3 },
  heavy: { health: 15, scale: 4, points: 500, fireInterval: 1 },
  boss: { health: 40, scale: 6, points: 4000, fireInterval: 3 },
} as const;

export const LEVEL_ONE = {
  enemySpeed: 40,
  maxFire: 1,
  waves: [
    {
      at: 1,
      name: "ARROWHEAD",
      formation: [[60, -90], [100, -60], [140, -30], [180, 0], [220, 0], [260, -30], [300, -60], [340, -90]],
    },
    {
      at: 17,
      name: "TWIN COLUMNS",
      formation: [[120, 0], [280, 0], [120, -40], [280, -40], [120, -80], [280, -80], [120, -120], [280, -120], [120, -160], [280, -160]],
    },
    {
      at: 34,
      name: "WIDE WING",
      formation: [[65, 0], [155, 0], [245, 0], [335, 0], [65, -50], [155, -50], [245, -50], [335, -50], [65, -100], [155, -100], [245, -100], [335, -100]],
    },
  ],
} as const;

export const LEVEL_ENEMY_COUNT = LEVEL_ONE.waves.reduce((total, wave) => total + wave.formation.length, 0);

const basicWave = (pattern: number, at: number): Wave => ({ ...LEVEL_ONE.waves[pattern], at });

export const SECTORS: readonly Sector[] = [
  LEVEL_ONE,
  {
    enemySpeed: 40,
    maxFire: 2,
    waves: [
      basicWave(0, 1), basicWave(1, 17), basicWave(2, 34),
      { at: 51, name: "HEAVY ESCORT", formation: [[80, 0], [140, -40], [200, -60, "heavy"], [260, -40], [320, 0], [80, -80], [320, -80]] },
      { at: 69, name: "HEAVY FLIGHT", formation: [[100, -40, "heavy"], [200, 0, "heavy"], [300, -40, "heavy"]] },
    ],
  },
  {
    enemySpeed: 42,
    maxFire: 3,
    waves: [
      basicWave(0, 1), basicWave(1, 17), basicWave(2, 34),
      { at: 51, name: "HEAVY ARROWHEAD", formation: [...LEVEL_ONE.waves[0].formation, [200, -120, "heavy"]] },
      { at: 68, name: "HEAVY WING", formation: [...LEVEL_ONE.waves[2].formation, [110, -150, "heavy"], [290, -150, "heavy"]] },
      { at: 85, name: "HEAVY ESCORT", formation: [[80, 0], [140, -40], [200, -60, "heavy"], [260, -40], [320, 0]] },
      { at: 103, name: "HEAVY FLIGHT", formation: [[100, -40, "heavy"], [200, 0, "heavy"], [300, -40, "heavy"]] },
      { at: 121, name: "COMMAND ESCORT", formation: [[200, 0, "boss"], [100, -30, "heavy"], [300, -30, "heavy"], [60, -60], [340, -60], [60, -110], [340, -110]] },
    ],
  },
];

export function sectorMaxScore(sector: Sector) {
  return sector.waves.reduce((total, wave) => total + wave.formation.reduce((sum, [, , kind = "basic"]) => sum + ENEMY_TYPES[kind].points, 0), 0);
}
