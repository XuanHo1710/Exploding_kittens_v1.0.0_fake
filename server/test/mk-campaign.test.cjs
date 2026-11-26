const test = require('node:test');
const assert = require('node:assert/strict');
const { CAMPAIGN, CAMPAIGN_LEVEL_CAP, CAMPAIGN_ACTION, campaignStats } = require('../dist/shared/src/mk/campaign.js');
const { initialCampaign, awardWave, upgradeCampaign } = require('../dist/server/src/game/mk/campaign-progress.js');
const { CampaignBattle } = require('../dist/server/src/game/mk/campaign-battle.js');

test('campaign grants XP and skill unlocks, then preserves first-clear loot on replay', () => {
  const p = initialCampaign();
  const first = awardWave(p, 1, ['arden'], 'first');
  assert.equal(first.crest, 25);
  assert.equal(first.recruit, 'linnet');
  assert.equal(p.heroes.arden.level, 2);
  assert.equal(p.heroes.arden.skills.active, 1);
  const hp = campaignStats(CAMPAIGN.heroes[0], p.heroes.arden).hp;
  upgradeCampaign(p, 'arden', 'stat', 'vitality');
  upgradeCampaign(p, 'arden', 'crest', 'force');
  assert.equal(campaignStats(CAMPAIGN.heroes[0], p.heroes.arden).hp, hp + 8);
  const xp = p.heroes.arden.xp;
  const replay = awardWave(p, 1, ['arden'], 'second');
  assert.equal(replay.crest, 0);
  assert.equal(replay.recruit, undefined);
  assert.ok(p.heroes.arden.xp > xp);
  assert.equal(awardWave(p, 1, ['arden'], 'second'), undefined);
  assert.throws(() => upgradeCampaign(p, 'arden', 'skill', 'ultimate'));
  for (let i = 0; i < 4000; i++) awardWave(p, 1, ['arden'], `replay-${i}`);
  assert.equal(p.heroes.arden.level, CAMPAIGN_LEVEL_CAP);
  assert.equal(p.heroes.arden.xp, 0);
  assert.equal(p.heroes.arden.skills.ultimate, 1);
  for (let i = 0; i < 4; i++) upgradeCampaign(p, 'arden', 'skill', 'active');
  assert.equal(p.heroes.arden.skills.active, 5);
  assert.throws(() => upgradeCampaign(p, 'arden', 'skill', 'active'));
});

test('real simulation clears all groups, advances the boss through three phases and settles five waves', () => {
  const progress = initialCampaign();
  const phases = new Set();
  for (let wave = 1; wave <= 5; wave++) {
    const roster = Object.keys(progress.heroes).slice(0, 3);
    const battle = new CampaignBattle(`wave-${wave}`, wave, roster, 'arden', progress);
    for (let tick = 0; tick < 10000 && !battle.outcome; tick++) {
      const snapshot = battle.snapshot();
      const hero = snapshot.actors.find(a => a.id === snapshot.controlled);
      const foes = snapshot.actors.filter(a => a.side === 'enemy' && a.hp > 0);
      foes.sort((a, b) => Math.hypot(a.x - hero.x, a.y - hero.y) - Math.hypot(b.x - hero.x, b.y - hero.y));
      const target = foes[0];
      const boss = foes.find(a => a.boss);
      if (boss) phases.add(snapshot.bossPhase);
      const dx = target ? target.x - hero.x : 0;
      const dy = target ? target.y - hero.y : 0;
      const guard = snapshot.hazards.length > 0 && tick % 13 === 0;
      battle.acceptInput({
        attemptId: battle.id, seq: tick + 1, x: Math.abs(dx) > 17 ? Math.sign(dx) : 0,
        y: Math.abs(dy) > 4 ? Math.sign(dy) : 0,
        buttons: CAMPAIGN_ACTION.attack | (tick % 2 ? CAMPAIGN_ACTION.active : CAMPAIGN_ACTION.ultimate) |
          (guard ? CAMPAIGN_ACTION.guard : 0),
      });
      battle.step();
    }
    assert.equal(battle.outcome, 'win', `Wave ${wave}`);
    awardWave(progress, wave, roster, battle.id);
  }
  assert.deepEqual([...phases], [0, 1, 2]);
  assert.equal(progress.highestCleared, 5);
  assert.equal(Object.keys(progress.heroes).length, 6);
});
