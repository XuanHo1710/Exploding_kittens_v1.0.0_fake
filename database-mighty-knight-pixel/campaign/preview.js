"use strict";

const $ = (id) => document.getElementById(id);
const { maps, heroes, enemies, boss, waves, progression, viewport, poses } = campaign;
const actors = [...heroes, ...enemies, boss];
const names = new Map(actors.map((actor) => [actor.id, actor.name]));
const entryNames = { east: "Cửa đông", west: "Cửa tây", northEast: "Cửa đông bắc", boss: "Trùm" };
const gateNames = {
  start: "Mở wave", "remaining<=1": "Còn tối đa 1 quái", "remaining<=2": "Còn tối đa 2 quái",
  "bossHp<=65%": "Trùm còn ≤65% HP", "bossHp<=30%": "Trùm còn ≤30% HP",
};
const initialCamp = () => ({
  crest: 0, cleared: 0, roster: [progression.starter], party: [progression.starter],
  leader: progression.starter, levels: {},
});
let camp = initialCamp();
let currentMap = 0;
let currentWave = 1;
let playback = 0;

function selectNav(nav, values, selected, onSelect) {
  const buttons = values.map((value, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = value;
    button.setAttribute("aria-pressed", index === selected);
    button.onclick = () => {
      onSelect(index);
      buttons.forEach((item, i) => item.setAttribute("aria-pressed", i === index));
    };
    return button;
  });
  nav.replaceChildren(...buttons);
}

function marker(point, label) {
  const node = document.createElement("span");
  node.className = "marker";
  node.style.left = `${100 * point[0] / viewport[0]}%`;
  node.style.top = `${100 * point[1] / viewport[1]}%`;
  node.textContent = label;
  return node;
}

function showMap(index) {
  currentMap = index;
  const map = maps[index];
  $("map-art").src = map.art;
  $("map-art").alt = map.landmark;
  const caption = document.createElement("strong");
  caption.textContent = map.name;
  const notes = document.createElement("span");
  notes.textContent = map.state === "chapter"
    ? map.mechanic : `Bản vẽ đảo · Ý tưởng địa hình: ${map.mechanic}`;
  $("map-caption").replaceChildren(caption, notes);
  const [x, y, w, h] = map.lane;
  const lane = document.createElement("div");
  lane.className = "lane";
  Object.assign(lane.style, { left:`${x/6.4}%`, top:`${y/3.6}%`, width:`${w/6.4}%`, height:`${h/3.6}%` });
  const layout = $("layout");
  layout.hidden = !$("show-layout").checked;
  layout.replaceChildren(lane, marker(map.party, "Đội"),
    ...Object.entries(map.entries).map(([key, point]) => marker(point, entryNames[key])));
  if (map.boss) layout.append(marker(map.boss, "Trùm"));
}

function showWave(number) {
  currentWave = number;
  const wave = waves[number - 1];
  const canClear = number === camp.cleared + 1;
  const outcome = number <= camp.cleared ? "Đã nhận thưởng lần đầu." :
    canClear ? "Có thể mô phỏng kết quả." : "Chiến thắng wave trước để mở wave này.";
  const groups = wave.groups.map((group) => {
    const mobList = Object.entries(group.mobs).map(([id, count]) => `${count} × ${names.get(id)}`).join(", ");
    return `<li>${gateNames[group.gate]} · ${entryNames[group.entry]} · ${mobList}</li>`;
  });
  $("wave-detail").innerHTML = `<h3>${number}. ${wave.name}</h3><p>${wave.lesson}</p><ul>${groups.join("")}</ul>
    <p>Thưởng đầu · ${wave.crest} Crest + ${names.get(wave.recruit)}</p><p>${outcome}</p>
    <button id="clear-wave" type="button" ${canClear ? "" : "disabled"}>Mô phỏng thắng</button>
    <button id="fail-wave" class="quiet" type="button" ${canClear ? "" : "disabled"}>Mô phỏng thua</button>`;
  $("clear-wave").onclick = () => {
    if (currentWave !== camp.cleared + 1) return;
    camp.crest += wave.crest;
    camp.cleared = number;
    camp.roster.push(wave.recruit);
    showCamp(number === waves.length ? `Đã hoàn thành đảo và chiêu mộ ${names.get(wave.recruit)}.`
      : `Đã chiêu mộ ${names.get(wave.recruit)}. Có thể vào wave ${number + 1}.`, wave.recruit);
    showWave(number);
    $("status").setAttribute("tabindex", "-1");
    $("status").focus();
  };
  $("fail-wave").onclick = () => showCamp("Đội bị hạ. Có thể thử lại wave hiện tại.");
}

