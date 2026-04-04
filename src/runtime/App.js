import * as THREE from 'three';
import { gsap } from 'gsap';
import { prepareWithSegments, layoutNextLine } from '@chenglou/pretext';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { createGlyphAtlas } from './sdfAtlas.js';
import { particleFragmentShader, particleVertexShader } from './shaders.js';
import { chromaticAberrationShader, filmGrainShader } from './postFX.js';

const PARTICLE_COUNT = 5200;
const FALLBACK_TEXT = 'You are allowed to become slowly. Not every transition arrives as a breakthrough; sometimes it looks like staying in motion long enough for uncertainty to turn into form, for the noisy parts of the story to soften, and for the next version of you to appear through repetition, patience, and one more deliberate step. What feels unfinished is often only early. The shape keeps changing because it is still listening, still gathering signal, still deciding which fragments deserve to become structure and which should remain atmosphere.';
const DEFAULT_ORBS = [
  { x: -2.7, y: 1.4, z: 0, radius: 1.08 },
  { x: 0.55, y: -0.15, z: 0, radius: 1.42 },
  { x: 2.9, y: 1.1, z: 0, radius: 0.92 },
];
const TEXT_FONT = '500 24px Manrope';
const TEXT_LINE_HEIGHT = 30;
const EDITORIAL_SNIPPETS = [
  'You are allowed to become slowly. Not every transition arrives as a breakthrough; sometimes it looks like staying in motion long enough for uncertainty to turn into form, for the noisy parts of the story to soften, and for the next version of you to appear through repetition, patience, and one more deliberate step.',
  'What looked unfinished was often just early. The shape kept changing because it was still listening, still gathering signal, still deciding which fragments deserved to become structure and which ones should remain only atmosphere.',
  'Some futures do not announce themselves. They gather at the edges first, in habits, in returns, in the way attention keeps circling the same need until the body finally understands that desire is also a map.',
  'Momentum rarely feels cinematic from the inside. It feels like revision, restraint, and a thousand tiny corrections that slowly align until the room changes temperature and the old version of the story cannot hold anymore.',
];

const SCENE_MODES = {
  still: {
    label: 'Still',
    heading: 'quiet proof',
    subheading: 'Soft drift, wider breathing, slow editorial movement.',
    pulseSpeed: 0.36,
    lineBend: 3,
    lineDrift: 6,
    bloom: 0.12,
    chroma: 0.0004,
    grain: 0.03,
    camera: 0.55,
    orbExpand: 18,
  },
  tide: {
    label: 'Tide',
    heading: 'signal in motion',
    subheading: 'Balanced flow with a living center of gravity.',
    pulseSpeed: 0.68,
    lineBend: 8,
    lineDrift: 12,
    bloom: 0.18,
    chroma: 0.0008,
    grain: 0.04,
    camera: 0.85,
    orbExpand: 28,
  },
  nova: {
    label: 'Nova',
    heading: 'after the drift',
    subheading: 'Brighter surges, stronger displacement, cinematic tension.',
    pulseSpeed: 1.04,
    lineBend: 13,
    lineDrift: 22,
    bloom: 0.26,
    chroma: 0.0014,
    grain: 0.05,
    camera: 1.12,
    orbExpand: 38,
  },
};

