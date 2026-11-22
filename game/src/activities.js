// Side activities for SOLARA: street races, taxi fares, courier deliveries,
// stunt jumps and hidden packages. All playable, repeatable, and paying
// cash + district standing. Markers glow in the world; press T nearby.
import { dist2d } from './random.js';

export const MARKERS = [
  { type: 'race', x: 210, z: 60, label: 'STREET RACE', color: 0xff3a3a },
  { type: 'taxi', x: 90, z: 0, label: 'TAXI STAND', color: 0xffd23a },
  { type: 'delivery', x: -90, z: 210, label: 'COURIER DEPOT', color: 0x3ad86a },
  { type: 'stunt', x: -210, z: -120, label: 'STUNT JUMPS', color: 0x22e6ff },
];

export const RACE_GATES = [
  { x: 210, z: -180, label: 'GATE 1' },
  { x: 90, z: -240, label: 'GATE 2' },
  { x: -90, z: -180, label: 'GATE 3' },
  { x: -210, z: -60, label: 'GATE 4' },
  { x: -90, z: 180, label: 'GATE 5' },
  { x: 210, z: 180, label: 'GATE 6' },
];

const STUNT_RINGS = [
  { x: 210, z: -120, label: 'RING 1' },
  { x: 30, z: -180, label: 'RING 2' },
  { x: -150, z: -60, label: 'RING 3' },
  { x: -30, z: 120, label: 'RING 4' },
  { x: 150, z: 180, label: 'RING 5' },
];

const FARE_SPOTS = [
  { x: 210, z: -180, label: 'SOLARA STRAND' },
  { x: -210, z: 180, label: 'OLD TOWN' },
  { x: 90, z: -120, label: 'SUNSET HEIGHTS' },
  { x: -90, z: 60, label: 'WESTGATE' },
  { x: 270, z: 0, label: 'BEACHFRONT' },
  { x: 0, z: 270, label: 'HARBORLIGHT' },
  { x: -270, z: -180, label: 'NORTHGATE' },
  { x: 150, z: 180, label: 'LUMEN AVE' },
];

export const PACKAGE_SPOTS = [
  { x: 210, z: -180 }, { x: 150, z: 60 }, { x: -30, z: -120 }, { x: -150, z: 30 },
  { x: 90, z: 180 }, { x: 270, z: 60 }, { x: -270, z: -60 }, { x: 30, z: -240 },
  { x: -90, z: -180 }, { x: 210, z: 240 }, { x: -210, z: 0 }, { x: 0, z: -60 },
];

export class Activities {
  constructor(rng) {
    this.rng = rng;
    this.active = null; // {type, code, name, objective, timer, target, checkpoints, visited, reward}
    this.timer = 0;
    this.visited = new Set();
    this.collected = new Set();
    this.lastReward = 0;
  }

  nearestMarker(px, pz, maxD) {
    let best = null;
    let bd = maxD;
    for (const m of MARKERS) {
      const d = dist2d(px, pz, m.x, m.z);
      if (d < bd) {
        bd = d;
        best = m;
      }
    }
    return best;
  }

  start(type) {
    if (this.active) return null;
    if (type === 'race') {
      this.active = {
        type, code: 'RACE', name: 'MALECON SPRINT',
        objective: 'Hit all 6 race gates before the clock runs out',
        checkpoints: RACE_GATES, target: RACE_GATES[0],
        timeLimit: 150, reward: 900,
      };
    } else if (type === 'taxi') {
      const spot = FARE_SPOTS[Math.floor(this.rng() * FARE_SPOTS.length)];
      this.active = {
        type, code: 'TAXI', name: 'TAXI FARE',
        objective: `Pick up the fare and drive them to ${spot.label}`,
        target: spot, timeLimit: 100, reward: 300,
      };
    } else if (type === 'delivery') {
      const spot = FARE_SPOTS[Math.floor(this.rng() * FARE_SPOTS.length)];
      this.active = {
        type, code: 'DELIVERY', name: 'COURIER DROP',
        objective: `Deliver the parcel to ${spot.label}`,
        target: spot, timeLimit: 110, reward: 350,
      };
    } else if (type === 'stunt') {
      this.active = {
        type, code: 'STUNT', name: 'SUNSET STUNTS',
        objective: 'Thread all 5 stunt rings at speed',
        checkpoints: STUNT_RINGS, target: STUNT_RINGS[0],
        timeLimit: 120, reward: 750,
      };
    }
    if (!this.active) return null;
    this.timer = this.active.timeLimit;
    this.visited = new Set();
    return this.active;
  }

  targetPos() {
    if (!this.active) return null;
    if (this.active.checkpoints) {
      return this.active.checkpoints.find((c) => !this.visited.has(c.label)) || null;
    }
    return this.active.target;
  }

  progressText() {
    if (!this.active) return '';
    if (this.active.checkpoints) return `${this.visited.size}/${this.active.checkpoints.length} GATES`;
    return '';
  }

  update(dt, px, pz) {
    if (!this.active) return null;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.active = null;
      return 'failed';
    }
    const a = this.active;
    if (a.checkpoints) {
      for (const c of a.checkpoints) {
        if (!this.visited.has(c.label) && dist2d(px, pz, c.x, c.z) < 12) {
          this.visited.add(c.label);
          if (this.visited.size >= a.checkpoints.length) {
            this.lastReward = this.active.reward;
            this.active = null;
            return 'done';
          }
          return 'checkpoint';
        }
      }
      return null;
    }
    if (dist2d(px, pz, a.target.x, a.target.z) < 12) {
      this.lastReward = this.active.reward;
      this.active = null;
      return 'done';
    }
    return null;
  }

  cancel() {
    this.active = null;
  }
}