function options(select, items, selected) {
  select.replaceChildren(...items.map(([id, label]) => new Option(label, id)));
  if (selected && items.some(([id]) => id === selected)) select.value = selected;
}

function updateUpgrade() {
  const branch = $("branch").value;
  const key = `${$("upgrade-hero").value}/${branch}`;
  const level = camp.levels[key] ?? 0;
  const tier = progression.upgradeTiers[level];
  const values = progression.branches[branch];
  $("upgrade").disabled = !tier || tier.cost > camp.crest;
  $("upgrade").textContent = tier ? `Cấp ${level} → ${level + 1} · ${tier.cost} Crest` : "Đã đạt cấp tối đa";
  const bonus = tier?.bonus ?? progression.upgradeTiers.at(-1).bonus;
  $("upgrade-benefit").textContent = branch === "vitality" ? `Hiệu lực · +${bonus * values.maxHpPerBonus} HP tối đa`
    : branch === "force" ? `Hiệu lực · +${bonus * values.atkPerBonus} ATK`
    : `Hiệu lực · −${bonus * values.activeCooldownMsPerBonus} ms hồi kỹ năng`;
  return { key, level, tier };
}

function drawParty() {
  $("party").querySelector("legend").textContent = `Đội ra trận · ${camp.party.length}/${progression.partyCap}`;
  const controls = camp.roster.map((id) => {
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = camp.party.includes(id);
    input.disabled = input.checked ? camp.party.length === 1 : camp.party.length === progression.partyCap;
    input.onchange = () => {
      camp.party = input.checked ? [...camp.party, id] : camp.party.filter((member) => member !== id);
      if (!camp.party.includes(camp.leader)) camp.leader = camp.party[0];
      drawParty();
      const focus = [...$("party-slots").querySelectorAll("input")].find((node) => node.value === id);
      if (!focus.disabled) focus.focus();
      else $("leader").focus();
    };
    input.value = id;
    label.append(input, document.createTextNode(names.get(id)));
    return label;
  });
  $("party-slots").replaceChildren(...controls);
  options($("leader"), camp.party.map((id) => [id, names.get(id)]), camp.leader);
}

function showCamp(message, heroId = $("upgrade-hero").value) {
  $("crest").textContent = `${camp.crest} Crest`;
  $("status").textContent = message;
  options($("upgrade-hero"), camp.roster.map((id) => [id, names.get(id)]), heroId);
  $("roster").textContent = `Đã tuyển (${camp.roster.length}/${heroes.length}) · ${camp.roster.map((id) => names.get(id)).join(", ")}`;
  updateUpgrade();
  drawParty();
}

const canvas = $("sprite");
const ctx = canvas.getContext("2d");
const images = new Map();
function art(path) {
  if (!images.has(path)) {
    const image = new Image();
    image.onload = () => { if (!$("animate").checked) renderActor(0); };
    image.src = path;
    images.set(path, image);
  }
  return images.get(path);
}

function actorInfo() {
  const actor = actors.find((entry) => entry.id === $("actor").value);
  const kind = actor.active ? "hero" : actor.phases ? "boss" : "foe";
  return { actor, kind, cell: kind === "boss" ? 80 : 48 };
}