const THEMES = {
  light: {
    scene: '#f2ede4',
    glowA: [0.93, 0.91, 0.87],
    glowB: [0.99, 0.97, 0.95],
    text: '#17181c',
    mutedText: 'rgba(23, 24, 28, 0.34)',
    accentText: 'rgba(23, 24, 28, 0.55)',
    colorA: '#18191d',
    colorB: '#465067',
    colorC: '#fcf7ef',
    colorD: '#c67f43',
    orbPrimary: '#17181c',
    orbSecondary: '#2b2f39',
    orbTint: '#4f5768',
    frozen: '#7f90a8',
    divider: 'rgba(23, 24, 28, 0.12)',
    veilA: 'rgba(234, 160, 96, 0.12)',
    veilB: 'rgba(115, 138, 214, 0.1)',
    aura: 'rgba(255, 248, 234, 0.18)',
    themeEmoji: '\uD83C\uDF19',
  },
  dark: {
    scene: '#0d1119',
    glowA: [0.08, 0.1, 0.14],
    glowB: [0.12, 0.15, 0.2],
    text: '#eef2ff',
    mutedText: 'rgba(238, 242, 255, 0.12)',
    accentText: 'rgba(238, 242, 255, 0.52)',
    colorA: '#eef2ff',
    colorB: '#8ca3d9',
    colorC: '#18212c',
    colorD: '#f0b37a',
    orbPrimary: '#eef2ff',
    orbSecondary: '#d3ddf7',
    orbTint: '#96a9d8',
    frozen: '#f0b37a',
    divider: 'rgba(238, 242, 255, 0.1)',
    veilA: 'rgba(239, 176, 112, 0.11)',
    veilB: 'rgba(127, 162, 255, 0.1)',
    aura: 'rgba(193, 214, 255, 0.12)',
    themeEmoji: '\u2600\uFE0F',
  },
};

export class App {
  constructor(container, ui) {
    this.container = container;
    this.ui = ui;
    this.text = sanitizeText(ui.textInput.value || FALLBACK_TEXT);
    this.worker = null;
    this.latestFrame = null;
    this.clock = new THREE.Clock();
    this.theme = 'dark';
    this.sceneMode = ui.sceneMode?.value || 'tide';
    this.engineIntensity = Number(ui.engineIntensity?.value || 0.82);
    this.engineSignals = getEngineSignals(0, this.sceneMode, this.engineIntensity);
    this.pressedOrbIndex = -1;
    this.draggingOrbIndex = -1;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.dragPoint = new THREE.Vector3();
    this.downPoint = new THREE.Vector2();
    this.cameraOffset = { x: 0, y: 0, zoom: 0 };
  }

  async init() {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    this.createRenderer();
    this.createTextOverlay();
    this.createScene();
    this.prepareTextLayout(this.text);
    this.createParticleSystem(this.text);
    this.createOrbs();
    this.createComposer();
    this.bindUi();
    this.createWorker();
    this.createCameraMotion();
    this.applyTheme();
    this.setStatus(SCENE_MODES[this.sceneMode].subheading);
    this.animate();
  }

  createRenderer() {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(THEMES.light.scene);

    const aspect = window.innerWidth / window.innerHeight;
    this.frustumHeight = 8.6;
    this.camera = new THREE.OrthographicCamera(
      (-this.frustumHeight * aspect) / 2,
      (this.frustumHeight * aspect) / 2,
      this.frustumHeight / 2,
      -this.frustumHeight / 2,
      0.1,
      20,
    );
    this.camera.position.set(0, 0, 8);
    this.camera.lookAt(0, 0, 0);

    window.addEventListener('resize', this.handleResize);
  }

  createTextOverlay() {
    this.textCanvas = document.createElement('canvas');
    this.textCanvas.className = 'editorial-canvas';
    this.container.appendChild(this.textCanvas);
    this.textContext = this.textCanvas.getContext('2d');
    this.resizeTextCanvas();
  }

