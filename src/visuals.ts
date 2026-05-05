import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { faultProfiles } from './data';
import type { AppState } from './types';

interface SimulationSignals {
  simTime: number;
  omega: number;
  rpmHz: number;
  visualGain: number;
  amp1x: number;
  amp2x: number;
  amp3x: number;
  phase: number;
  radialX: number;
  radialY: number;
  axial: number;
  jitter: number;
}

interface MachineSceneParts {
  machineGroup: THREE.Group;
  motorGroup: THREE.Group;
  pumpGroup: THREE.Group;
  coupling: THREE.Mesh;
  couplingRings: THREE.Mesh[];
  shaftMotor: THREE.Mesh;
  shaftPump: THREE.Mesh;
  shaftStripes: THREE.Mesh[];
  impeller: THREE.Group;
  arrowAxial: THREE.Group;
  arrowRadial: THREE.Group;
  sensorMarkers: THREE.Mesh[];
  sensorProbes: THREE.Group[];
  boltMarkers: THREE.Mesh[];
  orbitTrail: THREE.Line;
  forceVectors: THREE.Group[];
  drivenLabels: Record<string, THREE.Sprite>;
  wireframeObjects: THREE.Mesh[];
}

export interface ThreeController {
  resetCamera(): void;
  toggleWireframe(): void;
  resize(): void;
  destroy(): void;
}

export interface ChartController {
  resize(): void;
  destroy(): void;
}

function createCanvasLabel(text: string, color: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const texture = new THREE.Texture();
    const material = new THREE.SpriteMaterial({ color: 0xffffff });
    return new THREE.Sprite(material);
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(8, 18, 32, 0.76)';
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  roundedRect(ctx, 12, 16, 488, 96, 20);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = 'bold 38px "Space Grotesk"';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 256, 64);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(2.2, 0.55, 1);
  return sprite;
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function resizeRendererToContainer(renderer: THREE.WebGLRenderer, camera: THREE.PerspectiveCamera, container: HTMLElement): void {
  const rect = container.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return;
  }

  const width = Math.floor(rect.width);
  const height = Math.floor(rect.height);
  if (renderer.domElement.width !== width || renderer.domElement.height !== height) {
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
}

function createMaterial(color: number, emissive = 0x000000): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    color,
    emissive,
    metalness: 0.35,
    roughness: 0.55,
  });
}