function renderActor(tick) {
  const { actor, kind, cell } = actorInfo();
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  const y = 81 - (kind === "boss" ? 74 : 44);
  const sprite = art(`art/${actor.id}.png`);
  const previewPoses = ["idle","idle-rise","walk-a","walk-b","windup","strike-a","release","idle"];
  const selected = $("pose").value;
  const effectMode = selected === "vfx";
  const phase = selected.startsWith("telegraph-") ? Number(selected.split("-")[1]) : null;
  const pose = effectMode ? "release" : phase !== null ? "windup" :
    $("animate").checked ? previewPoses[tick % previewPoses.length] : selected;
  const frame = poses[kind].indexOf(pose);
  ctx.fillStyle = "#161520";
  ctx.beginPath();
  ctx.ellipse(60, 82, kind === "boss" ? 30 : 15, 3, 0, 0, 2 * Math.PI);
  ctx.fill();
  if (sprite.complete && sprite.naturalWidth && frame >= 0) {
    ctx.drawImage(sprite, frame*cell, 0, cell, cell, 60-cell/2, y, cell, cell);
  }
  if (kind === "hero" && ["strike-a","release","cast"].includes(pose)) {
    const vfx = art(`art/${actor.id}-vfx.png`);
    const effectFrame = effectMode && $("animate").checked ? tick % 8 : (pose === "release" ? 5 : 2);
    if (vfx.complete && vfx.naturalWidth) ctx.drawImage(vfx, effectFrame*64, 0, 64, 64, 62, 22, 64, 64);
  }
  if (phase !== null) {
    ctx.save();
    ctx.strokeStyle = "#ffe6a3";
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    if (phase === 0) {
      ctx.ellipse(61, 77, 52, 10, 0, -0.8, 0.8);
      ctx.lineTo(61, 77);
      ctx.closePath();
    } else if (phase === 1) {
      ctx.rect(65, 74, 58, 8);
      ctx.rect(82, 66, 41, 8);
    } else {
      ctx.ellipse(60, 77, 52, 10, 0, 0.4, Math.PI * 2 - 0.4);
    }
    ctx.stroke();
    ctx.restore();
  }
}

function showActor() {
  const { actor, kind } = actorInfo();
  const poseOptions = poses[kind].map((pose) => [pose, pose]);
  if (kind === "hero") poseOptions.push(["vfx", "Dải hiệu ứng kỹ năng"]);
  if (kind === "boss") actor.phases.forEach((phase, i) => poseOptions.push([`telegraph-${i}`, `Báo đòn · ${phase.name}`]));
  options($("pose"), poseOptions);
  const details = kind === "hero" ? `<p>${actor.role} · ${actor.hp} HP · ${actor.atk} ATK</p>
    <p>Đòn thường · ${actor.basic}</p><p><strong>${actor.active.name}</strong> · ${actor.active.effect}</p>
    <p><strong>${actor.ultimate.name}</strong> · ${actor.ultimate.effect}</p>` : kind === "boss"
    ? `<p>${actor.hp} HP · Ngắt thế ở ${actor.breakMax} Break</p><ul>${actor.phases.map((phase) =>
      `<li><strong>${phase.thresholdPct}% · ${phase.name}</strong> · ${phase.response}</li>`).join("")}</ul>`
    : `<p>${actor.hp} HP · Báo đòn ${actor.windupMs} ms</p><p>${actor.response}</p>`;
  $("actor-detail").innerHTML = `<h3>${actor.name}</h3><p>${actor.silhouette}</p>${details}`;
  renderActor(playback);
}

const mapLabels = maps.map((map) => map.name.split(" · ")[0]);
const waveLabels = waves.map((wave) => `Wave ${wave.number}`);
selectNav($("maps"), mapLabels, 0, showMap);
selectNav($("waves"), waveLabels, 0, (index) => showWave(index + 1));
$("show-layout").onchange = () => showMap(currentMap);
options($("branch"), Object.entries(progression.branches).map(([key, branch]) => [key, branch.name]));
$("upgrade-hero").onchange = updateUpgrade;
$("branch").onchange = updateUpgrade;
$("leader").onchange = () => { camp.leader = $("leader").value; };
$("upgrade-form").onsubmit = (event) => {
  event.preventDefault();
  const { key, level, tier } = updateUpgrade();
  if (!tier || tier.cost > camp.crest) return;
  camp.crest -= tier.cost;
  camp.levels[key] = level + 1;
  showCamp(`Đã nâng ${names.get($("upgrade-hero").value)} lên cấp nhánh ${level + 1}.`);
};
$("reset").onclick = () => {
  camp = initialCamp();
  selectNav($("waves"), waveLabels, 0, (index) => showWave(index + 1));
  showWave(1);
  showCamp("Đã đặt lại bản duyệt.");
};

options($("actor"), actors.map((actor) => [actor.id, actor.name]));
$("actor").onchange = showActor;
$("pose").onchange = () => { $("animate").checked = false; renderActor(0); };
$("animate").onchange = () => { playback = 0; renderActor(0); };
window.setInterval(() => { if ($("animate").checked) renderActor(++playback); }, 140);
showMap(0);
showWave(1);
showCamp("Mô phỏng kết quả để duyệt các bước mở khóa và nâng cấp.");
showActor();
