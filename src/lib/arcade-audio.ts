const SOUNDS = {
  shoot: { file: "SoundShootRegular", volume: .18, cooldown: .12 },
  missile: { file: "SoundMissile", volume: .35, cooldown: .2 },
  enemyShot: { file: "SoundEnemyShot", volume: .13, cooldown: .08 },
  enemyHit: { file: "SoundEnemyHit", volume: .25, cooldown: .06 },
  enemyDeath: { file: "SoundEnemyDeath", volume: .35, cooldown: .06 },
  explosion: { file: "SoundExplosionLarge", volume: .5, cooldown: .12 },
  playerHit: { file: "SoundPlayerHit", volume: .5, cooldown: .1 },
  heart: { file: "SoundCoin", volume: .45, cooldown: .08 },
  upgrade: { file: "SoundBonus", volume: .45, cooldown: .08 },
  start: { file: "SoundStartLevel", volume: .45, cooldown: .5 },
  win: { file: "SoundReachGoal", volume: .5, cooldown: .5 },
  lose: { file: "SoundGameOver", volume: .5, cooldown: .5 },
} as const;

type Sound = keyof typeof SOUNDS;
const MAX_VOICES = 12;
const MASTER_VOLUME = .4;

export function createArcadeAudio() {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let loading: Promise<unknown> | null = null;
  let muted = false;
  const buffers = new Map<Sound, AudioBuffer>();
  const lastPlayed = new Map<Sound, number>();
  const active = new Set<AudioBufferSourceNode>();

  async function unlock() {
    try {
      if (!window.AudioContext) return;
      if (!context) {
        context = new window.AudioContext();
        master = context.createGain();
        master.gain.value = MASTER_VOLUME;
        master.connect(context.destination);
      }
      const audioContext = context;
      await audioContext.resume();
      if (!loading) {
        loading = Promise.allSettled((Object.keys(SOUNDS) as Sound[]).map(async name => {
          if (buffers.has(name)) return;
          const response = await fetch(`/sounds/${SOUNDS[name].file}.mp3`);
          if (!response.ok) throw new Error(`Sound unavailable: ${name}`);
          buffers.set(name, await audioContext.decodeAudioData(await response.arrayBuffer()));
        })).finally(() => { loading = null; });
      }
      await loading;
    } catch {
      // The game remains playable if audio is blocked or unavailable.
    }
  }

  function stop() {
    for (const source of active) source.stop();
    active.clear();
    lastPlayed.clear();
  }

  function play(name: Sound) {
    if (muted || !context || !master || context.state !== "running") return;
    const buffer = buffers.get(name);
    if (!buffer) return;
    const spec = SOUNDS[name];
    const now = context.currentTime;
    if (now - (lastPlayed.get(name) ?? -Infinity) < spec.cooldown) return;
    if (active.size >= MAX_VOICES) {
      const oldest = active.values().next().value;
      oldest?.stop();
      if (oldest) active.delete(oldest);
    }
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    gain.gain.value = spec.volume;
    source.connect(gain);
    gain.connect(master);
    source.onended = () => { active.delete(source); source.disconnect(); gain.disconnect(); };
    active.add(source);
    lastPlayed.set(name, now);
    source.start();
  }

  function toggleMute() {
    muted = !muted;
    if (muted) stop();
    return muted;
  }

  return { unlock, play, stop, toggleMute };
}
