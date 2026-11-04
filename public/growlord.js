// Growlord: a floating glass figure. Muscular, robed, long locs, large eyes, a staff.
// Everything is generated in code (no model files).
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const UP = new THREE.Vector3(0, 1, 0);
const tmpV = new THREE.Vector3();
const tmpV2 = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpM = new THREE.Matrix4();
const tmpS = new THREE.Vector3();

function placed(geo, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot)),
    new THREE.Vector3(...scale),
  );
  const g = geo.index ? geo : geo; // all generators here are indexed
  return g.applyMatrix4(m);
}

function lathe(profile, segments = 40) {
  return new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
}

// Smooth a coarse [r, y] profile into many points.
function smoothProfile(points, n = 24) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  return curve.getPoints(n).map((p) => [Math.max(0.001, p.x), p.y]);
}

// Ribbon mesh along a curve (used for the robe's shoulder drape).
function ribbon(curve, width, samples = 60) {
  const pos = [];
  const idx = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const p = curve.getPoint(t);
    const tan = curve.getTangent(t);
    const out = new THREE.Vector3(p.x, 0, p.z).normalize(); // away from body axis
    const side = new THREE.Vector3().crossVectors(tan, out).normalize();
    const w = width * (0.75 + 0.25 * Math.sin(Math.PI * t));
    const a = p.clone().addScaledVector(side, w / 2).addScaledVector(out, 0.02);
    const b = p.clone().addScaledVector(side, -w / 2).addScaledVector(out, 0.02);
    pos.push(a.x, a.y, a.z, b.x, b.y, b.z);
    if (i < samples) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Two-bone IK: returns the elbow position for a shoulder->hand chain.
function solveElbow(s, t, l1, l2, pole, out) {
  const d = Math.min(s.distanceTo(t), l1 + l2 - 1e-3);
  const dir = tmpV.subVectors(t, s).normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const p = tmpV2.copy(pole).addScaledVector(dir, -pole.dot(dir)).normalize();
  return out.copy(s).addScaledVector(dir, a).addScaledVector(p, h);
}

function orientBetween(mesh, a, b, radiusScale = 1) {
  const len = a.distanceTo(b);
  mesh.position.copy(a).lerp(b, 0.5);
  mesh.quaternion.setFromUnitVectors(UP, tmpV.subVectors(b, a).normalize());
  mesh.scale.set(radiusScale, len, radiusScale);
}

export function createGrowlord(scene, { lite = false } = {}) {
  const root = new THREE.Group();
  root.name = 'Growlord';
  const body = new THREE.Group();
  root.add(body);

  // ------------------------------------------------------------ materials
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xc8f3ff,
    roughness: 0.08,
    metalness: 0,
    transmission: lite ? 0 : 1,
    thickness: 0.8,
    ior: 1.42,
    attenuationColor: new THREE.Color(0x58c8ff),
    attenuationDistance: 1.8,
    clearcoat: 1,
    clearcoatRoughness: 0.08,
    emissive: new THREE.Color(0x2f8dff),
    emissiveIntensity: 0.12,
    transparent: lite,
    opacity: lite ? 0.62 : 1,
    specularIntensity: 1,
  });
  const robeMat = new THREE.MeshStandardMaterial({
    color: 0x34206e, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide,
    emissive: 0x150a33, emissiveIntensity: 0.6,
  });
  const gold = new THREE.MeshStandardMaterial({ color: 0xf2c25b, metalness: 0.9, roughness: 0.28, emissive: 0x5a3a00, emissiveIntensity: 0.35 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3a2214, metalness: 0.25, roughness: 0.55 });
  const crystalMat = new THREE.MeshStandardMaterial({ color: 0x9ff9ff, emissive: 0x3fe8ff, emissiveIntensity: 1.6, roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.95 });
  const coreMat = new THREE.MeshBasicMaterial({ color: 0x8ff0ff });
  const locMat = new THREE.MeshStandardMaterial({ color: 0x2b1a10, roughness: 0.85, metalness: 0.05 });
  const eyeWhite = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xd8f6ff, emissiveIntensity: 0.55, roughness: 0.2 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x0e3b52, emissive: 0x1aa6d6, emissiveIntensity: 0.5, roughness: 0.25 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x02070c });
  const sparkMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0b1d2c, roughness: 0.6 });

  // ------------------------------------------------------------ robe (waist down)
  const robeProfile = smoothProfile([[0.98, 0], [0.93, 0.15], [0.78, 0.55], [0.62, 0.95], [0.5, 1.22], [0.45, 1.36]], 22);
  const robeGeo = lathe(robeProfile, lite ? 28 : 48);
  const robe = new THREE.Mesh(robeGeo, robeMat);
  robe.castShadow = !lite;
  body.add(robe);
  const robeBase = robeGeo.attributes.position.array.slice();

  const hem = new THREE.Mesh(new THREE.TorusGeometry(0.97, 0.035, 8, 64), gold);
  hem.rotation.x = Math.PI / 2;
  hem.position.y = 0.03;
  body.add(hem);
  const belt = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.05, 10, 48), gold);
  belt.rotation.x = Math.PI / 2;
  belt.scale.set(1, 0.64, 1);
  belt.position.y = 1.36;
  body.add(belt);
  const buckle = new THREE.Mesh(new THREE.OctahedronGeometry(0.09), crystalMat);
  buckle.position.set(0, 1.36, 0.31);
  buckle.scale.set(1, 1.3, 0.5);
  body.add(buckle);

  // Toga drape over the left shoulder, across the chest and back.
  const drapeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.44, 1.34, 0.18),
    new THREE.Vector3(-0.18, 1.72, 0.36),
    new THREE.Vector3(0.2, 2.1, 0.36),
    new THREE.Vector3(0.52, 2.42, 0.16),
    new THREE.Vector3(0.6, 2.55, -0.08),
    new THREE.Vector3(0.36, 2.15, -0.38),
    new THREE.Vector3(-0.12, 1.66, -0.34),
    new THREE.Vector3(-0.44, 1.34, -0.14),
  ]);
  const drape = new THREE.Mesh(ribbon(drapeCurve, 0.34), robeMat);
  body.add(drape);
  const drapeTrim = new THREE.Mesh(new THREE.TubeGeometry(drapeCurve, 80, 0.018, 6, false), gold);
  drapeTrim.position.y = 0.17;
  drapeTrim.scale.set(1.02, 0.94, 1.02);
  body.add(drapeTrim);

  // Folded hood resting behind the neck.
  const hood = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.13, 10, 24, Math.PI), robeMat);
  hood.position.set(0, 2.6, -0.16);
  hood.rotation.set(-0.35, 0, Math.PI);
  hood.scale.set(1.25, 1, 1);
  body.add(hood);

  // ------------------------------------------------------------ muscular glass torso (one merged mesh)
  const torsoProfile = smoothProfile([[0.43, 1.3], [0.41, 1.5], [0.47, 1.78], [0.6, 2.02], [0.68, 2.26], [0.62, 2.42], [0.42, 2.54], [0.16, 2.6]], 26);
  const parts = [
    placed(lathe(torsoProfile, lite ? 24 : 40), { scale: [1, 1, 0.6] }),
    // pecs
    placed(new THREE.SphereGeometry(0.27, 20, 14), { pos: [0.21, 2.13, 0.27], scale: [1.05, 0.68, 0.52] }),
    placed(new THREE.SphereGeometry(0.27, 20, 14), { pos: [-0.21, 2.13, 0.27], scale: [1.05, 0.68, 0.52] }),
    // traps
    placed(new THREE.SphereGeometry(0.2, 14, 10), { pos: [0.24, 2.5, -0.04], scale: [1.4, 0.6, 0.9], rot: [0, 0, -0.45] }),
    placed(new THREE.SphereGeometry(0.2, 14, 10), { pos: [-0.24, 2.5, -0.04], scale: [1.4, 0.6, 0.9], rot: [0, 0, 0.45] }),
    // deltoids
    placed(new THREE.SphereGeometry(0.23, 18, 12), { pos: [0.66, 2.31, 0], scale: [1, 1.08, 1] }),
    placed(new THREE.SphereGeometry(0.23, 18, 12), { pos: [-0.66, 2.31, 0], scale: [1, 1.08, 1] }),
    // lats (V-taper)
    placed(new THREE.SphereGeometry(0.3, 14, 10), { pos: [0.4, 1.9, -0.08], scale: [0.7, 1.3, 0.75] }),
    placed(new THREE.SphereGeometry(0.3, 14, 10), { pos: [-0.4, 1.9, -0.08], scale: [0.7, 1.3, 0.75] }),
    // neck
    placed(new THREE.CylinderGeometry(0.15, 0.19, 0.36, 16), { pos: [0, 2.7, 0] }),
  ];
  // six-pack
  for (const y of [1.56, 1.73, 1.9]) {
    for (const x of [-0.095, 0.095]) {
      parts.push(placed(new THREE.SphereGeometry(0.1, 12, 8), { pos: [x, y, 0.235], scale: [0.95, 0.75, 0.45] }));
    }
  }
  const torso = new THREE.Mesh(mergeGeometries(parts), glass);
  body.add(torso);

  // Inner core: the glow you see through the glass chest.
  const core = new THREE.Mesh(new THREE.IcosahedronGeometry(0.13, 2), coreMat);
  core.position.set(0, 2.08, 0.02);
  body.add(core);
  const coreLight = new THREE.PointLight(0x6fe6ff, 2, 4, 2);
  coreLight.position.copy(core.position);
  body.add(coreLight);

  // ------------------------------------------------------------ head
  const head = new THREE.Group();
  head.position.set(0, 3.0, 0.02);
  body.add(head);
  const skull = new THREE.Mesh(
    mergeGeometries([
      placed(new THREE.SphereGeometry(0.33, 28, 20), { scale: [0.95, 1.08, 1] }),
      placed(new THREE.SphereGeometry(0.24, 20, 14), { pos: [0, -0.17, 0.06], scale: [1.08, 0.8, 1] }), // strong jaw
      placed(new THREE.SphereGeometry(0.06, 10, 8), { pos: [0, -0.04, 0.33], scale: [0.8, 1, 0.9] }), // nose
    ]),
    glass,
  );
  head.add(skull);

  const eyes = [];
  for (const side of [-1, 1]) {
    const eye = new THREE.Group();
    eye.position.set(side * 0.135, 0.05, 0.255);
    const white = new THREE.Mesh(new THREE.SphereGeometry(0.115, 24, 18), eyeWhite);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.068, 20, 14), irisMat);
    iris.position.z = 0.068;
    iris.scale.z = 0.6;
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.036, 14, 10), pupilMat);
    pupil.position.z = 0.1;
    pupil.scale.z = 0.5;
    const spark = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), sparkMat);
    spark.position.set(0.03, 0.035, 0.112);
    eye.add(white, iris, pupil, spark);
    head.add(eye);
    const brow = new THREE.Mesh(new THREE.CapsuleGeometry(0.022, 0.13, 4, 8), darkMat);
    brow.position.set(side * 0.14, 0.2, 0.3);
    brow.rotation.set(0, 0, Math.PI / 2 + side * 0.18);
    head.add(brow);
    eyes.push({ eye, brow, side });
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 12), darkMat);
  mouth.position.set(0, -0.2, 0.29);
  head.add(mouth);

  // ------------------------------------------------------------ arms (IK each frame)
  const armGeoUpper = new THREE.CylinderGeometry(1, 0.85, 1, 14);
  const armGeoFore = new THREE.CylinderGeometry(0.85, 0.7, 1, 14);
  const bulgeGeo = new THREE.SphereGeometry(1, 16, 12);
  const jointGeo = new THREE.SphereGeometry(1, 14, 10);
  function makeArm(side) {
    const parts = {
      upper: new THREE.Mesh(armGeoUpper, glass),
      fore: new THREE.Mesh(armGeoFore, glass),
      bicep: new THREE.Mesh(bulgeGeo, glass),
      foreBulge: new THREE.Mesh(bulgeGeo, glass),
      elbow: new THREE.Mesh(jointGeo, glass),
      hand: new THREE.Mesh(jointGeo, glass),
      cuff: new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.025, 8, 24), gold),
    };
    for (const m of Object.values(parts)) body.add(m);
    return {
      side,
      parts,
      shoulder: new THREE.Vector3(side * 0.7, 2.3, 0),
      target: new THREE.Vector3(),
      elbowPos: new THREE.Vector3(),
      pole: new THREE.Vector3(side * 0.9, -0.1, -0.7).normalize(),
    };
  }
  const rightArm = makeArm(-1); // his right holds the staff (viewer's left)
  const leftArm = makeArm(1);
  const L1 = 0.56;
  const L2 = 0.5;

  function poseArm(arm) {
    const { shoulder: s, target: t, parts: p } = arm;
    const e = solveElbow(s, t, L1, L2, arm.pole, arm.elbowPos);
    orientBetween(p.upper, s, e, 0.15);
    orientBetween(p.fore, e, t, 0.15);
    p.bicep.position.copy(s).lerp(e, 0.5);
    p.bicep.quaternion.copy(p.upper.quaternion);
    p.bicep.scale.set(0.17, 0.27, 0.17);
    p.bicep.position.addScaledVector(tmpV.copy(arm.pole).multiplyScalar(-1), 0.04);
    p.foreBulge.position.copy(e).lerp(t, 0.3);
    p.foreBulge.quaternion.copy(p.fore.quaternion);
    p.foreBulge.scale.set(0.145, 0.22, 0.145);
    p.elbow.position.copy(e);
    p.elbow.scale.setScalar(0.13);
    p.hand.position.copy(t);
    p.hand.scale.set(0.12, 0.14, 0.13);
    p.cuff.position.copy(e).lerp(t, 0.85);
    p.cuff.quaternion.copy(p.fore.quaternion).multiply(tmpQ.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2));
  }

  // ------------------------------------------------------------ staff
  const staff = new THREE.Group();
  body.add(staff);
  const STAFF_LEN = 3.7;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, STAFF_LEN, 12), wood);
  shaft.position.y = STAFF_LEN / 2;
  staff.add(shaft);
  // gold spiral up the top third
  const helix = [];
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = t * Math.PI * 8;
    helix.push(new THREE.Vector3(Math.cos(a) * 0.065, STAFF_LEN * 0.62 + t * STAFF_LEN * 0.32, Math.sin(a) * 0.065));
  }
  staff.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(helix), 200, 0.013, 6, false), gold));
  for (const y of [0.05, STAFF_LEN * 0.6, STAFF_LEN * 0.95]) {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.02, 8, 20), gold);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = y;
    staff.add(ring);
  }
  // headpiece: three curved prongs cradling a crystal
  const crown = new THREE.Group();
  crown.position.y = STAFF_LEN;
  staff.add(crown);
  for (let i = 0; i < 3; i++) {
    const prong = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.022, 8, 24, Math.PI * 0.85), gold);
    const holder = new THREE.Group();
    holder.rotation.y = (i / 3) * Math.PI * 2;
    prong.rotation.set(0, Math.PI / 2, Math.PI * 0.08);
    prong.position.set(0.17, 0.2, 0);
    holder.add(prong);
    crown.add(holder);
  }
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.17, 0), crystalMat);
  crystal.scale.set(1, 1.7, 1);
  crystal.position.y = 0.3;
  crown.add(crystal);
  const halo = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.012, 8, 64), new THREE.MeshBasicMaterial({ color: 0xaaf6ff, transparent: true, opacity: 0.7 }));
  halo.position.y = 0.3;
  crown.add(halo);
  const halo2 = halo.clone();
  halo2.scale.setScalar(0.75);
  crown.add(halo2);
  const crystalLight = lite ? null : new THREE.PointLight(0x7ff2ff, 3, 6, 2);
  if (crystalLight) {
    crystalLight.position.y = 0.3;
    crown.add(crystalLight);
  }
  // Staff is held in his right hand; hand grips at ~45% of its length.
  const STAFF_GRIP = STAFF_LEN * 0.45;
  const staffHand = new THREE.Vector3(-0.98, 1.78, 0.42);

  // ------------------------------------------------------------ locs (verlet strands, instanced)
  const N_LOCS = lite ? 10 : 18;
  const SEGS = lite ? 8 : 12;
  const SEG_LEN = lite ? 0.19 : 0.15;
  const locs = [];
  const headRoots = [];
  for (let i = 0; i < N_LOCS; i++) {
    // spread around the back and sides; keep the face clear
    const u = i / (N_LOCS - 1);
    const theta = THREE.MathUtils.lerp(0.62, Math.PI * 2 - 0.62, u) + Math.PI / 2; // around Y, 0 = +x
    const ring = i % 2 === 0 ? 0.55 : 0.85; // two rows: crown and lower
    const phi = ring; // from top
    const r = 0.33;
    const local = new THREE.Vector3(
      Math.cos(theta) * Math.sin(phi) * r * 0.95,
      Math.cos(phi) * r * 1.08,
      Math.sin(theta) * Math.sin(phi) * r - 0.04, // centred on the back of the head, face stays clear
    );
    headRoots.push(local);
    const pts = [];
    for (let j = 0; j <= SEGS; j++) pts.push({ p: new THREE.Vector3(), q: new THREE.Vector3() });
    locs.push({ pts, len: SEG_LEN * (0.9 + 0.2 * ((i * 37) % 7) / 7) });
  }
  const segCount = N_LOCS * SEGS;
  const segMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1, 1, 7, 1, true), locMat, segCount);
  const knotMesh = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), locMat, N_LOCS * (SEGS + 1));
  const cuffMesh = new THREE.InstancedMesh(new THREE.TorusGeometry(1, 0.28, 6, 14).rotateX(Math.PI / 2), gold, N_LOCS * 2);
  for (const m of [segMesh, knotMesh, cuffMesh]) {
    m.frustumCulled = false;
    m.castShadow = !lite;
    scene.add(m);
  }

  // colliders in body-local space (sphere centers + radii)
  const colliders = [
    { c: new THREE.Vector3(0, 3.0, 0.0), r: 0.38 }, // head
    { c: new THREE.Vector3(0, 2.92, 0.22), r: 0.3 }, // face guard
    { c: new THREE.Vector3(0, 2.25, -0.02), r: 0.52 }, // upper back/chest
    { c: new THREE.Vector3(0.62, 2.32, 0), r: 0.27 },
    { c: new THREE.Vector3(-0.62, 2.32, 0), r: 0.27 },
    { c: new THREE.Vector3(0, 1.8, -0.02), r: 0.46 },
  ];
  const worldColliders = colliders.map((c) => ({ c: new THREE.Vector3(), r: c.r }));
  let locsInit = false;
  const gravity = new THREE.Vector3(0, -9.8, 0);

  function initLocs() {
    root.updateMatrixWorld(true);
    const headCenter = head.getWorldPosition(new THREE.Vector3());
    locs.forEach((loc, i) => {
      const rootPos = head.localToWorld(headRoots[i].clone());
      // leave the scalp outward first (outside the head collider), then hang down behind
      const out = rootPos.clone().sub(headCenter).setY(0).normalize();
      if (!Number.isFinite(out.x)) out.set(0, 0, -1);
      const p = rootPos.clone();
      loc.pts.forEach((pt, j) => {
        if (j > 0) {
          if (j <= 2) p.addScaledVector(out, loc.len * 0.9).y -= loc.len * 0.4;
          else p.addScaledVector(out, loc.len * 0.15).y -= loc.len;
        }
        pt.p.copy(p);
        pt.q.copy(p);
      });
    });
    locsInit = true;
  }

  let simAcc = 0;
  function simulateLocs(dt, t) {
    if (!locsInit) initLocs();
    simAcc = Math.min(simAcc + dt, 4 / 60);
    let steps = 0;
    while (simAcc >= 1 / 60 && steps < 4) {
      simAcc -= 1 / 60;
      steps++;
      stepLocs(1 / 60, t);
    }
    writeLocInstances();
  }

  function stepLocs(step, t) {
    const d2 = step * step;
    const s = root.scale.x;
    for (let k = 0; k < colliders.length; k++) {
      body.localToWorld(worldColliders[k].c.copy(colliders[k].c));
      worldColliders[k].r = colliders[k].r * s;
    }
    const wind = Math.sin(t * 0.7) * 0.6;
    locs.forEach((loc, i) => {
      const pts = loc.pts;
      head.localToWorld(pts[0].p.copy(headRoots[i]));
      pts[0].q.copy(pts[0].p);
      for (let j = 1; j < pts.length; j++) {
        const pt = pts[j];
        tmpV.subVectors(pt.p, pt.q).multiplyScalar(0.965); // velocity with damping
        pt.q.copy(pt.p);
        pt.p.add(tmpV).addScaledVector(gravity, d2 * 0.9);
        pt.p.x += wind * d2 * 0.4 * Math.sin(i * 1.7 + j);
      }
      const segLen = loc.len * s;
      for (let it = 0; it < 4; it++) {
        for (let j = 1; j < pts.length; j++) {
          const a = pts[j - 1].p;
          const b = pts[j].p;
          tmpV.subVectors(b, a);
          const dist = tmpV.length() || 1e-6;
          const diff = (dist - segLen) / dist;
          if (j === 1) b.addScaledVector(tmpV, -diff);
          else {
            a.addScaledVector(tmpV, diff * 0.5);
            b.addScaledVector(tmpV, -diff * 0.5);
          }
        }
        for (let j = 1; j < pts.length; j++) {
          for (const col of worldColliders) {
            tmpV.subVectors(pts[j].p, col.c);
            const dd = tmpV.length();
            const rr = col.r + 0.05 * s;
            if (dd < rr) pts[j].p.copy(col.c).addScaledVector(tmpV.normalize(), rr);
          }
        }
      }
    });
  }

  function writeLocInstances() {
    const s = root.scale.x;
    let si = 0;
    let ki = 0;
    let ci = 0;
    locs.forEach((loc) => {
      const pts = loc.pts;
      for (let j = 0; j < pts.length; j++) {
        const rad = (0.052 - j * 0.0022) * s;
        tmpM.compose(pts[j].p, tmpQ.identity(), tmpS.setScalar(rad));
        knotMesh.setMatrixAt(ki++, tmpM);
        if (j > 0) {
          const a = pts[j - 1].p;
          const b = pts[j].p;
          tmpV.copy(a).lerp(b, 0.5);
          tmpQ.setFromUnitVectors(UP, tmpV2.subVectors(b, a).normalize());
          tmpM.compose(tmpV, tmpQ, tmpS.set(rad, a.distanceTo(b), rad));
          segMesh.setMatrixAt(si++, tmpM);
          if (j === 2 || j === pts.length - 2) {
            tmpM.compose(tmpV, tmpQ, tmpS.set(rad * 1.25, rad * 1.6, rad * 1.25));
            cuffMesh.setMatrixAt(ci++, tmpM);
          }
        }
      }
    });
    segMesh.instanceMatrix.needsUpdate = true;
    knotMesh.instanceMatrix.needsUpdate = true;
    cuffMesh.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------ animation state
  let level = 0; // smoothed speech level 0..1
  let targetLevel = 0;
  let blinkT = 2 + Math.random() * 3;
  let blink = 0;
  let flareT = 0;
  let thinking = false;
  let yaw = 0;
  let yawTarget = 0;
  const lookTarget = new THREE.Vector3();
  const baseY = 3.6;

  function setLevel(v) {
    targetLevel = Math.max(0, Math.min(1, v));
  }

  function update(t, dt, camera, focusPoint) {
    level += (targetLevel - level) * Math.min(1, dt * (targetLevel > level ? 30 : 10));

    // float + breathe
    root.position.y = baseY + Math.sin(t * 1.1) * 0.14;
    const breathe = 1 + Math.sin(t * 1.6) * 0.012 + level * 0.035;
    body.scale.set(breathe, 1 + (breathe - 1) * 0.5, breathe);
    body.rotation.z = Math.sin(t * 0.7) * 0.025;

    // turn toward what he's talking about, otherwise toward the camera
    lookTarget.copy(focusPoint || camera.position);
    root.worldToLocal(tmpV.copy(lookTarget));
    yawTarget = Math.atan2(tmpV.x, tmpV.z) + root.rotation.y * 0; // in root space
    let dy = yawTarget - yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    yaw += dy * Math.min(1, dt * 2.2);
    body.rotation.y = yaw;

    // head follows camera a little more than the body
    head.updateMatrixWorld();
    body.worldToLocal(tmpV.copy(camera.position));
    const hy = Math.atan2(tmpV.x, tmpV.z);
    head.rotation.y = THREE.MathUtils.clamp(hy, -0.6, 0.6) * 0.6;
    head.rotation.x = -0.08 + Math.sin(t * 0.9) * 0.03 - level * 0.05;

    // eyes: look at camera, blink
    blinkT -= dt;
    if (blinkT <= 0) {
      blink = 1;
      blinkT = 2.5 + Math.random() * 3.5;
    }
    blink = Math.max(0, blink - dt * 7);
    const lid = 1 - Math.sin(blink * Math.PI) * 0.92;
    for (const { eye, brow, side } of eyes) {
      head.worldToLocal(tmpV.copy(camera.position));
      tmpV.sub(eye.position);
      eye.rotation.y = THREE.MathUtils.clamp(Math.atan2(tmpV.x, tmpV.z), -0.45, 0.45);
      eye.rotation.x = THREE.MathUtils.clamp(-Math.atan2(tmpV.y, Math.hypot(tmpV.x, tmpV.z)), -0.35, 0.35);
      eye.scale.set(1, lid, 1);
      brow.position.y = 0.2 + level * 0.025 + (thinking ? 0.02 : 0);
      brow.rotation.z = Math.PI / 2 + side * (0.18 + (thinking ? 0.12 : 0));
    }

    // mouth opens with the voice
    const open = 0.012 + level * 0.075;
    mouth.scale.set(0.1 + level * 0.025, open, 0.04);

    // glow
    const glow = 0.12 + level * 0.55 + (thinking ? 0.12 + Math.sin(t * 6) * 0.08 : 0);
    glass.emissiveIntensity = glow;
    coreMat.color.setHSL(0.52, 1, 0.6 + level * 0.3);
    core.scale.setScalar(1 + level * 0.6 + Math.sin(t * 3) * 0.05);
    coreLight.intensity = 1.5 + level * 10;
    flareT = Math.max(0, flareT - dt);
    const flare = Math.sin(Math.min(1, flareT / 1.6) * Math.PI);
    crystalMat.emissiveIntensity = 1.4 + level * 3.5 + flare * 6 + (thinking ? Math.sin(t * 8) * 0.8 + 0.8 : 0);
    if (crystalLight) crystalLight.intensity = 2.5 + level * 8 + flare * 18;
    crystal.rotation.y = t * 0.8;
    halo.rotation.set(Math.PI / 2 + Math.sin(t) * 0.3, t * (1 + level * 4 + flare * 8), 0);
    halo2.rotation.set(Math.PI / 2 + Math.cos(t * 1.3) * 0.4, -t * (1.4 + flare * 8), 0);
    halo.scale.setScalar(1 + flare * 0.6);

    // arms: right grips the staff, left gestures when talking
    rightArm.target.copy(staffHand).add(tmpV.set(0, Math.sin(t * 1.1 + 0.6) * 0.03, 0));
    poseArm(rightArm);
    staff.position.copy(rightArm.target).add(tmpV.set(0, -STAFF_GRIP, 0));
    staff.rotation.set(0.04, 0, 0.06 + Math.sin(t * 0.8) * 0.02);
    staff.position.x += Math.sin(staff.rotation.z) * STAFF_GRIP;

    const g = level;
    leftArm.target.set(
      0.86 - g * 0.12 + Math.sin(t * 2.3) * g * 0.08,
      1.42 + g * 0.5 + Math.sin(t * 3.1) * g * 0.12,
      0.28 + g * 0.32,
    );
    poseArm(leftArm);

    // robe sways from the waist down
    const pos = robeGeo.attributes.position;
    const arr = pos.array;
    for (let i = 0; i < arr.length; i += 3) {
      const x = robeBase[i];
      const y = robeBase[i + 1];
      const z = robeBase[i + 2];
      const w = Math.max(0, 1.3 - y) * 0.06;
      const ang = Math.atan2(z, x);
      const ripple = Math.sin(t * 1.8 + ang * 3 + y * 2.5) * w;
      arr[i] = x * (1 + ripple);
      arr[i + 2] = z * (1 + ripple) + Math.sin(t * 1.1) * w * 0.6;
      arr[i + 1] = y;
    }
    pos.needsUpdate = true;
    robeGeo.computeVertexNormals();

    root.updateMatrixWorld(true);
    simulateLocs(dt, t);
  }

  scene.add(root);

  return {
    root,
    update,
    setLevel,
    flare() {
      flareT = 1.6;
    },
    setThinking(v) {
      thinking = v;
    },
    get level() {
      return level;
    },
  };
}