function buildMachineScene(scene: THREE.Scene): MachineSceneParts {
  const machineGroup = new THREE.Group();
  scene.add(machineGroup);

  const baseMaterial = createMaterial(0x15243a, 0x030b13);
  const motorMaterial = createMaterial(0x5aa7d8, 0x071b2b);
  const pumpMaterial = createMaterial(0x58c6ad, 0x08251f);
  const shaftMaterial = createMaterial(0xd4e4ec, 0x151e25);
  const couplingMaterial = createMaterial(0xe8bc72, 0x241a0a);
  const bearingMaterial = createMaterial(0x8aa0b8, 0x0b111a);
  const impellerMaterial = createMaterial(0x7ad8cf, 0x092b2b);

  const wireframeObjects: THREE.Mesh[] = [];

  const base = new THREE.Mesh(new THREE.BoxGeometry(7.2, 0.22, 2.4), baseMaterial);
  base.position.set(0, 0.1, 0);
  machineGroup.add(base);
  wireframeObjects.push(base);

  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(7.8, 0.08, 2.85),
    new THREE.MeshStandardMaterial({
      color: 0x0c1728,
      emissive: 0x061320,
      transparent: true,
      opacity: 0.78,
      metalness: 0.15,
      roughness: 0.72,
    }),
  );
  plinth.position.set(0, -0.02, 0);
  machineGroup.add(plinth);

  const motorGroup = new THREE.Group();
  motorGroup.position.set(-2.0, 1.05, 0);
  machineGroup.add(motorGroup);

  const motorBody = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.22, 1.22), motorMaterial);
  motorBody.castShadow = true;
  motorGroup.add(motorBody);
  wireframeObjects.push(motorBody);

  const fanCover = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.54, 0.35, 24), motorMaterial);
  fanCover.rotation.z = Math.PI / 2;
  fanCover.position.set(-1.15, 0, 0);
  motorGroup.add(fanCover);
  wireframeObjects.push(fanCover);

  const motorEnd = new THREE.Mesh(new THREE.CylinderGeometry(0.33, 0.39, 0.9, 24), baseMaterial);
  motorEnd.rotation.z = Math.PI / 2;
  motorEnd.position.set(1.1, 0, 0);
  motorGroup.add(motorEnd);
  wireframeObjects.push(motorEnd);

  const motorBearing = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 16), bearingMaterial);
  motorBearing.rotation.z = Math.PI / 2;
  motorBearing.position.set(1.4, 0, 0);
  motorGroup.add(motorBearing);
  wireframeObjects.push(motorBearing);

  const pumpGroup = new THREE.Group();
  pumpGroup.position.set(2.1, 0.98, 0);
  machineGroup.add(pumpGroup);

  const pumpBody = new THREE.Mesh(new THREE.BoxGeometry(1.65, 1.45, 1.45), pumpMaterial);
  pumpBody.castShadow = true;
  pumpGroup.add(pumpBody);
  wireframeObjects.push(pumpBody);

  const volute = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.74, 1.2, 24), pumpMaterial);
  volute.rotation.z = Math.PI / 2;
  volute.position.set(0.25, 0.03, 0);
  pumpGroup.add(volute);
  wireframeObjects.push(volute);

  const discharge = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.45, 12), pumpMaterial);
  discharge.rotation.x = Math.PI / 2;
  discharge.position.set(0.55, 0.72, 0);
  pumpGroup.add(discharge);
  wireframeObjects.push(discharge);

  const pumpBearing = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.28, 16), bearingMaterial);
  pumpBearing.rotation.z = Math.PI / 2;
  pumpBearing.position.set(-0.9, 0, 0);
  pumpGroup.add(pumpBearing);
  wireframeObjects.push(pumpBearing);

  const shaftMotor = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.8, 16), shaftMaterial);
  shaftMotor.rotation.z = Math.PI / 2;
  shaftMotor.position.set(-0.05, 1.05, 0);
  machineGroup.add(shaftMotor);
  wireframeObjects.push(shaftMotor);

  const shaftPump = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 16), shaftMaterial);
  shaftPump.rotation.z = Math.PI / 2;
  shaftPump.position.set(1.85, 1.0, 0);
  machineGroup.add(shaftPump);
  wireframeObjects.push(shaftPump);

  const coupling = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.4, 20), couplingMaterial);
  coupling.rotation.z = Math.PI / 2;
  coupling.position.set(1.0, 1.0, 0);
  machineGroup.add(coupling);
  wireframeObjects.push(coupling);

  const couplingRings = [-0.16, 0.16].map((offset) => {
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.025, 10, 28), couplingMaterial.clone());
    ring.rotation.y = Math.PI / 2;
    ring.position.set(1.0 + offset, 1.0, 0);
    machineGroup.add(ring);
    wireframeObjects.push(ring);
    return ring;
  });

  const stripeMaterial = new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0x26313a, metalness: 0.2, roughness: 0.42 });
  const shaftStripes = [
    new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), stripeMaterial),
    new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.22, 0.035), stripeMaterial.clone()),
  ];
  shaftStripes[0].position.set(-0.05, 1.05, 0.08);
  shaftStripes[1].position.set(1.85, 1.0, 0.08);
  machineGroup.add(...shaftStripes);

  const impeller = new THREE.Group();
  impeller.position.set(-0.95, 0, 0);
  pumpGroup.add(impeller);
  for (let index = 0; index < 12; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.04, 0.3), impellerMaterial);
    blade.rotation.y = (index / 12) * Math.PI * 2;
    blade.position.x = Math.cos((index / 12) * Math.PI * 2) * 0.04;
    blade.position.z = Math.sin((index / 12) * Math.PI * 2) * 0.04;
    impeller.add(blade);
    wireframeObjects.push(blade);
  }

  const arrowAxial = new THREE.Group();
  const arrowAxialStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.1, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x2a0f12 }));
  arrowAxialStem.rotation.z = Math.PI / 2;
  arrowAxialStem.position.set(0, 0, 0);
  arrowAxial.add(arrowAxialStem);
  const arrowAxialHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 12), new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x2a0f12 }));
  arrowAxialHead.rotation.z = -Math.PI / 2;
  arrowAxialHead.position.set(0.62, 0, 0);
  arrowAxial.add(arrowAxialHead);
  arrowAxial.position.set(0.1, 1.9, 0);
  machineGroup.add(arrowAxial);

  const arrowRadial = new THREE.Group();
  const arrowRadialStem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.0, 12), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x102111 }));
  arrowRadialStem.rotation.x = Math.PI / 2;
  arrowRadialStem.position.set(0, 0, 0);
  arrowRadial.add(arrowRadialStem);
  const arrowRadialHead = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.24, 12), new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x102111 }));
  arrowRadialHead.rotation.x = Math.PI / 2;
  arrowRadialHead.position.set(0, 0.62, 0);
  arrowRadial.add(arrowRadialHead);
  arrowRadial.position.set(-3.0, 1.65, 0);
  machineGroup.add(arrowRadial);

  const labelMotor = createCanvasLabel('MOTOR', '#60a5fa');
  labelMotor.position.set(-2.0, 2.72, 0);
  machineGroup.add(labelMotor);

  const labelCoupling = createCanvasLabel('COUPLING', '#f59e0b');
  labelCoupling.position.set(0.7, 2.74, 0);
  machineGroup.add(labelCoupling);

  const drivenLabels: Record<string, THREE.Sprite> = {};
  [
    ['pump', 'PUMP', '#34d399'],
    ['fan', 'FAN', '#22d3ee'],
    ['gearbox', 'GEARBOX', '#f97316'],
    ['compressor', 'COMPRESSOR', '#a7f3d0'],
    ['turbine', 'TURBINE', '#fde68a'],
    ['motor', 'MOTOR ONLY', '#93c5fd'],
  ].forEach(([key, text, color]) => {
    const label = createCanvasLabel(text, color);
    label.position.set(2.55, 2.72, 0);
    label.visible = key === 'pump';
    drivenLabels[key] = label;
    machineGroup.add(label);
  });

  const sensorMaterial = new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x083344, metalness: 0.2, roughness: 0.35 });
  const sensorMarkers = [
    new THREE.Vector3(-0.65, 1.82, 0.78),
    new THREE.Vector3(1.18, 1.76, 0.78),
    new THREE.Vector3(2.0, 1.74, 0.82),
    new THREE.Vector3(2.78, 1.78, 0.82),
  ].map((position, index) => {
    const marker = new THREE.Mesh(new THREE.SphereGeometry(0.11, 18, 18), sensorMaterial.clone());
    marker.position.copy(position);
    marker.userData.point = `B${index + 1}`;
    machineGroup.add(marker);
    return marker;
  });

  const sensorProbes = sensorMarkers.map((marker) => {
    const probe = new THREE.Group();
    const cable = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.52, 8), new THREE.MeshStandardMaterial({ color: 0x9dd7e8, emissive: 0x0c2730 }));
    cable.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.055, 0.16, 12), new THREE.MeshStandardMaterial({ color: 0xa7f3d0, emissive: 0x12382d }));
    tip.rotation.x = -Math.PI / 2;
    tip.position.z = -0.3;
    probe.add(cable, tip);
    probe.position.copy(marker.position);
    probe.position.z += 0.44;
    machineGroup.add(probe);
    return probe;
  });

  const boltMaterial = new THREE.MeshStandardMaterial({ color: 0x9fb4c7, emissive: 0x111827, metalness: 0.55, roughness: 0.36 });
  const boltPositions = [
    [-3.35, 0.28, -0.9],
    [-3.35, 0.28, 0.9],
    [-0.95, 0.28, -0.9],
    [-0.95, 0.28, 0.9],
    [1.35, 0.28, -0.9],
    [1.35, 0.28, 0.9],
    [3.1, 0.28, -0.9],
    [3.1, 0.28, 0.9],
  ] as const;
  const boltMarkers = boltPositions.map(([x, y, z]) => {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.055, 12), boltMaterial.clone());
    bolt.position.set(x, y, z);
    machineGroup.add(bolt);
    wireframeObjects.push(bolt);
    return bolt;
  });

  const orbitTrailGeometry = new THREE.BufferGeometry().setFromPoints(
    Array.from({ length: 72 }, (_, index) => {
      const angle = (index / 72) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(angle) * 0.28, 0, Math.sin(angle) * 0.16);
    }),
  );
  const orbitTrail = new THREE.Line(
    orbitTrailGeometry,
    new THREE.LineBasicMaterial({ color: 0x7dd3fc, transparent: true, opacity: 0.5 }),
  );
  orbitTrail.position.set(-2.0, 1.08, 0);
  machineGroup.add(orbitTrail);

  const forceVectors = [arrowAxial, arrowRadial];

  return {
    machineGroup,
    motorGroup,
    pumpGroup,
    coupling,
    couplingRings,
    shaftMotor,
    shaftPump,
    shaftStripes,
    impeller,
    arrowAxial,
    arrowRadial,
    sensorMarkers,
    sensorProbes,
    boltMarkers,
    orbitTrail,
    forceVectors,
    drivenLabels,
    wireframeObjects,
  };
}

