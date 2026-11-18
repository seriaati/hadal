import type { CreatureKind } from "./pixel/creatures";
import { DARK_AT, OFF_AT, type Glitch } from "./pixel/glitch";
import type { Scene } from "./pixel/scene";
import type { Game, Phase } from "./state";

/** The levels the player can set, each from 0 to 1: everything together, then each kind of sound. */
export const LEVELS = ["master", "music", "effects", "ambient"] as const;
export type Level = (typeof LEVELS)[number];
type Kind = Exclude<Level, "master">;

const STORED = "hadal.soundLevels";
/** Browsers allow a page no sound until the player has pressed a key, clicked or tapped. */
const GESTURES = ["keydown", "mousedown", "touchend"];

/** Pitches are counted in semitones from the A below middle C. */
const pitch = (semitones: number) => 220 * 2 ** (semitones / 12);
/** The music keeps to A minor: five notes of it for the tune, and four slow chords under them. */
const SCALE = [0, 3, 5, 7, 10];
const CHORDS = [[-12, -5, 0, 3], [-16, -9, 0, 3], [-19, -7, -4, 0], [-17, -10, -2, 2]];
/** The notes a lamp can ring, from the commonest answer to the rarest: all in tune with the music. */
const CHIME = [7, 10, 12, 15, 17, 19];

type Rig = ReturnType<typeof build>;

/** The sounds that never stop, each silent until `Sound.update` raises it. */
function build() {
  const context = new AudioContext();
  // One gain for each level: every kind of sound runs into its own, and those into the master.
  const gains = Object.fromEntries(LEVELS.map((name) => [name, new GainNode(context)])) as Record<Level, GainNode>;
  // Many sounds at once, with the master at full, can add up to more than a speaker takes: a limiter holds the peaks down.
  const limiter = new DynamicsCompressorNode(context, { threshold: -6, knee: 6, ratio: 20, attack: 0.002, release: 0.15 });
  for (const name of LEVELS) gains[name].connect(name === "master" ? limiter : gains.master);
  limiter.connect(context.destination);

  const hiss = context.createBuffer(1, context.sampleRate * 4, context.sampleRate);
  const samples = hiss.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  const noise = (kind: Kind, type: BiquadFilterType, frequency: number) => {
    const source = new AudioBufferSourceNode(context, { buffer: hiss, loop: true });
    const filter = new BiquadFilterNode(context, { type, frequency, Q: 0.7 });
    const gain = new GainNode(context, { gain: 0 });
    source.connect(filter).connect(gain).connect(gains[kind]);
    source.start(0, Math.random() * 4);
    return { filter, gain };
  };

  // Waves at the surface: the noise brightens and dulls as each one passes.
  const surface = noise("ambient", "lowpass", 500);
  const swell = new OscillatorNode(context, { frequency: 0.13 });
  swell.connect(new GainNode(context, { gain: 300 })).connect(surface.filter.frequency);
  swell.start();

  // A hum under everything in the deep, on the music's home note: two voices a little apart, which slowly beat.
  const drone = new GainNode(context, { gain: 0 });
  const muffle = new BiquadFilterNode(context, { type: "lowpass", frequency: 260 });
  muffle.connect(drone).connect(gains.ambient);
  for (const detune of [0, 12]) {
    const voice = new OscillatorNode(context, { type: "sawtooth", frequency: 55, detune });
    voice.connect(muffle);
    voice.start();
  }

  const deep = noise("ambient", "lowpass", 600);
  const rush = noise("effects", "bandpass", 600);

  // The tape of a chaos dive: mains hum, tape hiss, a wash of static while the signal is lost.
  const hum = new GainNode(context, { gain: 0 });
  hum.connect(gains.ambient);
  for (const [frequency, share] of [[60, 1], [120, 0.5], [180, 0.25]] as const) {
    const voice = new OscillatorNode(context, { frequency });
    voice.connect(new GainNode(context, { gain: share })).connect(hum);
    voice.start();
  }
  const tapeHiss = noise("ambient", "highpass", 4500);
  const wash = noise("effects", "bandpass", 1100);
  // The music runs through the tape too: muffled, and its pitch wavers (wow, and the faster flutter).
  const tape = new BiquadFilterNode(context, { type: "lowpass", frequency: 20000 });
  const musicBus = new GainNode(context);
  musicBus.connect(tape).connect(gains.music);
  const waver = (frequency: number) => {
    const depth = new GainNode(context, { gain: 0 });
    const swing = new OscillatorNode(context, { frequency });
    swing.connect(depth);
    swing.start();
    return depth;
  };
  const wow = waver(0.6);
  const flutter = waver(7);
  return { context, gains, hiss, surface, deep, rush, drone, hum, tapeHiss, wash, tape, musicBus, wow, flutter };
}

