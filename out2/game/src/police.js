// Police for SOLARA: wanted level 1-5, patrol units that chase, ram, flank
// and roadblock, plus a helicopter with a bright spotlight at 3+ stars.
// At 5 stars SWAT vans join the hunt: faster, heavier, harder rams.
// The helicopter's spotlight beam is deliberately bright — in the top-5
// covers the heli + its light cone is the single most readable element.
import { mulberry32, pick, clamp, angleLerp, dist2d } from './random.js';
import { makeCarMesh, Car } from './cars.js';

const UNIT_NAMES = ['UNIT 12', 'UNIT 07', 'UNIT 23', 'UNIT 31', 'UNIT 44', 'UNIT 58', 'UNIT 65', 'UNIT 80'];
const UNIT_STATUS = ['PURSUE', 'RAMMING', 'FLANKING', 'ROADBLOCK', 'CLOSING IN', 'PIT', 'FIRING', 'SPOTLIGHT'];

export class Police {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed + 21);
    this.wanted = 0;
    this.heat = 0; // 0..100, drives wanted stars
    this.units = [];
    this.heli = null;
    this.heliLight = null;
    this.spot = null;
    this.time = 0;
    this.sirenOn = false;
    this.onWantedUp = false;
    this._buildHeli();
  }

  _buildHeli() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.5, 4.8),
      new THREE.MeshLambertMaterial({ color: 0x2a4a7a }));
    g.add(body);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.7, 4.6),
      new THREE.MeshLambertMaterial({ color: 0x2a4a7a }));
    tail.position.set(0, 0.3, -4.2);
    g.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(10, 0.14, 0.55),
      new THREE.MeshLambertMaterial({ color: 0x1a1a1a }));
    rotor.position.y = 1.05;
    g.add(rotor);
    this.heliRotor = rotor;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.85, 1.5),
      new THREE.MeshLambertMaterial({ color: 0x9fd8ff }));
    glass.position.set(0, 0.2, 2.0);
    g.add(glass);
    // Bright spotlight beam: a wide translucent cone from the heli to the
    // street, plus a glowing pool where it lands.
    const beam = new THREE.Mesh(new THREE.ConeGeometry(6, 40, 12, 1, true),
      new THREE.MeshBasicMaterial({
        color: 0xfff2b0, transparent: true, opacity: 0.18,
        side: THREE.DoubleSide, depthWrite: false,
      }));
    beam.rotation.x = Math.PI; // apex up at the heli, base at the ground
    beam.position.set(0, -22, 0);
    g.add(beam);
    this.heliBeam = beam;
    const pool = new THREE.Mesh(new THREE.CircleGeometry(7, 20),
      new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.28, depthWrite: false }));
    pool.rotation.x = -Math.PI / 2;
    pool.position.set(0, -43.5, 0);
    g.add(pool);
    this.spot = new THREE.SpotLight(0xfff2b0, 0, 100, 0.34, 0.45, 1);
    this.spot.position.set(0, -0.6, 0);
    g.add(this.spot);
    const target = new THREE.Object3D();
    target.position.set(0, -42, 0);
    g.add(target);
    this.spot.target = target;
    g.visible = false;
    this.scene.add(g);
    this.heli = g;
  }

  addHeat(amount) {
    this.heat = clamp(this.heat + amount, 0, 100);
    const w = this.heat <= 0 ? 0 : this.heat < 20 ? 1 : this.heat < 40 ? 2 : this.heat < 60 ? 3 : this.heat < 85 ? 4 : 5;
    if (w > this.wanted) this.onWantedUp = true;
    this.wanted = w;
  }

  maxUnits() {
    return [0, 2, 3, 4, 5, 6][this.wanted];
  }

  spawnUnit(px, pz) {
    const rng = this.rng;
    const a = rng() * Math.PI * 2;
    const d = 55 + rng() * 30;
    const x = px + Math.sin(a) * d;
    const z = pz + Math.cos(a) * d;
    const swat = this.wanted >= 5 && rng() < 0.45;
    const mesh = makeCarMesh(swat ? 0x0a0a0a : 0x2a3a55, true);
    this.scene.add(mesh);
    const car = new Car(mesh, {
      name: swat ? 'SOLARA SWAT VAN' : 'SOLARA INTERCEPTOR',
      color: swat ? 0x0a0a0a : 0x2a3a55, top: swat ? 46 : 44, accel: 30,
    }, x, z, Math.atan2(px - x, pz - z));
    car.isPolice = true;
    car.isSwat = swat;
    car.unitName = swat ? `SWAT ${String(this.units.length + 1).padStart(2, '0')}` : UNIT_NAMES[this.units.length % UNIT_NAMES.length];
    car.status = swat ? 'SWAT' : 'PURSUE';
    car.statusTimer = 2 + rng() * 3;
    this.units.push(car);
    return car;
  }

  // Park two units across the road ahead of the player as a roadblock.
  stageRoadblock(px, pz, heading) {
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    for (const off of [-6, 6]) {
      const x = px + rx * off + fx * -40;
      const z = pz + rz * off + fz * -40;
      const mesh = makeCarMesh(0x2a3a55, true);
      this.scene.add(mesh);
      const car = new Car(mesh, { name: 'SOLARA INTERCEPTOR', color: 0x2a3a55, top: 44, accel: 30 },
        x, z, heading + Math.PI / 2);
      car.isPolice = true;
      car.roadblock = true;
      car.unitName = 'ROADBLOCK';
      car.status = 'ROADBLOCK';
      car.statusTimer = 99;
      car.speed = 0;
      this.units.push(car);
    }
  }

  removeUnit(car) {
    this.scene.remove(car.mesh);
    const i = this.units.indexOf(car);
    if (i >= 0) this.units.splice(i, 1);
  }

  // Stage a chase for a screenshot: units placed in view around the player,
  // ahead and flanking, moving at chase speed. The helicopter sits high and
  // ahead so its body and spotlight cone both read in the frame.
  stageChase(px, pz, heading) {
    while (this.units.length) this.removeUnit(this.units[0]);
    const fx = Math.sin(heading);
    const fz = Math.cos(heading);
    const rx = Math.cos(heading);
    const rz = -Math.sin(heading);
    const spots = [
      [-9, -28], [9, -38], [-15, -55], [13, -20], [-6, -70],
    ];
    for (let i = 0; i < spots.length; i++) {
      const [r, f] = spots[i];
      const x = px + rx * r + fx * f;
      const z = pz + rz * r + fz * f;
      const mesh = makeCarMesh(0x2a3a55, true);
      this.scene.add(mesh);
      const car = new Car(mesh, { name: 'SOLARA INTERCEPTOR', color: 0x2a3a55, top: 44, accel: 30 },
        x, z, heading);
      car.isPolice = true;
      car.unitName = UNIT_NAMES[i % UNIT_NAMES.length];
      car.status = ['RAMMING', 'FLANKING', 'PURSUE', 'CLOSING IN', 'ROADBLOCK'][i];
      car.statusTimer = 3;
      car.speed = 30;
      this.units.push(car);
    }
    this.heli.visible = true;
    this.heli.position.set(px + rx * 18 + fx * -55, 30, pz + rz * 18 + fz * -55);
    this.heli.rotation.y = heading;
  }

  update(dt, px, pz, playerSpeed, inCar, colliders, heading, onRam) {
    this.time += dt;
    this.onWantedUp = false;
    if (this.wanted > 0) {
      const calm = playerSpeed < 4 && !inCar;
      this.heat -= dt * (calm ? 2.2 : 0.55);
      if (this.heat <= 0) {
        this.heat = 0;
        this.wanted = 0;
      } else {
        this.wanted = this.heat < 20 ? 1 : this.heat < 40 ? 2 : this.heat < 60 ? 3 : this.heat < 85 ? 4 : 5;
      }
    }
    const want = this.maxUnits();
    const chaseCount = () => this.units.filter((u) => !u.roadblock).length;
    while (chaseCount() < want) this.spawnUnit(px, pz);
    while (chaseCount() > want) {
      const idx = this.units.findIndex((u) => !u.roadblock);
      if (idx < 0) break;
      this.removeUnit(this.units[idx]);
    }
    this.sirenOn = this.units.length > 0;

    for (const u of this.units) {
      if (u.roadblock) continue;
      u.statusTimer -= dt;
      if (u.statusTimer <= 0) {
        u.statusTimer = 2.5 + this.rng() * 3;
        u.status = pick(this.rng, UNIT_STATUS);
      }
      const d = dist2d(u.x, u.z, px, pz);
      const targetHeading = Math.atan2(px - u.x, pz - u.z);
      let desired = targetHeading;
      if (u.status === 'FLANKING') desired = targetHeading + 0.6;
      u.heading = angleLerp(u.heading, desired, Math.min(1, dt * 2.2));
      const targetSpeed = u.status === 'ROADBLOCK' && d < 26 ? 0 : 40 + this.wanted * 1.5;
      if (u.speed < targetSpeed) u.speed += 26 * dt;
      if (u.speed > targetSpeed) u.speed -= 20 * dt;
      u.x += Math.sin(u.heading) * u.speed * dt;
      u.z += Math.cos(u.heading) * u.speed * dt;
      u.mesh.position.set(u.x, 0, u.z);
      u.mesh.rotation.y = u.heading;
      if (d < 4.5 && onRam) onRam(u, d);
      for (const b of colliders) {
        if (u.x > b.minX - 1.6 && u.x < b.maxX + 1.6 && u.z > b.minZ - 1.6 && u.z < b.maxZ + 1.6) {
          u.x -= Math.sin(u.heading) * u.speed * dt * 2;
          u.z -= Math.cos(u.heading) * u.speed * dt * 2;
          u.speed *= 0.5;
          u.heading += 0.6;
        }
      }
    }

    // Helicopter at 3+ stars: orbits a point ahead of the player's heading.
    // It stays far ahead and low enough to read in the frame (a heli that
    // orbits high and close flies out of the top of the picture).
    const heliActive = this.wanted >= 3;
    this.heli.visible = heliActive;
    if (heliActive) {
      const fx = Math.sin(heading || 0);
      const fz = Math.cos(heading || 0);
      const hx = px + fx * 55 + Math.sin(this.time * 0.25) * 12;
      const hz = pz + fz * 55 + Math.cos(this.time * 0.2) * 12;
      this.heli.position.set(hx, 30 + Math.sin(this.time * 0.5) * 2, hz);
      this.heli.rotation.y = Math.atan2(px - hx, pz - hz);
      this.heliRotor.rotation.y += dt * 22;
      this.spot.intensity = 2.2;
      this.spot.target.position.set(px - hx, -30, pz - hz);
      this.spot.target.updateMatrixWorld();
    } else {
      this.spot.intensity = 0;
    }
  }

  unitList(px, pz) {
    return this.units.map((u) => ({
      name: u.unitName || 'UNIT',
      dist: Math.round(dist2d(u.x, u.z, px, pz)),
      status: u.status || 'PURSUE',
    }));
  }

  reset() {
    while (this.units.length) this.removeUnit(this.units[0]);
    this.wanted = 0;
    this.heat = 0;
    this.heli.visible = false;
  }
}