function simulationSpeedValue(state: AppState): number {
  return state.simulationSpeed === 'freeze' ? 0 : Number(state.simulationSpeed || 1);
}

function vibrationGainValue(state: AppState): number {
  switch (state.vibrationGain) {
    case 'low':
      return 0.55;
    case 'high':
      return 1.85;
    default:
      return 1;
  }
}

function orderAmplitude(state: AppState, targetOrder: number): number {
  const fromRows = state.peakRows
    .map((row) => ({
      order: Number.parseFloat(row.order.replace(/x/i, '')),
      amp: Number.parseFloat(row.amp),
    }))
    .find((row) => Number.isFinite(row.order) && Math.abs(row.order - targetOrder) < 0.18 && Number.isFinite(row.amp));

  if (fromRows) {
    return fromRows.amp;
  }

  const profilePeak = faultProfiles[state.faultKey].spectrum.find((peak) => Math.abs(peak.o - targetOrder) < 0.18);
  return profilePeak?.a ?? 0.1;
}

function getSimulationSignals(state: AppState, elapsed: number): SimulationSignals {
  const speed = simulationSpeedValue(state);
  const simTime = elapsed * speed;
  const rpmHz = Math.max(0.1, state.rpm / 60);
  const omega = rpmHz * Math.PI * 2;
  const profile = faultProfiles[state.faultKey];
  const visualGain = vibrationGainValue(state);
  const loadFactor = 0.55 + state.load / 140;
  const amp1x = Math.max(0.02, orderAmplitude(state, 1)) * 0.012 * visualGain * loadFactor;
  const amp2x = Math.max(0.01, orderAmplitude(state, 2)) * 0.009 * visualGain * loadFactor;
  const amp3x = Math.max(0.01, orderAmplitude(state, 3)) * 0.006 * visualGain * loadFactor;
  const phase = profile.phase;
  const radialX = Math.sin(simTime * omega) * amp1x + Math.sin(simTime * omega * 2 + phase) * amp2x;
  const radialY = Math.cos(simTime * omega + phase) * amp1x * 0.78 + Math.cos(simTime * omega * 3) * amp3x;
  const axial = Math.sin(simTime * omega + phase * 0.5) * amp1x * 0.72 + Math.sin(simTime * omega * 2) * amp2x;
  const jitter = (Math.sin(simTime * 37.7) + Math.sin(simTime * 61.3) * 0.6) * 0.007 * visualGain;

  return { simTime, omega, rpmHz, visualGain, amp1x, amp2x, amp3x, phase, radialX, radialY, axial, jitter };
}

