import { RENDER_DEPTH_STACK } from '@eldoria/shared';

export class DepthLayerManager {
  public static ground(offset = 0): number {
    return Math.min(RENDER_DEPTH_STACK.GROUND_MAX, RENDER_DEPTH_STACK.GROUND_MIN + offset);
  }

  public static allyDecal(offset = 0): number {
    return Math.min(RENDER_DEPTH_STACK.ALLY_DECAL_MAX, RENDER_DEPTH_STACK.ALLY_DECAL_MIN + offset);
  }

  public static buildGrid(offset = 0): number {
    return Math.min(RENDER_DEPTH_STACK.BUILD_GRID_MAX, RENDER_DEPTH_STACK.BUILD_GRID_MIN + offset);
  }

  public static bossTelegraphUnlit(offset = 0): number {
    return Math.min(
      RENDER_DEPTH_STACK.BOSS_TELEGRAPH_UNLIT_MAX,
      RENDER_DEPTH_STACK.BOSS_TELEGRAPH_UNLIT_MIN + offset,
    );
  }

  public static shadow(offset = 0): number {
    return Math.min(RENDER_DEPTH_STACK.GROUND_SHADOW_MAX, RENDER_DEPTH_STACK.GROUND_SHADOW_MIN + offset);
  }

  public static ySort(footY: number): number {
    return Math.max(
      RENDER_DEPTH_STACK.YSORT_BASE,
      Math.min(RENDER_DEPTH_STACK.YSORT_MAX, RENDER_DEPTH_STACK.YSORT_BASE + Math.round(footY)),
    );
  }

  public static canopy(): number {
    return RENDER_DEPTH_STACK.OVERHEAD_CANOPY;
  }

  public static airVfx(): number {
    return RENDER_DEPTH_STACK.AIR_VFX_ULTIMATE;
  }

  public static telegraphRimEcho(): number {
    return RENDER_DEPTH_STACK.TELEGRAPH_RIM_ECHO;
  }

  public static lighting(): number {
    return RENDER_DEPTH_STACK.LIGHTING_OVERLAY;
  }

  public static nameplate(): number {
    return RENDER_DEPTH_STACK.NAMEPLATES;
  }

  public static floatingText(): number {
    return RENDER_DEPTH_STACK.FLOATING_TEXT;
  }

  /**
   * Checks whether player's foot is behind a tree/roof canopy; smoothly dips alpha to 0.55
   */
  public static computeCanopyAlpha(
    canopyCenterX: number,
    canopyCenterY: number,
    playerFootX: number,
    playerFootY: number,
    radiusPx = 44,
  ): number {
    const dx = playerFootX - canopyCenterX;
    const dy = playerFootY - canopyCenterY;
    const behind = dx * dx + dy * dy < radiusPx * radiusPx && playerFootY < canopyCenterY + 24;
    return behind ? 0.55 : 1.0;
  }
}
