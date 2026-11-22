// Missions for SOLARA: a 10-job story arc handed out by fixer Luz Marín.
// Each mission has an objective marker, a timer, dialogue and a payout.
// Completing one unlocks the next. Ten jobs (FIRST LIGHT to LAST LIGHT).
import { dist2d } from './random.js';

export const FIXER = {
  name: 'LUZ MARÍN',
  role: 'FIXER — SOLARA',
  portrait: 'LM',
};

export const MISSIONS = [
  {
    id: 1, code: 'JOB 01', name: 'FIRST LIGHT',
    objective: 'Steal a car and drive to the Strand meet',
    detail: 'Grab any parked car on Palm Row, then bring it to the yellow marker on Strand Way. Keep it clean — the Solara cops are bored tonight.',
    target: { x: 210, z: 0, label: 'STRAND MEET' },
    needCar: true, timeLimit: 150, reward: 400,
    dialog: 'Rookie. Every legend in Solara started with one hot car. Take it, bring it to the Strand, and don\'t scratch the paint.',
  },
  {
    id: 2, code: 'JOB 02', name: 'COURIER RUN',
    objective: 'Deliver the package to Harborlight before the timer ends',
    detail: 'A sealed case for the dock crew. Drive fast, but the harbor road is crawling with patrols. Delivery window is tight.',
    target: { x: -180, z: 270, label: 'HARBORLIGHT DROP' },
    needCar: true, timeLimit: 120, reward: 650,
    dialog: 'The case stays shut, the car stays fast. Dock crew pays in cash, no questions. Move.',
  },
  {
    id: 3, code: 'JOB 03', name: 'PIER PRESSURE',
    objective: 'Reach the end of the pier on foot',
    detail: 'The buyer waits at the end of the pier. Leave the car, walk the boards, and don\'t let the patrol boats spot you.',
    target: { x: 470, z: 0, label: 'PIER END' },
    needCar: false, onFoot: true, timeLimit: 180, reward: 800,
    dialog: 'On foot from here, kid. The pier is long and the wind is loud — perfect for a quiet handoff.',
  },
  {
    id: 4, code: 'JOB 04', name: 'HEAT WAVE',
    objective: 'Lose the cops — survive the chase for 60 seconds',
    detail: 'You tripped an alarm in Sunset Heights. The whole city is looking for you. Outrun them, break line of sight, and stay free for a full minute.',
    target: null, survive: 60, timeLimit: 90, reward: 1200,
    dialog: 'Whole precinct is rolling. Don\'t stop, don\'t crash, and for the sea\'s sake don\'t get boxed in.',
  },
  {
    id: 5, code: 'JOB 05', name: 'GRAND TOUR',
    objective: 'Visit all three checkpoints: Plaza, Harborlight, Beach',
    detail: 'Three drops, one night. Hit the central plaza, the Harborlight crane yard, then the beachfront. Any order, any car.',
    checkpoints: [
      { x: 0, z: 0, label: 'PLAZA' },
      { x: -60, z: 270, label: 'HARBORLIGHT' },
      { x: 210, z: -120, label: 'BEACH' },
    ],
    target: { x: 0, z: 0, label: 'PLAZA' },
    timeLimit: 240, reward: 1500,
    dialog: 'Three drops, one night, no mistakes. Plaza, Harborlight, beach. The crew is counting on you.',
  },
  {
    id: 6, code: 'JOB 06', name: 'GOLDEN HOUR',
    objective: 'Drive the Comet GT to the Sunset overlook',
    detail: 'Take the red Comet GT to the overlook above the Strand as the sun goes down. The whole city will be watching.',
    target: { x: 210, z: -240, label: 'SUNSET OVERLOOK' },
    needCar: true, timeLimit: 180, reward: 1800,
    dialog: 'Bring the Comet to the overlook at sunset. Do this right and the Solara crew starts saying your name.',
  },
  {
    id: 7, code: 'JOB 07', name: 'CANAL RUN',
    objective: 'Smuggle the crate through the Old Town canals',
    detail: 'A crate for the canal crew, hidden under the bridges. Cross the canal, make the drop at Dockland Road, and stay off the main avenues.',
    target: { x: -120, z: 210, label: 'CANAL DROP' },
    needCar: true, timeLimit: 130, reward: 900,
    dialog: 'The canal hides everything, kid — boats, crates, people. Use it. Drop the crate and vanish.',
  },
  {
    id: 8, code: 'JOB 08', name: 'RACE THE SUN',
    objective: 'Hit all 6 race gates before sunset',
    detail: 'An unsanctioned sprint across Solara: six gates, one tank of nerve. Beat the clock and the street will remember it.',
    checkpoints: [
      { x: 210, z: -180, label: 'GATE 1' },
      { x: 90, z: -240, label: 'GATE 2' },
      { x: -90, z: -180, label: 'GATE 3' },
      { x: -210, z: -60, label: 'GATE 4' },
      { x: -90, z: 180, label: 'GATE 5' },
      { x: 210, z: 180, label: 'GATE 6' },
    ],
    target: { x: 210, z: -180, label: 'GATE 1' },
    timeLimit: 150, reward: 1400,
    dialog: 'Six gates, no brakes, no excuses. The sun sets in two minutes — be past the last gate before it does.',
  },
  {
    id: 9, code: 'JOB 09', name: 'FIVE-STAR STORM',
    objective: 'Survive a full 5-star manhunt for 45 seconds',
    detail: 'You burned the wrong warehouse. Now every unit in Solara — including SWAT — is coming. Survive 45 seconds at 5 stars.',
    target: null, survive: 45, forceWanted: 5, timeLimit: 90, reward: 2000,
    dialog: 'Five stars, kid. SWAT is rolling. Forty-five seconds of hell — then you disappear.',
  },
  {
    id: 10, code: 'JOB 10', name: 'LAST LIGHT',
    objective: 'Drive to the Beachfront overlook for the final handoff',
    detail: 'Final job. Take any car to the Beachfront overlook as the last light hits the water. Luz is waiting with the payout of your life.',
    target: { x: 270, z: 120, label: 'BEACHFRONT OVERLOOK' },
    needCar: true, timeLimit: 180, reward: 2500,
    dialog: 'Last one, kid. Bring it to the Beachfront overlook at last light. Do this right and Solara is yours.',
  },
];