/**
 * Everything the game sounds like, music included. Nothing is recorded: each sound is built from
 * plain waves and noise as it is needed. It only listens to the game and the scene, and never changes them.
 */
export class Sound {
  /** Where each slider in the settings stands. */
  levels: Record<Level, number> = { master: 0.5, music: 1, effects: 1, ambient: 1, ...JSON.parse(localStorage.getItem(STORED) ?? "{}") };
  private rig: Rig | null = null;
  // The game as it was a frame ago, to hear what has changed since.
  private phase: Phase = "title";
  private rejected: Game["rejected"] = null;
  private results = 0;
  private lit = 0;
  private depth = 0;
  private beat = 0;
  private bubble = 0;
  private typed = "";
  private seen = new WeakSet<object>();
  // What the tape of a chaos dive had done a frame ago.
  private faults = 0;
  private losses = 0;
  private turns = 0;
  private klaxon = 0;
  private off = false;
  /** When the sting of a lost signal was last heard, in the audio clock's seconds. */
  private stung = -Infinity;
  private typedOut = 0;
  private scared = false;
  // Where the music is: seconds until the next chord and the next note, and which they are.
  private chordIn = 0;
  private chord = 0;
  private noteIn = 4;
  private step = 5;

  constructor() {
    for (const type of GESTURES) addEventListener(type, this.wake);
    document.addEventListener("visibilitychange", this.rest);
  }

  close() {
    for (const type of GESTURES) removeEventListener(type, this.wake);
    document.removeEventListener("visibilitychange", this.rest);
    void this.rig?.context.close();
  }

  setLevel(name: Level, value: number) {
    this.levels[name] = value;
    localStorage.setItem(STORED, JSON.stringify(this.levels));
    this.apply();
  }

  /** A step of a slider in the settings: a tick, heard at the new level. */
  tick() {
    if (this.rig) this.burst("bandpass", 2000, 0.3, 0.06);
  }

  /** A pack has been written, and a lamp rings; or it could not be: a dull knock. */
  written(pack: boolean) {
    if (!this.rig) return;
    if (pack) this.bell(pitch(CHIME[3]!), 0.22, 2.5);
    else this.note("effects", "triangle", 320, 110, 0.35, 0.25);
  }

  /** A diver of the room lights their lantern (ready): a strike and a warm note rising. Or puts it out: a soft puff, falling. */
  lantern(lit: boolean) {
    if (!this.rig) return;
    if (lit) {
      this.burst("bandpass", 3200, 0.2, 0.08);
      this.note("effects", "sine", 392, 587, 0.12, 0.7, 0.03);
    } else {
      this.burst("lowpass", 700, 0.3, 0.3);
      this.note("effects", "sine", 440, 220, 0.08, 0.5, 0.01);
    }
  }

  /** A heart won: two high bell notes, a moment after the lamp's own. */
  heart() {
    if (!this.rig) return;
    this.note("effects", "sine", pitch(CHIME[5]!) * 2, pitch(CHIME[5]!) * 2, 0.1, 1.2, 0.005, 0.35);
    this.note("effects", "sine", pitch(CHIME[5]!) * 3, pitch(CHIME[5]!) * 3, 0.06, 1, 0.005, 0.5);
  }

  /** Ears hear loudness in ratios, so a slider's value is squared. */
  private apply() {
    const rig = this.rig;
    if (!rig) return;
    for (const name of LEVELS) rig.gains[name].gain.setTargetAtTime(this.levels[name] ** 2, rig.context.currentTime, 0.03);
  }

  private wake = () => {
    if (!this.rig) {
      this.rig = build();
      this.apply();
    }
    if (this.rig.context.state !== "running") void this.rig.context.resume();
  };