function applyRotatingMachineMotion(parts: MachineSceneParts, state: AppState, signals: SimulationSignals): void {
  const rotation = signals.simTime * signals.omega;
  const vaneMultiplier = Math.max(1.2, state.machineContext.vaneCount / 3);

  parts.coupling.rotation.y = rotation;
  parts.couplingRings.forEach((ring, index) => {
    ring.rotation.x = rotation * (index ? -1 : 1);
    ring.rotation.z = Math.PI / 2;
  });
  parts.shaftMotor.rotation.x = rotation;
  parts.shaftPump.rotation.x = rotation;
  parts.impeller.rotation.x = rotation * vaneMultiplier;
  parts.shaftStripes.forEach((stripe, index) => {
    const radius = 0.095;
    const angle = rotation + index * Math.PI;
    stripe.position.y = (index === 0 ? 1.05 : 1.0) + Math.sin(angle) * radius;
    stripe.position.z = Math.cos(angle) * radius;
  });
}

function applyFaultVibration(parts: MachineSceneParts, state: AppState, signals: SimulationSignals): void {
  const profile = faultProfiles[state.faultKey];
  const direction = state.direction;
  const motorBase = { x: -2.0, y: 1.05, z: 0 };
  const pumpBase = { x: 2.1, y: 0.98, z: 0 };
  let motorX = motorBase.x;
  let motorY = motorBase.y;
  let motorZ = motorBase.z;
  let pumpX = pumpBase.x;
  let pumpY = pumpBase.y;
  let pumpZ = pumpBase.z;

  if (direction === 'radial' || direction === 'both') {
    motorX += signals.radialX;
    motorY += signals.radialY;
    pumpX -= signals.radialX * 0.45;
    pumpY += Math.cos(signals.simTime * signals.omega + profile.phase) * signals.amp1x * 0.65;
  }

  if (direction === 'axial' || direction === 'both') {
    motorZ += signals.axial;
    pumpZ -= signals.axial * 0.55;
  }

  parts.motorGroup.rotation.x = 0;
  parts.motorGroup.rotation.z = 0;
  parts.pumpGroup.rotation.x = 0;
  parts.pumpGroup.rotation.z = 0;
  parts.machineGroup.rotation.z = 0;
  parts.machineGroup.position.y = 0.03;
  parts.coupling.rotation.z = 0;
  parts.shaftPump.position.y = 1.0;
  parts.shaftMotor.position.y = 1.05;

  if (state.faultKey === 'unbalance') {
    motorX += Math.sin(signals.simTime * signals.omega) * signals.amp1x * 1.7;
    motorY += Math.cos(signals.simTime * signals.omega) * signals.amp1x * 1.7;
  }

  if (state.faultKey === 'misalignment') {
    motorZ += signals.axial * 1.6;
    pumpZ -= signals.axial * 1.2;
    parts.coupling.rotation.z = Math.sin(signals.simTime * signals.omega) * 0.08;
    parts.couplingRings.forEach((ring, index) => {
      ring.rotation.y = Math.PI / 2 + Math.sin(signals.simTime * signals.omega + index) * 0.12;
    });
    parts.shaftPump.position.y = 1.0 + Math.sin(signals.simTime * signals.omega * 2 + profile.phase) * 0.055 * signals.visualGain;
    parts.shaftMotor.position.y = 1.05 - Math.sin(signals.simTime * signals.omega * 2 + profile.phase) * 0.04 * signals.visualGain;
  }

  if (state.faultKey === 'looseness') {
    const looseness = Math.sin(signals.simTime * signals.omega * 2) * signals.amp2x + Math.sin(signals.simTime * signals.omega * 3) * signals.amp3x;
    parts.machineGroup.rotation.z = looseness * 0.12;
    parts.machineGroup.position.y = 0.03 + Math.abs(looseness) * 0.65 + signals.jitter;
    parts.boltMarkers.forEach((bolt, index) => {
      const material = bolt.material as THREE.MeshStandardMaterial;
      const pulse = Math.abs(Math.sin(signals.simTime * signals.omega * (index % 2 ? 2 : 3)));
      material.emissive.set(pulse > 0.72 ? 0x4a3306 : 0x111827);
      bolt.scale.setScalar(1 + pulse * 0.18 * signals.visualGain);
    });
  }

  if (state.faultKey === 'bearing') {
    const bearingBuzz = Math.sin(signals.simTime * signals.omega * 12) * signals.amp1x * 0.6;
    motorY += bearingBuzz;
    pumpY -= bearingBuzz * 0.55;
  }

  if (state.faultKey === 'cavitation') {
    parts.pumpGroup.rotation.x = signals.jitter * 2.5;
    pumpY += signals.jitter * 1.8;
    parts.impeller.scale.setScalar(1 + Math.abs(signals.jitter) * 2);
  } else {
    parts.impeller.scale.setScalar(1);
  }

  if (state.faultKey === 'electrical') {
    parts.motorGroup.rotation.x = Math.sin(signals.simTime * 120) * 0.012 * signals.visualGain;
    motorY += Math.sin(signals.simTime * 90) * 0.012 * signals.visualGain;
  }

  parts.motorGroup.position.set(motorX, motorY, motorZ);
  parts.pumpGroup.position.set(pumpX, pumpY, pumpZ);
}

