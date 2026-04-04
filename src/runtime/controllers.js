import * as THREE from 'three';
import { gsap } from 'gsap';

export class AudioReactiveController {
  constructor({ beatReadout }) {
    this.audioContext = null;
    this.analyser = null;
    this.sourceNode = null;
    this.audioElement = null;
    this.mediaElementSource = null;
    this.currentMicStream = null;
    this.frequencyData = null;
    this.timeData = null;
    this.lastBass = 0;
    this.beatHold = 0;
    this.sensitivity = 1;
    this.beatReadout = beatReadout;
  }

  async ensureContext() {
    if (!this.audioContext) {
      this.audioContext = new AudioContext();
    }

    if (!this.analyser) {
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.82;
      this.frequencyData = new Uint8Array(this.analyser.frequencyBinCount);
      this.timeData = new Uint8Array(this.analyser.frequencyBinCount);
    }

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }

  disconnectActiveSource() {
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    if (this.currentMicStream) {
      this.currentMicStream.getTracks().forEach((track) => track.stop());
      this.currentMicStream = null;
    }
  }

  async useFile(file) {
    await this.ensureContext();
    this.disconnectActiveSource();

    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.loop = true;
      this.audioElement.crossOrigin = 'anonymous';
    }

    this.audioElement.src = URL.createObjectURL(file);

    if (!this.mediaElementSource) {
      this.mediaElementSource = this.audioContext.createMediaElementSource(this.audioElement);
      this.mediaElementSource.connect(this.analyser);
      this.mediaElementSource.connect(this.audioContext.destination);
    }

    this.sourceNode = this.mediaElementSource;
    await this.audioElement.play();
  }

  async toggleMic() {
    await this.ensureContext();

    if (this.currentMicStream) {
      this.disconnectActiveSource();
      if (this.beatReadout) {
        this.beatReadout.textContent = 'Mic off';
      }
      return false;
    }

    this.disconnectActiveSource();
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const source = this.audioContext.createMediaStreamSource(stream);
    source.connect(this.analyser);

    this.currentMicStream = stream;
    this.sourceNode = source;

    if (this.beatReadout) {
      this.beatReadout.textContent = 'Mic live';
    }

    return true;
  }

  update() {
    if (!this.analyser) {
      return {
        bass: 0.08,
        mid: 0.04,
        high: 0.02,
        beat: 0,
      };
    }

    this.analyser.getByteFrequencyData(this.frequencyData);
    this.analyser.getByteTimeDomainData(this.timeData);

    const bass = averageBand(this.frequencyData, 1, 14) * this.sensitivity;
    const mid = averageBand(this.frequencyData, 14, 68) * this.sensitivity;
    const high = averageBand(this.frequencyData, 68, 180) * this.sensitivity;

    const bassRise = bass - this.lastBass;
    const beat = bassRise > 0.075 && bass > 0.2 && this.beatHold <= 0 ? 1 : 0;
    this.lastBass = THREE.MathUtils.lerp(this.lastBass, bass, 0.42);
    this.beatHold = beat ? 9 : Math.max(0, this.beatHold - 1);

    if (this.beatReadout) {
      this.beatReadout.textContent = beat ? 'Pulse' : bass > 0.14 ? 'Breathing' : 'Idle';
    }

    return { bass, mid, high, beat };
  }
}

export class VideoInfluenceController {
  constructor({ videoReadout }) {
    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.loop = true;
    this.video.playsInline = true;
    this.video.crossOrigin = 'anonymous';
    this.videoReadout = videoReadout;
    this.canvas = document.createElement('canvas');
    this.canvas.width = 256;
    this.canvas.height = 256;
    this.context = this.canvas.getContext('2d', { willReadFrequently: true });
    this.texture = null;
    this.lastFrame = null;
    this.enabled = false;
  }

  useFile(file) {
    const url = URL.createObjectURL(file);
    this.video.src = url;
    this.video.play();
    this.texture = new THREE.VideoTexture(this.video);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.generateMipmaps = false;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.enabled = true;

    if (this.videoReadout) {
      this.videoReadout.textContent = 'Linked';
    }

    return this.texture;
  }

  update() {
    if (!this.enabled || this.video.readyState < 2) {
      return {
        brightness: 0,
        motion: 0,
        texture: this.texture,
      };
    }

    this.context.drawImage(this.video, 0, 0, this.canvas.width, this.canvas.height);
    const { data } = this.context.getImageData(0, 0, this.canvas.width, this.canvas.height);

    let brightness = 0;
    let motion = 0;

    for (let index = 0; index < data.length; index += 16) {
      const luma = (data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114) / 255;
      brightness += luma;

      if (this.lastFrame) {
        const last = this.lastFrame[index] * 0.299 + this.lastFrame[index + 1] * 0.587 + this.lastFrame[index + 2] * 0.114;
        motion += Math.abs(luma * 255 - last) / 255;
      }
    }

    brightness /= data.length / 16;
    motion /= data.length / 16;
    this.lastFrame = data.slice();

    if (this.videoReadout) {
      this.videoReadout.textContent = motion > 0.12 ? 'Flux' : brightness > 0.1 ? 'Luma' : 'Standby';
    }

    return {
      brightness,
      motion,
      texture: this.texture,
    };
  }
}

