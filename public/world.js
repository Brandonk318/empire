// The floating island, five districts, camera flights.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createGrowlord } from './growlord.js';

export const DISTRICTS = [
  { id: 'leads', label: 'Leads', color: 0xf6b94c },
  { id: 'ads', label: 'Ads', color: 0xff5fa2 },
  { id: 'inbox', label: 'Inbox', color: 0x4fb3ff },
  { id: 'sales', label: 'Sales', color: 0x4fdc8a },
  { id: 'workshop', label: 'Workshop', color: 0xff8a3d },
];

const RADIUS = 6.6;
const ANGLE0 = Math.PI / 5; // rotate the ring so no district sits directly behind Growlord

function rand(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function std(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.75, metalness: 0.05, flatShading: true, ...extra });
}

function labelSprite(text, color) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  const hex = '#' + new THREE.Color(color).getHexString();
  g.fillStyle = 'rgba(10,14,32,0.78)';
  g.beginPath();
  g.roundRect(8, 16, 496, 96, 48);
  g.fill();
  g.lineWidth = 6;
  g.strokeStyle = hex;
  g.stroke();
  g.fillStyle = '#fff';
  g.font = '700 58px system-ui, -apple-system, Segoe UI, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text.toUpperCase(), 256, 66);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false, transparent: true }));
  s.scale.set(2.6, 0.65, 1);
  s.renderOrder = 10;
  return s;
}

// ------------------------------------------------------------ landmarks

function beacon(color) {
  const g = new THREE.Group();
  const stone = std(0xd9d2c3);
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.75, 0.5, 8), stone);
  base.position.y = 0.25;
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.5, 2.6, 8), stone);
  tower.position.y = 1.8;
  const stripes = [];
  for (const y of [1.1, 1.9, 2.7]) {
    const s = new THREE.Mesh(new THREE.CylinderGeometry(0.4 - (y - 1) * 0.05, 0.42 - (y - 1) * 0.05, 0.22, 8), std(color));
    s.position.y = y;
    stripes.push(s);
  }
  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.32, 12, 10), new THREE.MeshStandardMaterial({ color: 0xfff1c2, emissive: color, emissiveIntensity: 2 }));
  lamp.position.y = 3.35;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.55, 8), std(0x3d3a5c));
  roof.position.y = 3.85;
  const beamPivot = new THREE.Group();
  beamPivot.position.y = 3.35;
  const beam = new THREE.Mesh(
    new THREE.ConeGeometry(0.45, 2.6, 16, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }),
  );
  beam.rotation.z = Math.PI / 2;
  beam.position.x = 1.3;
  beamPivot.add(beam);
  g.add(base, tower, ...stripes, lamp, roof, beamPivot);
  g.userData.tick = (t) => {
    beamPivot.rotation.y = t * 0.9;
    lamp.material.emissiveIntensity = 1.6 + Math.sin(t * 4) * 0.5;
  };
  return g;
}

function billboard(color) {
  const g = new THREE.Group();
  const post = std(0x4a4560);
  for (const x of [-0.9, 0.9]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 2.2, 0.14), post);
    p.position.set(x, 1.1, 0);
    g.add(p);
  }
  const frame = new THREE.Mesh(new THREE.BoxGeometry(2.6, 1.5, 0.16), std(0x2a2840));
  frame.position.y = 2.6;
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 256;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.3), new THREE.MeshBasicMaterial({ map: tex }));
  screen.position.set(0, 2.6, 0.085);
  const back = screen.clone();
  back.rotation.y = Math.PI;
  back.position.z = -0.085;
  const hex = '#' + new THREE.Color(color).getHexString();
  const words = ['FREE FIRST', 'WORKSHOPS', 'REFERRALS', 'ORGANIC'];
  let last = -1;
  g.add(frame, screen, back);
  g.userData.tick = (t) => {
    const i = Math.floor(t / 2.5) % words.length;
    if (i === last) return;
    last = i;
    const x = c.getContext('2d');
    const grd = x.createLinearGradient(0, 0, 512, 256);
    grd.addColorStop(0, '#1b1440');
    grd.addColorStop(1, hex);
    x.fillStyle = grd;
    x.fillRect(0, 0, 512, 256);
    x.fillStyle = '#fff';
    x.font = '800 64px system-ui, sans-serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText(words[i], 256, 128);
    tex.needsUpdate = true;
  };
  return g;
}

