// SOLARA — an open-world crime game. Third-person on foot and by car,
// traffic, pedestrians, a wanted level with police chases, SWAT and a
// helicopter, a 10-job story, side activities (races, taxi, deliveries,
// stunt jumps, hidden packages), district standing, day/night cycle, rain,
// garage upgrades, combat, HUD + minimap, start screen and saves.
// The loop runs on requestAnimationFrame: update(dt), render, then HUD refresh.
//
// ?seed=N fixes the world. ?shot=cover|drive|mission|menu stages that scene
// instead of free play, paints it twice and sets window.__shotReady.
//
// Visual direction (the gap vs the top 5, closed here): a bright golden-hour
// sky dome instead of a flat dark backdrop, warm high sun, a low close chase
// camera so the car fills the frame, dense palms and neon along every street,
// and a helicopter whose spotlight cone is big and bright.
import { mulberry32, clamp, angleLerp, dist2d } from './random.js';
import { Input } from './input.js';
import { AudioEngine } from './audio.js';
import { buildCity, buildSky, CITY, streetNameAt, districtAt, DISTRICTS } from './city.js';
import { CAR_MODELS, makeCarMesh, Car, Traffic } from './cars.js';
import { Police } from './police.js';
import { Peds } from './peds.js';
import { MissionManager, FIXER } from './missions.js';
import { Activities, MARKERS, PACKAGE_SPOTS } from './activities.js';
import { HUD } from './hud.js';
import { stageShot } from './shots.js';

const SAVE_KEY = 'solara-save-v1';
const GARAGE_COSTS = { engine: [500, 1000, 2000], armor: [400, 900, 1800], nitro: [800, 1500] };
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : 1;

const RANKS = [
  [0, 'ROOKIE'], [20, 'HUSTLER'], [40, 'STREET BOSS'], [60, 'SOLARA STAR'], [80, 'SOLARA LEGEND'],
];
function rankFor(respect) {
  let r = 'ROOKIE';
  for (const [min, name] of RANKS) if (respect >= min) r = name;
  return r;
}

class Game {
  constructor() {
    this.input = new Input();
    this.audio = new AudioEngine();
    this.hud = new HUD();
    this.mode = 'menu'; // menu | playing | busted | wasted
    this.paused = false;
    this.time = 0;
    this.clockMinutes = 18 * 60 + 20; // golden hour
    this.money = 1250;
    this.respect = 0;
    this.health = 100;
    this.armor = 50;
    this.ammo = 24;
    this.settleFrames = 0;
    this.bustedTimer = 0;
    this.missionCooldown = 0;
    this.shotDrive = false;
    this.abilities = [
      { key: 'Q', name: 'SWAP PLATES', cd: 0, max: 30, ready: true },
      { key: 'R', name: 'QUICK FIX', cd: 0, max: 20, ready: true },
      { key: 'V', name: 'EYES OUT', cd: 0, max: 15, ready: true },
    ];
    this.eyesOut = 0;
    this.missions = new MissionManager();
    this.activities = new Activities(mulberry32(seed + 55));
    this.districts = {};
    for (const d of DISTRICTS) this.districts[d] = 0;
    this.garage = { engine: 0, armor: 0, nitro: 0 };
    this.garageOpen = false;
    this.nitroTimer = 0;
    this.nitroCd = 0;
    this.weather = 'CLEAR';
    this.weatherTimer = 75;
    this.effects = [];
    this.collectedPackages = new Set();
    this.loadSave();

    // --- Three.js scene: bright golden-hour sky, warm sun, peach fog ---
    this.scene = new THREE.Scene();
    buildSky(this.scene);
    this.scene.fog = new THREE.Fog(0xe89a7a, 160, 820);
    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 2200);
    this.renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('game'), antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const hemi = new THREE.HemisphereLight(0xd8b8ff, 0x8a5a40, 1.25);
    this.scene.add(hemi);
    this.hemiLight = hemi;
    const sun = new THREE.DirectionalLight(0xffb060, 1.8);
    sun.position.set(420, 110, -260);
    this.scene.add(sun);
    this.sunLight = sun;
    this.skyDay = new THREE.Color(0x8fb0d8);
    this.skyDusk = new THREE.Color(0xe89a7a);
    this.skyNight = new THREE.Color(0x14102e);

    const city = buildCity(this.scene, seed);
    this.colliders = city.colliders;
    this.traffic = new Traffic(this.scene, seed, this.colliders);
    this.police = new Police(this.scene, seed);
    this.peds = new Peds(this.scene, seed);

    // Side-activity markers: glowing rings in the world.
    this.markerMeshes = [];
    for (const mk of MARKERS) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(5, 6.5, 32),
        new THREE.MeshBasicMaterial({ color: mk.color, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(mk.x, 0.15, mk.z);
      this.scene.add(ring);
      this.markerMeshes.push(ring);
    }
    // Garage marker ring at the Harborlight garage door.
    const gring = new THREE.Mesh(new THREE.RingGeometry(5, 6.5, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, transparent: true, opacity: 0.85 }));
    gring.rotation.x = -Math.PI / 2;
    gring.position.set(-180, 0.15, 250);
    this.scene.add(gring);
    this.markerMeshes.push(gring);