  createScene() {
    this.particleGroup = new THREE.Group();
    this.scene.add(this.particleGroup);

    const glowGeometry = new THREE.PlaneGeometry(18, 12);
    const glowMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uColorA: { value: new THREE.Vector3(...THEMES.light.glowA) },
        uColorB: { value: new THREE.Vector3(...THEMES.light.glowB) },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime;
        uniform vec3 uColorA;
        uniform vec3 uColorB;
        varying vec2 vUv;
        void main() {
          vec2 centered = vUv - 0.5;
          float radial = length(centered * vec2(1.0, 0.82));
          float halo = smoothstep(0.9, 0.06, radial);
          float ripple = sin((centered.x - centered.y) * 9.0 + uTime * 0.45) * 0.5 + 0.5;
          float swirl = sin(radial * 14.0 - uTime * 0.75) * 0.5 + 0.5;
          vec3 color = mix(uColorA, uColorB, ripple * 0.18 + swirl * 0.14);
          color += uColorB * pow(1.0 - radial, 3.2) * 0.08;
          gl_FragColor = vec4(color, halo * (0.78 + swirl * 0.06));
        }
      `,
    });

    this.backgroundPlane = new THREE.Mesh(glowGeometry, glowMaterial);
    this.backgroundPlane.position.z = -2;
    this.scene.add(this.backgroundPlane);
  }

  prepareTextLayout(text) {
    this.text = sanitizeText(text);
    this.preparedText = prepareWithSegments(this.text, TEXT_FONT, { whiteSpace: 'normal' });
  }

  createParticleSystem(text) {
    if (this.particleMesh) {
      this.particleGroup.remove(this.particleMesh);
      this.particleMesh.geometry.dispose();
      this.particleMaterial.dispose();
      this.glyphAtlas.texture.dispose();
    }

    const glyphSequence = buildGlyphSequence(text, PARTICLE_COUNT);
    this.glyphAtlas = createGlyphAtlas(uniqueCharacters(glyphSequence));

    const baseGeometry = new THREE.PlaneGeometry(1, 1);
    const geometry = new THREE.InstancedBufferGeometry().copy(baseGeometry);
    geometry.instanceCount = PARTICLE_COUNT;
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 24);

    this.instancePositionAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3);
    this.instancePositionAttr.setUsage(THREE.DynamicDrawUsage);
    this.instancePrevPositionAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_COUNT * 3), 3);
    this.instancePrevPositionAttr.setUsage(THREE.DynamicDrawUsage);
    this.instanceGlyphUvAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_COUNT * 4), 4);
    this.instanceDataAttr = new THREE.InstancedBufferAttribute(new Float32Array(PARTICLE_COUNT * 4), 4);
    this.instanceDataAttr.setUsage(THREE.DynamicDrawUsage);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const character = glyphSequence[index];
      const rect = this.glyphAtlas.rects.get(character) ?? this.glyphAtlas.rects.get(' ');
      const offset = index * 4;
      this.instanceGlyphUvAttr.array[offset] = rect.x;
      this.instanceGlyphUvAttr.array[offset + 1] = rect.y;
      this.instanceGlyphUvAttr.array[offset + 2] = rect.z;
      this.instanceGlyphUvAttr.array[offset + 3] = rect.w;
      this.instanceDataAttr.array[offset + 3] = pseudoRandom(index);
    }

    geometry.setAttribute('instancePosition', this.instancePositionAttr);
    geometry.setAttribute('instancePrevPosition', this.instancePrevPositionAttr);
    geometry.setAttribute('instanceGlyphUv', this.instanceGlyphUvAttr);
    geometry.setAttribute('instanceData', this.instanceDataAttr);

    this.particleMaterial = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      extensions: { derivatives: true },
      blending: THREE.NormalBlending,
      uniforms: {
        uGlyphAtlas: { value: this.glyphAtlas.texture },
        uTime: { value: 0 },
        uNoiseStrength: { value: 0.22 },
        uAudioBass: { value: 0.05 },
        uAudioMid: { value: 0.07 },
        uAudioHigh: { value: 0.03 },
        uVideoMotion: { value: 0.18 },
        uVideoBrightness: { value: 0.12 },
        uMorphPulse: { value: 0.34 },
        uColorA: { value: new THREE.Color(THEMES.light.colorA) },
        uColorB: { value: new THREE.Color(THEMES.light.colorB) },
        uColorC: { value: new THREE.Color(THEMES.light.colorC) },
        uColorD: { value: new THREE.Color(THEMES.light.colorD) },
      },
      vertexShader: particleVertexShader,
      fragmentShader: particleFragmentShader,
    });

    this.particleMesh = new THREE.Mesh(geometry, this.particleMaterial);
    this.particleMesh.frustumCulled = false;
    this.particleGroup.add(this.particleMesh);
  }

  createOrbs() {
    this.orbMeshes = [];
    this.orbGroup = new THREE.Group();
    this.scene.add(this.orbGroup);

    const sphereGeometry = new THREE.SphereGeometry(0.32, 48, 48);
    const haloGeometry = new THREE.CircleGeometry(1, 96);

    DEFAULT_ORBS.forEach((orb, index) => {
      const sphereMaterial = new THREE.MeshBasicMaterial({
        color: index === 1 ? THEMES.light.orbPrimary : THEMES.light.orbSecondary,
      });
      const haloMaterial = new THREE.ShaderMaterial({
        transparent: true,
        depthWrite: false,
        uniforms: {
          uInk: { value: new THREE.Color(index === 1 ? THEMES.light.orbPrimary : THEMES.light.orbTint) },
          uFrozen: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec2 vUv;
          void main() {
            vUv = uv;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uInk;
          uniform float uFrozen;
          varying vec2 vUv;
          void main() {
            vec2 centered = (vUv - 0.5) * 2.0;
            float dist = length(centered);
            if (dist > 1.0) discard;
            float glow = smoothstep(1.0, 0.0, dist);
            float alpha = pow(glow, 1.8) * mix(0.18, 0.28, uFrozen);
            vec3 frozenTint = mix(vec3(1.0), vec3(0.75, 0.84, 0.96), uFrozen);
            vec3 color = mix(vec3(1.0), uInk * frozenTint, pow(glow, 0.72));
            gl_FragColor = vec4(color, alpha);
          }
        `,
      });

      const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
      sphere.position.set(orb.x, orb.y, orb.z + 0.1);
      sphere.userData.orbIndex = index;

      const halo = new THREE.Mesh(haloGeometry, haloMaterial);
      halo.position.copy(sphere.position);
      halo.scale.setScalar(orb.radius * 1.95);

      this.orbGroup.add(halo);
      this.orbGroup.add(sphere);
      this.orbMeshes.push({ sphere, halo, sphereMaterial, haloMaterial });
    });

    gsap.from(this.orbGroup.scale, {
      duration: 1.3,
      x: 0.92,
      y: 0.92,
      z: 0.92,
      ease: 'power2.out',
    });
  }

  createComposer() {
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));

    this.bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.18, 0.5, 0.85);
    this.composer.addPass(this.bloomPass);

    this.chromaticPass = new ShaderPass(chromaticAberrationShader);
    this.chromaticPass.uniforms.uOffset.value = 0.0008;
    this.composer.addPass(this.chromaticPass);

    this.filmPass = new ShaderPass(filmGrainShader);
    this.filmPass.uniforms.uIntensity.value = 0.045;
    this.composer.addPass(this.filmPass);
  }

  bindUi() {
    this.ui.textSubmit.addEventListener('click', () => {
      this.updateText(this.ui.textInput.value);
    });

    this.ui.textInput.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        this.updateText(this.ui.textInput.value);
      }
    });

    this.ui.shuffleButton.addEventListener('click', () => {
      const next = pickSnippet(this.text);
      this.ui.textInput.value = next;
      this.updateText(next);
      this.setStatus('Copy remixed');
    });

    this.ui.resetButton.addEventListener('click', () => {
      this.worker?.postMessage({ type: 'reset' });
      this.setStatus('Field reset');
    });

    this.ui.sceneMode.addEventListener('change', () => {
      this.sceneMode = this.ui.sceneMode.value;
      this.syncEngine();
      this.setStatus(SCENE_MODES[this.sceneMode].subheading);
    });

    this.ui.engineIntensity.addEventListener('input', () => {
      this.engineIntensity = Number(this.ui.engineIntensity.value || 0.82);
      this.syncEngine();
      this.setStatus(`Intensity ${Math.round(this.engineIntensity * 100)}%`);
    });

    this.ui.themeToggle.addEventListener('click', () => {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
      this.applyTheme();
    });

    this.ui.adminToggle.addEventListener('click', () => {
      this.ui.adminPanel.classList.toggle('is-hidden');
    });

    this.ui.adminClose.addEventListener('click', () => {
      this.ui.adminPanel.classList.add('is-hidden');
    });

    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  createWorker() {
    this.worker = new Worker(new URL('../workers/simulationWorker.js', import.meta.url), { type: 'module' });
    this.worker.addEventListener('message', this.handleWorkerMessage);
    this.worker.addEventListener('error', (error) => {
      console.error('Orb field worker failed:', error);
      this.setStatus('Worker failed');
    });
    this.worker.postMessage({
      type: 'init',
      count: PARTICLE_COUNT,
      orbs: DEFAULT_ORBS,
      engine: { mode: this.sceneMode, intensity: this.engineIntensity },
    });
  }

  createCameraMotion() {
    gsap.timeline({ repeat: -1, yoyo: true })
      .to(this.cameraOffset, { x: 0.18, y: -0.1, zoom: 0.02, duration: 7.2, ease: 'sine.inOut' })
      .to(this.cameraOffset, { x: -0.15, y: 0.14, zoom: -0.03, duration: 8.4, ease: 'sine.inOut' })
      .to(this.cameraOffset, { x: 0.08, y: 0.08, zoom: 0.01, duration: 6.2, ease: 'sine.inOut' });
  }

  syncEngine() {
    this.engineSignals = getEngineSignals(this.clock.getElapsedTime(), this.sceneMode, this.engineIntensity);
    this.worker?.postMessage({
      type: 'set-engine',
      engine: { mode: this.sceneMode, intensity: this.engineIntensity },
    });
  }

  applyTheme() {
    const palette = THEMES[this.theme];
    document.body.classList.toggle('theme-dark', this.theme === 'dark');
    this.ui.themeToggle.textContent = palette.themeEmoji;
    this.scene.background = new THREE.Color(palette.scene);
    this.backgroundPlane.material.uniforms.uColorA.value.set(...palette.glowA);
    this.backgroundPlane.material.uniforms.uColorB.value.set(...palette.glowB);
    this.particleMaterial.uniforms.uColorA.value.set(palette.colorA);
    this.particleMaterial.uniforms.uColorB.value.set(palette.colorB);
    this.particleMaterial.uniforms.uColorC.value.set(palette.colorC);
    this.particleMaterial.uniforms.uColorD.value.set(palette.colorD);

    this.orbMeshes.forEach((entry, index) => {
      entry.sphereMaterial.color.set(index === 1 ? palette.orbPrimary : palette.orbSecondary);
      entry.haloMaterial.uniforms.uInk.value.set(index === 1 ? palette.orbPrimary : palette.orbTint);
    });
  }

  animate = () => {
    requestAnimationFrame(this.animate);
    const elapsed = this.clock.getElapsedTime();
    const mode = SCENE_MODES[this.sceneMode];
    this.engineSignals = getEngineSignals(elapsed, this.sceneMode, this.engineIntensity);

    this.backgroundPlane.material.uniforms.uTime.value = elapsed;
    this.particleMaterial.uniforms.uTime.value = elapsed;
    this.particleMaterial.uniforms.uNoiseStrength.value = 0.16 + this.engineIntensity * 0.08 + this.engineSignals.pulse * 0.04;
    this.particleMaterial.uniforms.uMorphPulse.value = 0.18 + this.engineSignals.pulse * 0.34;
    this.particleMaterial.uniforms.uAudioBass.value = 0.04 + this.engineSignals.breath * 0.12;
    this.particleMaterial.uniforms.uAudioMid.value = 0.05 + this.engineSignals.bend * 0.08;
    this.particleMaterial.uniforms.uAudioHigh.value = 0.03 + this.engineSignals.spark * 0.05;
    this.particleMaterial.uniforms.uVideoMotion.value = this.engineSignals.bend;
    this.particleMaterial.uniforms.uVideoBrightness.value = this.engineSignals.breath;
    this.filmPass.uniforms.uTime.value = elapsed;
    this.filmPass.uniforms.uIntensity.value = mode.grain;
    this.chromaticPass.uniforms.uOffset.value = mode.chroma + this.engineSignals.spark * 0.0009;
    this.bloomPass.strength = mode.bloom + this.engineSignals.pulse * 0.14;

    const cameraScale = mode.camera;
    this.camera.position.x = this.cameraOffset.x * cameraScale + this.engineSignals.driftX * 0.012;
    this.camera.position.y = this.cameraOffset.y * cameraScale + this.engineSignals.driftY * 0.012;
    this.camera.zoom = 1 + this.cameraOffset.zoom * cameraScale + this.engineSignals.pulse * 0.012;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(0, 0, 0);

    if (this.latestFrame) {
      this.applyFrame(this.latestFrame);
      this.latestFrame = null;
    }

    this.composer.render();
  };

  handleWorkerMessage = (event) => {
    if (event.data.type === 'frame') {
      this.latestFrame = event.data;
    }
  };

  applyFrame(frame) {
    this.instancePositionAttr.array.set(frame.positions);
    this.instancePrevPositionAttr.array.set(frame.prevPositions);

    for (let index = 0; index < PARTICLE_COUNT; index += 1) {
      const offset = index * 4;
      this.instanceDataAttr.array[offset] = frame.sizes[index];
      this.instanceDataAttr.array[offset + 1] = frame.states[index];
      this.instanceDataAttr.array[offset + 2] = frame.energies[index];
    }

    this.instancePositionAttr.needsUpdate = true;
    this.instancePrevPositionAttr.needsUpdate = true;
    this.instanceDataAttr.needsUpdate = true;

    const palette = THEMES[this.theme];
    frame.orbs.forEach((orb, index) => {
      const entry = this.orbMeshes[index];
      entry.sphere.position.set(orb.x, orb.y, 0.1);
      entry.halo.position.set(orb.x, orb.y, 0.0);
      entry.halo.scale.setScalar(orb.radius * (1.88 + this.engineSignals.pulse * 0.14));
      entry.haloMaterial.uniforms.uFrozen.value = orb.frozen ? 1 : 0;
      entry.sphereMaterial.color.set(orb.frozen ? palette.frozen : index === 1 ? palette.orbPrimary : palette.orbSecondary);
    });

    this.renderEditorialText(frame.orbs);
  }

  renderEditorialText(orbs) {
    if (!this.textContext || !this.preparedText) return;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const palette = THEMES[this.theme];
    const mode = SCENE_MODES[this.sceneMode];
    const ctx = this.textContext;
    ctx.clearRect(0, 0, width, height);


    ctx.save();
    ctx.font = TEXT_FONT;
    ctx.fillStyle = palette.text;
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.globalAlpha = this.theme === 'dark' ? 0.95 : 0.92;

    const marginX = width < 760 ? 18 : 34;
    const topY = width < 760 ? 68 : 58;
    const bottomY = height - (width < 760 ? 54 : 50);
    const lineHeight = TEXT_LINE_HEIGHT + this.engineSignals.breath * 3;
    let baselineY = topY;
    let cursor = { segmentIndex: 0, graphemeIndex: 0 };
    let lineIndex = 0;

    while (baselineY <= bottomY) {
      const freeSegments = this.computeFreeSegmentsForLine(orbs, baselineY, marginX, width - marginX);

      for (const segment of freeSegments) {
        const segmentWidth = segment.end - segment.start;
        if (segmentWidth < 42) continue;

        let line = layoutNextLine(this.preparedText, cursor, segmentWidth);
        if (!line) {
          cursor = { segmentIndex: 0, graphemeIndex: 0 };
          line = layoutNextLine(this.preparedText, cursor, segmentWidth);
        }
        if (!line) {
          continue;
        }

        const motionBend = Math.sin(lineIndex * 0.52 + this.engineSignals.phase * 3.4 + this.clock.getElapsedTime() * mode.pulseSpeed) * mode.lineBend * this.engineIntensity;
        const driftX = this.engineSignals.driftX * (0.05 + (lineIndex % 5) * 0.03);
        const driftY = this.engineSignals.driftY * 0.14 + Math.cos(lineIndex * 0.35 + this.engineSignals.phase) * 1.6;
        const x = segment.start + driftX;
        const y = baselineY + motionBend + driftY;
        ctx.fillText(line.text, x, y);
        cursor = line.end;
        lineIndex += 1;
      }

      baselineY += lineHeight;
    }

    ctx.restore();
  }

  computeFreeSegmentsForLine(orbs, baselineY, minX, maxX) {
    const blocked = [];

    for (const orb of orbs) {
      const screen = this.worldToScreen(orb.x, orb.y);
      const edge = this.worldToScreen(orb.x + orb.radius * 1.18, orb.y);
      const radiusPx = Math.abs(edge.x - screen.x);
      const verticalDistance = Math.abs(baselineY - radiusPx * 0.05 - screen.y);
      const effectiveRadius = radiusPx + 12 + SCENE_MODES[this.sceneMode].orbExpand * this.engineIntensity + this.engineSignals.pulse * 14;
      if (verticalDistance >= effectiveRadius) continue;

      const halfWidth = Math.sqrt(effectiveRadius * effectiveRadius - verticalDistance * verticalDistance);
      blocked.push({ start: screen.x - halfWidth, end: screen.x + halfWidth });
    }

    blocked.sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of blocked) {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end) {
        merged.push({ ...range });
      } else {
        last.end = Math.max(last.end, range.end);
      }
    }

    const free = [];
    let cursor = minX;
    for (const range of merged) {
      if (range.start > cursor) {
        free.push({ start: cursor, end: Math.min(range.start - 12, maxX) });
      }
      cursor = Math.max(cursor, range.end + 12);
      if (cursor >= maxX) break;
    }

    if (cursor < maxX) {
      free.push({ start: cursor, end: maxX });
    }

    return free.filter((segment) => segment.end - segment.start > 20);
  }

  worldToScreen(x, y) {
    const vector = new THREE.Vector3(x, y, 0).project(this.camera);
    return {
      x: (vector.x * 0.5 + 0.5) * window.innerWidth,
      y: (-vector.y * 0.5 + 0.5) * window.innerHeight,
    };
  }

  updateText(text) {
    const cleaned = sanitizeText(text);
    this.prepareTextLayout(cleaned);
    this.createParticleSystem(cleaned);
    this.setStatus('Text updated');
  }

  handlePointerDown = (event) => {
    this.pressedOrbIndex = -1;
    this.draggingOrbIndex = -1;
    this.downPoint.set(event.clientX, event.clientY);
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);

    const hits = this.raycaster.intersectObjects(this.orbMeshes.map((entry) => entry.sphere));
    if (hits.length) {
      this.pressedOrbIndex = hits[0].object.userData.orbIndex;
      this.setStatus('Click to freeze or drag to move');
    }
  };

  handlePointerMove = (event) => {
    if (this.pressedOrbIndex < 0) return;
    const movedDistance = Math.abs(event.clientX - this.downPoint.x) + Math.abs(event.clientY - this.downPoint.y);
    if (movedDistance <= 4) return;

    this.draggingOrbIndex = this.pressedOrbIndex;
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    this.raycaster.ray.intersectPlane(this.dragPlane, this.dragPoint);

    this.worker?.postMessage({
      type: 'set-orb',
      index: this.draggingOrbIndex,
      x: THREE.MathUtils.clamp(this.dragPoint.x, -5.9, 5.9),
      y: THREE.MathUtils.clamp(this.dragPoint.y, -3.4, 3.4),
    });
    this.setStatus('Dragging orb');
  };

  handlePointerUp = () => {
    if (this.draggingOrbIndex >= 0) {
      this.worker?.postMessage({ type: 'release-orb', index: this.draggingOrbIndex });
      this.setStatus('Orb moved');
    } else if (this.pressedOrbIndex >= 0) {
      this.worker?.postMessage({ type: 'toggle-orb-stop', index: this.pressedOrbIndex });
      this.setStatus('Orb freeze toggled');
    }

    this.pressedOrbIndex = -1;
    this.draggingOrbIndex = -1;
  };

  handleResize = () => {
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    const aspect = window.innerWidth / window.innerHeight;
    this.camera.left = (-this.frustumHeight * aspect) / 2;
    this.camera.right = (this.frustumHeight * aspect) / 2;
    this.camera.top = this.frustumHeight / 2;
    this.camera.bottom = -this.frustumHeight / 2;
    this.camera.updateProjectionMatrix();
    this.composer.setSize(window.innerWidth, window.innerHeight);
    this.resizeTextCanvas();
  };

  resizeTextCanvas() {
    if (!this.textCanvas || !this.textContext) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.textCanvas.width = Math.floor(window.innerWidth * dpr);
    this.textCanvas.height = Math.floor(window.innerHeight * dpr);
    this.textCanvas.style.width = `${window.innerWidth}px`;
    this.textCanvas.style.height = `${window.innerHeight}px`;
    this.textContext.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  setStatus(message) {
    this.ui.statusReadout.textContent = message;
  }
}