export function mountThreeScene(container: HTMLElement, getState: () => AppState): ThreeController {
  if (!container) {
    return {
      resetCamera() {},
      toggleWireframe() {},
      resize() {},
      destroy() {},
    };
  }

  if (!('WebGLRenderingContext' in window)) {
    container.innerHTML = `
      <div class="scene-fallback">
        <div class="scene-fallback__icon">3D</div>
        <div class="scene-fallback__title">WebGL tidak tersedia</div>
        <div class="scene-fallback__text">Periksa dukungan browser atau jalankan mode yang memiliki akselerasi grafis.</div>
      </div>
    `;
    return {
      resetCamera() {},
      toggleWireframe() {},
      resize() {},
      destroy() {},
    };
  }

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x081521);
  scene.fog = new THREE.Fog(0x081521, 10, 24);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.set(5.6, 4.2, 5.8);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.replaceChildren(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.target.set(0.25, 1.15, 0);
  controls.update();

  const ambient = new THREE.AmbientLight(0xe8fbff, 0.78);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xf3ffff, 1.08);
  keyLight.position.set(5, 10, 5);
  keyLight.castShadow = true;
  scene.add(keyLight);

  const rim = new THREE.PointLight(0x7dd3fc, 1.05, 20);
  rim.position.set(-4, 4, -2.5);
  scene.add(rim);

  const glow = new THREE.PointLight(0x6ee7b7, 0.72, 18);
  glow.position.set(4.5, 3, 3.5);
  scene.add(glow);

  const fill = new THREE.PointLight(0xbae6fd, 0.45, 12);
  fill.position.set(0, 3.4, -4);
  scene.add(fill);

  const grid = new THREE.GridHelper(15, 30, 0x244056, 0x142334);
  grid.position.y = 0.01;
  scene.add(grid);

  const floor = new THREE.Mesh(
    new THREE.CircleGeometry(5.2, 64),
    new THREE.MeshBasicMaterial({ color: 0x10263a, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.025;
  scene.add(floor);

  const parts = buildMachineScene(scene);
  parts.machineGroup.scale.setScalar(1.18);
  parts.machineGroup.position.y = 0.03;

  let wireframe = false;
  let raf = 0;
  const clock = new THREE.Clock();

  function applyWireframe(value: boolean): void {
    parts.wireframeObjects.forEach((mesh) => {
      const material = mesh.material;
      if (Array.isArray(material)) {
        material.forEach((mat) => {
          if ('wireframe' in mat) {
            mat.wireframe = value;
          }
        });
      } else if ('wireframe' in material) {
        material.wireframe = value;
      }
    });
  }

  function resetCamera(): void {
    camera.position.set(5.6, 4.2, 5.8);
    controls.target.set(0.25, 1.15, 0);
    controls.update();
  }

  function toggleWireframe(): void {
    wireframe = !wireframe;
    applyWireframe(wireframe);
  }

  function resize(): void {
    resizeRendererToContainer(renderer, camera, container);
  }

  function applyMotion(state: AppState, elapsed: number): void {
    const signals = getSimulationSignals(state, elapsed);
    const context = state.machineContext;
    const syncWave = Math.sin(signals.simTime * signals.omega);
    const drivenVisible = context.machineType !== 'motor' || context.drivenComponent !== 'motor';

    parts.machineGroup.rotation.y = Math.sin(signals.simTime * 0.12) * 0.08;

    parts.pumpGroup.visible = drivenVisible;
    parts.coupling.visible = drivenVisible && context.couplingType !== 'belt';
    parts.couplingRings.forEach((ring) => {
      ring.visible = parts.coupling.visible;
    });
    parts.shaftPump.visible = drivenVisible;
    parts.shaftStripes[1].visible = drivenVisible;
    Object.entries(parts.drivenLabels).forEach(([key, label]) => {
      label.visible = drivenVisible ? key === context.drivenComponent : key === 'motor';
    });

    if (context.drivenComponent === 'fan') {
      parts.pumpGroup.scale.set(1.22, 0.82, 1.22);
    } else if (context.drivenComponent === 'gearbox') {
      parts.pumpGroup.scale.set(1.05, 0.92, 0.86);
    } else if (context.drivenComponent === 'compressor') {
      parts.pumpGroup.scale.set(1.35, 0.9, 0.92);
    } else if (context.drivenComponent === 'turbine') {
      parts.pumpGroup.scale.set(1.28, 0.82, 0.82);
    } else {
      parts.pumpGroup.scale.set(1, 1, 1);
    }

    applyRotatingMachineMotion(parts, state, signals);
    applyFaultVibration(parts, state, signals);

    parts.orbitTrail.visible = state.showOrbit;
    parts.orbitTrail.position.set(parts.motorGroup.position.x, parts.motorGroup.position.y, parts.motorGroup.position.z);
    parts.orbitTrail.scale.set(1 + signals.amp1x * 8, 1, 1 + signals.amp2x * 8);

    parts.forceVectors.forEach((vector) => {
      vector.visible = state.showVectors;
    });
    parts.arrowAxial.visible = state.showVectors && (state.direction === 'axial' || state.direction === 'both');
    parts.arrowRadial.visible = state.showVectors && (state.direction === 'radial' || state.direction === 'both');
    parts.arrowAxial.scale.setScalar(1 + Math.abs(syncWave) * 0.16);
    parts.arrowRadial.scale.setScalar(1 + Math.abs(syncWave) * 0.16);

    parts.sensorMarkers.forEach((marker, index) => {
      const active = marker.userData.point === context.measurementPoint;
      const material = marker.material as THREE.MeshStandardMaterial;
      const bearingBuzz = state.faultKey === 'bearing' && active ? Math.abs(Math.sin(signals.simTime * signals.omega * 10)) : Math.abs(syncWave);
      marker.visible = state.showSensors && Number(marker.userData.point.slice(1)) <= context.bearingCount;
      parts.sensorProbes[index].visible = marker.visible;
      marker.scale.setScalar(active ? 1.45 + bearingBuzz * 0.55 : 0.95);
      material.color.set(active ? 0xfacc15 : 0x38bdf8);
      material.emissive.set(active ? 0x4a2d05 : 0x083344);
    });
  }

  function animate(): void {
    raf = window.requestAnimationFrame(animate);
    const elapsed = clock.getElapsedTime();
    const state = getState();
    applyMotion(state, elapsed);
    controls.update();
    renderer.render(scene, camera);
  }

  resize();
  animate();

  const observer = new ResizeObserver(() => resize());
  observer.observe(container);
  window.addEventListener('resize', resize);

  return {
    resetCamera,
    toggleWireframe,
    resize,
    destroy() {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
      controls.dispose();
      renderer.dispose();
      container.innerHTML = '';
    },
  };
}

function resizeCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const parent = canvas.parentElement;
  if (!parent) {
    return null;
  }

  const rect = parent.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return null;
  }

  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.floor(rect.width * ratio);
  const height = Math.floor(rect.height * ratio);

  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext('2d');
  if (!ctx) {
    return null;
  }

  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  return ctx;
}

