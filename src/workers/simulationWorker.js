let count = 5200;
let paused = false;
let time = 0;
let engine = {
  mode: 'tide',
  intensity: 0.82,
};
let orbs = [];
let basePositions;
let positions;
let prevPositions;
let velocities;
let energies;
let states;
let sizes;
let loopHandle = null;
let lastTick = 0;

const MODE_TUNING = {
  still: {
    orbDrift: 0.006,
    orbSpring: 0.0034,
    swirl: 0.05,
    baseReturn: 0.023,
    compression: 0.14,
    damping: 0.86,
    pulseSpeed: 0.45,
    lift: 0.012,
  },
  tide: {
    orbDrift: 0.011,
    orbSpring: 0.0042,
    swirl: 0.085,
    baseReturn: 0.03,
    compression: 0.18,
    damping: 0.84,
    pulseSpeed: 0.7,
    lift: 0.016,
  },
  nova: {
    orbDrift: 0.017,
    orbSpring: 0.0052,
    swirl: 0.13,
    baseReturn: 0.038,
    compression: 0.22,
    damping: 0.81,
    pulseSpeed: 1.05,
    lift: 0.022,
  },
};

function init(payload) {
  count = payload.count ?? count;
  engine = {
    mode: payload.engine?.mode ?? engine.mode,
    intensity: payload.engine?.intensity ?? engine.intensity,
  };
  orbs = (payload.orbs ?? []).map((orb) => ({
    ...orb,
    baseX: orb.x,
    baseY: orb.y,
    vx: 0,
    vy: 0,
    dragging: false,
    frozen: false,
  }));

  buildField();
  lastTick = performance.now();

  if (!loopHandle) {
    loop();
  }
}

function buildField() {
  const rows = 28;
  const columns = Math.ceil(count / rows);
  const width = 13.6;
  const lineHeight = 0.24;
  const xStep = width / columns;
  const top = ((rows - 1) * lineHeight) / 2;

  basePositions = new Float32Array(count * 3);
  positions = new Float32Array(count * 3);
  prevPositions = new Float32Array(count * 3);
  velocities = new Float32Array(count * 3);
  energies = new Float32Array(count);
  states = new Float32Array(count);
  sizes = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const row = index % rows;
    const column = Math.floor(index / rows);
    const offset = index * 3;

    const x = -width / 2 + column * xStep;
    const y = top - row * lineHeight;
    const wave = Math.sin(column * 0.24 + row * 0.68) * 0.015;

    basePositions[offset] = x;
    basePositions[offset + 1] = y + wave;
    basePositions[offset + 2] = 0;

    positions[offset] = x;
    positions[offset + 1] = y + wave;
    positions[offset + 2] = 0;
    prevPositions[offset] = positions[offset];
    prevPositions[offset + 1] = positions[offset + 1];
    prevPositions[offset + 2] = positions[offset + 2];

    sizes[index] = 0.028;
    energies[index] = 0.18;
    states[index] = 0.08;
  }
}

function loop() {
  const now = performance.now();
  const delta = Math.min(0.05, (now - lastTick) / 1000 || 0.016);
  lastTick = now;

  if (!paused) {
    update(delta);
  }

  emitFrame();
  loopHandle = setTimeout(loop, 16);
}

