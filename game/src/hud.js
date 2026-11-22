// HUD for SOLARA: mission panel, clock/money/wanted, police dispatch,
// weapon slots, minimap, health/armor, speed, dialogue, radio, crew abilities,
// district standing, weather, garage upgrades and package count.
// The minimap is a 2D canvas; the rest of the HUD is DOM over the 3D view.
import { CITY, streetNameAt, districtAt } from './city.js';

const WEAPONS = [
  { n: 1, name: 'FISTS', ammo: '∞' },
  { n: 2, name: 'PISTOL', ammo: '24' },
  { n: 3, name: 'SMG', ammo: '60' },
  { n: 4, name: 'SHOTGUN', ammo: '8' },
  { n: 5, name: 'RIFLE', ammo: '30' },
  { n: 6, name: 'SNIPER', ammo: '0' },
  { n: 7, name: 'LAUNCHER', ammo: '0' },
];

export class HUD {
  constructor() {
    this.el = {};
    const ids = ['mission', 'clock', 'money', 'stars', 'wantedText', 'rank', 'dispatch',
      'weapons', 'minimap', 'health', 'armor', 'speed', 'carName', 'condition',
      'dialog', 'dialogName', 'dialogRole', 'dialogText', 'radio', 'abilities',
      'location', 'respect', 'objective', 'hint', 'stage', 'timer', 'progress',
      'banner', 'menu', 'gameover', 'districts', 'weather', 'garageLine', 'packages'];
    for (const id of ids) this.el[id] = document.getElementById(id);
    this.mm = this.el.minimap.getContext('2d');
    this.weapon = 2;
    this.dialogTimer = 0;
    this.bannerTimer = 0;
  }

  setWeapon(i) {
    this.weapon = i;
  }

  showDialog(name, role, text, seconds) {
    this.el.dialogName.textContent = name;
    this.el.dialogRole.textContent = role;
    this.el.dialogText.textContent = text;
    this.el.dialog.style.display = 'flex';
    this.dialogTimer = seconds || 6;
  }

  showBanner(text, seconds) {
    this.el.banner.textContent = text;
    this.el.banner.style.display = 'block';
    this.bannerTimer = seconds || 3;
  }

