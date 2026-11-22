// Pedestrians for SOLARA: walkers on the sidewalks who flee from speeding
// cars and scatter when the player shoves or shoots near them.
// Forty walkers, so the streets read as lived-in rather than empty.
import { mulberry32, pick, range, dist2d } from './random.js';

const SHIRTS = [0xff6a5a, 0x5a9fe8, 0x7ad86a, 0xf0d25a, 0xb06ae8, 0xf2f2f2, 0x3a3a44, 0xff9a5a, 0x22e6ff, 0xff2e88];
const PANTS = [0x2a3a5a, 0x333333, 0x5a4a3a, 0x1a1a1a];

export class Peds {
  constructor(scene, seed) {
    this.scene = scene;
    this.rng = mulberry32(seed + 33);
    this.list = [];
    for (let i = 0; i < 40; i++) this.spawn();
  }

  makePedMesh(shirt, pants) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.85, 0.32),
      new THREE.MeshLambertMaterial({ color: shirt }));
    body.position.y = 1.05;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 10),
      new THREE.MeshLambertMaterial({ color: 0xd8a67e }));
    head.position.y = 1.72;
    g.add(head);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.3),
      new THREE.MeshLambertMaterial({ color: pants }));
    legs.position.y = 0.35;
    g.add(legs);
    return g;
  }

  spawn() {
    const rng = this.rng;
    const x = range(rng, -250, 250);
    const z = range(rng, -250, 250);
    const mesh = this.makePedMesh(pick(rng, SHIRTS), pick(rng, PANTS));
    this.scene.add(mesh);
    const p = {
      mesh, x, z,
      heading: rng() * Math.PI * 2,
      speed: range(rng, 1.2, 2.2),
      panic: 0,
      walkPhase: rng() * 6,
    };
    mesh.position.set(x, 0, z);
    this.list.push(p);
    return p;
  }

  update(dt, px, pz, playerSpeed, inCar) {
    for (const p of this.list) {
      const d = dist2d(p.x, p.z, px, pz);
      if (d < 10 && (playerSpeed > 8 || !inCar)) p.panic = 2.5;
      if (p.panic > 0) {
        p.panic -= dt;
        p.heading = Math.atan2(p.x - px, p.z - pz);
        p.speed = 4.2;
      } else {
        p.speed += (1.6 - p.speed) * dt;
        if (this.rng() < dt * 0.05) p.heading += (this.rng() - 0.5) * 1.6;
      }
      p.x += Math.sin(p.heading) * p.speed * dt;
      p.z += Math.cos(p.heading) * p.speed * dt;
      if (p.x > 275) p.x = -275;
      if (p.x < -275) p.x = 275;
      if (p.z > 275) p.z = -275;
      if (p.z < -275) p.z = 275;
      p.walkPhase += dt * p.speed * 4;
      p.mesh.position.set(p.x, Math.abs(Math.sin(p.walkPhase)) * 0.05, p.z);
      p.mesh.rotation.y = p.heading;
    }
  }

  nearest(x, z, maxD) {
    let best = null;
    let bd = maxD;
    for (const p of this.list) {
      const d = dist2d(x, z, p.x, p.z);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    return best;
  }
}
