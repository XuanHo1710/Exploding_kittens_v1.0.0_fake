import Phaser from 'phaser';

/**
 * Pixel-Perfect 640x360 Camera Controller
 * Guarantees integer-snapped scroll coordinates (0 subpixel shimmer / 0 tile seams)
 * and accessibility-aware camera shake (0% / 50% / 100%).
 */
export class PixelCameraController {
  private shakeIntensity = 0;
  private shakeTimerMs = 0;
  private shakeScalePct: 0 | 50 | 100 = 100;
  private targetX = 0;
  private targetY = 0;

  constructor(private readonly camera: Phaser.Cameras.Scene2D.Camera) {
    this.camera.roundPixels = true;
  }

  public setShakePreference(pct: 0 | 50 | 100): void {
    this.shakeScalePct = pct;
  }

  public triggerShake(intensityPx: number, durationMs: number): void {
    if (this.shakeScalePct === 0) return;
    const scaled = intensityPx * (this.shakeScalePct / 100);
    this.shakeIntensity = Math.max(this.shakeIntensity, scaled);
    this.shakeTimerMs = Math.max(this.shakeTimerMs, durationMs);
  }

  public followImmediate(worldX: number, worldY: number): void {
    this.targetX = worldX;
    this.targetY = worldY;
    this.applySnappedScroll(0, 0);
  }

  public update(worldX: number, worldY: number, dtMs: number): void {
    const lerp = Math.min(1, dtMs / 100);
    this.targetX += (worldX - this.targetX) * lerp;
    this.targetY += (worldY - this.targetY) * lerp;

    let offX = 0;
    let offY = 0;
    if (this.shakeTimerMs > 0) {
      this.shakeTimerMs = Math.max(0, this.shakeTimerMs - dtMs);
      const decay = this.shakeTimerMs > 0 ? this.shakeIntensity : 0;
      offX = Math.round((Math.random() * 2 - 1) * decay);
      offY = Math.round((Math.random() * 2 - 1) * decay);
      if (this.shakeTimerMs === 0) this.shakeIntensity = 0;
    }

    this.applySnappedScroll(offX, offY);
  }

  private applySnappedScroll(offX: number, offY: number): void {
    const halfW = this.camera.width / 2;
    const halfH = this.camera.height / 2;
    this.camera.scrollX = Math.round(this.targetX - halfW + offX);
    this.camera.scrollY = Math.round(this.targetY - halfH + offY);
  }
}