export class MissionManager {
  constructor() {
    this.index = 0;
    this.active = null;
    this.timer = 0;
    this.visited = new Set();
    this.surviveLeft = 0;
    this.state = 'idle'; // idle | active | done | failed
    this.message = '';
  }

  current() {
    return MISSIONS[this.index] || null;
  }

  start() {
    const m = this.current();
    if (!m) return null;
    this.active = m;
    this.timer = m.timeLimit;
    this.visited = new Set();
    this.surviveLeft = m.survive || 0;
    this.state = 'active';
    this.message = m.dialog;
    return m;
  }

  targetPos() {
    if (!this.active) return null;
    if (this.active.checkpoints) {
      return this.active.checkpoints.find((c) => !this.visited.has(c.label)) || null;
    }
    return this.active.target;
  }

  update(dt, px, pz, inCar, wanted) {
    if (this.state !== 'active' || !this.active) return null;
    const m = this.active;
    this.timer -= dt;
    if (this.timer <= 0) {
      this.state = 'failed';
      this.message = 'Time ran out. Luz is not happy — try the job again.';
      return 'failed';
    }
    if (m.survive) {
      if (wanted > 0) {
        this.surviveLeft -= dt;
        if (this.surviveLeft <= 0) {
          this.state = 'done';
          this.message = 'You shook them. Clean getaway — the crew is impressed.';
          return 'done';
        }
      }
      return null;
    }
    if (m.checkpoints) {
      for (const c of m.checkpoints) {
        if (!this.visited.has(c.label) && dist2d(px, pz, c.x, c.z) < 10) {
          this.visited.add(c.label);
          if (this.visited.size >= m.checkpoints.length) {
            this.state = 'done';
            this.message = 'All three drops made. That was a grand tour, kid.';
            return 'done';
          }
          return 'checkpoint';
        }
      }
      return null;
    }
    const t = m.target;
    if (!t) return null;
    if (m.onFoot && inCar) return null; // must arrive on foot
    if (dist2d(px, pz, t.x, t.z) < 12) {
      this.state = 'done';
      this.message = 'Job done. Payment is on its way — nice driving.';
      return 'done';
    }
    return null;
  }

  complete() {
    const m = this.active;
    this.index = Math.min(this.index + 1, MISSIONS.length);
    this.active = null;
    this.state = 'idle';
    return m;
  }

  retry() {
    this.active = null;
    this.state = 'idle';
    return this.start();
  }

  isFinished() {
    return this.index >= MISSIONS.length;
  }

  progressText() {
    if (!this.active) return '';
    if (this.active.checkpoints) return `${this.visited.size}/${this.active.checkpoints.length} CHECKPOINTS`;
    if (this.active.survive) return `SURVIVE ${Math.ceil(this.surviveLeft)}s`;
    return '';
  }
}
