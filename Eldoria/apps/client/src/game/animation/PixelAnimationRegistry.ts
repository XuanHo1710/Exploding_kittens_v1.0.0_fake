import Phaser from 'phaser';
import { AnimationClipDefinition } from '@eldoria/shared';

export class PixelAnimationRegistry {
  public readonly clipMap = new Map<string, AnimationClipDefinition>();

  public registerClips(scene: Phaser.Scene, clips: AnimationClipDefinition[]): number {
    let registered = 0;
    for (const clip of clips) {
      this.clipMap.set(clip.clipKey, clip);
      if (scene.anims.exists(clip.clipKey)) continue;
      if (!scene.textures.exists(clip.atlasKey)) continue;

      const tex = scene.textures.get(clip.atlasKey);
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let i = 0; i < clip.frameCount; i++) {
        // VFX 16x16 clips store frames as <entityId>_<i>, hero/mob/boss clips as <clipKey>_<i>
        const candidateA = `${clip.clipKey}_${i}`;
        const candidateB = `${clip.entityId}_${i}`;
        const frameName = tex.has(candidateA) ? candidateA : tex.has(candidateB) ? candidateB : null;
        if (frameName) {
          frames.push({
            key: clip.atlasKey,
            frame: frameName,
            duration: clip.frameDurationMs[i] || 100,
          });
        }
      }

      if (frames.length > 0) {
        scene.anims.create({
          key: clip.clipKey,
          frames,
          repeat: clip.loop ? -1 : 0,
        });
        registered++;
      }
    }
    return registered;
  }

  public playSafe(sprite: Phaser.GameObjects.Sprite, desiredClipKey: string, entityId: string, dir = 'down'): void {
    const anims = sprite.scene.anims;
    const candidates = [
      desiredClipKey,
      `${entityId}_idle_${dir}`,
      `${entityId}_idle_down`,
    ];
    for (const key of candidates) {
      if (anims.exists(key)) {
        if (sprite.anims.currentAnim?.key !== key || !sprite.anims.isPlaying) {
          sprite.play(key, true);
        }
        return;
      }
    }
  }
}
