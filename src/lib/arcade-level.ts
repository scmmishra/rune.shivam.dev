export const LEVEL_ONE = {
  enemySpeed: 40,
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
