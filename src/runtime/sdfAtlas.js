import * as THREE from 'three';
import TinySDF from 'tiny-sdf';

export function createGlyphAtlas(characters) {
  const glyphBuilder = new TinySDF(56, 14, 10, 0.25, 'Georgia');
  const glyphSize = glyphBuilder.size;
  const columns = Math.ceil(Math.sqrt(characters.length));
  const rows = Math.ceil(characters.length / columns);

  const canvas = document.createElement('canvas');
  canvas.width = columns * glyphSize;
  canvas.height = rows * glyphSize;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Unable to create glyph atlas 2D context.');
  }

  const rects = new Map();

  characters.forEach((character, index) => {
    const glyphImage = glyphBuilder.draw(character);
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * glyphSize;
    const y = row * glyphSize;

    context.putImageData(glyphImage, x, y);

    rects.set(character, {
      x: x / canvas.width,
      y: y / canvas.height,
      z: (x + glyphSize) / canvas.width,
      w: (y + glyphSize) / canvas.height,
    });
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;

  return {
    characters,
    rects,
    texture,
  };
}
