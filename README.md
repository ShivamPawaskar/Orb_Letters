# Orb Letters

Orb Letters is a real-time typography experiment built with Three.js, GLSL, workers, and Pretext.

Text flows around moving orbs while a particle layer turns letters into a living field.

## Features

- Real-time text wrapping around moving circles
- GPU glyph particles with custom shaders
- Worker-driven motion simulation
- Dark and light theme toggle
- Three scene modes: Still, Tide, and Nova
- Live text editing, shuffle, reset, and intensity controls
- GitHub Pages deployment workflow included

## Stack

- Three.js
- GLSL
- Pretext
- GSAP
- Web Workers
- Vite

## Run Locally

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Controls

- Toggle theme
- Open the controls panel
- Drag an orb to move it
- Click an orb to freeze or unfreeze it
- Edit the text and apply changes
- Shuffle the text instantly

## Deployment

GitHub Pages workflow file:

```text
.github/workflows/deploy.yml
```

Expected Pages URL:

```text
https://shivampawaskar.github.io/NEW/
```

## Project Structure

```text
src/
  main.js
  styles.css
  runtime/
    App.js
    shaders.js
    sdfAtlas.js
    postFX.js
  workers/
    simulationWorker.js
public/
index.html
vite.config.js
```
