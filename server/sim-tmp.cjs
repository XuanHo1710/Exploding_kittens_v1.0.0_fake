const shared=require('./dist/shared/src/index.js');const {createStarterProfile}=require('./dist/server/src/game/expedition/expedition-store.js');
function play(profile,kind,target,map,hit,def,seed){const s=shared.createBattleSession({battleId:'b',battleSeed:seed,profile,encounterKind:kind,targetId:target,mapId:map});
const rng=new shared.Mulberry32(seed);let st=0;const kinds={};
while(s.state!=='VICTORY'&&s.state!=='DEFEAT'&&st<300){const a=s.combatants.find(c=>c.unitUid===s.activeActorUid);let rec;
if(a.side==='party'){const d=shared.EXPEDITION_HEROES_BY_ID[a.templateId];const u=d.skillIds.map(i=>shared.EXPEDITION_SKILLS_BY_ID[i]).filter(x=>x.slotKind!=='passive'&&a.unlockedSkillIds.includes(x.skillId)).map(x=>shared.resolveSkillFor(a,x)).filter(r=>r.apCost<=a.ap).sort((x,y)=>y.apCost-x.apCost)[0];
rec={stepIndex:st++,actorUid:a.unitUid,kind:'player_skill',skillId:u.skill.skillId,targetUid:s.combatants.find(c=>c.side==='enemy'&&c.alive).unitUid,timedHitGrades:u.hits.map(()=>typeof hit==='function'?hit():hit)};}
else{const m=shared.getActiveEnemyMove(s);const dg={};for(const uid of shared.getEnemyIntentTargets(s))dg[uid]=m.hitBeatsMs.map(()=>typeof def==='function'?def():def);rec={stepIndex:st++,actorUid:a.unitUid,kind:'enemy_turn',defenseGrades:dg};}
for(const e of shared.executeTurnAction(s,rec,rng))kinds[e.kind+(e.statusId?':'+e.statusId:'')]=(kinds[e.kind+(e.statusId?':'+e.statusId:'')]||0)+1;}
return {state:s.state,steps:st,kinds};}
module.exports={play,shared,createStarterProfile};
if(require.main===module){
 const mk=(lv,party)=>{const p=createStarterProfile('x');for(const h of party){p.heroes[h]??={heroId:h,level:lv,exp:0,awakeningRank:0,shards:0,skillLevels:{}};p.heroes[h].level=lv;}p.activeParty=party;return p;};
 const starters=['gustave_blade','celine_prism','bastian_aegis'];
 const mixed=()=>{const r=Math.random();return r<0.35?'perfect':r<0.7?'good':'miss'};
 const mixedDef=()=>{const r=Math.random();return r<0.3?'parry':r<0.55?'dodge':'hit'};
 const rows=[];
 const cases=[
  ['wild','01-dawn-meadow_wild_1','01-dawn-meadow',1],['wild','01-dawn-meadow_wild_2','01-dawn-meadow',2],['wild','01-dawn-meadow_wild_3','01-dawn-meadow',3],
  ['gatekeeper','01-dawn-meadow_gk_1','01-dawn-meadow',1],['gatekeeper','01-dawn-meadow_gk_2','01-dawn-meadow',3],['gatekeeper','01-dawn-meadow_gk_3','01-dawn-meadow',5],
  ['boss','sylvan_warden','01-dawn-meadow',7],['wild','02-everfrost-peaks_wild_2','02-everfrost-peaks',9],['gatekeeper','02-everfrost-peaks_gk_3','02-everfrost-peaks',11],['boss','boreal_chevalier','02-everfrost-peaks',14],
  ['boss','chronos_khepri','03-sunken-dunes',20],['boss','vulcan_titan','05-cinder-caldera',34],['boss','astral_painter_seraphina','07-aurora-zenith',50]];
 for(const [k,t,m,lv] of cases){let w=0,steps=0;const N=40;for(let i=0;i<N;i++){const r=play(mk(lv,starters),k,t,m,mixed,mixedDef,1000+i);if(r.state==='VICTORY')w++;steps+=r.steps;}
 const pr=play(mk(lv,starters),k,t,m,'perfect','parry',7);
 rows.push(`${t.padEnd(28)} lv${String(lv).padEnd(3)} avg-play win ${(w/N*100).toFixed(0)}% steps ${(steps/N).toFixed(0)} | perfect ${pr.state} ${pr.steps}`);}
 console.log(rows.join('\n'));}