function setupChartCanvas(canvas: HTMLCanvasElement): CanvasRenderingContext2D | null {
  const ctx = resizeCanvas(canvas);
  if (!ctx) {
    return null;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  return ctx;
}

function drawGrid(ctx: CanvasRenderingContext2D, width: number, height: number, columns: number, rows: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.12)';
  ctx.lineWidth = 1;
  for (let i = 0; i <= columns; i += 1) {
    const x = (width / columns) * i;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let i = 0; i <= rows; i += 1) {
    const y = (height / rows) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();
}

function chartSize(ctx: CanvasRenderingContext2D): { width: number; height: number } {
  const canvas = ctx.canvas;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  return {
    width: canvas.width / ratio,
    height: canvas.height / ratio,
  };
}

function drawWaveform(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { width, height } = chartSize(ctx);
  const profile = faultProfiles[state.faultKey];
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 8, 6);

  const centerY = height / 2;
  const amplitude = Math.max(0.2, profile.spectrum[0]?.a ?? 0.2) * 0.16 * (0.5 + state.load / 100);
  const frequency = state.rpm / 60;

  ctx.save();
  ctx.strokeStyle = '#67e8f9';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#67e8f9';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  for (let x = 0; x < width; x += 1) {
    const t = (x / width) * 4 / frequency + performance.now() / 1000 * 0.55;
    let y = Math.sin(Math.PI * 2 * frequency * t) * amplitude;

    if (state.faultKey === 'looseness') {
      y += 0.45 * Math.sin(Math.PI * 4 * frequency * t);
    }
    if (state.faultKey === 'cavitation') {
      y += 0.15 * Math.sin(t * 160) + 0.08 * Math.sin(t * 280);
    }
    if (state.faultKey === 'electrical') {
      y += 0.22 * Math.sin(Math.PI * 2 * 2 * frequency * t);
    }

    const drawY = centerY - y * (height * 0.7);
    if (x === 0) {
      ctx.moveTo(x, drawY);
    } else {
      ctx.lineTo(x, drawY);
    }
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(226, 232, 240, 0.75)';
  ctx.font = '12px "IBM Plex Mono"';
  ctx.fillText(`${state.faultKey.toUpperCase()} waveform`, 12, 18);
  ctx.restore();
}

