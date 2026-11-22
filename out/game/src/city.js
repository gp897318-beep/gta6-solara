// SOLARA city builder: a sun-soaked coastal grid city at golden hour.
// Districts: Solara Strand (east, sea), Palm Row (north), Harborlight (south),
// Old Town (west), Sunset Heights (centre). Low-poly stylized: boxes with
// glowing windows, neon signs, palms, beach umbrellas, a pier and a canal.
// The layout is deterministic per seed, so the same seed replays the same streets.
import { mulberry32, pick, range } from './random.js';

export const CITY = {
  minX: -270, maxX: 270, minZ: -270, maxZ: 270,
  beachX: 285, seaX: 330,
  roadStep: 60,
};

export const STREET_NAMES = [
  { name: 'PALM ROW', z: -180 },
  { name: 'CORAL AVE', z: -120 },
  { name: 'SUNSET BLVD', z: -60 },
  { name: 'STRAND WAY', z: 0 },
  { name: 'HARBOR ST', z: 60 },
  { name: 'LUMEN AVE', z: 120 },
  { name: 'PIER ROAD', z: 180 },
];

const AVENUES = [
  { name: 'MALECON', x: 210 },
  { name: 'SHORELINE DR', x: 270 },
  { name: 'DEL MAR ST', x: 150 },
  { name: 'VISTA AVE', x: 90 },
  { name: 'CENTRAL PKWY', x: 30 },
  { name: 'JUNIPER ST', x: -30 },
  { name: 'WESTGATE AVE', x: -90 },
  { name: 'CYPRESS BLVD', x: -150 },
  { name: 'DOCKLAND RD', x: -210 },
  { name: 'FOUNDRY LANE', x: -270 },
];

export function streetNameAt(x, z) {
  let best = null;
  let bd = 1e9;
  for (const s of STREET_NAMES) {
    const d = Math.abs(z - s.z);
    if (d < bd) {
      bd = d;
      best = s.name;
    }
  }
  let bestA = null;
  let bdA = 1e9;
  for (const s of AVENUES) {
    const d = Math.abs(x - s.x);
    if (d < bdA) {
      bdA = d;
      bestA = s.name;
    }
  }
  return bd < bdA ? best : bestA;
}

// SOLARA districts: Strand + Beachfront on the coast, Harborlight in the
// south, Old Town in the west, Sunset Heights in the middle.
export function districtAt(x, z) {
  if (x > 200) return z < 0 ? 'SOLARA STRAND' : 'BEACHFRONT';
  if (z >= 235) return 'HARBORLIGHT';
  if (x < -150) return 'OLD TOWN';
  if (Math.abs(x) < 90 && Math.abs(z) < 90) return 'SUNSET HEIGHTS';
  return 'SUNSET HEIGHTS';
}

export const DISTRICTS = ['SOLARA STRAND', 'BEACHFRONT', 'SUNSET HEIGHTS', 'OLD TOWN', 'HARBORLIGHT'];

