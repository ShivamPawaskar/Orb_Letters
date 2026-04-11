# Orb Letters 4343

![Status](https://img.shields.io/badge/status-live%20prototype-111827?style=for-the-badge)
![Built With](https://img.shields.io/badge/built%20with-Three.js%20%2B%20GLSL-0f172a?style=for-the-badge)
![Layout Engine](https://img.shields.io/badge/layout-Pretext-1d4ed8?style=for-the-badge)
![Motion](https://img.shields.io/badge/motion-Web%20Workers%20%2B%20GSAP-7c3aed?style=for-the-badge)

> A cinematic typography field where language bends, drifts, and breathes around invisible bodies.

Orb Letters is a real-time interactive visual piece built with Three.js, GLSL shaders, Web Workers, and Pretext. Instead of treating text like static content, it turns language into a living surface that wraps around moving orbital forms while a glyph-particle layer creates depth, energy, and motion.

## Why It Stands Out 

- Text is always in motion and continuously reflows around moving orbs
- Letters exist both as readable copy and as a glowing particle field
- The experience feels editorial, cinematic, and reactive instead of demo-like
- Motion simulation runs off the main thread for smoother interaction
- The interface stays intentionally minimal so the scene remains the focus

## Core Features

- Real-time text wrapping around animated circular bodies
- GPU glyph particles with custom GLSL shading
- Worker-driven orb and motion-field simulation
- Dark and light theme toggle
- Three scene modes: `Still`, `Tide`, and `Nova`
- Live text editing, shuffle, reset, and intensity controls
- GitHub Pages deployment workflow included

## Tech Stack

- `Three.js`
- `GLSL`
- `@chenglou/pretext`
- `GSAP`
- `Web Workers`
- `Vite`

## Experience Modes

| Mode | Feeling | Behavior |
| --- | --- | --- |
| `Still` | Quiet and restrained | Softer bloom, calmer drift, slower typography motion |
| `Tide` | Balanced and fluid | Smooth orbital pull with steady readable flow |
| `Nova` | High-energy and cinematic | Stronger displacement, brighter pulses, denser tension |

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

## Interaction

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

## Project Links

- Repository: https://github.com/ShivamPawaskar/NEW
- Pages: https://shivampawaskar.github.io/NEW/
