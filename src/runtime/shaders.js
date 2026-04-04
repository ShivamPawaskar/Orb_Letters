export const particleVertexShader = /* glsl */ `
attribute vec3 instancePosition;
attribute vec3 instancePrevPosition;
attribute vec4 instanceGlyphUv;
attribute vec4 instanceData;

uniform float uTime;
uniform float uNoiseStrength;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uVideoMotion;
uniform float uMorphPulse;

varying vec2 vGlyphUv;
varying float vState;
varying float vEnergy;
varying float vVelocity;
varying float vPulse;
varying float vDepth;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.17, 0.23));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise3d(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);

  float n000 = hash(i + vec3(0.0, 0.0, 0.0));
  float n100 = hash(i + vec3(1.0, 0.0, 0.0));
  float n010 = hash(i + vec3(0.0, 1.0, 0.0));
  float n110 = hash(i + vec3(1.0, 1.0, 0.0));
  float n001 = hash(i + vec3(0.0, 0.0, 1.0));
  float n101 = hash(i + vec3(1.0, 0.0, 1.0));
  float n011 = hash(i + vec3(0.0, 1.0, 1.0));
  float n111 = hash(i + vec3(1.0, 1.0, 1.0));

  float nx00 = mix(n000, n100, f.x);
  float nx10 = mix(n010, n110, f.x);
  float nx01 = mix(n001, n101, f.x);
  float nx11 = mix(n011, n111, f.x);
  float nxy0 = mix(nx00, nx10, f.y);
  float nxy1 = mix(nx01, nx11, f.y);
  return mix(nxy0, nxy1, f.z);
}

vec3 noiseField(vec3 p) {
  return vec3(
    noise3d(p + vec3(17.0, 4.0, 0.0)),
    noise3d(p + vec3(2.0, 19.0, 7.0)),
    noise3d(p + vec3(11.0, 3.0, 23.0))
  );
}

vec3 curlNoise(vec3 p) {
  float e = 0.1;
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);

  vec3 p_x0 = noiseField(p - dx);
  vec3 p_x1 = noiseField(p + dx);
  vec3 p_y0 = noiseField(p - dy);
  vec3 p_y1 = noiseField(p + dy);
  vec3 p_z0 = noiseField(p - dz);
  vec3 p_z1 = noiseField(p + dz);

  float x = (p_y1.z - p_y0.z) - (p_z1.y - p_z0.y);
  float y = (p_z1.x - p_z0.x) - (p_x1.z - p_x0.z);
  float z = (p_x1.y - p_x0.y) - (p_y1.x - p_y0.x);
  return normalize(vec3(x, y, z) + 1e-5);
}

void main() {
  vState = instanceData.y;
  vEnergy = instanceData.z;

  vec3 velocity = instancePosition - instancePrevPosition;
  vVelocity = clamp(length(velocity) * 9.5, 0.0, 1.0);

  vec3 field = curlNoise(instancePosition * 0.38 + vec3(uTime * 0.16));
  float agitation = 0.24 + uNoiseStrength * 0.56 + vState * 0.22 + uVideoMotion * 0.34;
  vec3 displaced = instancePosition + field * agitation * (0.48 + vEnergy * 0.24 + uAudioMid * 0.34);
  displaced.z += (noise3d(displaced * 0.6 + vec3(uTime * 0.35)) - 0.5) * (0.12 + uAudioBass * 0.24);

  float pulse = sin(uTime * 3.6 + instanceData.w * 22.0 + length(displaced.xy) * 1.15) * 0.5 + 0.5;
  pulse += sin(uTime * 8.0 + displaced.z * 3.0) * 0.08;
  vPulse = clamp(pulse, 0.0, 1.0);

  vec4 mvPosition = viewMatrix * vec4(displaced, 1.0);

  float size = instanceData.x;
  size *= 1.0 + vEnergy * 0.42 + uAudioHigh * 0.18 + vPulse * 0.16 * uMorphPulse;

  vec2 stretchDir = normalize(velocity.xy + vec2(0.0001));
  vec2 stretched = position.xy;
  stretched += stretchDir * position.y * vVelocity * 0.28;
  stretched += vec2(field.x, field.y) * position.y * 0.06;
  mvPosition.xy += stretched * size;

  gl_Position = projectionMatrix * mvPosition;

  vGlyphUv = mix(instanceGlyphUv.xy, instanceGlyphUv.zw, uv);
  vDepth = clamp(-mvPosition.z / 18.0, 0.0, 1.0);
}
`;

export const particleFragmentShader = /* glsl */ `
uniform sampler2D uGlyphAtlas;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform vec3 uColorC;
uniform vec3 uColorD;
uniform float uAudioBass;
uniform float uAudioMid;
uniform float uAudioHigh;
uniform float uVideoBrightness;

varying vec2 vGlyphUv;
varying float vState;
varying float vEnergy;
varying float vVelocity;
varying float vPulse;
varying float vDepth;

void main() {
  float sdf = texture2D(uGlyphAtlas, vGlyphUv).r;
  float aa = max(fwidth(sdf), 0.0035);
  float glyph = smoothstep(0.5 - aa, 0.5 + aa, sdf);
  float inner = smoothstep(0.74 - aa, 0.74 + aa, sdf);
  float edge = smoothstep(0.38 - aa, 0.62 + aa, sdf) - inner;
  float fringe = smoothstep(0.18 - aa, 0.56 + aa, sdf) - smoothstep(0.42 - aa, 0.78 + aa, sdf);

  float stateMix = clamp(vState * 0.52, 0.0, 1.0);
  float heat = clamp(vEnergy * 1.25 + uAudioBass * 0.45 + uVideoBrightness * 0.24, 0.0, 1.0);
  float electric = clamp(vPulse * 0.9 + uAudioHigh * 0.42 + vVelocity * 0.35, 0.0, 1.0);
  float spectralMix = sin(vPulse * 6.28318 + vDepth * 4.0 + vVelocity * 2.8) * 0.5 + 0.5;

  vec3 ember = mix(uColorA, uColorB, heat);
  vec3 surge = mix(uColorC, uColorD, electric);
  vec3 iridescence = mix(uColorB, uColorD, spectralMix);
  vec3 color = mix(ember, surge, stateMix);
  color = mix(color, iridescence, electric * 0.26 + fringe * 0.12);
  color += edge * mix(surge, iridescence, 0.45) * (1.6 + uAudioMid * 0.45);
  color += inner * vec3(1.0, 0.92, 0.84) * (0.22 + heat * 0.34 + electric * 0.16);
  color += fringe * iridescence * (0.34 + electric * 0.22);

  float alpha = glyph * (0.52 + heat * 0.44 + vDepth * 0.2) + edge * 0.48 + fringe * 0.18;
  if (alpha < 0.01) {
    discard;
  }

  gl_FragColor = vec4(color, alpha);
}
`;