function drawFFT(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { width, height } = chartSize(ctx);
  const profile = faultProfiles[state.faultKey];
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 10, 5);

  const peaks = profile.spectrum;
  const maxAmp = Math.max(...peaks.map((peak) => peak.a), 1);
  const barWidth = Math.max(16, (width - 48) / 10);
  const rpmHz = state.rpm / 60;

  ctx.save();
  ctx.font = '12px "IBM Plex Mono"';
  peaks.forEach((peak, index) => {
    const x = 18 + index * (barWidth + 14);
    const barHeight = (peak.a / maxAmp) * (height * 0.68);
    const y = height - 24 - barHeight;
    const gradient = ctx.createLinearGradient(0, y, 0, height - 24);
    gradient.addColorStop(0, peak.a > maxAmp * 0.8 ? '#a855f7' : '#60a5fa');
    gradient.addColorStop(1, peak.a > maxAmp * 0.8 ? '#22c55e' : '#2563eb');
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, barWidth, barHeight);
    ctx.fillStyle = 'rgba(226, 232, 240, 0.88)';
    const label = peak.label ?? `${peak.o.toFixed(1)}X`;
    ctx.fillText(label, x, height - 8);
    ctx.fillStyle = 'rgba(148, 163, 184, 0.78)';
    ctx.fillText(`${Math.round(peak.o * rpmHz)}Hz`, x, y - 6);
  });
  ctx.restore();
}

