(() => {
  'use strict';

  const APP_ID = 'rayon-fake-planner-new';
  const STORAGE_KEY = 'rayon_fake_planner_new_settings_v1';
  const POSITION_KEY = 'rayon_fake_planner_new_position_v1';
  const gd = window.game_data || {};

  document.getElementById(APP_ID)?.remove();

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
  }[char]));
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  const pad = n => String(n).padStart(2, '0');
  const numberFromText = value => Number(String(value ?? '').replace(/[^\d-]/g, '')) || 0;
  const uniqueBy = (items, keyFn) => [...new Map(items.map(item => [keyFn(item), item])).values()];

  const extractCoord = value => String(value ?? '').match(/\b\d{1,3}\|\d{1,3}\b/)?.[0] || '';
  const coordToXY = value => value.split('|').map(Number);
  const distance = (a, b) => {
    const [ax, ay] = coordToXY(a);
    const [bx, by] = coordToXY(b);
    return Math.hypot(ax - bx, ay - by);
  };
  const formatDateTime = timestamp => {
    const d = new Date(timestamp);
    return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  const formatInputDateTime = timestamp => {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };
  const parseTimeToMinutes = value => {
    const match = String(value ?? '').match(/^(\d{1,2}):(\d{2})$/);
    return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
  };
  const isInsideBlockedInterval = (timestamp, fromMinutes, toMinutes) => {
    if (!Number.isFinite(fromMinutes) || !Number.isFinite(toMinutes) || fromMinutes === toMinutes) return false;
    const d = new Date(timestamp);
    const minute = d.getHours() * 60 + d.getMinutes();
    return fromMinutes < toMinutes
      ? minute >= fromMinutes && minute < toMinutes
      : minute >= fromMinutes || minute < toMinutes;
  };

  const state = {
    unitInfo: {},
    groups: [],
    villages: [],
    plan: [],
    drag: null
  };

  const panel = document.createElement('div');
  panel.id = APP_ID;
  panel.innerHTML = `
    <style>
      #${APP_ID}{position:fixed;z-index:99999;top:20px;left:20px;width:min(1260px,calc(100vw - 40px));max-height:94vh;overflow:auto;background:#f4f8fb;color:#17232d;border:1px solid #6f8798;border-radius:14px;box-shadow:0 18px 60px rgba(0,0,0,.45);font:14px/1.42 Arial,sans-serif}
      #${APP_ID} *{box-sizing:border-box}
      #${APP_ID} .head{position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:9px;padding:12px 14px;background:#17374d;color:#fff;cursor:move;user-select:none}
      #${APP_ID} .title{font-size:20px;font-weight:800;flex:1}
      #${APP_ID} .body{padding:14px}
      #${APP_ID} .grid{display:grid;grid-template-columns:1fr 1fr;gap:13px}
      #${APP_ID} .card{background:#fff;border:1px solid #c7d4dd;border-radius:11px;padding:13px}
      #${APP_ID} h2{margin:0 0 10px;color:#0b609d;font-size:18px}
      #${APP_ID} label{display:block;margin:8px 0 5px;font-weight:700;color:#344c5d}
      #${APP_ID} input,#${APP_ID} textarea,#${APP_ID} select{width:100%;padding:8px 9px;border:1px solid #8ca1af;border-radius:7px;background:#fff;color:#111;font-size:14px}
      #${APP_ID} textarea{min-height:125px;resize:vertical;font-family:monospace}
      #${APP_ID} .row{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      #${APP_ID} .btn{border:1px solid #456579;border-radius:8px;background:#e8eef3;color:#173042;padding:8px 12px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-block}
      #${APP_ID} .btn:hover{filter:brightness(.97)}
      #${APP_ID} .primary{background:#0b73c7;color:#fff;border-color:#075b9e}
      #${APP_ID} .danger{background:#9c3030;color:#fff;border-color:#7f2222}
      #${APP_ID} .good{background:#16813a;color:#fff;border-color:#10662d}
      #${APP_ID} .actions{display:flex;gap:8px;flex-wrap:wrap;margin:12px 0}
      #${APP_ID} .info{padding:9px;border:1px solid #b8c8d2;border-radius:8px;background:#eef4f8;margin-top:9px}
      #${APP_ID} .ok{color:#12652a}.bad{color:#a21d1d}
      #${APP_ID} .groups{max-height:210px;overflow:auto;border:1px solid #b9c7d1;border-radius:8px;padding:7px;background:#f9fbfd}
      #${APP_ID} .groupRow{display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid #e1e8ed}
      #${APP_ID} .groupRow input{width:auto}
      #${APP_ID} .modes{display:grid;grid-template-columns:1fr 1fr;gap:9px}
      #${APP_ID} .mode{border:1px solid #9db0bd;border-radius:9px;padding:9px;background:#f8fbfd}
      #${APP_ID} .mode input{width:auto;margin-right:7px}
      #${APP_ID} .small{font-size:12px;color:#5b7181}
      #${APP_ID} .tableWrap{overflow:auto;max-height:430px}
      #${APP_ID} table{width:100%;border-collapse:collapse;font-size:12px}
      #${APP_ID} th,#${APP_ID} td{padding:7px;border-bottom:1px solid #d5dfe6;text-align:left;white-space:nowrap}
      #${APP_ID} th{position:sticky;top:0;background:#e7f0f6;z-index:2}
      #${APP_ID} .warn{background:#fff4dd;border-color:#e2bf72}
      #${APP_ID} .summary{display:flex;gap:10px;flex-wrap:wrap;margin-top:8px}
      #${APP_ID} .pill{background:#e7f0f6;border:1px solid #b8c8d2;border-radius:999px;padding:5px 9px;font-weight:700}
      @media(max-width:850px){#${APP_ID}{left:7px!important;top:7px!important;width:calc(100vw - 14px)!important}#${APP_ID} .grid,#${APP_ID} .row,#${APP_ID} .modes{grid-template-columns:1fr}}
    </style>
    <div class="head" id="rfpHead">
      <div class="title">🎭 Rayon Fake Planner</div>
      <button class="btn" id="rfpMin">Sbalit</button>
      <button class="btn danger" id="rfpClose">Zavřít</button>
    </div>
    <div class="body" id="rfpBody">
      <div class="grid">
        <section class="card">
          <h2>1. Skupiny a zdrojové vesnice</h2>
          <div class="row">
            <input id="rfpGroupSearch" placeholder="Hledat skupinu…">
            <div class="actions" style="margin:0">
              <button class="btn" id="rfpAll">Vše</button>
              <button class="btn" id="rfpNone">Nic</button>
              <button class="btn" id="rfpReloadGroups">Obnovit</button>
            </div>
          </div>
          <div id="rfpGroups" class="groups">Načítám skupiny…</div>
          <label>Ruční ID skupin – záloha, oddělené čárkou</label>
          <input id="rfpManualGroups" placeholder="např. 12,15,22">
          <button class="btn primary" id="rfpLoadGroups" style="margin-top:9px">NAČÍST VYBRANÉ SKUPINY</button>
          <div id="rfpVillageInfo" class="info">Zatím nejsou načtené vesnice.</div>

          <h2 style="margin-top:16px">2. Cíle</h2>
          <label>Jedna souřadnice na řádek</label>
          <textarea id="rfpTargets" placeholder="500|500&#10;501|500&#10;502|501"></textarea>
        </section>

        <section class="card">
          <h2>3. Časové podmínky</h2>
          <div class="row">
            <div><label>Dopad od</label><input id="rfpFrom" type="datetime-local"></div>
            <div><label>Dopad do</label><input id="rfpTo" type="datetime-local"></div>
          </div>
          <div class="row">
            <div><label>Neposílat od</label><input id="rfpNightFrom" type="time" value="00:00"></div>
            <div><label>Neposílat do</label><input id="rfpNightTo" type="time" value="07:00"></div>
          </div>
          <div class="row">
            <div><label>Vyřadit vzdálenost ≤ polí</label><input id="rfpMinDistance" type="number" min="0" value="10"></div>
            <div><label>Min. rozestup dopadů (ms)</label><input id="rfpSpacing" type="number" min="0" value="250"></div>
          </div>
          <div class="info warn">Výchozí nastavení automaticky vyřadí faky vzdálené 10 polí a méně.</div>

          <h2 style="margin-top:16px">4. Typ faku</h2>
          <div class="modes">
            <label class="mode"><input type="radio" name="rfpMode" value="green" checked><b>Zelený fake</b><div class="small">1 % bodů vesnice. Pouze špeh, beranidlo, lehká jízda a katapult.</div></label>
            <label class="mode"><input type="radio" name="rfpMode" value="strong"><b>Silný adaptivní</b><div class="small">Až 300 seker, 200 lehké jízdy a 100 katapultů podle dostupnosti.</div></label>
          </div>
          <label>Maximální počet faků z jedné vesnice</label>
          <input id="rfpPerVillage" type="number" min="1" value="1">
        </section>
      </div>

      <div class="actions">
        <button class="btn primary" id="rfpBuild">VYPOČÍTAT PLÁN</button>
        <button class="btn" id="rfpCopy">KOPÍROVAT BB-CODE</button>
        <button class="btn" id="rfpCsv">STÁHNOUT CSV</button>
      </div>
      <div id="rfpStatus" class="info">Připraveno.</div>
      <div id="rfpSummary" class="summary"></div>

      <section class="card" style="margin-top:14px">
        <h2>Výsledný plán</h2>
        <div class="tableWrap"><table>
          <thead><tr><th>#</th><th>Zdroj</th><th>Body</th><th>Cíl</th><th>Vzd.</th><th>Armáda</th><th>Odeslat</th><th>Dopad</th><th>Stav</th><th>Akce</th></tr></thead>
          <tbody id="rfpResults"></tbody>
        </table></div>
      </section>
    </div>`;
  document.body.appendChild(panel);

  const el = selector => $(selector, panel);
  const setStatus = (text, bad = false) => {
    const node = el('#rfpStatus');
    node.textContent = text;
    node.className = `info ${bad ? 'bad' : 'ok'}`;
  };

  function saveSettings() {
    const settings = {
      targets: el('#rfpTargets').value,
      from: el('#rfpFrom').value,
      to: el('#rfpTo').value,
      nightFrom: el('#rfpNightFrom').value,
      nightTo: el('#rfpNightTo').value,
      minDistance: el('#rfpMinDistance').value,
      spacing: el('#rfpSpacing').value,
      perVillage: el('#rfpPerVillage').value,
      mode: el('input[name="rfpMode"]:checked')?.value || 'green',
      manualGroups: el('#rfpManualGroups').value,
      selectedGroups: $$('#rfpGroups input:checked', panel).map(node => node.value)
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  function loadSettings() {
    let settings = {};
    try { settings = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch {}
    el('#rfpTargets').value = settings.targets || '';
    el('#rfpFrom').value = settings.from || formatInputDateTime(Date.now() + 3600000);
    el('#rfpTo').value = settings.to || formatInputDateTime(Date.now() + 7200000);
    el('#rfpNightFrom').value = settings.nightFrom || '00:00';
    el('#rfpNightTo').value = settings.nightTo || '07:00';
    el('#rfpMinDistance').value = settings.minDistance ?? '10';
    el('#rfpSpacing').value = settings.spacing ?? '250';
    el('#rfpPerVillage').value = settings.perVillage ?? '1';
    el('#rfpManualGroups').value = settings.manualGroups || '';
    const mode = el(`input[name="rfpMode"][value="${settings.mode || 'green'}"]`);
    if (mode) mode.checked = true;
    return settings;
  }

  const savedSettings = loadSettings();

  try {
    const position = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
    if (position?.left) panel.style.left = position.left;
    if (position?.top) panel.style.top = position.top;
  } catch {}

  el('#rfpHead').addEventListener('mousedown', event => {
    if (event.target.closest('button')) return;
    const rect = panel.getBoundingClientRect();
    state.drag = { dx: event.clientX - rect.left, dy: event.clientY - rect.top };
  });
  document.addEventListener('mousemove', event => {
    if (!state.drag) return;
    panel.style.left = `${Math.max(0, Math.min(innerWidth - panel.offsetWidth, event.clientX - state.drag.dx))}px`;
    panel.style.top = `${Math.max(0, Math.min(innerHeight - 70, event.clientY - state.drag.dy))}px`;
  });
  document.addEventListener('mouseup', () => {
    if (!state.drag) return;
    localStorage.setItem(POSITION_KEY, JSON.stringify({ left: panel.style.left, top: panel.style.top }));
    state.drag = null;
  });

  el('#rfpClose').onclick = () => panel.remove();
  el('#rfpMin').onclick = () => {
    const body = el('#rfpBody');
    const hidden = body.style.display === 'none';
    body.style.display = hidden ? 'block' : 'none';
    el('#rfpMin').textContent = hidden ? 'Sbalit' : 'Rozbalit';
  };

  async function fetchText(url) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
  }

  async function loadUnitInfo() {
    const xml = await fetchText('/interface.php?func=get_unit_info');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    state.unitInfo = {};
    for (const node of [...doc.documentElement.children]) {
      state.unitInfo[node.tagName] = {
        speed: Number(node.querySelector('speed')?.textContent || 0),
        pop: Number(node.querySelector('population')?.textContent || 1)
      };
    }
  }

  function discoverGroupsFromDocument(doc) {
    const found = [];
    const add = (id, name) => {
      const cleanId = String(id ?? '').trim();
      const cleanName = String(name ?? '').trim();
      if (!/^\d+$/.test(cleanId) || !cleanName) return;
      found.push({ id: cleanId, name: cleanName });
    };

    for (const select of $$('select#group_select, select[name="group"], select[name="group_id"]', doc)) {
      for (const option of [...select.options]) add(option.value, option.textContent);
    }

    for (const node of $$('[data-group-id], [data-group]', doc)) {
      add(node.dataset.groupId || node.dataset.group, node.textContent);
    }

    for (const link of $$('a[href*="group="]', doc)) {
      try {
        const url = new URL(link.getAttribute('href'), location.href);
        add(url.searchParams.get('group'), link.textContent);
      } catch {}
    }

    const html = doc.documentElement?.innerHTML || '';
    for (const match of html.matchAll(/["']?(\d+)["']?\s*:\s*["']([^"']{1,80})["']/g)) {
      if (/group/i.test(match[2]) || /skup/i.test(match[2])) add(match[1], match[2]);
    }

    return found;
  }

  async function loadGroups() {
    setStatus('Načítám skupiny…');
    let found = discoverGroupsFromDocument(document);
    const villageId = gd.village?.id || '';
    const pages = [
      `/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=combined`,
      `/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&mode=units&type=home`
    ];

    for (const url of pages) {
      try {
        const html = await fetchText(url);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        found.push(...discoverGroupsFromDocument(doc));
      } catch (error) {
        console.warn('Fake Planner: skupiny z této stránky nešly načíst', url, error);
      }
    }

    found.push({ id: '0', name: 'Všechny vesnice' });
    state.groups = uniqueBy(found.filter(group => group.name), group => group.id)
      .sort((a, b) => a.name.localeCompare(b.name, 'cs'));
    renderGroups(savedSettings.selectedGroups || []);
    setStatus(`Skupiny načteny: ${state.groups.length}.`);
  }

  function renderGroups(selectedIds = null) {
    const query = el('#rfpGroupSearch').value.trim().toLowerCase();
    const previouslySelected = selectedIds || $$('#rfpGroups input:checked', panel).map(node => node.value);
    const selected = new Set(previouslySelected);
    const visible = state.groups.filter(group => group.name.toLowerCase().includes(query));
    el('#rfpGroups').innerHTML = visible.map(group => `
      <label class="groupRow"><input type="checkbox" value="${esc(group.id)}" ${selected.has(group.id) ? 'checked' : ''}><span>${esc(group.name)}</span></label>
    `).join('') || 'Nenalezena žádná skupina. Použij ruční ID skupin.';
  }

  el('#rfpGroupSearch').oninput = () => renderGroups();
  el('#rfpAll').onclick = () => $$('#rfpGroups input[type="checkbox"]', panel).forEach(node => { node.checked = true; });
  el('#rfpNone').onclick = () => $$('#rfpGroups input[type="checkbox"]', panel).forEach(node => { node.checked = false; });
  el('#rfpReloadGroups').onclick = () => loadGroups().catch(error => setStatus(error.message, true));

  function parsePoints(row) {
    const explicit = row.querySelector('.points, td.points, [data-field="points"]');
    if (explicit) return numberFromText(explicit.textContent);
    const cells = [...row.cells].map(cell => numberFromText(cell.textContent)).filter(value => value > 0 && value < 1000000);
    return cells.length ? Math.max(...cells) : 0;
  }

  function parseVillageRows(doc) {
    const villages = [];
    for (const row of $$('tr', doc)) {
      const villageCoord = extractCoord(row.textContent);
      if (!villageCoord) continue;
      const villageLink = row.querySelector('a[href*="village="]');
      if (!villageLink) continue;
      let villageId = '';
      try { villageId = new URL(villageLink.href, location.href).searchParams.get('village') || ''; } catch {}
      if (!villageId) continue;
      villages.push({
        id: villageId,
        coord: villageCoord,
        name: (villageLink.textContent || villageCoord).trim(),
        points: parsePoints(row),
        army: {}
      });
    }
    return uniqueBy(villages, village => village.id);
  }

  function detectUnitColumns(table) {
    const headers = $$('thead th, tr:first-child th, tr:first-child td', table);
    const columns = {};
    headers.forEach((header, index) => {
      const image = header.querySelector('img[src*="unit_"]');
      const source = `${image?.src || ''} ${header.className || ''} ${header.dataset.unit || ''}`;
      const match = source.match(/unit_(spear|sword|axe|spy|light|heavy|ram|catapult)|\b(spear|sword|axe|spy|light|heavy|ram|catapult)\b/);
      const unit = match?.[1] || match?.[2];
      if (unit) columns[unit] = index;
    });
    return columns;
  }

  function parseArmyRows(doc) {
    const result = new Map();
    for (const table of $$('table', doc)) {
      const columns = detectUnitColumns(table);
      if (!Object.keys(columns).length) continue;
      for (const row of $$('tr', table)) {
        const villageCoord = extractCoord(row.textContent);
        if (!villageCoord || !row.cells?.length) continue;
        const army = {};
        for (const [unit, index] of Object.entries(columns)) {
          army[unit] = numberFromText(row.cells[index]?.textContent);
        }
        if (Object.values(army).some(value => value > 0)) result.set(villageCoord, army);
      }
    }
    return result;
  }

  async function loadGroup(groupId) {
    const villageId = gd.village?.id || '';
    const common = `/game.php?village=${encodeURIComponent(villageId)}&screen=overview_villages&group=${encodeURIComponent(groupId)}&page=-1`;
    const [combinedHtml, unitsHtml] = await Promise.all([
      fetchText(`${common}&mode=combined`),
      fetchText(`${common}&mode=units&type=home`)
    ]);
    const combinedDoc = new DOMParser().parseFromString(combinedHtml, 'text/html');
    const unitsDoc = new DOMParser().parseFromString(unitsHtml, 'text/html');
    const villages = parseVillageRows(combinedDoc);
    const armies = parseArmyRows(unitsDoc);
    for (const village of villages) village.army = armies.get(village.coord) || {};
    return villages;
  }

  async function loadSelectedGroups() {
    const checkedIds = $$('#rfpGroups input:checked', panel).map(node => node.value);
    const manualIds = el('#rfpManualGroups').value.split(/[\s,;]+/).map(value => value.trim()).filter(value => /^\d+$/.test(value));
    const ids = [...new Set([...checkedIds, ...manualIds])];
    if (!ids.length) return setStatus('Vyber alespoň jednu skupinu nebo zadej její ID.', true);

    saveSettings();
    const allVillages = [];
    const errors = [];
    for (let index = 0; index < ids.length; index++) {
      setStatus(`Načítám skupinu ${index + 1}/${ids.length}…`);
      try {
        allVillages.push(...await loadGroup(ids[index]));
      } catch (error) {
        console.error(error);
        errors.push(`${ids[index]}: ${error.message}`);
      }
      await sleep(120);
    }

    const merged = new Map();
    for (const village of allVillages) {
      const existing = merged.get(village.id);
      if (!existing) merged.set(village.id, village);
      else if (Object.values(village.army || {}).some(value => value > 0)) existing.army = village.army;
    }
    state.villages = [...merged.values()];
    const armyCount = state.villages.filter(village => Object.values(village.army || {}).some(value => value > 0)).length;
    el('#rfpVillageInfo').innerHTML = `Načteno <b>${state.villages.length}</b> vesnic; armáda rozpoznána u <b>${armyCount}</b>.${errors.length ? `<br>Chyby: ${esc(errors.join(' | '))}` : ''}`;
    setStatus(state.villages.length ? `Načteno ${state.villages.length} vesnic.` : 'Nenačetla se žádná vesnice.', !state.villages.length);
  }

  el('#rfpLoadGroups').onclick = () => loadSelectedGroups().catch(error => setStatus(error.message, true));

  function makeGreenComposition(village, remainingArmy) {
    const requiredPopulation = Math.ceil(Math.max(0, village.points) * 0.01);
    if (!requiredPopulation) return { composition: null, reason: 'Vesnice nemá rozpoznané body' };
    const allowed = ['spy', 'ram', 'light', 'catapult'];
    const composition = Object.fromEntries(allowed.map(unit => [unit, 0]));
    let remainingPopulation = requiredPopulation;

    for (const unit of allowed) {
      const population = Math.max(1, state.unitInfo[unit]?.pop || 1);
      const available = remainingArmy[unit] || 0;
      const amount = Math.min(available, Math.ceil(remainingPopulation / population));
      composition[unit] = amount;
      remainingPopulation -= amount * population;
      if (remainingPopulation <= 0) break;
    }

    return remainingPopulation <= 0
      ? { composition, reason: '' }
      : { composition: null, reason: `Nesplní zelený limit ${requiredPopulation} populace` };
  }

  function makeStrongComposition(remainingArmy) {
    const composition = {
      axe: Math.min(300, remainingArmy.axe || 0),
      light: Math.min(200, remainingArmy.light || 0),
      catapult: Math.min(100, remainingArmy.catapult || 0)
    };
    return Object.values(composition).some(value => value > 0)
      ? { composition, reason: '' }
      : { composition: null, reason: 'Chybí sekery, lehká jízda i katapulty' };
  }

  function slowestUnit(composition) {
    const units = Object.entries(composition || {})
      .filter(([, amount]) => amount > 0)
      .map(([unit]) => ({ unit, speed: Number(state.unitInfo[unit]?.speed || 0) }))
      .filter(item => item.speed > 0);
    if (!units.length) return null;
    return units.reduce((slowest, current) => current.speed >= slowest.speed ? current : slowest);
  }

  function compositionText(composition) {
    const labels = { spy: 'špeh', ram: 'ber', light: 'LJ', catapult: 'kat', axe: 'sek' };
    return Object.entries(composition || {})
      .filter(([, amount]) => amount > 0)
      .map(([unit, amount]) => `${amount} ${labels[unit] || unit}`)
      .join(' + ');
  }

  function subtractComposition(remainingArmy, composition) {
    for (const [unit, amount] of Object.entries(composition || {})) {
      remainingArmy[unit] = Math.max(0, (remainingArmy[unit] || 0) - amount);
    }
  }

  function findTiming(village, target, slowest, from, to, blockedFrom, blockedTo, spacing, occupiedArrivals) {
    const dist = distance(village.coord, target);
    const travelMs = dist * slowest.speed * 60000;
    const span = to - from;
    const step = Math.max(1000, spacing || 1000);
    const attempts = Math.max(120, Math.min(1500, Math.ceil(span / step)));

    for (let index = 0; index < attempts; index++) {
      const ratio = attempts === 1 ? 0 : index / (attempts - 1);
      const arrival = Math.round(from + span * ratio);
      const send = arrival - travelMs;
      if (send <= Date.now()) continue;
      if (isInsideBlockedInterval(send, blockedFrom, blockedTo)) continue;
      if (occupiedArrivals.some(existing => Math.abs(existing - arrival) < spacing)) continue;
      return { distance: dist, arrival, send };
    }
    return null;
  }

  async function buildPlan() {
    if (!Object.keys(state.unitInfo).length) await loadUnitInfo();
    const targets = [...new Set(el('#rfpTargets').value.split(/\s+/).map(extractCoord).filter(Boolean))];
    const from = new Date(el('#rfpFrom').value).getTime();
    const to = new Date(el('#rfpTo').value).getTime();
    const blockedFrom = parseTimeToMinutes(el('#rfpNightFrom').value);
    const blockedTo = parseTimeToMinutes(el('#rfpNightTo').value);
    const minDistance = Math.max(0, Number(el('#rfpMinDistance').value) || 0);
    const spacing = Math.max(0, Number(el('#rfpSpacing').value) || 0);
    const perVillage = Math.max(1, Math.floor(Number(el('#rfpPerVillage').value) || 1));
    const mode = el('input[name="rfpMode"]:checked')?.value || 'green';

    if (!state.villages.length) return setStatus('Nejdřív načti skupiny.', true);
    if (!targets.length) return setStatus('Zadej alespoň jeden cíl.', true);
    if (!(to > from)) return setStatus('Dopad do musí být později než Dopad od.', true);

    saveSettings();
    setStatus('Počítám globální plán…');

    const targetUsage = Object.fromEntries(targets.map(target => [target, 0]));
    const occupiedByTarget = Object.fromEntries(targets.map(target => [target, []]));
    const remainingByVillage = new Map(state.villages.map(village => [village.id, { ...(village.army || {}) }]));
    const jobs = [];
    for (const village of state.villages) {
      for (let copy = 0; copy < perVillage; copy++) jobs.push({ village, copy });
    }

    jobs.sort((a, b) => {
      const usableA = Object.values(a.village.army || {}).reduce((sum, value) => sum + value, 0);
      const usableB = Object.values(b.village.army || {}).reduce((sum, value) => sum + value, 0);
      return usableB - usableA;
    });

    state.plan = [];
    for (const job of jobs) {
      const remainingArmy = remainingByVillage.get(job.village.id) || {};
      const result = mode === 'strong'
        ? makeStrongComposition(remainingArmy)
        : makeGreenComposition(job.village, remainingArmy);

      if (!result.composition) {
        state.plan.push({ ...job, target: '-', composition: null, status: result.reason, send: null, arrival: null, distance: null });
        continue;
      }

      const slowest = slowestUnit(result.composition);
      if (!slowest) {
        state.plan.push({ ...job, target: '-', composition: result.composition, status: 'Nelze určit rychlost jednotek', send: null, arrival: null, distance: null });
        continue;
      }

      const targetCandidates = targets
        .filter(target => distance(job.village.coord, target) > minDistance)
        .sort((a, b) => targetUsage[a] - targetUsage[b] || distance(job.village.coord, b) - distance(job.village.coord, a));

      let selected = null;
      for (const target of targetCandidates) {
        const timing = findTiming(job.village, target, slowest, from, to, blockedFrom, blockedTo, spacing, occupiedByTarget[target]);
        if (timing) {
          selected = { target, ...timing };
          break;
        }
      }

      if (!selected) {
        state.plan.push({
          ...job,
          target: '-',
          composition: result.composition,
          status: `Nenalezena platná kombinace nad ${minDistance} polí`,
          send: null,
          arrival: null,
          distance: null
        });
        continue;
      }

      targetUsage[selected.target]++;
      occupiedByTarget[selected.target].push(selected.arrival);
      subtractComposition(remainingArmy, result.composition);
      state.plan.push({ ...job, ...selected, composition: result.composition, slowest, status: 'OK' });
    }

    state.plan.sort((a, b) => (a.send ?? Infinity) - (b.send ?? Infinity));
    renderPlan();
    const successful = state.plan.filter(item => item.send).length;
    const failed = state.plan.length - successful;
    setStatus(`Hotovo: ${successful}/${state.plan.length} faků.`, failed > 0);
    el('#rfpSummary').innerHTML = `
      <span class="pill">Úspěšné: ${successful}</span>
      <span class="pill">Vynechané: ${failed}</span>
      <span class="pill">Vesnice: ${state.villages.length}</span>
      <span class="pill">Cíle: ${targets.length}</span>`;
  }

  function buildSendUrl(row) {
    const [x, y] = row.target.split('|');
    const query = new URLSearchParams({ village: row.village.id, screen: 'place', x, y });
    for (const [unit, amount] of Object.entries(row.composition || {})) {
      if (amount > 0) query.set(unit, String(amount));
    }
    return `/game.php?${query.toString()}`;
  }

  function renderPlan() {
    el('#rfpResults').innerHTML = state.plan.map((row, index) => `
      <tr>
        <td>${index + 1}</td>
        <td>${esc(row.village.name)} (${row.village.coord})</td>
        <td>${row.village.points || '?'}</td>
        <td>${esc(row.target)}</td>
        <td>${row.distance == null ? '-' : row.distance.toFixed(1)}</td>
        <td>${row.composition ? esc(compositionText(row.composition)) : '-'}</td>
        <td>${row.send ? formatDateTime(row.send) : '-'}</td>
        <td>${row.arrival ? formatDateTime(row.arrival) : '-'}</td>
        <td class="${row.status === 'OK' ? 'ok' : 'bad'}">${esc(row.status)}</td>
        <td>${row.send ? `<a class="btn good" target="_blank" href="${esc(buildSendUrl(row))}">Otevřít</a>` : '-'}</td>
      </tr>`).join('');
  }

  function buildBBCode() {
    return state.plan.filter(row => row.send).map((row, index) => {
      const courtyardUrl = new URL(buildSendUrl(row), location.origin).href;
      return `${index + 1}. [coord]${row.village.coord}[/coord] → [coord]${row.target}[/coord] | ${compositionText(row.composition)} | ${row.distance.toFixed(1)} polí | odeslat [b]${formatDateTime(row.send)}[/b] | dopad ${formatDateTime(row.arrival)} | [url=${courtyardUrl}]ODESLAT[/url]`;
    }).join('\n');
  }

  el('#rfpBuild').onclick = () => buildPlan().catch(error => {
    console.error(error);
    setStatus(`Výpočet selhal: ${error.message}`, true);
  });
  el('#rfpCopy').onclick = async () => {
    const text = buildBBCode();
    if (!text) return setStatus('Není co kopírovat.', true);
    await navigator.clipboard.writeText(text);
    setStatus('BB-Code zkopírován.');
  };
  el('#rfpCsv').onclick = () => {
    const rows = [
      ['source', 'points', 'target', 'distance', 'army', 'send', 'arrival', 'status'],
      ...state.plan.map(row => [
        row.village.coord,
        row.village.points,
        row.target,
        row.distance ?? '',
        compositionText(row.composition),
        row.send ? formatDateTime(row.send) : '',
        row.arrival ? formatDateTime(row.arrival) : '',
        row.status
      ])
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    link.download = 'rayon_fake_plan.csv';
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  };

  for (const input of $$('input,textarea,select', panel)) {
    input.addEventListener('change', saveSettings);
  }

  (async () => {
    try {
      await loadUnitInfo();
      await loadGroups();
      setStatus('Připraveno. Vyber skupiny a načti vesnice.');
    } catch (error) {
      console.error(error);
      setStatus(`Spuštění selhalo: ${error.message}`, true);
    }
  })();
})();