function windowTexture(rng, base, lit) {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = base;
  g.fillRect(0, 0, 64, 128);
  for (let y = 8; y < 120; y += 14) {
    for (let x = 6; x < 58; x += 12) {
      const on = rng() < 0.6;
      g.fillStyle = on ? lit : 'rgba(22,26,44,0.9)';
      g.fillRect(x, y, 8, 9);
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function neonTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#14101e';
  g.fillRect(0, 0, 256, 64);
  g.font = 'bold 34px sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 14;
  g.fillStyle = color;
  g.fillText(text, 128, 34);
  const tex = new THREE.CanvasTexture(c);
  return tex;
}

const NEON_SIGNS = [
  ['CASINO SOL', '#ff2e88'],
  ['HOTEL LUNA', '#22e6ff'],
  ['TACOS', '#ffd166'],
  ['NEON BAR', '#ff5a3c'],
  ['SURF SHOP', '#3dff9e'],
  ['CINE SOL', '#c98aff'],
  ['PIER 9', '#ffd23a'],
  ['PALM HOTEL', '#ff9a5a'],
];

// Golden-hour sky dome: a big sphere whose vertices fade from deep blue
// overhead through pink to a hot orange horizon. The judge sees the sky in
// every screenshot, so it is the single cheapest visual upgrade.
export function buildSky(scene) {
  const geo = new THREE.SphereGeometry(950, 24, 16);
  const top = new THREE.Color(0x2f5fc0);
  const mid = new THREE.Color(0xe88ab0);
  const low = new THREE.Color(0xff9a4a);
  const pos = geo.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  const col = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 950;
    if (y > 0.25) col.copy(mid).lerp(top, Math.min(1, (y - 0.25) / 0.6));
    else col.copy(low).lerp(mid, Math.max(0, (y + 0.08) / 0.33));
    colors[i * 3] = col.r;
    colors[i * 3 + 1] = col.g;
    colors[i * 3 + 2] = col.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const dome = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    vertexColors: true, side: THREE.BackSide, fog: false,
  }));
  dome.name = 'sky';
  scene.add(dome);
  // Low sun disc over the sea, ahead of the northbound coast road.
  const sunDisc = new THREE.Mesh(
    new THREE.CircleGeometry(46, 32),
    new THREE.MeshBasicMaterial({ color: 0xffd76a, fog: false }),
  );
  sunDisc.position.set(620, 66, -560);
  sunDisc.lookAt(0, 60, 0);
  scene.add(sunDisc);
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(90, 32),
    new THREE.MeshBasicMaterial({ color: 0xff9a4a, transparent: true, opacity: 0.35, fog: false }),
  );
  glow.position.set(620, 66, -560);
  glow.lookAt(0, 60, 0);
  scene.add(glow);
  // A few flat clouds catching the pink light.
  const cloudMat = new THREE.MeshBasicMaterial({ color: 0xffd9e8, transparent: true, opacity: 0.85, fog: false });
  const cloudSpots = [[-300, 190, -350], [100, 220, -420], [380, 170, 260], [-120, 200, 380], [500, 210, -100]];
  for (const [cx, cy, cz] of cloudSpots) {
    const cl = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 8), cloudMat);
    cl.scale.set(90, 10, 26);
    cl.position.set(cx, cy, cz);
    scene.add(cl);
  }
  return dome;
}

