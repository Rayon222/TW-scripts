(async () => {
  try {
    const APP_ID = 'mk_map_marker_v8';
    const STORAGE_KEY = 'mk_map_marker_v1_data';
    const SETTINGS_KEY = 'mk_map_marker_v8_settings';
    const VERSION = 'v8-investigation';

    if (window.__mkMapMarkerV8?.showPanel) {
      window.__mkMapMarkerV8.showPanel();
      return;
    }

    for (const old of [
      window.__mkMapMarkerV4,
      window.__mkMapMarkerV5,
      window.__mkMapMarkerV6,
      window.__mkMapMarkerV7
    ]) {
      if (old?.destroy) {
        try { old.destroy(); } catch (_) {}
      }
    }

    const COLORS = [
      { key: 'black', label: 'Černá', color: '#000000' },
      { key: 'green', label: 'Zelená', color: '#00a000' },
      { key: 'pink', label: 'Pink', color: '#ff1493' },
    ];

    const loadJson = (key, fallback) => {
      try {
        const value = JSON.parse(localStorage.getItem(key) || 'null');
        return value && typeof value === 'object' ? value : fallback;
      } catch (_) {
        return fallback;
      }
    };

    const marks = loadJson(STORAGE_KEY, {});
    const settings = Object.assign({
      activeColor: 'black',
      panelMinimized: false,
      debugOpen: true,
      circle: false
    }, loadJson(SETTINGS_KEY, {}));

    const saveMarks = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    const state = {
      startedAt: new Date(),
      initCalls: 0,
      focusCalls: 0,
      moveCalls: 0,
      repaintCalls: 0,
      repaintWithVillages: 0,
      lastVillageCount: 0,
      lastPaintedCount: 0,
      handlerChanges: 0,
      mapChanges: 0,
      rootChanges: 0,
      observerEvents: 0,
      lastEvent: 'start',
      lastRepaint: '-',
      status: 'START',
      hooked: false
    };

    const logItems = [];
    const objectIds = new WeakMap();
    let nextObjectId = 1;
    const objectId = (obj) => {
      if (!obj || (typeof obj !== 'object' && typeof obj !== 'function')) return '-';
      if (!objectIds.has(obj)) objectIds.set(obj, nextObjectId++);
      return objectIds.get(obj);
    };

    const now = () => {
      const d = new Date();
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}.${String(d.getMilliseconds()).padStart(3, '0')}`;
    };

    const addLog = (text) => {
      state.lastEvent = text;
      logItems.unshift(`${now()}  ${text}`);
      if (logItems.length > 30) logItems.length = 30;
      updateDebug();
    };

    const getColor = (key) => COLORS.find((c) => c.key === key) || COLORS[0];

    const villageIdByCoords = (x, y) => {
      const villages = window.TWMap?.villages;
      if (!villages) return null;
      const village = villages[parseInt(`${x}${y}`, 10)];
      return village?.id || null;
    };

    const villageElement = (x, y) => {
      const id = villageIdByCoords(x, y);
      return id ? document.getElementById(`map_village_${id}`) : null;
    };

    const STYLE_ID = 'mk_map_marker_v8_style';
    document.getElementById(STYLE_ID)?.remove();
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      [data-mk-v8-color="black"] { outline:4px solid #000 !important; outline-offset:-3px !important; z-index:30 !important; }
      [data-mk-v8-color="green"] { outline:4px solid #00a000 !important; outline-offset:-3px !important; z-index:30 !important; }
      [data-mk-v8-color="pink"]  { outline:4px solid #ff1493 !important; outline-offset:-3px !important; z-index:30 !important; }
      [data-mk-v8-shape="circle"] { border-radius:50% !important; }
      [data-mk-v8-color] { box-sizing:border-box !important; }
    `;
    document.head.appendChild(style);

    const paint = (x, y) => {
      const el = villageElement(x, y);
      if (!el) return false;
      const mark = marks[`${x}|${y}`];
      if (!mark) {
        el.removeAttribute('data-mk-v8-color');
        el.removeAttribute('data-mk-v8-shape');
        return true;
      }
      el.setAttribute('data-mk-v8-color', mark.key);
      if (mark.shape === 'circle') el.setAttribute('data-mk-v8-shape', 'circle');
      else el.removeAttribute('data-mk-v8-shape');
      return true;
    };

    const repaintAll = (reason = 'manual') => {
      state.repaintCalls++;
      state.lastRepaint = now();
      const villageCount = document.querySelectorAll('[id^="map_village_"]').length;
      state.lastVillageCount = villageCount;
      if (villageCount) state.repaintWithVillages++;

      let painted = 0;
      Object.keys(marks).forEach((coord) => {
        const [x, y] = coord.split('|').map(Number);
        if (paint(x, y)) painted++;
      });
      state.lastPaintedCount = painted;
      state.status = villageCount ? 'OK' : 'WAITING FOR VILLAGES';
      updateDebug();
      return { villageCount, painted, reason };
    };

    const scheduleRepaint = (reason) => {
      [0, 80, 180, 350, 700, 1200].forEach((delay, index) => {
        setTimeout(() => {
          const result = repaintAll(`${reason}:${delay}`);
          if (index === 0 || (result.villageCount && index > 0)) {
            addLog(`REPAINT ${reason} | villages ${result.villageCount} | painted ${result.painted}`);
          }
        }, delay);
      });
    };

    const clearVisible = () => {
      document.querySelectorAll('[data-mk-v8-color], [data-mk-v8-shape]').forEach((el) => {
        el.removeAttribute('data-mk-v8-color');
        el.removeAttribute('data-mk-v8-shape');
      });
    };

    const count = (key) => Object.values(marks).filter((m) => m.key === key).length;
    const coordsFor = (key = null) => Object.keys(marks)
      .filter((coord) => !key || marks[coord].key === key)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const panel = document.createElement('div');
    panel.id = APP_ID;
    panel.style.cssText = 'position:fixed;top:82px;right:18px;z-index:10000;width:285px;max-height:86vh;overflow:auto;background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;padding:10px;font:13px Arial;color:#2b1b09;box-shadow:0 4px 18px #0008';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <b style="font-size:16px">Označení vesnic v8</b>
        <div><button id="mk8_min">−</button> <button id="mk8_hide">✕</button></div>
      </div>
      <div id="mk8_body" style="margin-top:8px">
        <div style="padding:7px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
          Drž <b>Shift</b> a klikni na vesnici.
        </div>
        <div style="margin-top:8px"><b>Aktivní barva:</b></div>
        <div id="mk8_colors" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:5px">
          ${COLORS.map((c) => `<button type="button" data-color="${c.key}" style="border:3px solid ${c.color};font-weight:bold">${c.label}</button>`).join('')}
        </div>
        <div style="margin-top:8px;line-height:1.6">
          ⬛ <b id="mk8_black">0</b> &nbsp; 🟩 <b id="mk8_green">0</b> &nbsp; 🩷 <b id="mk8_pink">0</b>
        </div>
        <label style="display:block;margin:7px 0"><input id="mk8_circle" type="checkbox"> Kruh pro nová označení</label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px">
          <button data-copy="black">Kopírovat černé</button>
          <button data-copy="green">Kopírovat zelené</button>
          <button data-copy="pink">Kopírovat pink</button>
          <button id="mk8_copyall">Kopírovat vše</button>
          <button id="mk8_repaint">Překreslit teď</button>
          <button id="mk8_clear">Vymazat vše</button>
        </div>
        <div id="mk8_msg" style="margin-top:7px;font-weight:bold"></div>

        <button id="mk8_debug_toggle" style="width:100%;margin-top:10px;font-weight:bold">Diagnostika</button>
        <div id="mk8_debug" style="margin-top:6px;background:#1f1f1f;color:#e9e9e9;border-radius:5px;padding:7px;font:12px monospace">
          <div id="mk8_stats"></div>
          <button id="mk8_copydebug" style="width:100%;margin:7px 0 5px">Copy Debug</button>
          <div id="mk8_log" style="max-height:190px;overflow:auto;white-space:pre-wrap;border-top:1px solid #666;padding-top:5px"></div>
        </div>
      </div>`;
    document.body.appendChild(panel);

    const $ = (s) => panel.querySelector(s);
    const msg = (text) => { $('#mk8_msg').textContent = text; };

    function updateCounts() {
      $('#mk8_black').textContent = count('black');
      $('#mk8_green').textContent = count('green');
      $('#mk8_pink').textContent = count('pink');
      panel.querySelectorAll('[data-color]').forEach((btn) => {
        const active = btn.dataset.color === settings.activeColor;
        btn.style.background = active ? getColor(btn.dataset.color).color : '';
        btn.style.color = active && btn.dataset.color !== 'green' ? '#fff' : '';
        btn.style.boxShadow = active ? '0 0 0 2px #fff inset' : '';
      });
    }

    function debugText() {
      const map = window.TWMap?.map;
      const handler = map?.handler;
      const root = currentMapRoot();
      return [
        `Version: ${VERSION}`,
        `Status: ${state.status}`,
        `TWMap.map object: #${objectId(map)}`,
        `Handler object: #${objectId(handler)}`,
        `Map root object: #${objectId(root)}`,
        `Map changes: ${state.mapChanges}`,
        `Handler changes: ${state.handlerChanges}`,
        `Root changes: ${state.rootChanges}`,
        `TWMap.init calls: ${state.initCalls}`,
        `focusSubmit calls: ${state.focusCalls}`,
        `onMovePixel calls: ${state.moveCalls}`,
        `Observer events: ${state.observerEvents}`,
        `Repaint calls: ${state.repaintCalls}`,
        `Repaints with villages: ${state.repaintWithVillages}`,
        `Villages now: ${state.lastVillageCount}`,
        `Markers stored: ${Object.keys(marks).length}`,
        `Markers painted: ${state.lastPaintedCount}`,
        `Hooked: ${state.hooked ? 'YES' : 'NO'}`,
        `Last repaint: ${state.lastRepaint}`,
        `Last event: ${state.lastEvent}`,
        '',
        'Event log:',
        ...logItems.slice().reverse()
      ].join('\n');
    }

    function updateDebug() {
      if (!panel.isConnected) return;
      const map = window.TWMap?.map;
      const handler = map?.handler;
      const root = currentMapRoot();
      $('#mk8_stats').innerHTML = `
        <div>Status: <b>${state.status}</b></div>
        <div>Map: #${objectId(map)} | Handler: #${objectId(handler)} | Root: #${objectId(root)}</div>
        <div>INIT ${state.initCalls} | FOCUS ${state.focusCalls} | MOVE ${state.moveCalls}</div>
        <div>Map změny ${state.mapChanges} | Handler změny ${state.handlerChanges}</div>
        <div>REPAINT ${state.repaintCalls} | Vesnice ${state.lastVillageCount} | Označeno ${state.lastPaintedCount}</div>
        <div>Poslední: ${state.lastRepaint}</div>`;
      $('#mk8_log').textContent = logItems.join('\n');
    }

    const copyText = async (text) => {
      try {
        await navigator.clipboard.writeText(text);
      } catch (_) {
        const ta = document.createElement('textarea');
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
      }
    };

    panel.querySelectorAll('[data-color]').forEach((btn) => {
      btn.onclick = () => {
        settings.activeColor = btn.dataset.color;
        saveSettings();
        updateCounts();
        msg(`Aktivní barva: ${getColor(settings.activeColor).label}.`);
      };
    });

    $('#mk8_circle').checked = !!settings.circle;
    $('#mk8_circle').onchange = () => {
      settings.circle = $('#mk8_circle').checked;
      saveSettings();
    };

    panel.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = async () => {
        const coords = coordsFor(btn.dataset.copy);
        if (!coords.length) return msg('V této barvě není žádná vesnice.');
        await copyText(coords.join('\n'));
        msg(`Zkopírováno: ${coords.length}.`);
      };
    });

    $('#mk8_copyall').onclick = async () => {
      const coords = coordsFor();
      if (!coords.length) return msg('Není označena žádná vesnice.');
      await copyText(coords.join('\n'));
      msg(`Zkopírováno: ${coords.length}.`);
    };

    $('#mk8_repaint').onclick = () => {
      const result = repaintAll('button');
      addLog(`MANUAL REPAINT | villages ${result.villageCount} | painted ${result.painted}`);
      msg(`Vesnice: ${result.villageCount}, označeno: ${result.painted}.`);
    };

    $('#mk8_clear').onclick = () => {
      if (!confirm('Opravdu vymazat všechna označení?')) return;
      Object.keys(marks).forEach((key) => delete marks[key]);
      saveMarks();
      clearVisible();
      updateCounts();
      addLog('ALL MARKERS CLEARED');
      msg('Označení vymazána.');
    };

    $('#mk8_copydebug').onclick = async () => {
      await copyText(debugText());
      msg('Diagnostika zkopírována.');
    };

    $('#mk8_debug_toggle').onclick = () => {
      settings.debugOpen = !settings.debugOpen;
      saveSettings();
      $('#mk8_debug').style.display = settings.debugOpen ? '' : 'none';
    };
    $('#mk8_debug').style.display = settings.debugOpen ? '' : 'none';

    let hookedHandler = null;
    let originalOnClick = null;
    let originalOnMovePixel = null;
    let currentMap = null;
    let currentRoot = null;
    let mapObserver = null;
    let bodyObserver = null;
    let monitorTimer = null;

    const currentMapRoot = () =>
      document.querySelector('#map_wrap, #map, #map_container, .map_container, .map-wrapper') ||
      document.querySelector('[id^="map_village_"]')?.parentElement ||
      null;

    const unhookHandler = () => {
      if (hookedHandler) {
        if (originalOnClick && hookedHandler.onClick?.__mkMarkerV8) hookedHandler.onClick = originalOnClick;
        if (originalOnMovePixel && hookedHandler.onMovePixel?.__mkMarkerV8) hookedHandler.onMovePixel = originalOnMovePixel;
      }
      hookedHandler = null;
      originalOnClick = null;
      originalOnMovePixel = null;
      state.hooked = false;
    };

    const ensureRootObserver = () => {
      const root = currentMapRoot();
      if (root === currentRoot && mapObserver) return;
      mapObserver?.disconnect();
      if (root !== currentRoot) {
        state.rootChanges++;
        addLog(`MAP ROOT CHANGED -> #${objectId(root)}`);
      }
      currentRoot = root;
      if (!root) return;
      mapObserver = new MutationObserver((mutations) => {
        state.observerEvents += mutations.length;
        scheduleRepaint('root mutation');
      });
      mapObserver.observe(root, { childList: true, subtree: true });
    };

    const hookHandler = () => {
      const handler = window.TWMap?.map?.handler;
      if (!handler) {
        state.status = 'NO HANDLER';
        updateDebug();
        return false;
      }
      if (handler === hookedHandler && handler.onClick?.__mkMarkerV8) {
        ensureRootObserver();
        return true;
      }

      unhookHandler();
      hookedHandler = handler;
      state.handlerChanges++;
      addLog(`HANDLER HOOKED -> #${objectId(handler)}`);

      originalOnClick = handler.onClick;
      const wrappedClick = function (x, y, event) {
        const isVillage = !!villageIdByCoords(x, y);
        if (!event?.shiftKey || !isVillage) {
          return originalOnClick?.call(this, x, y, event);
        }
        event.preventDefault?.();
        event.stopPropagation?.();

        const coord = `${x}|${y}`;
        const selected = getColor(settings.activeColor);
        if (marks[coord]?.key === selected.key) {
          delete marks[coord];
          msg(`${coord}: odstraněno.`);
          addLog(`UNMARK ${coord}`);
        } else {
          marks[coord] = {
            key: selected.key,
            color: selected.color,
            shape: settings.circle ? 'circle' : 'square'
          };
          msg(`${coord}: ${selected.label}.`);
          addLog(`MARK ${coord} ${selected.key}`);
        }
        saveMarks();
        paint(x, y);
        updateCounts();
        updateDebug();
        return false;
      };
      wrappedClick.__mkMarkerV8 = true;
      handler.onClick = wrappedClick;

      originalOnMovePixel = handler.onMovePixel;
      if (typeof originalOnMovePixel === 'function') {
        const wrappedMove = function (...args) {
          state.moveCalls++;
          const result = originalOnMovePixel.apply(this, args);
          scheduleRepaint('onMovePixel');
          updateDebug();
          return result;
        };
        wrappedMove.__mkMarkerV8 = true;
        handler.onMovePixel = wrappedMove;
      }

      state.hooked = true;
      ensureRootObserver();
      scheduleRepaint('handler hook');
      return true;
    };

    const originalInit = typeof window.TWMap?.init === 'function' ? window.TWMap.init : null;
    const originalFocusSubmit = typeof window.TWMap?.focusSubmit === 'function' ? window.TWMap.focusSubmit : null;

    if (originalInit && !originalInit.__mkMarkerV8) {
      const wrappedInit = function (...args) {
        state.initCalls++;
        addLog('TWMap.init()');
        const result = originalInit.apply(this, args);
        setTimeout(() => {
          hookHandler();
          ensureRootObserver();
          scheduleRepaint('TWMap.init');
        }, 0);
        return result;
      };
      wrappedInit.__mkMarkerV8 = true;
      window.TWMap.init = wrappedInit;
    }

    if (originalFocusSubmit && !originalFocusSubmit.__mkMarkerV8) {
      const wrappedFocus = function (...args) {
        state.focusCalls++;
        addLog('TWMap.focusSubmit()');
        const result = originalFocusSubmit.apply(this, args);
        setTimeout(() => {
          hookHandler();
          ensureRootObserver();
          scheduleRepaint('focusSubmit');
        }, 0);
        return result;
      };
      wrappedFocus.__mkMarkerV8 = true;
      window.TWMap.focusSubmit = wrappedFocus;
    }

    const monitor = () => {
      const map = window.TWMap?.map || null;
      const handler = map?.handler || null;
      const root = currentMapRoot();

      if (map !== currentMap) {
        currentMap = map;
        state.mapChanges++;
        addLog(`MAP OBJECT CHANGED -> #${objectId(map)}`);
        hookHandler();
        scheduleRepaint('map changed');
      }
      if (handler !== hookedHandler || !handler?.onClick?.__mkMarkerV8) {
        hookHandler();
      }
      if (root !== currentRoot) ensureRootObserver();

      const villageCount = document.querySelectorAll('[id^="map_village_"]').length;
      if (villageCount !== state.lastVillageCount) {
        state.lastVillageCount = villageCount;
        addLog(`VILLAGES NOW ${villageCount}`);
        if (villageCount) scheduleRepaint('villages appeared');
      }
      updateDebug();
    };

    bodyObserver = new MutationObserver(() => {
      const root = currentMapRoot();
      if (root !== currentRoot) {
        ensureRootObserver();
        scheduleRepaint('body root change');
      }
    });
    bodyObserver.observe(document.body, { childList: true, subtree: true });

    const applyMinimized = () => {
      $('#mk8_body').style.display = settings.panelMinimized ? 'none' : '';
      $('#mk8_min').textContent = settings.panelMinimized ? '+' : '−';
    };
    $('#mk8_min').onclick = () => {
      settings.panelMinimized = !settings.panelMinimized;
      saveSettings();
      applyMinimized();
    };
    $('#mk8_hide').onclick = () => { panel.style.display = 'none'; };

    const destroy = () => {
      unhookHandler();
      mapObserver?.disconnect();
      bodyObserver?.disconnect();
      clearInterval(monitorTimer);
      clearVisible();
      style.remove();

      if (originalInit && window.TWMap?.init?.__mkMarkerV8) window.TWMap.init = originalInit;
      if (originalFocusSubmit && window.TWMap?.focusSubmit?.__mkMarkerV8) window.TWMap.focusSubmit = originalFocusSubmit;

      panel.remove();
      delete window.__mkMapMarkerV8;
    };

    window.__mkMapMarkerV8 = {
      destroy,
      repaintAll,
      debugText,
      showPanel() {
        panel.style.display = '';
        hookHandler();
        scheduleRepaint('show panel');
      }
    };

    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        addLog('PAGE VISIBLE');
        hookHandler();
        scheduleRepaint('visibility');
      }
    });
    window.addEventListener('focus', () => {
      addLog('WINDOW FOCUS');
      hookHandler();
      scheduleRepaint('focus');
    });

    applyMinimized();
    updateCounts();
    addLog('SCRIPT STARTED');
    hookHandler();
    ensureRootObserver();
    monitorTimer = window.setInterval(monitor, 300);
    scheduleRepaint('startup');
    msg('v8 aktivní.');
  } catch (error) {
    console.error('Map Marker v8', error);
    alert('Chyba označovače mapy v8: ' + error.message);
  }
})();