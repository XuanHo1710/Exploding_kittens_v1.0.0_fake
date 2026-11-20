import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { WorldScene } from './scenes/WorldScene';

/**
 * Creates a strictly Pixel-Perfect Phaser 3 instance:
 * 640x360 logical viewport, pixelArt: true, antialias: false, roundPixels: true
 */
export function createEldoriaPhaserGame(parent: HTMLElement): Phaser.Game {
  return new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: 640,
    height: 360,
    backgroundColor: '#13161f',
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 640,
      height: 360,
    },
    scene: [BootScene, WorldScene],
  });
}