  update(dt, s) {
    // Mission panel: story job, or the active side activity if there is one.
    const m = s.activity || s.mission;
    const isActivity = !!s.activity;
    if (m) {
      this.el.mission.style.display = 'block';
      this.el.stage.textContent = isActivity ? m.code : `STAGE ${m.id} / 10`;
      this.el.objective.textContent = m.objective;
      const t = isActivity ? s.activityTimer : s.missionTimer;
      this.el.timer.textContent = t > 0 ? `⏱ ${Math.ceil(t)}s` : '';
      this.el.progress.textContent = isActivity ? (s.activityProgress || '') : (s.missionProgress || '');
      document.getElementById('missionName').textContent = `${m.code} — ${m.name}`;
    } else {
      this.el.mission.style.display = 'none';
    }
    // Clock / money / wanted / weather.
    const mins = Math.floor(s.clockMinutes % 60);
    const hrs = Math.floor(s.clockMinutes / 60) % 24;
    this.el.clock.textContent = `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
    this.el.weather.textContent = s.weather === 'RAIN' ? '🌧 RAIN' : '☀ CLEAR';
    this.el.money.textContent = `$${s.money.toLocaleString('en-US')}`;
    let stars = '';
    for (let i = 0; i < 5; i++) stars += i < s.wanted ? '★' : '☆';
    this.el.stars.textContent = stars;
    this.el.stars.className = s.wanted > 0 ? 'stars hot' : 'stars';
    this.el.wantedText.textContent = s.wanted === 0 ? 'CLEAN' : s.wanted >= 5 ? 'WANTED — SWAT' : s.wanted >= 3 ? 'WANTED — IN SIGHT' : 'WANTED';
    this.el.rank.textContent = s.rank;
    this.el.respect.textContent = `RESPECT ${s.respect}`;
    // Dispatch panel (cap the list at 5 rows so it never covers the rest).
    const units = s.policeUnits || [];
    const shown = units.slice(0, 5);
    this.el.dispatch.innerHTML = `<div class="dispatch-title">🚔 SOLARA PD DISPATCH — ${units.length} UNIT${units.length === 1 ? '' : 'S'}</div>` +
      (units.length ? shown.map((u) => `<div class="dispatch-row"><span>${u.name}</span><span>${u.dist}m</span><span class="st">${u.status}</span></div>`).join('') +
        (units.length > 5 ? `<div class="dispatch-row"><span>+${units.length - 5} MORE UNITS</span><span>—</span><span class="st">EN ROUTE</span></div>` : '') :
        '<div class="dispatch-row"><span>NO ACTIVE UNITS</span><span>—</span><span class="st">CLEAR</span></div>');
    // District standing.
    if (s.districts) {
      const names = Object.keys(s.districts);
      this.el.districts.innerHTML = '<div class="dispatch-title">🏙 DISTRICT STANDING</div>' +
        names.map((n) => `<div class="dispatch-row"><span>${n}</span><span>${s.districts[n]}</span><span class="st">${'●'.repeat(Math.min(5, Math.floor(s.districts[n] / 10))) || '○'}</span></div>`).join('');
    }
    // Weapons (shotgun unlocks after job 4, rifle after job 7).
    const unlocked = { 4: s.jobsDone >= 4, 5: s.jobsDone >= 7, 6: false, 7: false };
    this.el.weapons.innerHTML = WEAPONS.map((w) => {
      const locked = w.n >= 4 && !unlocked[w.n];
      return `<div class="slot${w.n === this.weapon ? ' sel' : ''}${locked ? ' locked' : ''}"><b>${w.n}</b> ${w.name}<span>${locked ? 'LOCKED' : w.ammo}</span></div>`;
    }).join('');
    // Health / armor.
    this.el.health.style.width = `${Math.max(0, s.health)}%`;
    this.el.armor.style.width = `${Math.max(0, s.armor)}%`;
    // Speed + car.
    this.el.speed.textContent = s.inCar ? String(Math.round(Math.abs(s.speedMph))) : '—';
    document.getElementById('speedUnit').textContent = s.inCar ? 'MPH' : '';
    this.el.carName.textContent = s.inCar ? s.carName : 'ON FOOT';
    this.el.condition.textContent = s.inCar ? `CONDITION ${Math.round(s.condition)}%` : 'WALK — PRESS E NEAR A CAR';
    // Radio + abilities + garage + packages.
    this.el.radio.textContent = `♪ ${s.radio}`;
    this.el.garageLine.textContent = `🔧 GARAGE ENG ${s.garage.engine}/3 • ARM ${s.garage.armor}/3 • NITRO ${s.garage.nitro}/2`;
    this.el.packages.textContent = `📦 HIDDEN PACKAGES ${s.packagesCollected}/${s.packagesTotal}`;
    this.el.abilities.innerHTML = s.abilities.map((a) =>
      `<div class="ability${a.ready ? '' : ' cool'}"><b>${a.key}</b> ${a.name}<span>${a.ready ? 'READY' : `${a.cd}s`}</span></div>`).join('');
    // Location + district standing.
    const d = districtAt(s.px, s.pz);
    const standing = s.districts ? (s.districts[d] || 0) : 0;
    this.el.location.textContent = `${streetNameAt(s.px, s.pz)} • ${d} — STANDING ${standing}`;
    // Hint line.
    this.el.hint.textContent = s.hint || '';
    // Timers.
    if (this.dialogTimer > 0) {
      this.dialogTimer -= dt;
      if (this.dialogTimer <= 0) this.el.dialog.style.display = 'none';
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.el.banner.style.display = 'none';
    }
    this.drawMinimap(s);
  }

  drawMinimap(s) {
    const c = this.mm;
    const W = 190;
    const H = 190;
    c.clearRect(0, 0, W, H);
    c.save();
    c.beginPath();
    c.arc(95, 95, 92, 0, Math.PI * 2);
    c.clip();
    c.fillStyle = 'rgba(10,16,28,0.92)';
    c.fillRect(0, 0, W, H);
    const scale = W / 620;
    const toMap = (x, z) => [95 + (x - s.px) * scale, 95 + (z - s.pz) * scale];
    // Sea.
    c.fillStyle = '#2a9ab0';
    c.fillRect(95 + (285 - s.px) * scale, 0, W, H);
    // Roads.
    c.strokeStyle = '#5a5a66';
    c.lineWidth = 3;
    for (let x = -270; x <= 270; x += 60) {
      const [ax, ay] = toMap(x, -310);
      const [bx, by] = toMap(x, 310);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
    }
    for (let z = -270; z <= 270; z += 60) {
      const [ax, ay] = toMap(-310, z);
      const [bx, by] = toMap(310, z);
      c.beginPath();
      c.moveTo(ax, ay);
      c.lineTo(bx, by);
      c.stroke();
    }
    // Objective marker.
    if (s.objectivePos) {
      const [ox, oy] = toMap(s.objectivePos.x, s.objectivePos.z);
      c.fillStyle = '#ffd23a';
      c.beginPath();
      c.arc(ox, oy, 7, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#fff';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(ox, oy, 10, 0, Math.PI * 2);
      c.stroke();
    }
    // Police dots.
    c.fillStyle = '#4a86ff';
    for (const u of s.policeUnits || []) {
      const [ux, uy] = toMap(u.x, u.z);
      c.beginPath();
      c.arc(ux, uy, 4, 0, Math.PI * 2);
      c.fill();
    }
    // Player arrow (rotates with heading).
    c.save();
    c.translate(95, 95);
    c.rotate(-s.heading);
    c.fillStyle = '#fff';
    c.beginPath();
    c.moveTo(0, -9);
    c.lineTo(6, 7);
    c.lineTo(-6, 7);
    c.closePath();
    c.fill();
    c.restore();
    c.restore();
    // Rim + N.
    c.strokeStyle = 'rgba(255,255,255,0.7)';
    c.lineWidth = 2;
    c.beginPath();
    c.arc(95, 95, 92, 0, Math.PI * 2);
    c.stroke();
    c.fillStyle = '#fff';
    c.font = 'bold 13px sans-serif';
    c.textAlign = 'center';
    c.fillText('N', 95, 16);
  }
}