function update(delta) {
  time += delta;
  const tuning = MODE_TUNING[engine.mode] ?? MODE_TUNING.tide;
  const intensity = engine.intensity;
  const frameScale = delta * 60;
  const pulse = Math.sin(time * tuning.pulseSpeed * 2.3) * 0.5 + 0.5;
  const breath = Math.sin(time * tuning.pulseSpeed * 0.85 + 1.2) * 0.5 + 0.5;
  const windX = Math.sin(time * (0.44 + tuning.pulseSpeed * 0.14) + breath * 2.2) * 0.02 * intensity;
  const windY = Math.cos(time * (0.37 + tuning.pulseSpeed * 0.18) + pulse * 1.4) * 0.016 * intensity;

  orbs.forEach((orb, index) => {
    if (orb.dragging || orb.frozen) {
      orb.vx *= 0.55;
      orb.vy *= 0.55;
      return;
    }

    const orbital = index === 1 ? 1.25 : 0.9;
    const driftX = Math.sin(time * (0.42 + index * 0.09) + index * 2.1) * tuning.orbDrift * intensity * orbital;
    const driftY = Math.cos(time * (0.36 + index * 0.07) + index * 1.7) * tuning.orbDrift * intensity * orbital;
    const homeX = (orb.baseX - orb.x) * tuning.orbSpring;
    const homeY = (orb.baseY - orb.y) * tuning.orbSpring;

    orb.vx = (orb.vx + driftX + homeX + windX * 0.12) * 0.985;
    orb.vy = (orb.vy + driftY + homeY + windY * 0.12) * 0.985;
    orb.x += orb.vx * frameScale;
    orb.y += orb.vy * frameScale;
  });

  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    const baseX = basePositions[offset];
    const baseY = basePositions[offset + 1];

    let px = positions[offset];
    let py = positions[offset + 1];
    let vx = velocities[offset];
    let vy = velocities[offset + 1];

    prevPositions[offset] = px;
    prevPositions[offset + 1] = py;
    prevPositions[offset + 2] = 0;

    let state = 0;
    let swirlX = Math.sin(py * 1.18 + time * (0.8 + tuning.pulseSpeed * 0.35) + index * 0.003) * tuning.lift * intensity;
    let swirlY = Math.cos(px * 0.94 - time * (0.62 + tuning.pulseSpeed * 0.25) + index * 0.0024) * tuning.lift * intensity;
    let compression = 0;

    for (let orbIndex = 0; orbIndex < orbs.length; orbIndex += 1) {
      const orb = orbs[orbIndex];
      const dx = px - orb.x;
      const dy = py - orb.y;
      const distSq = dx * dx + dy * dy + 0.0001;
      const dist = Math.sqrt(distSq);
      const influenceRadius = orb.radius * (2.15 + pulse * 0.45 + intensity * 0.2);
      const influence = Math.max(0, 1 - dist / influenceRadius);

      if (influence <= 0) {
        continue;
      }

      const invDist = 1 / Math.max(dist, 0.001);
      const nx = dx * invDist;
      const ny = dy * invDist;
      const tx = -ny;
      const ty = nx;
      const direction = orbIndex % 2 === 0 ? 1 : -1;
      const frozenFactor = orb.frozen ? 0.34 : 1;
      const surge = 1 + pulse * 0.8 + intensity * 0.35;

      swirlX += tx * influence * tuning.swirl * direction * frozenFactor * surge;
      swirlY += ty * influence * tuning.swirl * direction * frozenFactor * surge;
      swirlX += nx * influence * (0.04 + breath * 0.04) * frozenFactor;
      swirlY += ny * influence * (0.04 + breath * 0.04) * frozenFactor;
      compression += influence * tuning.compression;
      state = Math.max(state, influence * (orb.frozen ? 0.78 : 1));
    }

    vx *= tuning.damping;
    vy *= tuning.damping;
    vx += ((baseX - px) * (tuning.baseReturn + compression) + swirlX + windX * 0.7) * frameScale;
    vy += ((baseY - py) * (tuning.baseReturn + compression) + swirlY + windY * 0.7) * frameScale;

    px += vx * 0.12;
    py += vy * 0.12;

    positions[offset] = px;
    positions[offset + 1] = py;
    positions[offset + 2] = 0;
    velocities[offset] = vx;
    velocities[offset + 1] = vy;
    velocities[offset + 2] = 0;

    const speed = Math.min(1.6, Math.hypot(vx, vy) * 0.9);
    energies[index] = energies[index] * 0.88 + (speed + state * 0.28 + pulse * 0.18) * 0.12;
    states[index] = state;
    sizes[index] = 0.022 + state * 0.016 + speed * 0.01 + pulse * 0.004;
  }
}

function emitFrame() {
  postMessage({
    type: 'frame',
    positions: positions.slice(),
    prevPositions: prevPositions.slice(),
    sizes: sizes.slice(),
    states: states.slice(),
    energies: energies.slice(),
    orbs: orbs.map(({ x, y, z, radius, frozen }) => ({ x, y, z, radius, frozen })),
  });
}

self.onmessage = (event) => {
  const { type } = event.data;

  switch (type) {
    case 'init':
      init(event.data);
      break;
    case 'toggle-pause':
      paused = Boolean(event.data.paused);
      break;
    case 'set-engine':
      engine = {
        mode: event.data.engine?.mode ?? engine.mode,
        intensity: event.data.engine?.intensity ?? engine.intensity,
      };
      break;
    case 'set-orb': {
      const orb = orbs[event.data.index];
      if (!orb) {
        return;
      }
      orb.x = event.data.x;
      orb.y = event.data.y;
      orb.dragging = true;
      orb.vx = 0;
      orb.vy = 0;
      break;
    }
    case 'release-orb': {
      const orb = orbs[event.data.index];
      if (!orb) {
        return;
      }
      orb.dragging = false;
      break;
    }
    case 'toggle-orb-stop': {
      const orb = orbs[event.data.index];
      if (!orb) {
        return;
      }
      orb.frozen = !orb.frozen;
      orb.vx = 0;
      orb.vy = 0;
      break;
    }
    case 'reset':
      orbs.forEach((orb) => {
        orb.x = orb.baseX;
        orb.y = orb.baseY;
        orb.vx = 0;
        orb.vy = 0;
        orb.dragging = false;
        orb.frozen = false;
      });
      buildField();
      break;
    default:
      break;
  }
};
