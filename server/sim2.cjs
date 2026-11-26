const {play,createStarterProfile}=require('./sim-tmp.cjs');
const {shared}=require('./sim-tmp.cjs');Object.assign(shared.EXP_BALANCE.enemy, JSON.parse(process.env.EK||'{}'));
const mk=(lv,party)=>{const p=createStarterProfile('x');for(const h of party){p.heroes[h]??={heroId:h,level:lv,exp:0,awakeningRank:0,shards:0,skillLevels:{}};p.heroes[h].level=lv;}p.activeParty=party;return p;};
const st=['gustave_blade','celine_prism','bastian_aegis'];
const mixed=()=>{const r=Math.random();return r<0.35?'perfect':r<0.7?'good':'miss'};
const mixedDef=()=>{const r=Math.random();return r<0.3?'parry':r<0.55?'dodge':'hit'};
const bad=()=>{const r=Math.random();return r<0.2?'perfect':r<0.6?'good':'miss'}; const badDef=()=>{const r=Math.random();return r<0.15?'parry':r<0.4?'dodge':'hit'};
const cases=JSON.parse(process.argv[2]);
for(const [k,t,m,lvs] of cases){const out=[];for(const lv of lvs){let w=0,wb=0;const N=30;for(let i=0;i<N;i++){if(play(mk(lv,st),k,t,m,mixed,mixedDef,500+i).state==='VICTORY')w++;if(play(mk(lv,st),k,t,m,bad,badDef,900+i).state==='VICTORY')wb++;}out.push(`lv${lv}:${Math.round(w/N*100)}/${Math.round(wb/N*100)}`);}console.log(t.padEnd(28),out.join('  '));}