  /** A hidden page stops drawing, so its sound stops too. */
  private rest = () => void (document.hidden ? this.rig?.context.suspend() : this.rig?.context.resume());

  /** Once a frame, after the scene is drawn: steer the lasting sounds and play whatever just happened. */
  update(game: Game, scene: Scene, dt: number, glitch?: Glitch) {
    const rig = this.rig;
    if (!rig) return;
    const steer = (param: AudioParam, value: number) => param.setTargetAtTime(value, rig.context.currentTime, 0.25);
    const depth = scene.depth;

    // The sea: waves near the surface, below them a rumble that dulls with depth, and in the deep a hum.
    steer(rig.surface.gain.gain, 0.2 * Math.max(0, 1 - depth / 150));
    steer(rig.deep.gain.gain, Math.min(1, depth / 150) * (0.22 + 0.18 * Math.min(1, depth / 6000)));
    steer(rig.deep.filter.frequency, 600 * 0.27 ** Math.min(1, depth / 6000));
    steer(rig.drone.gain, 0.14 * Math.max(0, Math.min(1, (depth - 200) / 3800)));
    // Water rushes past whenever the diver moves, down or up.
    const speed = Math.min(1, Math.abs(depth - this.depth) / Math.max(dt, 0.001) / 1200);
    steer(rig.rush.gain.gain, 0.18 * Math.sqrt(speed));
    steer(rig.rush.filter.frequency, 400 + 700 * speed);
    this.depth = depth;
    this.music(dt, Math.min(1, depth / 6000));

    // Each key typed: a small tick.
    if (game.input !== this.typed) this.burst("bandpass", 1800 + Math.random() * 600, 0.3, 0.06);
    this.typed = game.input;

    // A bell tolls as the dive begins. In a chaos dive it is cracked: two bells a little out of tune.
    if (game.phase === "ask" && (this.phase === "title" || this.phase === "drop")) {
      this.bell(294, 0.3, 3.5);
      if (game.chaos) this.bell(311, 0.22, 3);
    }
    this.phase = game.phase;
    if (glitch) this.tape(game, scene, glitch);

    // A wrong answer: a dull knock.
    if (game.rejected && game.rejected !== this.rejected) this.note("effects", "triangle", 320, 110, 0.35, 0.25);
    this.rejected = game.rejected;

    // Out of air: the lamp's glass breaks and its light sinks away.
    if (game.results.length > this.results && !game.results.at(-1)!.correct) {
      this.burst("highpass", 3000, 0.25, 0.25);
      this.bell(2600, 0.07, 0.6);
      this.note("effects", "triangle", 330, 70, 0.25, 1.4);
    }
    this.results = game.results.length;

    // A lamp rings as it is lit: a higher note, and for longer, the rarer the answer.
    if (scene.lit > this.lit) {
      const rarity = game.results.findLast((result) => result.correct)?.rarity ?? 0;
      this.bell(pitch(CHIME[Math.round(rarity / 20)]!), 0.22, 1.5 + rarity / 50);
    }
    this.lit = scene.lit;

    // Low on air: a heartbeat, in step with the red pulse on screen.
    const beat = Math.floor((scene.pulse - 0.6) / (Math.PI * 2));
    if (beat !== this.beat && scene.alarm > 0.05) {
      const level = 0.25 + 0.35 * scene.alarm;
      this.note("effects", "triangle", 120, 55, level, 0.2);
      this.note("effects", "triangle", 100, 50, level * 0.6, 0.18, 0.005, 0.13);
    }
    this.beat = beat;

    // Bubbles from the helmet, faster as the air runs low.
    this.bubble -= dt;
    if (this.bubble <= 0 && game.phase !== "done") {
      this.bubble = (0.5 + Math.random() * 0.9) * (1 - 0.7 * scene.panic);
      const blip = 300 + Math.random() * 300;
      this.note("ambient", "sine", blip, blip * 1.7, 0.035, 0.07);
    }

    // Whatever has just arrived in the dark is heard once, however many of its kind came together.
    const arrived = new Set<CreatureKind>();
    for (const creature of scene.ambient.creatures) {
      if (!this.seen.has(creature)) arrived.add(creature.kind);
      this.seen.add(creature);
    }
    for (const kind of arrived) {
      if (kind === "angler") {
        // A low throb: two notes a semitone apart.
        this.note("ambient", "triangle", 130, 123, 0.26, 7, 2.5);
        this.note("ambient", "triangle", 138, 130, 0.26, 7, 2.5);
      } else if (kind === "serpent") {
        // A long groan, sliding down.
        this.note("ambient", "triangle", 220, 95, 0.22, 8, 3);
        this.note("ambient", "triangle", 223, 96, 0.22, 8, 3);
      } else if (kind === "whale") {
        // A far-off call: a low moan that rises, then falls away.
        this.note("ambient", "sine", 140, 210, 0.12, 3, 1.5);
        this.note("ambient", "sine", 210, 110, 0.1, 5, 2, 3);
      } else if (kind === "eyes") {
        // A thin, high shimmer, at the edge of hearing.
        this.note("ambient", "sine", 1480, 1480, 0.03, 4.5, 1.5);
        this.note("ambient", "sine", 1487, 1487, 0.03, 4.5, 1.5);
      }
    }
  }