export class InputFieldController {
  constructor(domElement) {
    this.domElement = domElement;
    this.pointer = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    this.worldPoint = new THREE.Vector3();
    this.interactions = [];
    this.dragging = false;

    this.domElement.addEventListener('pointerdown', this.handlePointerDown);
    window.addEventListener('pointermove', this.handlePointerMove);
    window.addEventListener('pointerup', this.handlePointerUp);
  }

  dispose() {
    this.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    window.removeEventListener('pointermove', this.handlePointerMove);
    window.removeEventListener('pointerup', this.handlePointerUp);
  }

  handlePointerDown = (event) => {
    this.dragging = true;
    this.pushInteraction(event, 1.6, true);
  };

  handlePointerMove = (event) => {
    if (!this.dragging) {
      return;
    }

    this.pushInteraction(event, 1.1, true);
  };

  handlePointerUp = () => {
    this.dragging = false;
  };

  pushInteraction(event, strength, attract) {
    this.interactions.push({
      screenX: event.clientX,
      screenY: event.clientY,
      strength,
      attract,
      age: 0,
    });
  }

  update(camera) {
    const rect = this.domElement.getBoundingClientRect();
    const payload = [];

    this.interactions = this.interactions.filter((interaction) => interaction.age < 1.25);
    this.interactions.forEach((interaction) => {
      interaction.age += 1 / 60;

      this.pointer.x = ((interaction.screenX - rect.left) / rect.width) * 2 - 1;
      this.pointer.y = -((interaction.screenY - rect.top) / rect.height) * 2 + 1;
      this.raycaster.setFromCamera(this.pointer, camera);
      this.raycaster.ray.intersectPlane(this.plane, this.worldPoint);

      payload.push({
        x: this.worldPoint.x,
        y: this.worldPoint.y,
        z: this.worldPoint.z,
        strength: interaction.strength * (1 - interaction.age / 1.25),
        attract: interaction.attract,
      });
    });

    return payload;
  }
}

export class CaptureController {
  constructor({ recorderReadout, button }) {
    this.mediaRecorder = null;
    this.chunks = [];
    this.recorderReadout = recorderReadout;
    this.button = button;
  }

  toggle(stream) {
    if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
      this.mediaRecorder.stop();
      return false;
    }

    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9',
      videoBitsPerSecond: 18_000_000,
    });

    this.mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        this.chunks.push(event.data);
      }
    };

    this.mediaRecorder.onstop = () => {
      const blob = new Blob(this.chunks, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `god-mode-v3-${Date.now()}.webm`;
      anchor.click();

      if (this.recorderReadout) {
        this.recorderReadout.textContent = 'Saved';
      }

      if (this.button) {
        this.button.textContent = 'Start Record';
      }
    };

    this.mediaRecorder.start();

    if (this.recorderReadout) {
      this.recorderReadout.textContent = 'Recording';
    }

    if (this.button) {
      this.button.textContent = 'Stop Record';
    }

    return true;
  }
}

export class CinematicDirector {
  constructor(camera) {
    this.camera = camera;
    this.target = new THREE.Vector3();
    this.shots = [
      {
        position: new THREE.Vector3(0, 1.8, 8.2),
        duration: 6.5,
      },
      {
        position: new THREE.Vector3(-4.5, 2.6, 5.7),
        duration: 7.5,
      },
      {
        position: new THREE.Vector3(4.7, 1.2, 4.8),
        duration: 6.8,
      },
      {
        position: new THREE.Vector3(0.6, 4.2, 7.0),
        duration: 8.0,
      },
    ];
    this.elapsed = 0;
    this.currentShot = 0;
    this.shake = 0;
  }

  update(delta, focusPoint, mode, audioFeatures) {
    this.elapsed += delta;
    this.target.lerp(focusPoint, 0.08);

    const shot = this.shots[this.currentShot];
    if (this.elapsed >= shot.duration) {
      this.elapsed = 0;
      this.currentShot = (this.currentShot + 1) % this.shots.length;
      const nextShot = this.shots[this.currentShot];

      gsap.to(this.camera.position, {
        duration: 2.8,
        x: nextShot.position.x,
        y: nextShot.position.y,
        z: nextShot.position.z,
        ease: 'sine.inOut',
      });
    }

    if (audioFeatures.beat || mode === 'beast' || mode === 'god') {
      this.shake = Math.min(1, this.shake + 0.12 + audioFeatures.bass * 0.35);
    }

    this.shake *= mode === 'calm' ? 0.9 : 0.94;
    const shakeAmount = this.shake * (mode === 'god' ? 0.08 : 0.045);

    this.camera.position.x += (Math.random() - 0.5) * shakeAmount;
    this.camera.position.y += (Math.random() - 0.5) * shakeAmount;
    this.camera.position.z += (Math.random() - 0.5) * shakeAmount * 0.65;
    this.camera.lookAt(this.target);
  }
}

function averageBand(data, from, to) {
  let total = 0;
  let count = 0;

  for (let index = from; index < to && index < data.length; index += 1) {
    total += data[index];
    count += 1;
  }

  return count ? total / count / 255 : 0;
}

