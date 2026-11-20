import fs from 'node:fs';
import path from 'node:path';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { CatalogBundle, loadCanonicalCatalog } from '@eldoria/game-config';

@Injectable()
export class CatalogService implements OnModuleInit {
  private readonly logger = new Logger(CatalogService.name);
  private bundle!: CatalogBundle;
  private readonly gameDataDir: string;

  constructor() {
    this.gameDataDir = this.resolveGameDataDir();
  }

  private resolveGameDataDir(): string {
    if (process.env.GAME_DATA_DIR && fs.existsSync(process.env.GAME_DATA_DIR)) {
      return path.resolve(process.env.GAME_DATA_DIR);
    }
    const candidates = [
      path.resolve(process.cwd(), 'game-data'),
      path.resolve(process.cwd(), '../../game-data'),
      path.resolve(__dirname, '../../../../game-data'),
    ];
    for (const c of candidates) {
      if (fs.existsSync(path.join(c, 'characters.json'))) return c;
    }
    return candidates[0];
  }

  onModuleInit(): void {
    this.ensureLoaded();
  }

  public ensureLoaded(): CatalogBundle {
    if (!this.bundle) {
      this.bundle = loadCanonicalCatalog(this.gameDataDir);
      this.logger.log(
        `Loaded ${this.bundle.filesLoaded} canonical game-data files (hash=${this.bundle.manifestHash.slice(0, 12)}, heroes=${this.bundle.characters.length}, skills=${this.bundle.skills.length}, items=${this.bundle.items.length})`,
      );
    }
    return this.bundle;
  }

  public get catalog(): CatalogBundle {
    return this.ensureLoaded();
  }

  public isLoaded(): boolean {
    return Boolean(this.bundle);
  }
}