  /** The sounds of a chaos dive's failing tape, and of what lives in it. */
  private tape(game: Game, scene: Scene, glitch: Glitch) {
    const rig = this.rig!;
    const steer = (param: AudioParam, value: number, time = 0.1) => param.setTargetAtTime(value, rig.context.currentTime, time);
    // Once a lost dive's screen has gone dark, the tape and the music are silent: only the sea is left.
    const dark = glitch.lostFor >= DARK_AT;
    const level = dark ? 0 : glitch.level;
    steer(rig.hum.gain, 0.03 * level);
    steer(rig.tapeHiss.gain.gain, level > 0 ? 0.03 + 0.05 * level : 0);
    steer(rig.wash.gain.gain, glitch.lost > 0 ? 0.18 : 0, 0.03);
    steer(rig.wow.gain, 45 * level);
    steer(rig.flutter.gain, 10 * level);
    steer(rig.tape.frequency, level > 0 ? 6000 - 4500 * level : 20000);
    steer(rig.musicBus.gain, dark ? 0 : glitch.lost > 0 ? 0.1 : 1, 0.05);

    // Every fault crackles.
    if (glitch.count > this.faults) {
      this.burst("bandpass", 1500 + Math.random() * 4000, 0.15 + 0.25 * level, 0.04 + Math.random() * 0.2);
      this.burst("highpass", 6000, 0.08, 0.03);
    }
    this.faults = glitch.count;
    // A loss of signal: a hit of static, and a whine falling away. It is shrill, so it is heard at most every 30 seconds.
    if (glitch.losses > this.losses && rig.context.currentTime - this.stung >= 30) {
      this.stung = rig.context.currentTime;
      this.burst("highpass", 1000, 0.35, 0.3);
      this.note("effects", "sine", 1600, 120, 0.05, 0.9);
    }
    this.losses = glitch.losses;
    // Something turns: a screech, two voices that grate, over a low blow.
    if (scene.ambient.turns > this.turns) {
      this.note("effects", "sawtooth", 1400, 220, 0.05, 1.2, 0.02);
      this.note("effects", "sawtooth", 1460, 205, 0.05, 1.2, 0.02);
      this.note("effects", "triangle", 90, 38, 0.3, 1.6);
    }
    this.turns = scene.ambient.turns;
    // The submarine's klaxon, while its lights blink and it holds the diver.
    if (game.chaos && game.phase === "drop" && game.phaseTime < 2.4 && game.phaseTime >= this.klaxon) {
      this.klaxon = game.phaseTime + 0.66;
      this.note("effects", "square", 440, 330, 0.035, 0.5, 0.02);
    }
    if (game.phase !== "drop") this.klaxon = 0;
    // A lost dive: the set switches off with a thump and the whine of its tube dying away.
    const off = glitch.lostFor >= OFF_AT;
    if (off && !this.off) {
      this.burst("lowpass", 300, 0.5, 0.2);
      this.note("effects", "sine", 7800, 5000, 0.015, 1.2);
    }
    this.off = off;
    // Its last words are typed, a soft key for every letter.
    if (glitch.typed > this.typedOut) {
      this.burst("bandpass", 2400 + Math.random() * 600, 0.12, 0.03);
      this.note("effects", "triangle", 140, 90, 0.05, 0.06);
    }
    this.typedOut = glitch.typed;
    // And for some, the eyes: the sting, always heard here, over a deep blow.
    if (glitch.scared && !this.scared) {
      this.burst("highpass", 1000, 0.45, 0.4);
      this.note("effects", "sine", 1600, 120, 0.07, 0.9);
      this.note("effects", "sawtooth", 1400, 200, 0.05, 0.9, 0.01);
      this.note("effects", "triangle", 80, 30, 0.4, 1.8);
    }
    this.scared = glitch.scared;
  }