function postOffice(color) {
  const g = new THREE.Group();
  const house = new THREE.Mesh(new THREE.BoxGeometry(1.8, 1.3, 1.4), std(0xeee6d8));
  house.position.y = 0.65;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(1.45, 0.9, 4), std(color));
  roof.position.y = 1.75;
  roof.rotation.y = Math.PI / 4;
  roof.scale.set(1, 1, 0.8);
  const door = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.7, 0.05), std(0x3d3a5c));
  door.position.set(0, 0.35, 0.72);
  const box = new THREE.Group();
  const boxBody = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.28, 0.7, 12, 1, false, 0, Math.PI), std(0x3477e0));
  boxBody.rotation.z = Math.PI / 2;
  boxBody.rotation.y = Math.PI / 2;
  boxBody.position.y = 0.95;
  const boxBase = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.3, 0.7), std(0x3477e0));
  boxBase.position.y = 0.8;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.7), std(0x4a4560));
  pole.position.y = 0.35;
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.35, 0.18), std(0xff4d4d));
  flag.position.set(0.3, 1.05, 0.1);
  box.add(boxBody, boxBase, pole, flag);
  box.position.set(1.3, 0, 0.4);
  const env = new THREE.Group();
  const paper = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.45, 0.04), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: color, emissiveIntensity: 0.35 }));
  const seal = new THREE.Mesh(new THREE.CircleGeometry(0.08, 16), std(0xff4d6d));
  seal.position.z = 0.025;
  env.add(paper, seal);
  env.position.y = 3;
  g.add(house, roof, door, box, env);
  g.userData.tick = (t) => {
    env.position.y = 2.9 + Math.sin(t * 1.8) * 0.18;
    env.rotation.y = Math.sin(t * 0.9) * 0.6;
    flag.rotation.z = Math.sin(t * 2) * 0.4 - 0.2;
  };
  return g;
}

function marketStall(color) {
  const g = new THREE.Group();
  const counter = new THREE.Mesh(new THREE.BoxGeometry(2, 0.9, 0.9), std(0x9b6b43));
  counter.position.y = 0.45;
  g.add(counter);
  for (const x of [-0.95, 0.95]) {
    for (const z of [-0.4, 0.4]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.1, 0.08), std(0x6e4a2e));
      p.position.set(x, 1.05, z);
      g.add(p);
    }
  }
  for (let i = 0; i < 6; i++) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 1.25), std(i % 2 ? 0xffffff : color));
    stripe.position.set(-0.9 + i * 0.36, 2.2, 0.1);
    stripe.rotation.x = -0.25;
    g.add(stripe);
  }
  const coins = new THREE.Group();
  const coinMat = new THREE.MeshStandardMaterial({ color: 0xffd257, metalness: 0.85, roughness: 0.3, emissive: 0x553300, emissiveIntensity: 0.5 });
  for (let i = 0; i < 5; i++) {
    const coin = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.05, 20), coinMat);
    coin.position.y = 0.94 + i * 0.055;
    coins.add(coin);
  }
  coins.position.set(-0.5, 0, 0.1);
  const bigCoin = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 28), coinMat);
  bigCoin.rotation.x = Math.PI / 2;
  bigCoin.position.y = 3.05;
  const handshake = new THREE.Mesh(new THREE.TorusKnotGeometry(0.16, 0.05, 48, 8), std(color, { flatShading: false, metalness: 0.4 }));
  handshake.position.set(0.5, 1.15, 0.1);
  g.add(coins, bigCoin, handshake);
  g.userData.tick = (t) => {
    bigCoin.rotation.z = t * 2;
    bigCoin.position.y = 3 + Math.sin(t * 1.5) * 0.12;
    handshake.rotation.y = t;
  };
  return g;
}