function sanitizeText(text) {
  const cleaned = (text || FALLBACK_TEXT).trim().replace(/\s+/g, ' ');
  return cleaned.length ? cleaned : FALLBACK_TEXT;
}

function buildGlyphSequence(text, count) {
  const source = `${sanitizeText(text)}   `;
  return Array.from({ length: count }, (_, index) => source[index % source.length]);
}

function uniqueCharacters(sequence) {
  return [...new Set([' ', ...sequence])];
}

function pseudoRandom(value) {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function pickSnippet(current) {
  const options = EDITORIAL_SNIPPETS.filter((snippet) => snippet !== current);
  return options[Math.floor(Math.random() * options.length)] ?? EDITORIAL_SNIPPETS[0];
}

function getEngineSignals(elapsed, modeKey, intensity) {
  const mode = SCENE_MODES[modeKey] ?? SCENE_MODES.tide;
  const pulse = Math.sin(elapsed * mode.pulseSpeed * 2.2) * 0.5 + 0.5;
  const breath = Math.cos(elapsed * mode.pulseSpeed * 0.9 + 1.4) * 0.5 + 0.5;
  const spark = Math.sin(elapsed * (mode.pulseSpeed * 1.8 + 0.25) + 0.8) * 0.5 + 0.5;
  const driftX = Math.sin(elapsed * 0.62 + breath * 2.6) * mode.lineDrift * intensity;
  const driftY = Math.cos(elapsed * 0.44 + pulse * 1.8) * mode.lineDrift * 0.46 * intensity;
  const bend = clamp(0.18 + pulse * 0.72 * intensity, 0, 1.3);
  const phase = Math.sin(elapsed * mode.pulseSpeed * 0.65);
  return { pulse, breath, spark, driftX, driftY, bend, phase };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

