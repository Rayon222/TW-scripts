(() => {
  'use strict';

  const APP_ID = 'rayon-fake-planner-v2-3';
  const STORAGE_KEY = 'rayon_fake_planner_new_settings_v1';
  const POSITION_KEY = 'rayon_fake_planner_new_position_v1';
  const SEND_STATUS_KEY = 'rayon_fake_planner_send_status_v1';
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
    worldVillagePoints: null,
    groups: [],
    villages: [],
    plan: [],
    drag: null,
    sendFilter: 'all',
    sendStatuses: {}
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
      #${APP_ID} tr.send-opened{background:#fff4c7}
      #${APP_ID} tr.send-sent{background:#daf3df}
      #${APP_ID} .status-opened{color:#8a5b00;font-weight:800}
      #${APP_ID} .status-sent{color:#12652a;font-weight:800}
      #${APP_ID} .status-new{color:#5b7181;font-weight:800}
      #${APP_ID} .filterBar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:8px 0 12px}
      #${APP_ID} .filterBar select{width:auto;min-width:180px}
      @media(max-width:850px){#${APP_ID}{left:7px!important;top:7px!important;width:calc(100vw - 14px)!important}#${APP_ID} .grid,#${APP_ID} .row,#${APP_ID} .modes{grid-template-columns:1fr}}
    </style>
    <div class="head" id="rfpHead">
      <div class="title">🎭 Rayon Fake Planner v2.15</div>
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
            <label class="mode"><input type="radio" name="rfpMode" value="green" checked><b>Zelený fake</b><div class="small">1 % bodů vesnice rozdělené mezi sekery, lehkou jízdu, beranidla a katapulty podle dostupnosti.</div></label>
            <label class="mode"><input type="radio" name="rfpMode" value="strong"><b>Silný adaptivní</b><div class="small">300 seker, 200 lehké; při více než 50 katech až 100 katů, jinak až 100 beranů.</div></label>
          </div>
          <label>Maximální počet faků z jedné vesnice</label>
          <input id="rfpPerVillage" type="number" min="1" value="1">
        </section>
      </div>

      <div class="actions">
        <button class="btn primary" id="rfpBuild">VYPOČÍTAT PLÁN</button>
        <button class="btn good" id="rfpRefreshArmies">OBNOVIT ARMÁDY A PŘEPOČÍTAT</button>
        <button class="btn" id="rfpCopy">KOPÍROVAT BB-CODE</button>
        <button class="btn" id="rfpCsv">STÁHNOUT CSV</button>
      </div>
      <div id="rfpStatus" class="info">Připraveno.</div>
      <div id="rfpSummary" class="summary"></div>

      <section class="card" style="margin-top:14px">
        <h2>Výsledný plán</h2>
        <div class="filterBar">
          <label style="margin:0">Zobrazit:</label>
          <select id="rfpSendFilter">
            <option value="all">Všechny</option>
            <option value="pending">Jen neodeslané</option>
            <option value="opened">Jen otevřené</option>
            <option value="sent">Jen odeslané</option>
          </select>
          <button class="btn" id="rfpResetSendStatus">Vynulovat stav odeslání</button>
          <span class="pill" id="rfpSendProgress">Odesláno: 0 / 0</span>
        </div>
        <div class="tableWrap"><table>
          <thead><tr><th>#</th><th>Zdroj</th><th>Body</th><th>Cíl</th><th>Vzd.</th><th>Armáda</th><th>Odeslat</th><th>Dopad</th><th>Výpočet</th><th>Odeslání</th><th>Akce</th></tr></thead>
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

  const COLLAPSED_KEY = 'rayon_fake_planner_collapsed';
  function setCollapsed(collapsed) {
    const body = el('#rfpBody');
    body.style.display = collapsed ? 'none' : 'block';
    el('#rfpMin').textContent = collapsed ? 'Rozbalit' : 'Sbalit';
    panel.style.maxHeight = collapsed ? 'none' : '94vh';
    try { localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0'); } catch {}
  }
  el('#rfpMin').onclick = () => setCollapsed(el('#rfpBody').style.display !== 'none');
  try { setCollapsed(localStorage.getItem(COLLAPSED_KEY) === '1'); } catch {}

  async function fetchText(url) {
    const response = await fetch(url, { credentials: 'same-origin', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
    return response.text();
  }

  async function loadWorldVillagePoints() {
    if (state.worldVillagePoints) return state.worldVillagePoints;
    const text = await fetchText('/map/village.txt');
    const byId = new Map();
    const byCoord = new Map();
    for (const line of text.split(/\r?\n/)) {
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 7) continue;
      const id = String(parts[0] || '').trim();
      const x = Number(parts[2]);
      const y = Number(parts[3]);
      const points = Number(parts[5]);
      if (!id || !Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(points)) continue;
      byId.set(id, points);
      byCoord.set(`${x}|${y}`, points);
    }
    state.worldVillagePoints = { byId, byCoord };
    return state.worldVillagePoints;
  }

  async function loadUnitInfo() {
    const xml = await fetchText('/interface.php?func=get_unit_info');
    const doc = new DOMParser().parseFromString(xml, 'text/xml');
    state.unitInfo = {};
    for (const node of [...doc.documentElement.children]) {
      state.unitInfo[node.tagName] = {
        speed: Number(node.querySelector('speed')?.textContent || 0),
        pop: Number(node.querySelector('pop')?.textContent || node.querySelector('population')?.textContent || 1)
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

  function detectPointsColumn(table) {
    const rows = $$('thead tr, tr', table).slice(0, 5);
    for (const row of rows) {
      for (let index = 0; index < row.cells.length; index++) {
        const cell = row.cells[index];
        const image = cell.querySelector('img');
        const haystack = [
          cell.textContent,
          cell.title,
          cell.getAttribute('data-title'),
          cell.getAttribute('data-field'),
          cell.getAttribute('data-sort-type'),
          cell.className,
          image?.alt,
          image?.title,
          image?.src
        ].filter(Boolean).join(' ').toLowerCase();
        if (/\b(body|bodů|bodu|points?|village_points)\b/.test(haystack)) return index;
      }
    }
    return -1;
  }

  function numericCellValue(cell) {
    if (!cell) return 0;
    const attributes = [
      cell.getAttribute('data-sort-value'),
      cell.getAttribute('data-value'),
      cell.dataset?.sortValue,
      cell.dataset?.value,
      cell.title
    ];
    for (const value of attributes) {
      const parsed = numberFromText(value);
      if (parsed > 0) return parsed;
    }
    return numberFromText(cell.textContent);
  }

  function parsePoints(row, pointsColumn = -1) {
    // 1) Přesná hodnota uložená přímo na řádku.
    for (const raw of [row.dataset?.points, row.getAttribute('data-points'), row.dataset?.villagePoints]) {
      const value = numberFromText(raw);
      if (value > 0) return value;
    }

    // 2) Sloupec určený podle hlavičky Body/Points. Použijeme data-sort-value,
    // protože zobrazený text může obsahovat tečky, mezery nebo další značky.
    if (pointsColumn >= 0 && row.cells?.[pointsColumn]) {
      const value = numericCellValue(row.cells[pointsColumn]);
      if (value > 0) return value;
    }

    // 3) Explicitně označená buňka s body.
    const explicit = row.querySelector('td.points, .points, [data-field="points"], [data-field="body"], [data-title="Body"], [data-title="Points"]');
    if (explicit) {
      const value = numericCellValue(explicit.closest('td') || explicit);
      if (value > 0) return value;
    }

    // Žádné hádání z ostatních čísel v řádku. Chybných 100 místo 104 vznikalo
    // právě tím, že se za body považovalo jiné číslo z přehledu.
    return 0;
  }

  function parseVillageRows(doc) {
    const villages = [];
    for (const table of $$('table', doc)) {
      const pointsColumn = detectPointsColumn(table);
      for (const row of $$('tr', table)) {
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
          points: parsePoints(row, pointsColumn),
          army: {}
        });
      }
    }
    return uniqueBy(villages, village => village.id);
  }

  const KNOWN_UNITS = ['spear', 'sword', 'axe', 'spy', 'light', 'heavy', 'ram', 'catapult'];

  function unitFromElement(element) {
    if (!element) return '';
    const image = element.matches?.('img') ? element : element.querySelector?.('img');
    const source = [
      element.dataset?.unit,
      element.getAttribute?.('data-unit'),
      element.className,
      element.getAttribute?.('title'),
      image?.src,
      image?.alt,
      image?.title,
      image?.className
    ].filter(Boolean).join(' ');
    const match = source.match(/unit_(spear|sword|axe|spy|light|heavy|ram|catapult)|(?:^|[\s_-])(spear|sword|axe|spy|light|heavy|ram|catapult)(?:$|[\s_-])/i);
    return (match?.[1] || match?.[2] || '').toLowerCase();
  }

  function readUnitValue(cell) {
    if (!cell) return null;
    const candidates = [
      cell.dataset?.count,
      cell.getAttribute?.('data-count'),
      cell.dataset?.value,
      cell.getAttribute?.('data-value'),
      cell.textContent
    ];
    for (const candidate of candidates) {
      if (candidate == null || String(candidate).trim() === '') continue;
      const value = numberFromText(candidate);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function detectUnitColumns(table) {
    // Vybereme řádek, který obsahuje nejvíce přesně rozpoznaných ikon jednotek.
    // Tím se vyhneme chybnému posunu sloupců kvůli nadpisům s colspan.
    let best = {};
    for (const row of $$('tr', table)) {
      const current = {};
      [...(row.cells || [])].forEach((cell, index) => {
        const candidates = [cell, ...$$('img,[data-unit],[class*="unit"]', cell)];
        for (const candidate of candidates) {
          const unit = unitFromElement(candidate);
          if (unit && current[unit] == null) {
            current[unit] = index;
            break;
          }
        }
      });
      if (Object.keys(current).length > Object.keys(best).length) best = current;
    }
    return best;
  }

  function parseArmyRows(doc) {
    const result = new Map();

    for (const table of $$('table', doc)) {
      const columns = detectUnitColumns(table);

      for (const row of $$('tr', table)) {
        const villageCoord = extractCoord(row.textContent);
        if (!villageCoord || !row.cells?.length) continue;

        const parsed = {};

        // 1) Nejspolehlivější cesta: buňka označená přímo názvem jednotky.
        for (const unit of KNOWN_UNITS) {
          const direct = row.querySelector(
            `[data-unit="${unit}"], .unit-item-${unit}, .unit_${unit}, td[class~="${unit}"]`
          );
          const directCell = direct?.closest?.('td') || (direct?.tagName === 'TD' ? direct : null);
          const directValue = readUnitValue(directCell || direct);
          if (directValue != null) parsed[unit] = directValue;
        }

        // 2) Přesný index sloupce z řádku ikon jednotek.
        for (const unit of KNOWN_UNITS) {
          if (parsed[unit] != null) continue;
          const index = columns[unit];
          if (index == null || index >= row.cells.length) continue;
          const value = readUnitValue(row.cells[index]);
          if (value != null) parsed[unit] = value;
        }

        // 3) Poslední záloha: rozpoznání jednotky uvnitř každé buňky.
        [...row.cells].forEach(cell => {
          const candidates = [cell, ...$$('img,[data-unit],[class*="unit"]', cell)];
          for (const candidate of candidates) {
            const unit = unitFromElement(candidate);
            if (!unit || !KNOWN_UNITS.includes(unit)) continue;
            const value = readUnitValue(cell);
            if (value != null) parsed[unit] = Math.max(parsed[unit] || 0, value);
            break;
          }
        });

        if (!Object.keys(parsed).length) continue;
        const merged = result.get(villageCoord) || {};
        for (const [unit, valueRaw] of Object.entries(parsed)) {
          const value = Number(valueRaw);
          if (Number.isFinite(value)) merged[unit] = Math.max(Number(merged[unit] || 0), value);
        }
        result.set(villageCoord, merged);
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
    let worldPoints = null;
    try { worldPoints = await loadWorldVillagePoints(); } catch (error) { console.warn('Nelze načíst /map/village.txt', error); }
    for (const village of villages) {
      village.army = armies.get(village.coord) || {};

      // Body z právě načteného přehledu jsou aktuálnější než /map/village.txt.
      // Mapový soubor může být několik minut opožděný, což u 1% limitu způsobí
      // rozdíl několika obyvatel (např. hra požaduje 104, ale plánovač spočítá 100).
      // /map/village.txt proto používáme jen jako zálohu, pokud přehled body neobsahuje.
      if (!(Number(village.points) > 0)) {
        const fallbackPoints = worldPoints?.byId.get(String(village.id)) ?? worldPoints?.byCoord.get(village.coord);
        if (Number.isFinite(fallbackPoints) && fallbackPoints > 0) village.points = fallbackPoints;
      }
    }
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
      if (!existing) {
        merged.set(village.id, village);
      } else {
        for (const unit of KNOWN_UNITS) {
          existing.army[unit] = Math.max(
            Number(existing.army?.[unit] || 0),
            Number(village.army?.[unit] || 0)
          );
        }
        if (!(Number(existing.points) > 0) && Number(village.points) > 0) existing.points = village.points;
      }
    }
    state.villages = [...merged.values()];
    const armyCount = state.villages.filter(village => Object.values(village.army || {}).some(value => value > 0)).length;
    el('#rfpVillageInfo').innerHTML = `Načteno <b>${state.villages.length}</b> vesnic; armáda rozpoznána u <b>${armyCount}</b>.${errors.length ? `<br>Chyby: ${esc(errors.join(' | '))}` : ''}`;
    setStatus(state.villages.length ? `Načteno ${state.villages.length} vesnic.` : 'Nenačetla se žádná vesnice.', !state.villages.length);
  }

  el('#rfpLoadGroups').onclick = () => loadSelectedGroups().catch(error => setStatus(error.message, true));

  el('#rfpRefreshArmies').onclick = async () => {
    const button = el('#rfpRefreshArmies');
    const originalText = button.textContent;
    button.disabled = true;
    button.textContent = 'OBNOVUJI ARMÁDY…';
    try {
      await loadSelectedGroups();
      if (!state.villages.length) return;
      if (el('#rfpTargets').value.trim()) {
        button.textContent = 'PŘEPOČÍTÁVÁM PLÁN…';
        await buildPlan();
      } else {
        setStatus(`Armády obnoveny u ${state.villages.length} vesnic.`);
      }
    } catch (error) {
      console.error(error);
      setStatus(`Obnovení armád selhalo: ${error.message}`, true);
    } finally {
      button.disabled = false;
      button.textContent = originalText;
    }
  };

  function makeGreenComposition(village, remainingArmy) {
    const villagePoints = Math.max(0, Number(village.points) || 0);
    if (!villagePoints) return { composition: null, reason: 'Vesnice nemá správně rozpoznané body' };

    // Zelený fake musí mít alespoň 1 % bodů vesnice vyjádřené populací.
    // Současně hra nepovolí útočný příkaz pod 100 populace.
    const onePercentPopulation = Math.ceil(villagePoints * 0.01);
    const requiredPopulation = Math.max(100, onePercentPopulation);
    const allowed = ['axe', 'light', 'ram', 'catapult'];

    const units = allowed.map(unit => ({
      unit,
      pop: Math.max(1, Number(state.unitInfo[unit]?.pop || 1)),
      available: Math.max(0, Math.floor(Number(remainingArmy[unit] || 0)))
    })).filter(item => item.available > 0);

    if (!units.length) {
      return { composition: null, reason: 'Chybí sekery, lehká jízda, beranidla i katapulty' };
    }

    const totalAvailablePopulation = units.reduce((sum, item) => sum + item.available * item.pop, 0);
    if (totalAvailablePopulation < requiredPopulation) {
      return { composition: null, reason: `Dostupné jednotky mají jen ${totalAvailablePopulation} populace; potřeba je ${requiredPopulation}` };
    }

    // Stačí hledat do hranice required + nejvyšší populace jednotky - 1.
    // Pokud přesný součet nejde vytvořit, vybere se nejmenší možné překročení.
    const maxUnitPopulation = Math.max(...units.map(item => item.pop));
    const limit = requiredPopulation + maxUnitPopulation - 1;
    const empty = Object.fromEntries(allowed.map(unit => [unit, 0]));
    let states = new Map([[0, empty]]);

    const quality = composition => {
      const contributions = units
        .map(item => (composition[item.unit] || 0) * item.pop)
        .filter(value => value > 0);
      const diversity = contributions.length;
      if (!diversity) return { diversity: 0, spread: Infinity, pieces: Infinity };
      const mean = contributions.reduce((sum, value) => sum + value, 0) / diversity;
      const spread = contributions.reduce((sum, value) => sum + Math.abs(value - mean), 0);
      const pieces = allowed.reduce((sum, unit) => sum + (composition[unit] || 0), 0);
      return { diversity, spread, pieces };
    };

    const isBetterAtSamePopulation = (candidate, current) => {
      if (!current) return true;
      const a = quality(candidate);
      const b = quality(current);
      // Při stejném populačním součtu rozdělíme fake mezi co nejvíce
      // dostupných typů, potom co nejrovnoměrněji podle populace.
      if (a.diversity !== b.diversity) return a.diversity > b.diversity;
      if (a.spread !== b.spread) return a.spread < b.spread;
      return a.pieces < b.pieces;
    };

    for (const item of units) {
      const next = new Map(states);
      const maxUseful = Math.min(item.available, Math.ceil(limit / item.pop));
      for (const [population, composition] of states) {
        for (let count = 1; count <= maxUseful; count++) {
          const newPopulation = population + count * item.pop;
          if (newPopulation > limit) break;
          const candidate = { ...composition, [item.unit]: count };
          if (isBetterAtSamePopulation(candidate, next.get(newPopulation))) {
            next.set(newPopulation, candidate);
          }
        }
      }
      states = next;
    }

    let chosenPopulation = -1;
    let composition = null;
    for (let population = requiredPopulation; population <= limit; population++) {
      const candidate = states.get(population);
      if (!candidate) continue;
      chosenPopulation = population;
      composition = candidate;
      break;
    }

    if (!composition) {
      return { composition: null, reason: `Nelze složit fake o alespoň ${requiredPopulation} populace` };
    }

    // Bezpečnostní kontrola: součet se počítá z reálné populace každé jednotky.
    const calculatedPopulation = allowed.reduce((sum, unit) => {
      const unitPopulation = Math.max(1, Number(state.unitInfo[unit]?.pop || 1));
      return sum + (composition[unit] || 0) * unitPopulation;
    }, 0);
    if (calculatedPopulation !== chosenPopulation || calculatedPopulation < requiredPopulation) {
      return { composition: null, reason: 'Interní chyba při výpočtu populace faku' };
    }

    return { composition, reason: '' };
  }

  function makeStrongComposition(remainingArmy, originalArmy) {
    const availableCatapults = Math.max(0, Math.floor(Number(remainingArmy.catapult || 0)));
    const availableRams = Math.max(0, Math.floor(Number(remainingArmy.ram || 0)));
    const originalCatapults = Math.max(0, Math.floor(Number(originalArmy?.catapult || 0)));

    // Typ obléhací jednotky se určí jednou podle původního stavu vesnice.
    // Když měla vesnice na začátku více než 50 katapultů, všechny její faky
    // používají katapulty. Po prvním faku se tedy nepřepne na berany jen proto,
    // že v plánovaném zůstatku klesl počet katapultů pod 50.
    const useCatapults = originalCatapults > 50;
    const composition = {
      axe: Math.min(300, Math.max(0, Math.floor(Number(remainingArmy.axe || 0)))),
      light: Math.min(200, Math.max(0, Math.floor(Number(remainingArmy.light || 0)))),
      ram: useCatapults ? 0 : Math.min(100, availableRams),
      catapult: useCatapults ? Math.min(100, availableCatapults) : 0
    };

    return Object.values(composition).some(value => value > 0)
      ? { composition, reason: '' }
      : { composition: null, reason: 'Chybí sekery, lehká jízda, beranidla i katapulty' };
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
        ? makeStrongComposition(remainingArmy, job.village.army || {})
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

  function loadSendStatuses() {
    try { state.sendStatuses = JSON.parse(localStorage.getItem(SEND_STATUS_KEY) || '{}') || {}; }
    catch { state.sendStatuses = {}; }
  }

  function saveSendStatuses() {
    try { localStorage.setItem(SEND_STATUS_KEY, JSON.stringify(state.sendStatuses)); } catch {}
  }

  function rowSendId(row) {
    return [row.village?.id || row.village?.coord, row.target, row.send || '', compositionText(row.composition || {})].join('::');
  }

  function getSendStatus(row) {
    return state.sendStatuses[rowSendId(row)] || 'new';
  }

  function setSendStatus(row, status) {
    state.sendStatuses[rowSendId(row)] = status;
    saveSendStatuses();
    renderPlan();
  }

  function sendStatusLabel(status) {
    if (status === 'sent') return '✅ Odesláno';
    if (status === 'opened') return '🟨 Otevřeno';
    return '⬜ Neodesláno';
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
    const successfulRows = state.plan.filter(row => row.send);
    const visibleRows = state.plan.filter(row => {
      if (!row.send) return state.sendFilter === 'all';
      const status = getSendStatus(row);
      if (state.sendFilter === 'pending') return status === 'new';
      if (state.sendFilter === 'opened') return status === 'opened';
      if (state.sendFilter === 'sent') return status === 'sent';
      return true;
    });

    el('#rfpResults').innerHTML = visibleRows.map(row => {
      const index = state.plan.indexOf(row);
      const sendStatus = row.send ? getSendStatus(row) : 'new';
      const rowClass = sendStatus === 'sent' ? 'send-sent' : sendStatus === 'opened' ? 'send-opened' : '';
      const statusClass = sendStatus === 'sent' ? 'status-sent' : sendStatus === 'opened' ? 'status-opened' : 'status-new';
      return `
      <tr class="${rowClass}">
        <td>${index + 1}</td>
        <td>${esc(row.village.name)} (${row.village.coord})</td>
        <td>${row.village.points || '?'}</td>
        <td>${esc(row.target)}</td>
        <td>${row.distance == null ? '-' : row.distance.toFixed(1)}</td>
        <td>${row.composition ? esc(compositionText(row.composition)) : '-'}</td>
        <td>${row.send ? formatDateTime(row.send) : '-'}</td>
        <td>${row.arrival ? formatDateTime(row.arrival) : '-'}</td>
        <td class="${row.status === 'OK' ? 'ok' : 'bad'}">${esc(row.status)}</td>
        <td class="${statusClass}">${row.send ? sendStatusLabel(sendStatus) : '-'}</td>
        <td>${row.send ? (
          sendStatus === 'new'
            ? `<button class="btn good rfpOpenSend" type="button" data-row-index="${index}">ODESLAT</button>`
            : sendStatus === 'opened'
              ? `<button class="btn good rfpMarkSent" type="button" data-row-index="${index}">✅ POTVRDIT</button>
                 <button class="btn rfpResetOne" type="button" data-row-index="${index}">↩ VRÁTIT</button>`
              : `<button class="btn rfpResetOne" type="button" data-row-index="${index}">↩ VRÁTIT</button>`
        ) : '-'}</td>
      </tr>`;
    }).join('');

    const sent = successfulRows.filter(row => getSendStatus(row) === 'sent').length;
    const opened = successfulRows.filter(row => getSendStatus(row) === 'opened').length;
    const progress = el('#rfpSendProgress');
    if (progress) progress.textContent = `Odesláno: ${sent} / ${successfulRows.length} • Otevřeno: ${opened}`;
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  }

  function formatSendDate(timestamp) {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function formatSendTime(timestamp) {
    const d = new Date(timestamp);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${String(d.getMilliseconds()).padStart(3, '0')}`;
  }

  function buildBBCode() {
    const successfulRows = state.plan.filter(row => row.send);
    if (!successfulRows.length) return '';

    const lines = [
      '[table]',
      '[**]Výchozí vesnice[||]Cíl[||]Vzdálenost[||]Doba[||]Datum[||]Čas[||]Stav[||]ODESLAT[/**]'
    ];

    for (const row of successfulRows) {
      const courtyardUrl = new URL(buildSendUrl(row), location.origin).href;
      const travelDuration = formatDuration(row.arrival - row.send);
      lines.push(
        `[*][coord]${row.village.coord}[/coord]` +
        `[|][coord]${row.target}[/coord]` +
        `[|]${row.distance.toFixed(2)}` +
        `[|]${travelDuration}` +
        `[|]${formatSendDate(row.send)}` +
        `[|]${formatSendTime(row.send)}` +
        `[|]${getSendStatus(row) === 'sent' ? '[color=#16813a][b]✅ ODESLÁNO[/b][/color]' : getSendStatus(row) === 'opened' ? '[color=#b77900][b]🟨 OTEVŘENO[/b][/color]' : '[color=#777777]⬜ NEODESLÁNO[/color]'}` +
        `[|][url=${courtyardUrl}][b]ODESLAT[/b][/url][/*]`
      );
    }

    lines.push('[/table]');
    return lines.join('\n');
  }

  el('#rfpResults').addEventListener('click', event => {
    const openButton = event.target.closest('.rfpOpenSend');
    if (openButton) {
      event.preventDefault();
      const row = state.plan[Number(openButton.dataset.rowIndex)];
      if (!row) return;

      // Novou kartu otevřeme přímo během kliknutí, aby ji prohlížeč nezablokoval.
      // Stav uložíme a překreslíme ještě před načtením nádvoří.
      const sendWindow = window.open('about:blank', '_blank');
      setSendStatus(row, 'opened');
      if (sendWindow) {
        sendWindow.location.href = buildSendUrl(row);
      } else {
        // Záloha pro případ blokování vyskakovacích oken.
        window.location.href = buildSendUrl(row);
      }
      return;
    }

    const markButton = event.target.closest('.rfpMarkSent');
    if (markButton) {
      const row = state.plan[Number(markButton.dataset.rowIndex)];
      if (row) setSendStatus(row, 'sent');
      return;
    }

    const resetButton = event.target.closest('.rfpResetOne');
    if (resetButton) {
      const row = state.plan[Number(resetButton.dataset.rowIndex)];
      if (row) setSendStatus(row, 'new');
    }
  });

  el('#rfpSendFilter').onchange = event => {
    state.sendFilter = event.target.value;
    renderPlan();
  };

  el('#rfpResetSendStatus').onclick = () => {
    if (!confirm('Opravdu vynulovat všechny stavy odeslání?')) return;
    state.sendStatuses = {};
    saveSendStatuses();
    renderPlan();
    setStatus('Stavy odeslání byly vynulovány.');
  };

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

  loadSendStatuses();

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
