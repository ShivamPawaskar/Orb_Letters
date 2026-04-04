import './styles.css';
import { App } from './runtime/App.js';

const app = new App(document.querySelector('#scene-root'), {
  statusReadout: document.querySelector('#status-readout'),
  textInput: document.querySelector('#text-input'),
  textSubmit: document.querySelector('#text-submit'),
  resetButton: document.querySelector('#reset-button'),
  sceneMode: document.querySelector('#scene-mode'),
  engineIntensity: document.querySelector('#engine-intensity'),
  shuffleButton: document.querySelector('#shuffle-button'),
  themeToggle: document.querySelector('#theme-toggle'),
  adminToggle: document.querySelector('#admin-toggle'),
  adminPanel: document.querySelector('#admin-panel'),
  adminClose: document.querySelector('#admin-close'),
});

app.init().catch((error) => {
  console.error('Editorial Field failed to start:', error);
  app.ui.statusReadout.textContent = 'Boot failed';
});
