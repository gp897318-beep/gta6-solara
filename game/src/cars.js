// Cars for SOLARA: a low-poly car factory, arcade driving physics, NPC
// traffic that follows the road grid, and parked cars to steal.
// Seven models (Solara Comet GT to Dune Runner); the player can steal any
// parked or slow NPC car.
import { mulberry32, pick, range, clamp, dist2d } from './random.js';
import { CITY } from './city.js';

export const CAR_MODELS = [
  { name: 'SOLARA COMET GT', color: 0xe83a2a, top: 44, accel: 27 },
  { name: 'LUNA FALCON S', color: 0x2a6fd8, top: 40, accel: 25 },
  { name: 'CORAL SUNSPRINT', color: 0xf0a83a, top: 36, accel: 23 },
  { name: 'MARLIN COUPE', color: 0x3ad8a0, top: 38, accel: 24 },
  { name: 'SABLE NOCTURNE', color: 0x22242e, top: 34, accel: 21 },
  { name: 'PALM TAXI', color: 0xf0e03a, top: 32, accel: 20 },
  { name: 'DUNE RUNNER', color: 0x9a6a3a, top: 33, accel: 21 },
];

export function makeCarMesh(color, isPolice) {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color });
  const glassMat = new THREE.MeshLambertMaterial({ color: 0x16283a });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x14141a });
  const body = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), bodyMat);
  body.position.y = 0.55;
  g.add(body);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.55, 2.2), glassMat);
  cabin.position.set(0, 1.1, -0.2);
  g.add(cabin);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.12, 1.6), bodyMat);
  roof.position.set(0, 1.42, -0.2);
  g.add(roof);
  // Rear spoiler on sports bodies.
  const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), darkMat);
  spoiler.position.set(0, 1.05, -2.05);
  g.add(spoiler);
  // Wheels.
  const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 10);
  for (const [wx, wz] of [[-0.95, 1.45], [0.95, 1.45], [-0.95, -1.45], [0.95, -1.45]]) {
    const w = new THREE.Mesh(wheelGeo, darkMat);
    w.rotation.z = Math.PI / 2;
    w.position.set(wx, 0.38, wz);
    g.add(w);
  }
  // Headlights + taillights.
  const lightMat = new THREE.MeshBasicMaterial({ color: 0xfff2b0 });
  for (const lx of [-0.6, 0.6]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.08), lightMat);
    h.position.set(lx, 0.6, 2.22);
    g.add(h);
  }
  const tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a2a });
  for (const lx of [-0.6, 0.6]) {
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.08), tailMat);
    t.position.set(lx, 0.62, -2.22);
    g.add(t);
  }
  if (isPolice) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.16, 0.4),
      new THREE.MeshBasicMaterial({ color: 0x2244ff }));
    bar.position.set(0, 1.56, -0.2);
    g.add(bar);
    const bar2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.42),
      new THREE.MeshBasicMaterial({ color: 0xff2222 }));
    bar2.position.set(0.55, 1.56, -0.2);
    g.add(bar2);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.2, 4.42),
      new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    stripe.position.y = 0.62;
    g.add(stripe);
  }
  return g;
}

export class Car {
  constructor(mesh, model, x, z, heading) {
    this.mesh = mesh;
    this.model = model;
    this.x = x;
    this.z = z;
    this.heading = heading;
    this.speed = 0;
    this.steer = 0;
    this.isPlayer = false;
    this.isPolice = false;
    this.condition = 100;
    this.stolen = false;
    this.topBonus = 0; // garage engine upgrades
    this.boost = false; // nitro active
    this.mesh.position.set(x, 0, z);
    this.mesh.rotation.y = heading;
  }

  // Simple arcade driving: accelerate, steer scaled by speed, drag.
  drive(dt, throttle, steerInput, brake) {
    const m = this.model;
    const top = m.top + (this.topBonus || 0) + (this.boost ? 12 : 0);
    const accel = m.accel * (this.boost ? 1.5 : 1);
    if (throttle > 0) this.speed += accel * throttle * dt;
    if (brake) this.speed -= 34 * dt;
    if (throttle < 0) this.speed += accel * 0.6 * throttle * dt;
    this.speed -= this.speed * 0.55 * dt; // drag
    if (this.speed > top) this.speed = top;
    if (this.speed < -12) this.speed = -12;
    const steerTarget = steerInput * 0.55 * clamp(Math.abs(this.speed) / 10, 0, 1);
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 8);
    if (Math.abs(this.speed) > 0.3) {
      this.heading += this.steer * (this.speed >= 0 ? 1 : -1) * dt * 1.6;
    }
    this.x += Math.sin(this.heading) * this.speed * dt;
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.mesh.position.set(this.x, 0, this.z);
    this.mesh.rotation.y = this.heading;
    // Body roll / pitch for feel.
    this.mesh.rotation.z = -this.steer * 0.06;
    this.mesh.rotation.x = clamp(-throttle * 0.02 * (this.speed / m.top), -0.03, 0.03);
  }
}

function onRoad(x, z) {
  const rx = Math.abs(((x + 30) % 60 + 60) % 60 - 30);
  const rz = Math.abs(((z + 30) % 60 + 60) % 60 - 30);
  return rx < 7 || rz < 7;
}