function forge(color) {
  const g = new THREE.Group();
  const stone = std(0x6b6578);
  const furnace = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.85, 1.2, 8), stone);
  furnace.position.set(-0.5, 0.6, -0.2);
  const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.3, 16), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  mouth.position.set(-0.5, 0.55, 0.47);
  const chimney = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 1.6, 8), stone);
  chimney.position.set(-0.5, 1.9, -0.3);
  const anvil = new THREE.Group();
  const aBase = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.45, 0.3), std(0x2e2c3a));
  aBase.position.y = 0.22;
  const aTop = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.32), std(0x3c3a4c, { metalness: 0.6 }));
  aTop.position.y = 0.55;
  const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.35, 8), std(0x3c3a4c, { metalness: 0.6 }));
  horn.rotation.z = Math.PI / 2;
  horn.position.set(0.5, 0.55, 0);
  anvil.add(aBase, aTop, horn);
  anvil.position.set(0.7, 0, 0.4);
  // crane
  const mast = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.4, 0.16), std(color));
  mast.position.set(0.9, 1.7, -0.6);
  const jibPivot = new THREE.Group();
  jibPivot.position.set(0.9, 3.4, -0.6);
  const jib = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.12, 0.12), std(color));
  jib.position.x = -0.6;
  const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 1.1), std(0x222222));
  cable.position.set(-1.5, -0.55, 0);
  const block = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.28), new THREE.MeshStandardMaterial({ color: 0x9ff9ff, emissive: 0x3fe8ff, emissiveIntensity: 1.2 }));
  block.position.set(-1.5, -1.15, 0);
  jibPivot.add(jib, cable, block);
  const glow = new THREE.PointLight(0xff8a3d, 3, 4, 2);
  glow.position.set(-0.5, 0.7, 0.8);
  g.add(furnace, mouth, chimney, anvil, mast, jibPivot, glow);
  g.userData.tick = (t, busy) => {
    jibPivot.rotation.y = Math.sin(t * (busy ? 1.4 : 0.4)) * 0.9;
    block.rotation.y = t;
    const f = 0.7 + Math.sin(t * 9) * 0.15 + Math.sin(t * 23) * 0.1 + (busy ? 0.6 : 0);
    glow.intensity = 2.5 * f;
    mouth.material.color.setHSL(0.07, 1, 0.45 + f * 0.12);
    block.material.emissiveIntensity = busy ? 2 + Math.sin(t * 6) : 1.2;
  };
  return g;
}

const LANDMARKS = { leads: beacon, ads: billboard, inbox: postOffice, sales: marketStall, workshop: forge };

// ------------------------------------------------------------ world