    // Hidden packages: 12 glowing gold boxes around the city.
    this.packageMeshes = [];
    for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
      const p = PACKAGE_SPOTS[i];
      const box = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.9, 0.9),
        new THREE.MeshLambertMaterial({ color: 0xffd23a, emissive: 0x8a6a00 }));
      box.position.set(p.x, 0.9, p.z);
      this.scene.add(box);
      this.packageMeshes.push(box);
    }

    // Rain: a cloud of falling points that follows the player.
    const rainCount = 900;
    const rainPos = new Float32Array(rainCount * 3);
    for (let i = 0; i < rainCount; i++) {
      rainPos[i * 3] = (Math.random() - 0.5) * 70;
      rainPos[i * 3 + 1] = Math.random() * 45;
      rainPos[i * 3 + 2] = (Math.random() - 0.5) * 70;
    }
    const rainGeo = new THREE.BufferGeometry();
    rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
    this.rain = new THREE.Points(rainGeo, new THREE.PointsMaterial({ color: 0x9fb8d8, size: 0.35, transparent: true, opacity: 0.55 }));
    this.rain.visible = false;
    this.scene.add(this.rain);

    this.packageMeshes.forEach((m, i) => { m.visible = !this.collectedPackages.has(i); });

    // --- Player character (on foot) ---
    this.playerMesh = this._makePlayerMesh();
    this.scene.add(this.playerMesh);
    this.px = 0;
    this.pz = 30;
    this.heading = Math.PI;
    this.walkPhase = 0;
    this.onFootSpeed = 0;
    this.playerCar = null;
    this.carSpeedMph = 0;

    // Objective beacon: glowing pillar + ring at the target.
    const beaconMat = new THREE.MeshBasicMaterial({ color: 0xffd23a, transparent: true, opacity: 0.45 });
    this.beacon = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 60, 12, 1, true), beaconMat);
    this.beacon.position.y = 30;
    this.beacon.visible = false;
    this.scene.add(this.beacon);
    this.beaconRing = new THREE.Mesh(new THREE.RingGeometry(6, 8, 32),
      new THREE.MeshBasicMaterial({ color: 0xffd23a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
    this.beaconRing.rotation.x = -Math.PI / 2;
    this.beaconRing.position.y = 0.15;
    this.beaconRing.visible = false;
    this.scene.add(this.beaconRing);

    this.camYaw = this.heading;
    this.camPos = new THREE.Vector3(0, 6, -12);
    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
    document.getElementById('startBtn').addEventListener('click', () => this.startGame());
    document.getElementById('continueBtn').addEventListener('click', () => this.startGame());
    document.getElementById('buyEngine').addEventListener('click', () => this.buyUpgrade('engine'));
    document.getElementById('buyArmor').addEventListener('click', () => this.buyUpgrade('armor'));
    document.getElementById('buyNitro').addEventListener('click', () => this.buyUpgrade('nitro'));
    this.hud.showDialog('LUZ MARÍN', 'FIXER — SOLARA',
      'Welcome to Solara, kid. Ten jobs, one sunset, and a city that never sleeps. Press ENTER to start.', 10);
  }

  _makePlayerMesh() {
    const g = new THREE.Group();
    const jacket = new THREE.MeshLambertMaterial({ color: 0xe83a2a });
    const skin = new THREE.MeshLambertMaterial({ color: 0xd8a67e });
    const pants = new THREE.MeshLambertMaterial({ color: 0x2a3a5a });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.34), jacket);
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.27, 12, 12), skin);
    head.position.y = 1.78;
    g.add(head);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.5),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    cap.position.y = 2.0;
    g.add(cap);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.32), pants);
    legs.position.y = 0.36;
    g.add(legs);
    this.playerLegs = legs;
    return g;
  }

  // --- Save / load ---
  loadSave() {
    try {
      const raw = window.localStorage.getItem(SAVE_KEY);
      if (!raw) return;
      const s = JSON.parse(raw);
      this.money = s.money ?? this.money;
      this.respect = s.respect ?? 0;
      this.missions.index = s.mission ?? 0;
      this.garage = s.garage || this.garage;
      this.districts = { ...this.districts, ...(s.districts || {}) };
      if (Array.isArray(s.packages)) this.collectedPackages = new Set(s.packages);
    } catch { /* private mode: play without saving */ }
  }

  save() {
    try {
      window.localStorage.setItem(SAVE_KEY, JSON.stringify({
        money: this.money, respect: this.respect, mission: this.missions.index,
        garage: this.garage, districts: this.districts,
        packages: [...this.collectedPackages],
      }));
    } catch { /* ignore */ }
  }

  // --- Menu ---
  showMenu() {
    document.getElementById('hud').style.display = 'none';
    document.getElementById('menu').style.display = 'flex';
    document.getElementById('menuSave').textContent =
      this.money > 1250 || this.missions.index > 0
        ? `SAVE FOUND — $${this.money.toLocaleString('en-US')} • JOB ${Math.min(this.missions.index + 1, 10)}/10 • ${rankFor(this.respect)}`
        : 'NEW CAREER — NO SAVE YET';
  }

  hideMenu() {
    document.getElementById('hud').style.display = 'block';
    document.getElementById('menu').style.display = 'none';
  }

  startGame() {
    this.audio.ensure();
    this.hideMenu();
    this.mode = 'playing';
    document.getElementById('gameover').style.display = 'none';
    if (!this.missions.active && !this.missions.isFinished()) {
      this.beginMission(this.missions.start());
    }
  }

  beginMission(m) {
    if (!m) return;
    if (m.forceWanted) this.police.addHeat(100);
    this.audio.missionStart();
    this.hud.showDialog(FIXER.name, FIXER.role, m.dialog, 7);
    this.hud.showBanner(`${m.code} — ${m.name}`, 3);
  }

  // --- Garage upgrades (Harborlight) ---
  openGarage() {
    this.garageOpen = true;
    document.getElementById('garage').style.display = 'flex';
    this.refreshGarage();
  }

  closeGarage() {
    this.garageOpen = false;
    document.getElementById('garage').style.display = 'none';
  }

  refreshGarage() {
    document.getElementById('garageMoney').textContent =
      `CASH $${this.money.toLocaleString('en-US')} • ENGINE ${this.garage.engine}/3 • ARMOR ${this.garage.armor}/3 • NITRO ${this.garage.nitro}/2`;
    const set = (id, kind) => {
      const max = kind === 'nitro' ? 2 : 3;
      const lv = this.garage[kind];
      const btn = document.getElementById(id);
      btn.textContent = lv >= max ? 'MAXED' : `BUY $${GARAGE_COSTS[kind][lv]}`;
      btn.disabled = lv >= max || this.money < GARAGE_COSTS[kind][lv];
    };
    set('buyEngine', 'engine');
    set('buyArmor', 'armor');
    set('buyNitro', 'nitro');
  }

  buyUpgrade(kind) {
    const max = kind === 'nitro' ? 2 : 3;
    const lv = this.garage[kind];
    if (lv >= max) return;
    const cost = GARAGE_COSTS[kind][lv];
    if (this.money < cost) {
      this.hud.showBanner('NOT ENOUGH CASH', 2);
      return;
    }
    this.money -= cost;
    this.garage[kind] = lv + 1;
    if (this.playerCar) this.playerCar.topBonus = this.garage.engine * 4;
    this.audio.pickup();
    this.refreshGarage();
    this.save();
  }

  damageCar(car, amount) {
    const reduced = amount * (1 - 0.2 * this.garage.armor);
    car.condition = Math.max(0, car.condition - reduced);
  }

  // --- Fire effects: burning wrecks and explosions ---
  spawnBurningWreck(x, z) {
    const mesh = makeCarMesh(0x1a1a1a, false);
    mesh.position.set(x, 0.3, z);
    mesh.rotation.set(0.12, 0.7, 0.28);
    this.scene.add(mesh);
    const flames = [];
    const flameMat = new THREE.MeshBasicMaterial({ color: 0xff7a1a });
    const flameMat2 = new THREE.MeshBasicMaterial({ color: 0xffd23a });
    for (let i = 0; i < 3; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.9, 2.6, 6), i % 2 ? flameMat : flameMat2);
      f.position.set(x + (i - 1) * 0.9, 1.6, z + (i % 2 ? 0.4 : -0.4));
      this.scene.add(f);
      flames.push(f);
    }
    const smoke = [];
    const smokeMat = new THREE.MeshLambertMaterial({ color: 0x555555, transparent: true, opacity: 0.55 });
    for (let i = 0; i < 4; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 8), smokeMat);
      s.position.set(x, 3 + i * 1.6, z);
      this.scene.add(s);
      smoke.push(s);
    }
    const light = new THREE.PointLight(0xff7a1a, 2, 30);
    light.position.set(x, 3, z);
    this.scene.add(light);
    this.effects.push({ kind: 'wreck', flames, smoke, light, t: Math.random() * 10 });
  }

  spawnExplosion(x, z) {
    const flames = [];
    const cols = [0xff7a1a, 0xffd23a, 0xff4a1a];
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(1.1 + (i % 2) * 0.5, 3.2 + (i % 3), 6),
        new THREE.MeshBasicMaterial({ color: cols[i % 3] }));
      f.position.set(x + (i - 2) * 0.9, 2.2, z + ((i * 7) % 3 - 1) * 0.7);
      this.scene.add(f);
      flames.push(f);
    }
    const smoke = [];
    const smokeMat = new THREE.MeshLambertMaterial({ color: 0x444444, transparent: true, opacity: 0.6 });
    for (let i = 0; i < 3; i++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 8), smokeMat.clone());
      s.position.set(x + (i - 1) * 1.2, 5 + i * 1.4, z);
      this.scene.add(s);
      smoke.push(s);
    }
    const light = new THREE.PointLight(0xff9a2a, 3, 45);
    light.position.set(x, 5, z);
    this.scene.add(light);
    this.effects.push({ kind: 'explosion', flames, smoke, light, t: 0 });
  }

  updateEffects(dt) {
    for (const e of this.effects) {
      e.t += dt;
      if (e.kind === 'wreck') {
        for (let i = 0; i < e.flames.length; i++) {
          const f = e.flames[i];
          f.scale.y = 0.8 + Math.abs(Math.sin(e.t * 7 + i * 2)) * 0.5;
          f.rotation.y += dt * 2;
        }
        for (let i = 0; i < e.smoke.length; i++) {
          const s = e.smoke[i];
          s.position.y += dt * 1.2;
          if (s.position.y > 11) s.position.y = 3;
          s.material.opacity = 0.55 - (s.position.y - 3) * 0.04;
        }
        e.light.intensity = 1.6 + Math.sin(e.t * 9) * 0.5;
      } else if (e.kind === 'explosion') {
        for (let i = 0; i < e.flames.length; i++) {
          const f = e.flames[i];
          f.scale.y = 0.85 + Math.abs(Math.sin(e.t * 9 + i * 1.7)) * 0.45;
          f.rotation.y += dt * 3;
        }
        for (let i = 0; i < e.smoke.length; i++) {
          const s = e.smoke[i];
          s.position.y += dt * 1.4;
          if (s.position.y > 12) s.position.y = 5;
        }
        e.light.intensity = 2.4 + Math.sin(e.t * 11) * 0.9;
      }
    }
  }

  // --- Placement helpers (used by shots + respawn) ---
  placePlayerInCar(modelName, x, z, heading) {
    const model = CAR_MODELS.find((m) => m.name === modelName) || CAR_MODELS[0];
    if (this.playerCar) this.scene.remove(this.playerCar.mesh);
    const mesh = makeCarMesh(model.color, false);
    this.scene.add(mesh);
    const car = new Car(mesh, model, x, z, heading);
    car.isPlayer = true;
    car.speed = 14;
    this.playerCar = car;
    this.px = x;
    this.pz = z;
    this.heading = heading;
    this.playerMesh.visible = false;
  }

  placePlayerOnFoot(x, z, heading) {
    if (this.playerCar) {
      this.scene.remove(this.playerCar.mesh);
      this.playerCar = null;
    }
    this.px = x;
    this.pz = z;
    this.heading = heading;
    this.playerMesh.visible = true;
    this.playerMesh.position.set(x, 0, z);
  }

  // Snap the chase camera behind the player (used by screenshot staging).
  // Low, close and offset to the side: a three-quarter rear view, the way
  // the top-5 covers frame the car (side visible, not just the roof).
  // A staged shot may set shotLook {ahead, y} to tilt the view (the cover
  // looks up so the helicopter reads in the frame).
  snapCamera() {
    this.camYaw = this.heading;
    const behind = this.playerCar ? 8 : 5.5;
    const height = this.playerCar ? 3.2 : 3.0;
    const side = 1.2;
    const lookAhead = this.shotLook ? this.shotLook.ahead : 6;
    const lookY = this.shotLook ? this.shotLook.y : 1.6;
    this.camPos.set(
      this.px - Math.sin(this.camYaw) * behind - Math.cos(this.camYaw) * side,
      height,
      this.pz - Math.cos(this.camYaw) * behind + Math.sin(this.camYaw) * side);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.px + Math.sin(this.heading) * lookAhead, lookY, this.pz + Math.cos(this.heading) * lookAhead);
  }

  // --- Entering / exiting cars ---
  tryEnterCar() {
    if (this.playerCar) {
      const car = this.playerCar;
      this.playerCar = null;
      this.px = car.x + Math.cos(car.heading) * 3;
      this.pz = car.z - Math.sin(car.heading) * 3;
      this.heading = car.heading;
      this.playerMesh.visible = true;
      this.playerMesh.position.set(this.px, 0, this.pz);
      this.hud.showBanner('ON FOOT', 1.5);
      return;
    }
    const car = this.traffic.nearestParked(this.px, this.pz, 6)
      || this._nearestTrafficCar(6);
    if (!car) {
      this.hud.showBanner('NO CAR NEARBY — GET CLOSER', 2);
      return;
    }
    const pi = this.traffic.parked.indexOf(car);
    if (pi >= 0) this.traffic.parked.splice(pi, 1);
    else {
      const ti = this.traffic.cars.indexOf(car);
      if (ti >= 0) this.traffic.cars.splice(ti, 1);
    }
    car.isPlayer = true;
    car.stolen = true;
    car.topBonus = this.garage.engine * 4;
    this.playerCar = car;
    this.px = car.x;
    this.pz = car.z;
    this.heading = car.heading;
    this.playerMesh.visible = false;
    this.police.addHeat(15);
    this.audio.wantedUp();
    this.hud.showBanner(`CAR STOLEN — ${car.model.name}`, 2.5);
    this.audio.pickup();
  }

  _nearestTrafficCar(maxD) {
    let best = null;
    let bd = maxD;
    for (const c of this.traffic.cars) {
      const d = dist2d(this.px, this.pz, c.x, c.z);
      if (d < bd && Math.abs(c.speed) < 3) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // --- Combat ---
  punch() {
    this.audio.punch();
    const ped = this.peds.nearest(this.px, this.pz, 2.4);
    if (ped) {
      ped.panic = 3;
      ped.x += Math.sin(ped.heading) * 2;
      ped.z += Math.cos(ped.heading) * 2;
      this.police.addHeat(8);
      this.hud.showBanner('SHOVED A LOCAL — HEAT RISING', 2);
    }
  }

  weaponUnlocked(n) {
    if (n <= 3) return true;
    if (n === 4) return this.missions.index >= 4;
    if (n === 5) return this.missions.index >= 7;
    return false;
  }

  shoot() {
    if (this.ammo <= 0) {
      this.hud.showBanner('OUT OF AMMO', 1.5);
      return;
    }
    const w = this.hud.weapon;
    if (!this.weaponUnlocked(w)) {
      this.hud.showBanner('WEAPON LOCKED — FINISH MORE JOBS', 2);
      return;
    }
    this.ammo -= 1;
    this.audio.shot();
    const range = { 2: 35, 3: 30, 4: 18, 5: 50 }[w] || 35;
    const heat = w >= 4 ? 16 : 12;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    let best = null;
    let bd = range;
    for (const p of this.peds.list) {
      const dx = p.x - this.px;
      const dz = p.z - this.pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const dot = d > 0 ? (dx * fx + dz * fz) / d : 0;
      if (d < bd && dot > 0.7) {
        bd = d;
        best = { kind: 'ped', obj: p };
      }
    }
    for (const u of this.police.units) {
      const dx = u.x - this.px;
      const dz = u.z - this.pz;
      const d = Math.sqrt(dx * dx + dz * dz);
      const dot = d > 0 ? (dx * fx + dz * fz) / d : 0;
      if (d < bd && dot > 0.7) {
        bd = d;
        best = { kind: 'cop', obj: u };
      }
    }
    if (best) {
      if (best.kind === 'ped') {
        best.obj.panic = 4;
        this.scene.remove(best.obj.mesh);
        this.peds.list.splice(this.peds.list.indexOf(best.obj), 1);
        this.peds.spawn();
        this.police.addHeat(heat);
      } else {
        best.obj.speed *= 0.4;
        this.police.addHeat(heat);
      }
      this.hud.showBanner('HIT!', 1);
    }
  }

  useAbility(i) {
    const a = this.abilities[i];
    if (!a || !a.ready) return;
    if (i === 0) {
      this.police.heat = Math.max(0, this.police.heat - 20);
      this.hud.showBanner('PLATES SWAPPED — HEAT DOWN', 2);
    } else if (i === 1) {
      if (this.playerCar) {
        this.playerCar.condition = 100;
        this.hud.showBanner('QUICK FIX — CAR REPAIRED', 2);
      } else {
        this.health = Math.min(100, this.health + 40);
        this.hud.showBanner('PATCHED UP +40 HP', 2);
      }
    } else if (i === 2) {
      this.eyesOut = 12;
      this.hud.showBanner('EYES OUT — POLICE POSITIONS MARKED', 2);
    }
    a.ready = false;
    a.cd = a.max;
    this.audio.pickup();
  }

  // --- Day / night cycle + weather ---
  updateLighting() {
    const hour = (this.clockMinutes / 60) % 24;
    let dayK = 0;
    let nightK = 0;
    if (hour >= 6 && hour <= 18) dayK = Math.sin((hour - 6) / 12 * Math.PI);
    else {
      const nh = hour < 6 ? hour + 24 : hour;
      nightK = Math.sin((nh - 18) / 12 * Math.PI);
    }
    const sky = this.skyDusk.clone().lerp(this.skyDay, dayK).lerp(this.skyNight, nightK);
    if (this.weather === 'RAIN') sky.multiplyScalar(0.7);
    this.scene.fog.color.copy(sky);
    this.scene.fog.far = this.weather === 'RAIN' ? 420 : 820;
    const rainDim = this.weather === 'RAIN' ? 0.55 : 1;
    this.sunLight.intensity = (0.25 + dayK * 1.55) * rainDim;
    this.hemiLight.intensity = 0.5 + dayK * 0.75;
  }

  updateWeather(dt) {
    this.weatherTimer -= dt;
    if (this.weatherTimer <= 0) {
      if (this.weather === 'CLEAR') {
        this.weather = 'RAIN';
        this.weatherTimer = 25;
      } else {
        this.weather = 'CLEAR';
        this.weatherTimer = 70;
      }
      this.rain.visible = this.weather === 'RAIN';
      this.hud.showBanner(this.weather === 'RAIN' ? '🌧 RAIN OVER SOLARA' : '☀ SKIES CLEARING', 2.5);
    }
    if (this.weather === 'RAIN') {
      const pos = this.rain.geometry.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) - 34 * dt;
        if (y < 0) y = 45;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
      this.rain.position.set(this.px, 0, this.pz);
    }
  }

  // --- Main update ---
  update(dt) {
    this.time += dt;
    this.clockMinutes += dt * 0.5; // a full day/night cycle in ~48 minutes of play
    const input = this.input;

    for (const a of this.abilities) {
      if (!a.ready) {
        a.cd -= dt;
        if (a.cd <= 0) {
          a.ready = true;
          a.cd = 0;
        }
      }
    }
    if (this.eyesOut > 0) this.eyesOut -= dt;
    if (this.nitroCd > 0) this.nitroCd -= dt;
    if (this.nitroTimer > 0) {
      this.nitroTimer -= dt;
      if (this.playerCar) this.playerCar.boost = this.nitroTimer > 0;
    }
    this.updateLighting();
    this.updateWeather(dt);
    this.updateEffects(dt);
    for (let i = 0; i < this.markerMeshes.length; i++) {
      const s = 1 + Math.sin(this.time * 3 + i) * 0.08;
      this.markerMeshes[i].scale.set(s, s, 1);
    }
    for (let i = 0; i < this.packageMeshes.length; i++) {
      const b = this.packageMeshes[i];
      if (b.visible) {
        b.rotation.y += dt * 1.5;
        b.position.y = 0.9 + Math.sin(this.time * 2 + i) * 0.15;
      }
    }

    if (this.mode === 'menu') {
      if (input.wasPressed('Enter', ' ') || input.mouseClicked) {
        this.startGame();
        return;
      }
      // Slow cinematic orbit around the Strand for the menu backdrop.
      const t = this.time * 0.05;
      this.camera.position.set(232 + Math.sin(t) * 26, 10 + Math.sin(t * 0.7) * 3, -40 + Math.cos(t) * 26);
      this.camera.lookAt(232, 2, -40);
      this.traffic.update(dt, null);
      this.renderer.render(this.scene, this.camera);
      return;
    }
    if (this.mode === 'busted' || this.mode === 'wasted') {
      this.renderer.render(this.scene, this.camera);
      if (input.wasPressed('Enter', ' ')) this.respawn();
      return;
    }

    if (this.garageOpen) {
      if (input.wasPressed('g', 'Escape')) this.closeGarage();
      this.renderer.render(this.scene, this.camera);
      return;
    }

    if (input.wasPressed('p', 'Escape')) {
      this.paused = !this.paused;
      this.hud.showBanner(this.paused ? 'PAUSED — PRESS P TO RESUME' : 'RESUMED', 2);
    }
    if (this.paused) {
      this.renderer.render(this.scene, this.camera);
      return;
    }

    // --- Player movement ---
    const fwd = input.down('w', 'ArrowUp') ? 1 : input.down('s', 'ArrowDown') ? -1 : 0;
    const strafe = input.down('d', 'ArrowRight') ? 1 : input.down('a', 'ArrowLeft') ? -1 : 0;
    if (this.playerCar) {
      const car = this.playerCar;
      const throttle = fwd || (this.shotDrive ? 1 : 0);
      const brake = input.down(' ') || input.down('Space');
      car.drive(dt, throttle, strafe, brake);
      this.px = car.x;
      this.pz = car.z;
      this.heading = car.heading;
      this.carSpeedMph = Math.abs(car.speed) * 2.24;
      if (this.traffic.collideWithBuildings(car, this.colliders)) this.audio.crash();
      for (const other of this.traffic.cars) {
        if (dist2d(car.x, car.z, other.x, other.z) < 4.2) {
          car.speed *= 0.6;
          other.speed *= 0.5;
          this.damageCar(car, 2);
          this.audio.crash();
        }
      }
      for (const p of [...this.peds.list]) {
        if (dist2d(car.x, car.z, p.x, p.z) < 2.6 && Math.abs(car.speed) > 6) {
          this.scene.remove(p.mesh);
          this.peds.list.splice(this.peds.list.indexOf(p), 1);
          this.peds.spawn();
          this.police.addHeat(20);
          this.audio.crash();
          this.hud.showBanner('PEDESTRIAN HIT — WANTED LEVEL UP', 2.5);
        }
      }
      if (Math.abs(car.speed) > 30 && this.police.units.length > 0) this.police.addHeat(dt * 1.5);
      if (car.condition <= 0) {
        this.spawnBurningWreck(car.x, car.z);
        this.hud.showBanner('CAR WRECKED — BURNING WRECK LEFT BEHIND', 3);
        this.tryEnterCar();
      }
      this.audio.setEngine(Math.abs(car.speed) / car.model.top, true);
      this.audio.updateRadio(dt, true);
    } else {
      const speed = input.down('Shift') ? 9 : 5.5;
      const mx = Math.sin(this.camYaw) * fwd + Math.cos(this.camYaw) * strafe;
      const mz = Math.cos(this.camYaw) * fwd - Math.sin(this.camYaw) * strafe;
      const len = Math.hypot(mx, mz);
      if (len > 0) {
        this.px += (mx / len) * speed * dt;
        this.pz += (mz / len) * speed * dt;
        const targetHeading = Math.atan2(mx, mz);
        this.heading = angleLerp(this.heading, targetHeading, Math.min(1, dt * 10));
        this.onFootSpeed = speed;
        this.walkPhase += dt * speed * 2;
      } else this.onFootSpeed = 0;
      this.px = clamp(this.px, -275, 480);
      this.pz = clamp(this.pz, -275, 275);
      for (const b of this.colliders) {
        if (this.px > b.minX - 0.6 && this.px < b.maxX + 0.6 && this.pz > b.minZ - 0.6 && this.pz < b.maxZ + 0.6) {
          const dxl = this.px - (b.minX - 0.6);
          const dxr = (b.maxX + 0.6) - this.px;
          const dzl = this.pz - (b.minZ - 0.6);
          const dzr = (b.maxZ + 0.6) - this.pz;
          const m = Math.min(dxl, dxr, dzl, dzr);
          if (m === dxl) this.px = b.minX - 0.6;
          else if (m === dxr) this.px = b.maxX + 0.6;
          else if (m === dzl) this.pz = b.minZ - 0.6;
          else this.pz = b.maxZ + 0.6;
        }
      }
      this.playerMesh.position.set(this.px, Math.abs(Math.sin(this.walkPhase)) * 0.06, this.pz);
      this.playerMesh.rotation.y = this.heading;
      this.audio.setEngine(0, false);
    }

    // Actions.
    if (input.wasPressed('e')) this.tryEnterCar();
    if (input.wasPressed('f') && !this.playerCar) this.punch();
    if (input.mouseClicked && !this.playerCar) this.shoot();
    if (input.wasPressed('q')) this.useAbility(0);
    if (input.wasPressed('r')) this.useAbility(1);
    if (input.wasPressed('v')) this.useAbility(2);
    if (input.wasPressed('c')) {
      this.audio.cycleStation();
      this.hud.showBanner(`RADIO — ${this.audio.currentStation()}`, 2);
    }
    if (input.wasPressed('1')) this.hud.setWeapon(1);
    if (input.wasPressed('2')) this.hud.setWeapon(2);
    if (input.wasPressed('3')) this.hud.setWeapon(3);
    if (input.wasPressed('4')) {
      if (this.weaponUnlocked(4)) this.hud.setWeapon(4);
      else this.hud.showBanner('SHOTGUN UNLOCKS AFTER JOB 4', 2);
    }
    if (input.wasPressed('5')) {
      if (this.weaponUnlocked(5)) this.hud.setWeapon(5);
      else this.hud.showBanner('RIFLE UNLOCKS AFTER JOB 7', 2);
    }
    if (input.wasPressed('n') && this.playerCar && this.garage.nitro > 0 && this.nitroCd <= 0) {
      this.nitroTimer = 3;
      this.nitroCd = 8;
      this.hud.showBanner('NITRO!', 1.5);
      this.audio.pickup();
    }
    if (input.wasPressed('t')) {
      if (this.activities.active) {
        this.activities.cancel();
        this.hud.showBanner('ACTIVITY CANCELLED', 2);
      } else {
        const mk = this.activities.nearestMarker(this.px, this.pz, 9);
        if (mk) {
          const a = this.activities.start(mk.type);
          if (a) {
            this.audio.missionStart();
            this.hud.showBanner(`${a.code} — ${a.name}`, 3);
            this.hud.showDialog(FIXER.name, FIXER.role, a.objective, 5);
          }
        } else this.hud.showBanner('NO ACTIVITY HERE — FIND A GLOWING RING', 2);
      }
    }
    if (input.wasPressed('g') && dist2d(this.px, this.pz, -180, 250) < 12) this.openGarage();
    if (input.wasPressed('Enter') && this.missions.state === 'idle' && !this.missions.isFinished()) {
      this.beginMission(this.missions.start());
    }

    // --- World systems ---
    this.traffic.update(dt, this.playerCar);
    this.peds.update(dt, this.px, this.pz, this.playerCar ? Math.abs(this.playerCar.speed) : this.onFootSpeed, !!this.playerCar);
    this.police.update(dt, this.px, this.pz, this.playerCar ? Math.abs(this.playerCar.speed) : this.onFootSpeed, !!this.playerCar, this.colliders, this.heading,
      (unit) => {
        if (this.playerCar) {
          this.damageCar(this.playerCar, unit.isSwat ? 3 : 1.5);
          this.playerCar.speed *= 0.85;
          this.audio.crash();
        } else {
          this.health -= unit.isSwat ? 12 : 6;
        }
      });
    if (this.police.onWantedUp) this.audio.wantedUp();
    this.audio.setSiren(this.police.sirenOn, this.time);

    if (!this.playerCar && this.police.wanted >= 2) {
      const near = this.police.units.some((u) => dist2d(u.x, u.z, this.px, this.pz) < 4);
      if (near) {
        this.bustedTimer += dt;
        if (this.bustedTimer > 2.5) return this.bust();
      } else this.bustedTimer = 0;
    }
    if (this.health <= 0) return this.waste();

    // --- Missions ---
    const result = this.missions.update(dt, this.px, this.pz, !!this.playerCar, this.police.wanted);
    if (result === 'done') {
      const m = this.missions.complete();
      this.money += m.reward;
      this.respect += 12;
      const d = districtAt(this.px, this.pz);
      this.districts[d] = (this.districts[d] || 0) + 10;
      this.ammo = Math.min(60, this.ammo + 12);
      this.audio.missionDone();
      this.hud.showBanner(`JOB COMPLETE — +$${m.reward}  •  RESPECT +12  •  ${d} +10`, 4);
      this.hud.showDialog(FIXER.name, FIXER.role, this.missions.message, 6);
      this.save();
      this.missionCooldown = 2;
    } else if (result === 'failed') {
      this.audio.fail();
      this.hud.showBanner('JOB FAILED', 3);
      this.hud.showDialog(FIXER.name, FIXER.role, this.missions.message, 6);
      this.missionCooldown = 2;
    } else if (result === 'checkpoint') {
      this.audio.pickup();
      this.hud.showBanner(`CHECKPOINT ${this.missions.visited.size}/${this.missions.active.checkpoints.length}`, 2);
    }
    if (this.missionCooldown > 0) {
      this.missionCooldown -= dt;
      if (this.missionCooldown <= 0 && !this.missions.isFinished() && !this.missions.active) {
        this.beginMission(this.missions.start());
      }
    }
    if (this.missions.isFinished() && this.missions.state === 'idle') {
      this.hud.showBanner('STORY COMPLETE — SOLARA IS YOURS', 5);
      this.missions.state = 'done';
    }

    // --- Side activities ---
    const aresult = this.activities.update(dt, this.px, this.pz);
    if (aresult === 'done') {
      const reward = this.activities.lastReward || 350;
      this.money += reward;
      this.respect += 4;
      const d = districtAt(this.px, this.pz);
      this.districts[d] = (this.districts[d] || 0) + 5;
      this.audio.missionDone();
      this.hud.showBanner(`ACTIVITY DONE — +$${reward}  •  ${d} +5`, 3);
      this.save();
    } else if (aresult === 'failed') {
      this.audio.fail();
      this.hud.showBanner('ACTIVITY FAILED — TIME UP', 3);
    } else if (aresult === 'checkpoint') {
      this.audio.pickup();
      this.hud.showBanner(`GATE ${this.activities.visited.size}/${this.activities.active.checkpoints.length}`, 2);
    }

    // --- Hidden packages ---
    for (let i = 0; i < PACKAGE_SPOTS.length; i++) {
      if (this.collectedPackages.has(i)) continue;
      const p = PACKAGE_SPOTS[i];
      if (dist2d(this.px, this.pz, p.x, p.z) < 4) {
        this.collectedPackages.add(i);
        this.packageMeshes[i].visible = false;
        this.money += 150;
        this.audio.pickup();
        this.hud.showBanner(`HIDDEN PACKAGE ${this.collectedPackages.size}/${PACKAGE_SPOTS.length} — +$150`, 2.5);
        this.save();
      }
    }

    // Beacon at the objective (activity target wins over the story job).
    const target = this.activities.active ? this.activities.targetPos()
      : (this.missions.active ? this.missions.targetPos() : null);
    if (target) {
      this.beacon.visible = true;
      this.beaconRing.visible = true;
      this.beacon.position.set(target.x, 30, target.z);
      this.beaconRing.position.set(target.x, 0.15, target.z);
      this.beacon.material.opacity = 0.35 + Math.sin(this.time * 3) * 0.15;
      const s = 1 + Math.sin(this.time * 3) * 0.08;
      this.beaconRing.scale.set(s, s, 1);
    } else {
      this.beacon.visible = false;
      this.beaconRing.visible = false;
    }

    // --- Chase camera: low, close and slightly to the side, the way the
    // top-5 covers frame it (three-quarter rear view, car side visible) ---
    const behind = this.playerCar ? 8 : 5.5;
    const height = this.playerCar ? 3.2 : 3.0;
    const side = 1.2;
    const lookAhead = this.shotLook ? this.shotLook.ahead : 6;
    const lookY = this.shotLook ? this.shotLook.y : 1.6;
    this.camYaw = angleLerp(this.camYaw, this.heading, Math.min(1, dt * 3.2));
    const cx = this.px - Math.sin(this.camYaw) * behind - Math.cos(this.camYaw) * side;
    const cz = this.pz - Math.cos(this.camYaw) * behind + Math.sin(this.camYaw) * side;
    this.camPos.x += (cx - this.camPos.x) * Math.min(1, dt * 6);
    this.camPos.y += (height - this.camPos.y) * Math.min(1, dt * 6);
    this.camPos.z += (cz - this.camPos.z) * Math.min(1, dt * 6);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.px + Math.sin(this.heading) * lookAhead, lookY, this.pz + Math.cos(this.heading) * lookAhead);

    // --- HUD ---
    const m = this.missions.active;
    const nearMarker = this.activities.nearestMarker(this.px, this.pz, 9);
    const nearGarage = dist2d(this.px, this.pz, -180, 250) < 12;
    this.hud.update(dt, {
      mission: m,
      activity: this.activities.active,
      activityTimer: this.activities.timer,
      activityProgress: this.activities.progressText(),
      missionTimer: m ? this.missions.timer : 0,
      missionProgress: m ? this.missions.progressText() : '',
      clockMinutes: this.clockMinutes,
      weather: this.weather,
      money: this.money,
      wanted: this.police.wanted,
      rank: rankFor(this.respect),
      respect: this.respect,
      districts: this.districts,
      jobsDone: this.missions.index,
      garage: this.garage,
      packagesCollected: this.collectedPackages.size,
      packagesTotal: PACKAGE_SPOTS.length,
      policeUnits: this.police.unitList(this.px, this.pz).map((u) => {
        const full = this.police.units.find((pu) => pu.unitName === u.name);
        return { ...u, x: full ? full.x : 0, z: full ? full.z : 0 };
      }),
      health: this.health,
      armor: this.armor,
      inCar: !!this.playerCar,
      speedMph: this.carSpeedMph,
      carName: this.playerCar ? this.playerCar.model.name : '',
      condition: this.playerCar ? this.playerCar.condition : 100,
      radio: this.audio.currentStation(),
      abilities: this.abilities.map((a) => ({ key: a.key, name: a.name, ready: a.ready, cd: Math.ceil(a.cd) })),
      px: this.px,
      pz: this.pz,
      heading: this.camYaw,
      objectivePos: target,
      hint: this.playerCar
        ? (nearGarage ? 'PRESS G — SOLARA GARAGE (UPGRADES)' : nearMarker ? `PRESS T — ${nearMarker.label}` : 'WASD DRIVE • SPACE BRAKE • E EXIT • Q SWAP PLATES • R QUICK FIX • N NITRO • C RADIO')
        : (nearGarage ? 'PRESS G — SOLARA GARAGE (UPGRADES)' : nearMarker ? `PRESS T — ${nearMarker.label}` : 'WASD MOVE • E ENTER CAR • F PUNCH • CLICK SHOOT • SHIFT RUN • ENTER START JOB'),
    });

    this.renderer.render(this.scene, this.camera);
  }

  bust() {
    this.mode = 'busted';
    this.money = Math.max(0, this.money - 300);
    this.police.reset();
    this.save();
    const el = document.getElementById('gameover');
    el.style.display = 'flex';
    document.getElementById('gameoverTitle').textContent = 'BUSTED';
    document.getElementById('gameoverText').textContent = 'Solara PD took you in. $300 bail — the crew got you out. Press ENTER to get back on the street.';
    this.audio.fail();
  }

  waste() {
    this.mode = 'wasted';
    this.money = Math.max(0, this.money - 200);
    this.police.reset();
    this.save();
    const el = document.getElementById('gameover');
    el.style.display = 'flex';
    document.getElementById('gameoverTitle').textContent = 'WASTED';
    document.getElementById('gameoverText').textContent = 'You blacked out on the pavement. The Solara clinic patched you up — $200. Press ENTER to get back on the street.';
    this.audio.fail();
  }

  respawn() {
    this.health = 100;
    this.armor = 50;
    this.mode = 'playing';
    document.getElementById('gameover').style.display = 'none';
    this.placePlayerOnFoot(0, 30, Math.PI);
    this.hud.showBanner('BACK ON THE STREET', 2);
  }

  frame(now, last) {
    const dt = Math.min((now - last) / 1000, 0.05);
    if (shot) {
      this.update(dt);
      if (this.settleFrames > 0) {
        this.settleFrames -= 1;
        if (this.settleFrames === 0) {
          this.renderer.render(this.scene, this.camera);
          this.renderer.render(this.scene, this.camera);
          window.__shotReady = true;
        }
      }
      return;
    }
    this.update(dt);
    this.input.endFrame();
  }
}

const game = new Game();
window.__game = game;
window.__shotReady = false;

if (shot) {
  stageShot(game, shot);
  let last = performance.now();
  let paints = 0;
  function shotFrame(now) {
    requestAnimationFrame(shotFrame);
    game.frame(now, last);
    last = now;
    paints += 1;
    if (paints === 2 && game.settleFrames <= 0) window.__shotReady = true;
  }
  requestAnimationFrame(shotFrame);
} else {
  let last = performance.now();
  function loop(now) {
    requestAnimationFrame(loop);
    game.frame(now, last);
    last = now;
  }
  requestAnimationFrame(loop);
}