export class Traffic {
  constructor(scene, seed, colliders) {
    this.scene = scene;
    this.rng = mulberry32(seed + 7);
    this.colliders = colliders;
    this.cars = [];
    this.parked = [];
    for (let i = 0; i < 20; i++) this.spawnTrafficCar();
    for (let i = 0; i < 14; i++) this.spawnParkedCar();
  }

  randomRoadPoint() {
    const rng = this.rng;
    const line = () => -270 + Math.floor(range(rng, 0, 10)) * 60;
    const vertical = rng() < 0.5;
    if (vertical) {
      const x = line() + (rng() < 0.5 ? 2.8 : -2.8);
      const z = range(rng, -250, 250);
      return { x, z, heading: rng() < 0.5 ? 0 : Math.PI };
    }
    const z = line() + (rng() < 0.5 ? 2.8 : -2.8);
    const x = range(rng, -250, 250);
    return { x, z, heading: rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2 };
  }

  spawnTrafficCar() {
    const rng = this.rng;
    const model = pick(rng, CAR_MODELS);
    const p = this.randomRoadPoint();
    const mesh = makeCarMesh(model.color, false);
    this.scene.add(mesh);
    const car = new Car(mesh, model, p.x, p.z, p.heading);
    car.speed = range(rng, 8, 14);
    car.nextTurn = range(rng, 40, 160);
    this.cars.push(car);
    return car;
  }

  spawnParkedCar() {
    const rng = this.rng;
    const model = pick(rng, CAR_MODELS);
    const p = this.randomRoadPoint();
    const x = p.x + (Math.abs(Math.sin(p.heading)) > 0.5 ? 5.5 : 0);
    const z = p.z + (Math.abs(Math.cos(p.heading)) > 0.5 ? 5.5 : 0);
    const mesh = makeCarMesh(model.color, false);
    this.scene.add(mesh);
    const car = new Car(mesh, model, x, z, p.heading);
    car.speed = 0;
    this.parked.push(car);
    return car;
  }

  nearestParked(x, z, maxD) {
    let best = null;
    let bd = maxD;
    for (const c of this.parked) {
      const d = dist2d(x, z, c.x, c.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  // Traffic AI: follow the road grid, turn at intersections, slow for cars ahead.
  update(dt, playerCar) {
    for (const car of this.cars) {
      car.nextTurn -= Math.abs(car.speed) * dt;
      const nearX = Math.round(car.x / 60) * 60;
      const nearZ = Math.round(car.z / 60) * 60;
      const atIntersection = Math.abs(car.x - nearX) < 4 && Math.abs(car.z - nearZ) < 4;
      if (atIntersection && car.nextTurn <= 0) {
        car.nextTurn = range(this.rng, 60, 200);
        const r = this.rng();
        if (r < 0.3) car.heading += Math.PI / 2;
        else if (r < 0.6) car.heading -= Math.PI / 2;
      }
      let target = 11;
      for (const other of this.cars) {
        if (other === car) continue;
        const d = dist2d(car.x, car.z, other.x, other.z);
        if (d < 12) {
          const ahead = Math.sin(car.heading) * (other.x - car.x) + Math.cos(car.heading) * (other.z - car.z);
          if (ahead > 0) target = 0;
        }
      }
      if (playerCar && dist2d(car.x, car.z, playerCar.x, playerCar.z) < 10) target = 0;
      const diff = target - car.speed;
      car.speed += clamp(diff, -14 * dt, 8 * dt);
      car.x += Math.sin(car.heading) * car.speed * dt;
      car.z += Math.cos(car.heading) * car.speed * dt;
      if (car.x > 275) car.x = -275;
      if (car.x < -275) car.x = 275;
      if (car.z > 275) car.z = -275;
      if (car.z < -275) car.z = 275;
      car.mesh.position.set(car.x, 0, car.z);
      car.mesh.rotation.y = car.heading;
      if (!onRoad(car.x, car.z) && Math.abs(car.speed) > 1) {
        const gx = Math.round(car.x / 60) * 60;
        const gz = Math.round(car.z / 60) * 60;
        if (Math.abs(car.x - gx) < Math.abs(car.z - gz)) car.x += (gx - car.x) * dt * 0.5;
        else car.z += (gz - car.z) * dt * 0.5;
      }
    }
  }

  collideWithBuildings(car, colliders) {
    for (const b of colliders) {
      if (car.x > b.minX - 1.6 && car.x < b.maxX + 1.6 && car.z > b.minZ - 1.6 && car.z < b.maxZ + 1.6) {
        const dxl = car.x - (b.minX - 1.6);
        const dxr = (b.maxX + 1.6) - car.x;
        const dzl = car.z - (b.minZ - 1.6);
        const dzr = (b.maxZ + 1.6) - car.z;
        const m = Math.min(dxl, dxr, dzl, dzr);
        if (m === dxl) car.x = b.minX - 1.6;
        else if (m === dxr) car.x = b.maxX + 1.6;
        else if (m === dzl) car.z = b.minZ - 1.6;
        else car.z = b.maxZ + 1.6;
        if (Math.abs(car.speed) > 6) car.condition = Math.max(0, car.condition - Math.abs(car.speed) * 0.4);
        car.speed *= -0.25;
        car.mesh.position.set(car.x, 0, car.z);
        return true;
      }
    }
    return false;
  }
}