export function createWorld(canvas, { lite = false } = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lite, powerPreference: 'high-performance' });
  let pixelRatio = Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = !lite;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  // sky gradient
  const sky = document.createElement('canvas');
  sky.width = 4;
  sky.height = 256;
  const sg = sky.getContext('2d');
  const grd = sg.createLinearGradient(0, 0, 0, 256);
  grd.addColorStop(0, '#0b0f2e');
  grd.addColorStop(0.45, '#2b2a6e');
  grd.addColorStop(0.75, '#a0558f');
  grd.addColorStop(1, '#f3a76a');
  sg.fillStyle = grd;
  sg.fillRect(0, 0, 4, 256);
  const skyTex = new THREE.CanvasTexture(sky);
  skyTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = skyTex;
  scene.fog = new THREE.Fog(0x4a3a7a, 40, 90);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.55;

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 45;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight(0xb9c8ff, 0x3a2a40, 1.1));
  const sun = new THREE.DirectionalLight(0xffe0b8, 2.4);
  sun.position.set(12, 20, 8);
  sun.castShadow = !lite;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -13, right: 13, top: 13, bottom: -13, near: 1, far: 60 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x7fb8ff, 1.2);
  rim.position.set(-10, 6, -12);
  scene.add(rim);

  // ---- island
  const r = rand(7);
  const island = new THREE.Group();
  scene.add(island);
  const topGeo = new THREE.CylinderGeometry(10, 9.4, 0.9, 64, 2);
  const tp = topGeo.attributes.position;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i);
    const z = tp.getZ(i);
    const rad = Math.hypot(x, z);
    if (rad > 8) {
      const a = Math.atan2(z, x);
      const k = 1 + Math.sin(a * 5) * 0.035 + Math.sin(a * 13 + 1) * 0.02;
      tp.setX(i, x * k);
      tp.setZ(i, z * k);
    }
  }
  topGeo.computeVertexNormals();
  const top = new THREE.Mesh(topGeo, std(0x5fbf6a));
  top.receiveShadow = true;
  top.position.y = -0.45;
  island.add(top);
  const dirtRing = new THREE.Mesh(new THREE.CylinderGeometry(9.45, 9.2, 0.6, 64, 1, true), std(0x8a5a3c));
  dirtRing.position.y = -1.05;
  island.add(dirtRing);
  const rockGeo = new THREE.ConeGeometry(9.3, 8, 28, 6);
  const rp = rockGeo.attributes.position;
  for (let i = 0; i < rp.count; i++) {
    const y = rp.getY(i);
    if (y < 3.9) {
      rp.setX(i, rp.getX(i) * (0.9 + r() * 0.22));
      rp.setZ(i, rp.getZ(i) * (0.9 + r() * 0.22));
      rp.setY(i, y + (r() - 0.5) * 0.6);
    }
  }
  rockGeo.computeVertexNormals();
  const rock = new THREE.Mesh(rockGeo, std(0x6a5a78));
  rock.rotation.x = Math.PI;
  rock.position.y = -5.3;
  island.add(rock);

  // floating rocks
  const shards = [];
  for (let i = 0; i < (lite ? 6 : 12); i++) {
    const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3 + r() * 0.6, 0), std(0x7a6a8a));
    const a = r() * Math.PI * 2;
    const d = 12 + r() * 6;
    s.position.set(Math.cos(a) * d, -2 + r() * 6, Math.sin(a) * d);
    s.userData = { a, d, y: s.position.y, sp: 0.03 + r() * 0.05 };
    scene.add(s);
    shards.push(s);
  }

  // central plinth with rune ring
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2, 0.5, 6), std(0xcfc7e8));
  plinth.position.y = 0.25;
  plinth.receiveShadow = true;
  island.add(plinth);
  const rune = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.05, 8, 64), new THREE.MeshBasicMaterial({ color: 0x7ff2ff }));
  rune.rotation.x = Math.PI / 2;
  rune.position.y = 0.52;
  island.add(rune);

  // trees
  const trunkMat = std(0x7a5232);
  const leafMats = [std(0x3fa55a), std(0x55b86a), std(0x2f8f55)];
  for (let i = 0; i < (lite ? 16 : 34); i++) {
    const a = r() * Math.PI * 2;
    const d = 2.8 + r() * 6.4;
    const nearDistrict = DISTRICTS.some((_, k) => {
      const da = (k / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2 + ANGLE0;
      return Math.hypot(Math.cos(a) * d - Math.cos(da) * RADIUS, Math.sin(a) * d - Math.sin(da) * RADIUS) < 2.6;
    });
    const nearPath = DISTRICTS.some((_, k) => {
      const da = (k / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2 + ANGLE0;
      const diff = Math.atan2(Math.sin(a - da), Math.cos(a - da));
      return Math.abs(diff) * d < 0.9;
    });
    if (nearDistrict || nearPath || d < 3) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.1, 0.5, 5), trunkMat);
    trunk.position.y = 0.25;
    const h = 0.9 + r() * 0.8;
    const leaves = new THREE.Mesh(new THREE.ConeGeometry(0.35 + r() * 0.2, h, 6), leafMats[i % 3]);
    leaves.position.y = 0.5 + h / 2;
    leaves.castShadow = !lite;
    t.add(trunk, leaves);
    t.position.set(Math.cos(a) * d, 0, Math.sin(a) * d);
    island.add(t);
  }

  // ---- districts
  const pickables = [];
  const districts = {};
  DISTRICTS.forEach((d, i) => {
    const a = (i / DISTRICTS.length) * Math.PI * 2 - Math.PI / 2 + ANGLE0;
    const pos = new THREE.Vector3(Math.cos(a) * RADIUS, 0, Math.sin(a) * RADIUS);
    const group = new THREE.Group();
    group.position.copy(pos);
    group.rotation.y = -a - Math.PI / 2; // face the center
    island.add(group);

    const plaza = new THREE.Mesh(new THREE.CylinderGeometry(2, 2.15, 0.22, 32), std(0xe8e0f0));
    plaza.position.y = 0.11;
    plaza.receiveShadow = true;
    const ringMat = new THREE.MeshStandardMaterial({ color: d.color, emissive: d.color, emissiveIntensity: 0.4 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.02, 0.07, 8, 64), ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.23;
    const lm = LANDMARKS[d.id](d.color);
    lm.position.y = 0.22;
    lm.traverse((o) => {
      if (o.isMesh) o.castShadow = !lite;
    });
    const label = labelSprite(d.label, d.color);
    label.position.y = 4.9;
    group.add(plaza, ring, lm, label);
    group.traverse((o) => {
      if (o.isMesh || o.isSprite) {
        o.userData.district = d.id;
        pickables.push(o);
      }
    });

    // path to center
    const path = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, RADIUS - 3.8), std(0xd9cfb8));
    path.position.set(Math.cos(a) * (RADIUS / 2 + 0.2), 0.03, Math.sin(a) * (RADIUS / 2 + 0.2));
    path.rotation.y = -a + Math.PI / 2;
    path.receiveShadow = true;
    island.add(path);

    districts[d.id] = { ...d, angle: a, pos, group, ring, ringMat, landmark: lm, label };
  });

  // ---- Growlord
  const growlord = createGrowlord(scene, { lite });

  // ---- camera views + flights
  const views = {};
  function computeViews() {
    const portrait = camera.aspect < 0.9;
    const far = portrait ? 1.55 : 1;
    views.growlord = { pos: new THREE.Vector3(1.4, 6.3, 7.2 * far), target: new THREE.Vector3(0, 5.4, 0) };
    views.overview = { pos: new THREE.Vector3(0, 12.5 * far, 22 * far), target: new THREE.Vector3(0, 2.4, 0) };
    for (const d of Object.values(districts)) {
      const out = new THREE.Vector3(Math.cos(d.angle), 0, Math.sin(d.angle));
      const side = new THREE.Vector3(-out.z, 0, out.x);
      views[d.id] = {
        pos: d.pos.clone().addScaledVector(out, 8 * far).addScaledVector(side, 1.8).add(new THREE.Vector3(0, 5.2 * far, 0)),
        target: d.pos.clone().add(new THREE.Vector3(0, 1.8, 0)).addScaledVector(out, -1.2),
      };
    }
  }

  let flight = null;
  let current = 'overview';
  let focusPoint = null;
  const listeners = { district: [], frame: [] };

  function flyTo(id, { duration = 1.6 } = {}) {
    if (!views[id]) id = 'overview';
    current = id;
    focusPoint = id === 'overview' || id === 'growlord' ? null : districts[id].pos.clone().setY(2);
    for (const d of Object.values(districts)) d.active = d.id === id;
    const cyl = (v) => ({ a: Math.atan2(v.z, v.x), r: Math.hypot(v.x, v.z), y: v.y });
    flight = {
      start: performance.now(),
      dur: duration * 1000,
      from: cyl(camera.position),
      to: cyl(views[id].pos),
      fromTarget: controls.target.clone(),
      toTarget: views[id].target.clone(),
    };
    controls.enabled = false;
    listeners.district.forEach((f) => f(id));
  }

  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);

  // ---- picking
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => (down = { x: e.clientX, y: e.clientY }));
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6) return;
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([...pickables, growlord.root], true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.district && o !== growlord.root) o = o.parent;
    if (o === growlord.root) flyTo('growlord');
    else if (o?.userData.district) flyTo(o.userData.district);
  });
  canvas.addEventListener('pointermove', (e) => {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    canvas.style.cursor = ray.intersectObjects(pickables, false).length ? 'pointer' : 'grab';
  });

  // ---- resize
  let insetRight = 0;
  function resize() {
    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Shift the picture left by half the panel width so the island isn't hidden under it.
    if (insetRight > 0) camera.setViewOffset(w, h, insetRight / 2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    computeViews();
  }
  window.addEventListener('resize', resize);
  resize();
  camera.position.copy(views.overview.pos).multiplyScalar(1.6);
  controls.target.copy(views.overview.target);
  flyTo('overview', { duration: 2.4 });

  // ---- loop with adaptive resolution
  const clock = new THREE.Clock();
  let frames = 0;
  let fpsWindow = 0;
  let fps = 60;
  let busy = false;
  function frame() {
    const dt = Math.min(clock.getDelta(), 0.1);
    const t = clock.elapsedTime;

    if (flight) {
      // Driven by the wall clock so flights take the same time at any frame rate.
      const raw = Math.min(1, (performance.now() - flight.start) / flight.dur);
      const k = ease(raw);
      const { from, to } = flight;
      const da = Math.atan2(Math.sin(to.a - from.a), Math.cos(to.a - from.a)); // shortest way around
      const a = from.a + da * k;
      // swing around the island (never through Growlord), slightly wider mid-flight
      const r = THREE.MathUtils.lerp(from.r, to.r, k) + Math.sin(k * Math.PI) * Math.abs(da) * 2.2;
      const y = THREE.MathUtils.lerp(from.y, to.y, k) + Math.sin(k * Math.PI) * 2;
      camera.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (raw >= 1) {
        flight = null;
        controls.enabled = true;
      }
    }
    controls.update();

    for (const d of Object.values(districts)) {
      d.landmark.userData.tick?.(t, d.id === 'workshop' && busy);
      const target = d.active ? 1.6 + Math.sin(t * 4) * 0.5 : 0.35;
      d.ringMat.emissiveIntensity += (target - d.ringMat.emissiveIntensity) * Math.min(1, dt * 6);
      d.label.position.y = 4.9 + Math.sin(t * 1.5 + d.angle) * 0.08 + (d.active ? 0.2 : 0);
    }
    rune.rotation.z = t * 0.3;
    for (const s of shards) {
      const u = s.userData;
      const a = u.a + t * u.sp;
      s.position.set(Math.cos(a) * u.d, u.y + Math.sin(t + u.a) * 0.4, Math.sin(a) * u.d);
      s.rotation.x = t * u.sp * 4;
    }

    listeners.frame.forEach((f) => f(t, dt));
    growlord.update(t, dt, camera, focusPoint);
    renderer.render(scene, camera);

    // adaptive quality: if we can't hold ~45fps, lower resolution
    frames++;
    fpsWindow += dt;
    if (fpsWindow >= 2) {
      fps = frames / fpsWindow;
      if (fps < 45 && pixelRatio > 1) {
        pixelRatio = Math.max(1, pixelRatio - 0.25);
        renderer.setPixelRatio(pixelRatio);
        resize();
      }
      frames = 0;
      fpsWindow = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    flyTo,
    growlord,
    _cam: () => ({ pos: camera.position.toArray().map(v=>+v.toFixed(2)), target: controls.target.toArray().map(v=>+v.toFixed(2)), flight: !!flight }),
    get current() {
      return current;
    },
    get fps() {
      return fps;
    },
    setInsetRight(px) {
      insetRight = px;
      resize();
    },
    setBusy(v) {
      busy = v;
    },
    on(evt, fn) {
      listeners[evt].push(fn);
    },
  };
}
