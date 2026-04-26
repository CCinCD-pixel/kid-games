import './styles.css';
import { Game } from './game/Game';
import { InputController } from './input/InputController';
import { Renderer } from './render/Renderer';
import { Hud } from './ui/Hud';

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing element: #${id}`);
  }
  return element as T;
}

const canvas = getElement<HTMLCanvasElement>('canvas');
const renderer = new Renderer(canvas);
const input = new InputController(canvas);
const hud = new Hud(
  getElement('hud-len'),
  getElement('hud-rank'),
  getElement('leaderboard'),
  getElement('death-score'),
  getElement('start-screen'),
  getElement('death-overlay'),
);
const game = new Game(renderer, input, hud);

getElement<HTMLButtonElement>('btn-start').addEventListener('click', () => game.start());
getElement<HTMLButtonElement>('btn-respawn').addEventListener('click', () => game.respawn());
