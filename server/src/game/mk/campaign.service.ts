import { BadRequestException, ConflictException, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import {
  CAMPAIGN, type CampaignFrame, type CampaignInput, type CampaignProgress, type CampaignResult,
  type CampaignState, type CampaignUpgrade,
} from '../../../../shared/src/mk/campaign';
import { DbService } from '../../store/db.service';
import { CampaignBattle, CAMPAIGN_TICK } from './campaign-battle';
import { awardWave, initialCampaign, upgradeCampaign } from './campaign-progress';
import { isSafePlainObject } from './security';

interface Session {
  socketId: string;
  battle: CampaignBattle;
  revision: number;
  send: (event: 'frame' | 'result', data: CampaignFrame | CampaignResult) => void;
  settling: boolean;
  inputCount: number;
  inputWindow: number;
}

const heroIds = new Set(CAMPAIGN.heroes.map((h) => h.id));
const isHero = (id: unknown): id is string => typeof id === 'string' && heroIds.has(id);
const isInteger = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n);

@Injectable()
export class CampaignService implements OnModuleDestroy {
  private readonly log = new Logger(CampaignService.name);
  private readonly sessions = new Map<string, Session>();
  private timer?: NodeJS.Timeout;
  private ticks = 0;

  constructor(private readonly db: DbService) {}

  private progress(playerId: string): CampaignProgress {
    const account = this.db.account(playerId);
    if (!account) throw new BadRequestException('Tài khoản không tồn tại.');
    return account.mkCampaign ?? initialCampaign();
  }

  async command(playerId: string, socketId: string, body: unknown, send: Session['send']): Promise<CampaignState> {
    if (!isSafePlainObject(body, 6)) throw new BadRequestException('Lệnh Chiến dịch không hợp lệ.');
    const session = this.sessions.get(playerId);
    if (session && session.socketId !== socketId) throw new ConflictException('Chiến dịch đang mở ở một tab khác.');
    const progress = this.progress(playerId);
    if (body.t === 'load') return { progress, frame: session?.battle.snapshot() };
    if (body.t === 'abandon') {
      if (session?.battle.id === body.attemptId && !session?.settling) {
        this.sessions.delete(playerId);
        this.stopIfIdle();
      }
      return { progress };
    }
    if (session) throw new ConflictException('Hãy trở về trại trước khi đổi đội hoặc nâng tướng.');
    const revision = body.revision;
    if (!isInteger(revision) || revision !== progress.revision) throw new ConflictException('Tiến trình vừa thay đổi. Hãy tải lại trại.');
    if (body.t === 'upgrade') {
      const { hero, kind, key } = body;
      if (!isHero(hero) || typeof key !== 'string' || key.length > 16 ||
          (kind !== 'stat' && kind !== 'skill' && kind !== 'crest')) throw new BadRequestException('Nâng cấp không hợp lệ.');
      const next = await this.db.transaction((draft) => {
        const account = draft.accounts[playerId];
        if (!account) throw new BadRequestException('Tài khoản không tồn tại.');
        const current = account.mkCampaign ?? initialCampaign();
        if (current.revision !== revision || this.sessions.has(playerId)) {
          throw new ConflictException('Tiến trình vừa thay đổi. Hãy tải lại trại.');
        }
        return (account.mkCampaign = upgradeCampaign(current, hero, kind as CampaignUpgrade['kind'], key));
      });
      return { progress: next };
    }
    if (body.t !== 'deploy') throw new BadRequestException('Lệnh Chiến dịch không hợp lệ.');
    const { wave, roster, controlled } = body;
    if (!isInteger(wave) || wave < 1 || wave > CAMPAIGN.waves.length || wave > progress.highestCleared + 1 ||
        !Array.isArray(roster) || roster.length < 1 || roster.length > CAMPAIGN.progression.partyCap ||
        !roster.every((id) => isHero(id) && Object.hasOwn(progress.heroes, id)) ||
        new Set(roster).size !== roster.length || !isHero(controlled) || !roster.includes(controlled)) {
      throw new BadRequestException('Wave hoặc đội ra trận không hợp lệ.');
    }
    const battle = new CampaignBattle(randomUUID(), wave, [...roster], controlled, progress);
    this.sessions.set(playerId, { battle, socketId, revision, send, settling: false, inputCount: 0, inputWindow: Date.now() });
    this.timer ??= setInterval(() => this.tick(), CAMPAIGN_TICK).unref();
    return { progress, frame: battle.snapshot() };
  }

  input(playerId: string, socketId: string, body: unknown) {
    const session = this.sessions.get(playerId);
    if (!session || session.socketId !== socketId || session.settling || !isSafePlainObject(body, 5)) return;
    const { attemptId, seq, x, y, buttons } = body;
    if (attemptId !== session.battle.id || !isInteger(seq) || seq < 1 ||
        !isInteger(x) || Math.abs(x) > 1 || !isInteger(y) || Math.abs(y) > 1 ||
        !isInteger(buttons) || buttons < 0 || buttons > 63) return;
    const now = Date.now();
    if (now - session.inputWindow >= 1000) {
      session.inputWindow = now;
      session.inputCount = 0;
    }
    if (++session.inputCount <= 64) session.battle.acceptInput({ attemptId, seq, x, y, buttons } satisfies CampaignInput);
  }

  disconnect(playerId: string, socketId: string) {
    const session = this.sessions.get(playerId);
    if (session?.socketId === socketId && !session.settling) this.sessions.delete(playerId);
    this.stopIfIdle();
  }

  private tick() {
    const sendFrame = ++this.ticks % 2 === 0;
    for (const [playerId, session] of this.sessions) {
      if (session.settling) continue;
      session.battle.step();
      if (session.battle.outcome) {
        session.settling = true;
        session.send('frame', session.battle.snapshot());
        void this.settle(playerId, session, session.battle.outcome);
      } else if (sendFrame) {
        session.send('frame', session.battle.snapshot());
      }
    }
  }

  private async settle(playerId: string, session: Session, outcome: 'win' | 'loss') {
    const { id, wave, roster } = session.battle;
    let result: CampaignResult = { attemptId: id, wave, outcome };
    try {
      if (outcome === 'win') {
        const update = await this.db.transaction((draft) => {
          const account = draft.accounts[playerId];
          if (!account) throw new BadRequestException('Tài khoản không tồn tại.');
          const progress = account.mkCampaign ?? initialCampaign();
          if (progress.revision !== session.revision) throw new ConflictException('Tiến trình đã thay đổi.');
          const reward = awardWave(progress, wave, roster, id);
          account.mkCampaign = progress;
          return { progress, reward };
        });
        result = { ...result, ...update };
      }
    } catch (error) {
      this.log.warn(`Không xác nhận được kết quả Chiến dịch của ${playerId}: ${String(error)}`);
      result = { attemptId: id, wave, outcome: 'error' };
    } finally {
      this.sessions.delete(playerId);
      this.stopIfIdle();
    }
    session.send('result', result);
  }

  private stopIfIdle() {
    if (!this.sessions.size && this.timer) {
      clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  onModuleDestroy() {
    clearInterval(this.timer);
    this.timer = undefined;
    this.sessions.clear();
  }
}