function drawPhase(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { width, height } = chartSize(ctx);
  const profile = faultProfiles[state.faultKey];
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 6, 6);

  const radius = Math.min(width, height) * 0.32;
  const centerX = width * 0.5;
  const centerY = height * 0.52;

  ctx.save();
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.3)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  const phaseA = 0;
  const phaseB = profile.phase + Math.sin(performance.now() / 1000) * (state.faultKey === 'looseness' ? 0.5 : 0.08);

  const drawPoint = (phase: number, color: string, label: string): void => {
    const x = centerX + Math.cos(phase) * radius;
    const y = centerY + Math.sin(phase) * radius;
    ctx.save();
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(226, 232, 240, 0.9)';
    ctx.font = '12px "Space Grotesk"';
    ctx.fillText(label, x + 10, y - 8);
    ctx.restore();
  };

  drawPoint(phaseA, '#67e8f9', 'A');
  drawPoint(phaseB, '#f59e0b', 'B');

  ctx.save();
  ctx.strokeStyle = 'rgba(103, 232, 249, 0.7)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(centerX + Math.cos(phaseA) * radius, centerY + Math.sin(phaseA) * radius);
  ctx.lineTo(centerX + Math.cos(phaseB) * radius, centerY + Math.sin(phaseB) * radius);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(148, 163, 184, 0.85)';
  ctx.font = '12px "IBM Plex Mono"';
  const degrees = ((phaseB * 180) / Math.PI + 360) % 360;
  ctx.fillText(`${degrees.toFixed(1)} deg`, 12, 18);
  ctx.restore();
}

function drawOrbit(ctx: CanvasRenderingContext2D, state: AppState): void {
  const { width, height } = chartSize(ctx);
  const profile = faultProfiles[state.faultKey];
  ctx.clearRect(0, 0, width, height);
  drawGrid(ctx, width, height, 6, 6);

  const centerX = width / 2;
  const centerY = height / 2;
  const scale = Math.min(width, height) * 0.06;
  const ampH = (profile.spectrum[0]?.a ?? 0.2) * scale * (0.8 + state.load / 200);
  const ampV = (state.direction === 'axial' || state.direction === 'both' ? 1.45 : 0.85) * ampH;

  ctx.save();
  ctx.strokeStyle = 'rgba(34, 197, 94, 0.85)';
  ctx.lineWidth = 2.5;
  ctx.shadowColor = '#22c55e';
  ctx.shadowBlur = 6;
  ctx.beginPath();
  for (let i = 0; i <= 360; i += 1) {
    const angle = (i * Math.PI) / 180;
    const t = performance.now() / 1000 + angle / (Math.PI * 2);
    let x = ampH * Math.sin(Math.PI * 2 * t);
    let y = ampV * Math.sin(Math.PI * 2 * t + profile.phase);

    if (state.faultKey === 'looseness') {
      x += 0.35 * ampH * Math.sin(Math.PI * 6 * t);
      y += 0.2 * ampV * Math.cos(Math.PI * 5 * t);
    }
    if (state.faultKey === 'bearing') {
      x += 0.1 * ampH * Math.sin(Math.PI * 18 * t);
      y += 0.08 * ampV * Math.sin(Math.PI * 17 * t);
    }

    const px = centerX + x;
    const py = centerY - y;
    if (i === 0) {
      ctx.moveTo(px, py);
    } else {
      ctx.lineTo(px, py);
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function mountChartPack(cases: {
  waveCanvas: HTMLCanvasElement;
  fftCanvas: HTMLCanvasElement;
  phaseCanvas: HTMLCanvasElement;
  orbitCanvas: HTMLCanvasElement;
}, getState: () => AppState): ChartController {
  const waveCtx = cases.waveCanvas.getContext('2d');
  const fftCtx = cases.fftCanvas.getContext('2d');
  const phaseCtx = cases.phaseCanvas.getContext('2d');
  const orbitCtx = cases.orbitCanvas.getContext('2d');

  let raf = 0;
  const observer = new ResizeObserver(() => resize());
  observer.observe(cases.waveCanvas.parentElement ?? cases.waveCanvas);
  observer.observe(cases.fftCanvas.parentElement ?? cases.fftCanvas);
  observer.observe(cases.phaseCanvas.parentElement ?? cases.phaseCanvas);
  observer.observe(cases.orbitCanvas.parentElement ?? cases.orbitCanvas);

  function resize(): void {
    [cases.waveCanvas, cases.fftCanvas, cases.phaseCanvas, cases.orbitCanvas].forEach((canvas) => {
      resizeCanvas(canvas);
    });
  }

  function draw(): void {
    raf = window.requestAnimationFrame(draw);
    const state = getState();
    if (waveCtx) {
      drawWaveform(waveCtx, state);
    }
    if (fftCtx) {
      drawFFT(fftCtx, state);
    }
    if (phaseCtx) {
      drawPhase(phaseCtx, state);
    }
    if (orbitCtx) {
      drawOrbit(orbitCtx, state);
    }
  }

  resize();
  draw();

  window.addEventListener('resize', resize);

  return {
    resize,
    destroy() {
      window.cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener('resize', resize);
    },
  };
}