  /**
   * The music is made up as it goes: slow chords that swell and fade into each other, and a tune
   * of lone notes that wanders over them. `dark` runs from 0 at the surface to 1 in the hadal zone:
   * the deeper, the hollower the chords, and the fewer, lower and less sure the notes.
   */
  private music(dt: number, dark: number) {
    this.chordIn -= dt;
    if (this.chordIn <= 0) {
      this.chordIn = 7;
      CHORDS[this.chord++ % CHORDS.length]!.forEach((tone, i) => {
        const level = 0.07 * (i < 2 ? 1 : 1 - 0.6 * dark);
        for (const detune of [0.998, 1.002]) this.note("music", "triangle", pitch(tone) * detune, pitch(tone) * detune, level, 20, 7);
      });
    }
    this.noteIn -= dt;
    if (this.noteIn <= 0) {
      // Now and then two notes come close together; otherwise the tune takes its time.
      this.noteIn = Math.random() < 0.35 ? 0.9 : (3 + Math.random() * 4) * (1 + 1.5 * dark);
      this.step = Math.max(0, Math.min(9, this.step + [-2, -1, 1, 2][Math.floor(Math.random() * 4)]!));
      let tone = SCALE[this.step % 5]! + 12 * Math.floor(this.step / 5);
      if (Math.random() < dark) tone -= 12;
      if (Math.random() < dark * 0.25) tone -= 1; // a note that is not in the key
      this.note("music", "sine", pitch(tone), pitch(tone), 0.07, 5, 0.02);
      this.note("music", "sine", pitch(tone + 12), pitch(tone + 12), 0.017, 2.5, 0.02);
    }
  }

  /** One voice: it swells for `attack` seconds, slides from one pitch to another, and has died away after `seconds`. */
  private note(kind: Kind, shape: OscillatorType, from: number, to: number, level: number, seconds: number, attack = 0.005, delay = 0) {
    const { context, gains } = this.rig!;
    const start = context.currentTime + delay;
    const voice = new OscillatorNode(context, { type: shape, frequency: from });
    const gain = new GainNode(context, { gain: 0 });
    voice.frequency.setValueAtTime(from, start);
    voice.frequency.exponentialRampToValueAtTime(to, start + seconds);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(level, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    // Music runs through the tape, and wavers with it.
    const { musicBus, wow, flutter } = this.rig!;
    voice.connect(gain).connect(kind === "music" ? musicBus : gains[kind]);
    if (kind === "music") {
      wow.connect(voice.detune);
      flutter.connect(voice.detune);
      voice.onended = () => {
        wow.disconnect(voice.detune);
        flutter.disconnect(voice.detune);
      };
    }
    voice.start(start);
    voice.stop(start + seconds);
  }

  /** A struck bell: partials that are not in tune with each other, the higher ones dying first. */
  private bell(frequency: number, level: number, seconds: number) {
    for (const [ratio, share] of [[1, 1], [2.76, 0.4], [5.4, 0.18]] as const) {
      this.note("effects", "sine", frequency * ratio, frequency * ratio, level * share, seconds / ratio);
    }
  }

  /** A burst of noise through a filter, `seconds` long: a tick if it is short, breaking glass if it is high. */
  private burst(type: BiquadFilterType, frequency: number, level: number, seconds: number) {
    const { context, gains, hiss } = this.rig!;
    const now = context.currentTime;
    const source = new AudioBufferSourceNode(context, { buffer: hiss });
    const filter = new BiquadFilterNode(context, { type, frequency });
    const gain = new GainNode(context, { gain: level });
    gain.gain.setValueAtTime(level, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + seconds);
    source.connect(filter).connect(gain).connect(gains.effects);
    source.start(now, Math.random() * 3);
    source.stop(now + seconds);
  }
}