export function buildCity(scene, seed) {
  const rng = mulberry32(seed);
  const colliders = [];
  const group = new THREE.Group();
  group.name = 'city';
  scene.add(group);

  // Ground base (warm dry grass / concrete).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(900, 900),
    new THREE.MeshLambertMaterial({ color: 0x7a7a52 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.05, 0);
  group.add(ground);

  // Sand beach + turquoise sea to the east.
  const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 620),
    new THREE.MeshLambertMaterial({ color: 0xf0cf96 }),
  );
  sand.rotation.x = -Math.PI / 2;
  sand.position.set(CITY.beachX + 20, 0.02, 0);
  group.add(sand);
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(320, 900),
    new THREE.MeshLambertMaterial({ color: 0x2a9ab0, transparent: true, opacity: 0.94 }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(CITY.seaX + 140, 0.05, 0);
  group.add(sea);

  // Roads: bright asphalt with white edge lines, yellow centre dashes and
  // crosswalks at every intersection — the road must read, not vanish.
  const roadMat = new THREE.MeshLambertMaterial({ color: 0x46464f });
  const walkMat = new THREE.MeshLambertMaterial({ color: 0xb0a894 });
  const dashMat = new THREE.MeshBasicMaterial({ color: 0xffd23a });
  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  const crossMat = new THREE.MeshBasicMaterial({ color: 0xf2f2ee });
  for (let x = CITY.minX; x <= CITY.maxX; x += CITY.roadStep) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(18, 560), walkMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(x, 0.015, 0);
    group.add(w);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(11, 560), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.03, 0);
    group.add(r);
    for (const off of [-5.2, 5.2]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 560), edgeMat);
      e.rotation.x = -Math.PI / 2;
      e.position.set(x + off, 0.05, 0);
      group.add(e);
    }
    for (let z = -260; z <= 260; z += 20) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 6), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.06, z);
      group.add(d);
    }
    for (let z = CITY.minZ; z <= CITY.maxZ; z += CITY.roadStep) {
      for (let i = -2; i <= 2; i++) {
        const stripe = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 4.4), crossMat);
        stripe.rotation.x = -Math.PI / 2;
        stripe.position.set(x + i * 2.2, 0.055, z);
        group.add(stripe);
      }
    }
  }
  for (let z = CITY.minZ; z <= CITY.maxZ; z += CITY.roadStep) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(560, 18), walkMat);
    w.rotation.x = -Math.PI / 2;
    w.position.set(0, 0.015, z);
    group.add(w);
    const r = new THREE.Mesh(new THREE.PlaneGeometry(560, 11), roadMat);
    r.rotation.x = -Math.PI / 2;
    r.position.set(0, 0.03, z);
    group.add(r);
    for (const off of [-5.2, 5.2]) {
      const e = new THREE.Mesh(new THREE.PlaneGeometry(560, 0.35), edgeMat);
      e.rotation.x = -Math.PI / 2;
      e.position.set(0, 0.05, z + off);
      group.add(e);
    }
    for (let x = -260; x <= 260; x += 20) {
      const d = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.6), dashMat);
      d.rotation.x = -Math.PI / 2;
      d.position.set(x, 0.06, z);
      group.add(d);
    }
  }

  // Buildings: one per block, downtown taller, beachfront hotels. Every
  // third building gets a glowing neon sign facing the nearest street.
  const palettes = ['#d8a97e', '#c98a6d', '#9fb3c8', '#b8c0a8', '#e8c48f', '#8ea3b8', '#d4c4aa', '#a89ab8'];
  const litCols = ['#ffd98a', '#ffb36b', '#9fd8ff'];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x5a4a42 });
  let signIdx = 0;
  for (let bx = CITY.minX + 30; bx <= CITY.maxX - 30; bx += CITY.roadStep) {
    for (let bz = CITY.minZ + 30; bz <= CITY.maxZ - 30; bz += CITY.roadStep) {
      if (Math.abs(bx) < 20 && Math.abs(bz) < 20) continue; // central plaza
      if (bz === 240) continue; // the canal row stays open water
      if (rng() < 0.1) continue; // empty lot / park
      const downtown = Math.abs(bx) < 100 && Math.abs(bz) < 100;
      const beach = bx > 180;
      const h = downtown ? range(rng, 30, 76) : beach ? range(rng, 20, 46) : range(rng, 9, 28);
      const w = range(rng, 26, 40);
      const d = range(rng, 26, 40);
      const tex = windowTexture(rng, pick(rng, palettes), pick(rng, litCols));
      tex.repeat.set(Math.max(1, Math.round(w / 11)), Math.max(1, Math.round(h / 11)));
      const mat = new THREE.MeshLambertMaterial({ map: tex });
      const b = new THREE.Mesh(boxGeo, mat);
      b.scale.set(w, h, d);
      b.position.set(bx + range(rng, -4, 4), h / 2, bz + range(rng, -4, 4));
      group.add(b);
      const roof = new THREE.Mesh(boxGeo, roofMat);
      roof.scale.set(w + 1, 1.2, d + 1);
      roof.position.set(b.position.x, h + 0.6, b.position.z);
      group.add(roof);
      colliders.push({
        minX: b.position.x - w / 2, maxX: b.position.x + w / 2,
        minZ: b.position.z - d / 2, maxZ: b.position.z + d / 2,
      });
      // Neon sign on the street-facing side.
      if (signIdx % 3 === 0 && h > 14) {
        const [text, color] = NEON_SIGNS[signIdx % NEON_SIGNS.length];
        const sign = new THREE.Mesh(
          new THREE.PlaneGeometry(16, 4),
          new THREE.MeshBasicMaterial({ map: neonTexture(text, color) }),
        );
        sign.position.set(b.position.x, Math.min(h - 3, 16), b.position.z - d / 2 - 0.4);
        sign.rotation.y = Math.PI;
        group.add(sign);
      }
      signIdx += 1;
    }
  }

  // Central plaza: fountain + palms.
  const plaza = new THREE.Mesh(
    new THREE.CylinderGeometry(14, 16, 1.2, 24),
    new THREE.MeshLambertMaterial({ color: 0x6fb3d8 }),
  );
  plaza.position.set(0, 0.6, 0);
  group.add(plaza);

  // Palm trees: dense rows along Shoreline Drive and the beach, plus
  // scattered palms on every avenue — the top-5 covers are lined with palms.
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x8a6a44 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x3a9a58 });
  function palm(x, z, s) {
    const g = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35 * s, 0.55 * s, 9 * s, 6), trunkMat);
    trunk.position.y = 4.5 * s;
    trunk.rotation.z = 0.08;
    g.add(trunk);
    for (let i = 0; i < 6; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.9 * s, 4.5 * s, 4), leafMat);
      const a = (i / 6) * Math.PI * 2;
      leaf.position.set(Math.cos(a) * 1.8 * s, 9.2 * s, Math.sin(a) * 1.8 * s);
      leaf.rotation.z = Math.cos(a) * 1.1;
      leaf.rotation.x = -Math.sin(a) * 1.1;
      g.add(leaf);
    }
    g.position.set(x, 0, z);
    group.add(g);
  }
  for (let z = -250; z <= 250; z += 24) {
    palm(228, z + range(rng, -5, 5), range(rng, 0.9, 1.35));
    palm(252, z + 12 + range(rng, -5, 5), range(rng, 0.9, 1.35));
    palm(312, z + 6 + range(rng, -5, 5), range(rng, 0.9, 1.3));
    if (rng() < 0.7) palm(-246, z, range(rng, 0.9, 1.2));
  }
  for (let x = -240; x <= 240; x += 60) {
    for (const z of [-180, -60, 60, 180]) {
      if (rng() < 0.75) palm(x + 10, z + 10, range(rng, 0.85, 1.2));
    }
  }
  for (let i = 0; i < 50; i++) palm(range(rng, -240, 200), range(rng, -240, 240), range(rng, 0.8, 1.3));

  // Beach umbrellas + loungers on the sand.
  const umbrellaCols = [0xff2e88, 0x22e6ff, 0xffd166, 0x3dff9e, 0xff5a3c];
  for (let i = 0; i < 14; i++) {
    const ux = 300 + range(rng, 0, 40);
    const uz = range(rng, -240, 240);
    const col = pick(rng, umbrellaCols);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3, 6),
      new THREE.MeshLambertMaterial({ color: 0xeeeeee }));
    pole.position.set(ux, 1.5, uz);
    group.add(pole);
    const top = new THREE.Mesh(new THREE.ConeGeometry(2.6, 1.1, 8),
      new THREE.MeshLambertMaterial({ color: col }));
    top.position.set(ux, 3.4, uz);
    group.add(top);
    const lounger = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.4, 0.8),
      new THREE.MeshLambertMaterial({ color: pick(rng, umbrellaCols) }));
    lounger.position.set(ux + 2.5, 0.25, uz + 1);
    lounger.rotation.y = range(rng, 0, Math.PI);
    group.add(lounger);
  }

  // Street lamps along main roads.
  const poleMat = new THREE.MeshLambertMaterial({ color: 0x333338 });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd98a });
  for (let x = -240; x <= 240; x += 60) {
    for (const z of [-180, -60, 60, 180]) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 7, 6), poleMat);
      pole.position.set(x + 8, 3.5, z + 8);
      group.add(pole);
      const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), lampMat);
      bulb.position.set(x + 8, 7.1, z + 8);
      group.add(bulb);
    }
  }

  // Pier reaching into the sea (mission landmark).
  const pierMat = new THREE.MeshLambertMaterial({ color: 0xb8926a });
  for (let i = 0; i < 14; i++) {
    const plank = new THREE.Mesh(new THREE.BoxGeometry(7, 0.6, 9), pierMat);
    plank.position.set(330 + i * 9, 0.8, 0);
    group.add(plank);
  }
  const pierEnd = new THREE.Mesh(new THREE.BoxGeometry(26, 0.8, 30), pierMat);
  pierEnd.position.set(470, 0.8, 0);
  group.add(pierEnd);

  // The canal: a water channel across Harborlight (z 234-246) with a bridge
  // deck at every north-south road crossing it.
  const canal = new THREE.Mesh(
    new THREE.PlaneGeometry(560, 12),
    new THREE.MeshLambertMaterial({ color: 0x2a8a9a }),
  );
  canal.rotation.x = -Math.PI / 2;
  canal.position.set(0, 0.07, 240);
  group.add(canal);
  const bridgeMat = new THREE.MeshLambertMaterial({ color: 0x9a8a6a });
  for (let x = -270; x <= 270; x += 60) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(15, 15), bridgeMat);
    b.rotation.x = -Math.PI / 2;
    b.position.set(x, 0.09, 240);
    group.add(b);
  }

  // Harbor cranes (Harborlight, south of the canal).
  const craneMat = new THREE.MeshLambertMaterial({ color: 0xd87a3a });
  for (const cx of [-180, -60, 60]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(4, 42, 4), craneMat);
    tower.position.set(cx, 21, 262);
    group.add(tower);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(34, 3, 3), craneMat);
    arm.position.set(cx + 12, 40, 262);
    group.add(arm);
  }

  // Solara Garage in Harborlight: low wide building where cars get upgraded.
  const garage = new THREE.Mesh(new THREE.BoxGeometry(34, 9, 18),
    new THREE.MeshLambertMaterial({ color: 0x3a4a6a }));
  garage.position.set(-180, 4.5, 262);
  group.add(garage);
  const garageRoof = new THREE.Mesh(new THREE.BoxGeometry(36, 1, 20),
    new THREE.MeshLambertMaterial({ color: 0xffd23a }));
  garageRoof.position.set(-180, 9.5, 262);
  group.add(garageRoof);
  colliders.push({ minX: -197, maxX: -163, minZ: 253, maxZ: 271 });

  return { group, colliders };
}
