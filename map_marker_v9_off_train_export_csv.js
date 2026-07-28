(async () => {
  try {
    const APP_ID = 'mk_map_marker_v9';
    const STORAGE_KEY = 'mk_map_marker_v1_data';
    const SETTINGS_KEY = 'mk_map_marker_v9_settings';

    if (window.__mkMapMarkerV9?.showPanel) {
      window.__mkMapMarkerV9.showPanel();
      return;
    }

    for (const old of [
      window.__mkMapMarkerV4,
      window.__mkMapMarkerV5,
      window.__mkMapMarkerV6,
      window.__mkMapMarkerV7,
      window.__mkMapMarkerV8
    ]) {
      if (old?.destroy) {
        try { old.destroy(); } catch (_) {}
      }
    }

    const COLORS = [
      { key: 'black', label: 'Černá', color: '#000000' },
      { key: 'green', label: 'Zelená', color: '#00a000' },
      { key: 'pink', label: 'Pink', color: '#ff1493' },
      { key: 'off_train', label: 'OFF + VLAK', color: '#ff8c00', forceCircle: true },
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
    const settings = Object.assign({ activeColor: 'black', panelMinimized: false, circle: false }, loadJson(SETTINGS_KEY, {}));
    const saveMarks = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    const STYLE_ID = 'mk_map_marker_v9_style';
    document.getElementById(STYLE_ID)?.remove();
    const markerStyle = document.createElement('style');
    markerStyle.id = STYLE_ID;
    markerStyle.textContent = `
      [data-mk-marker-color="black"] {
        outline: 4px solid #000000 !important;
        outline-offset: -3px !important;
        z-index: 20 !important;
      }
      [data-mk-marker-color="green"] {
        outline: 4px solid #00a000 !important;
        outline-offset: -3px !important;
        z-index: 20 !important;
      }
      [data-mk-marker-color="pink"] {
        outline: 4px solid #ff1493 !important;
        outline-offset: -3px !important;
        z-index: 20 !important;
      }
      [data-mk-marker-color="off_train"] {
        outline: 5px solid #ff8c00 !important;
        outline-offset: -2px !important;
        border-radius: 50% !important;
        box-shadow: 0 0 0 2px #fff, 0 0 0 4px #7a2f00 !important;
        z-index: 25 !important;
      }
      [data-mk-marker-shape="circle"] {
        border-radius: 50% !important;
      }
      [data-mk-marker-color] {
        box-sizing: border-box !important;
      }
    `;
    document.head.appendChild(markerStyle);

    let hookedHandler = null;
    let originalOnClick = null;
    let observer = null;
    let observedMapRoot = null;
    let monitorTimer = null;
    let pageObserver = null;

    const getColor = (key) => COLORS.find((c) => c.key === key) || COLORS[0];

    const villageIdByCoords = (x, y) => {
      const villages = window.TWMap?.villages;
      if (!villages) return null;
      const village = villages[parseInt(`${x}${y}`, 10)];
      return village?.id || null;
    };

    const villageElement = (x, y) => {
      const id = villageIdByCoords(x, y);
      return id ? document.querySelector(`#map_village_${id}`) : null;
    };

    const paint = (x, y) => {
      // Always resolve the current FreeMap village node; never reuse an old DOM element.
      const el = villageElement(x, y);
      if (!el) return false;

      const mark = marks[`${x}|${y}`];
      if (!mark) {
        el.removeAttribute('data-mk-marker-color');
        el.removeAttribute('data-mk-marker-shape');
        return true;
      }

      el.setAttribute('data-mk-marker-color', mark.key);
      if (mark.key === 'off_train' || mark.shape === 'circle') {
        el.setAttribute('data-mk-marker-shape', 'circle');
      } else {
        el.removeAttribute('data-mk-marker-shape');
      }
      return true;
    };

    const repaintAll = () => {
      Object.keys(marks).forEach((coord) => {
        const [x, y] = coord.split('|').map(Number);
        paint(x, y);
      });
    };

    const clearVisible = () => {
      document.querySelectorAll('[data-mk-marker-color], [data-mk-marker-shape]').forEach((el) => {
        el.removeAttribute('data-mk-marker-color');
        el.removeAttribute('data-mk-marker-shape');
      });
    };

    const count = (key) => Object.values(marks).filter((m) => m.key === key).length;
    const coordsFor = (key = null) => Object.keys(marks)
      .filter((coord) => !key || marks[coord].key === key)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    const panel = document.createElement('div');
    panel.id = APP_ID;
    panel.style.cssText = 'position:fixed;top:90px;right:18px;z-index:10000;width:255px;background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;padding:10px;font:13px Arial;color:#2b1b09;box-shadow:0 4px 18px #0008';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">
        <b style="font-size:16px">Označení vesnic v9</b>
        <div><button id="mkmm_min" title="Minimalizovat">−</button> <button id="mkmm_hide" title="Skrýt panel">✕</button></div>
      </div>
      <div id="mkmm_body" style="margin-top:8px">
        <div style="padding:7px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
          <b>Normální kliknutí zůstává beze změny.</b><br>
          Pro označení drž <b>Shift</b> a klikni na vesnici.<br>
          Shift + klik na již stejnou barvu označení odstraní.
        </div>
        <div style="margin-top:9px"><b>Aktivní barva:</b></div>
        <div id="mkmm_colors" style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-top:5px">
          ${COLORS.map((c) => `<button type="button" data-color="${c.key}" style="border:3px solid ${c.color};font-weight:bold">${c.label}</button>`).join('')}
        </div>
        <div style="margin-top:9px;line-height:1.7">
          ⬛ Černá: <b id="mkmm_black">0</b><br>
          🟩 Zelená: <b id="mkmm_green">0</b><br>
          🩷 Pink: <b id="mkmm_pink">0</b><br>
          🟠 OFF + VLAK: <b id="mkmm_off_train">0</b>
        </div>
        <div style="display:grid;gap:5px;margin-top:9px">
          <button data-copy="black">Kopírovat černé</button>
          <button data-copy="green">Kopírovat zelené</button>
          <button data-copy="pink">Kopírovat pink</button>
          <button data-copy="off_train">Kopírovat OFF + VLAK</button>
          <button id="mkmm_copyall">Kopírovat všechny</button>
          <button id="mkmm_exportcsv" style="font-weight:bold">📄 Export cílů do CSV</button>
          <button id="mkmm_clear">Vymazat všechna označení</button>
          <label style="display:block;padding:3px 0"><input id="mkmm_circle" type="checkbox"> Kruh</label>
        </div>
        <div id="mkmm_msg" style="margin-top:7px;font-weight:bold"></div>
      </div>`;
    document.body.appendChild(panel);

    const $ = (s) => panel.querySelector(s);
    const msg = (text) => { $('#mkmm_msg').textContent = text; };

    const updateCounts = () => {
      $('#mkmm_black').textContent = count('black');
      $('#mkmm_green').textContent = count('green');
      $('#mkmm_pink').textContent = count('pink');
      $('#mkmm_off_train').textContent = count('off_train');
      panel.querySelectorAll('[data-color]').forEach((btn) => {
        const active = btn.dataset.color === settings.activeColor;
        btn.style.background = active ? getColor(btn.dataset.color).color : '';
        btn.style.color = active && !['green'].includes(btn.dataset.color) ? '#fff' : '';
        btn.style.boxShadow = active ? '0 0 0 2px #fff inset' : '';
      });
    };

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
      btn.addEventListener('click', () => {
        settings.activeColor = btn.dataset.color;
        saveSettings();
        updateCounts();
        msg(`Aktivní barva: ${getColor(settings.activeColor).label}.`);
      });
    });

    $('#mkmm_circle').checked = !!settings.circle;
    $('#mkmm_circle').addEventListener('change', () => {
      settings.circle = $('#mkmm_circle').checked;
      saveSettings();
      msg(settings.circle ? 'Nová označení budou kruhová.' : 'Nová označení budou čtvercová.');
    });

    panel.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const coords = coordsFor(btn.dataset.copy);
        if (!coords.length) return msg('V této barvě není žádná vesnice.');
        await copyText(coords.join('\n'));
        msg(`Zkopírováno: ${coords.length} vesnic.`);
      });
    });

    $('#mkmm_copyall').onclick = async () => {
      const coords = coordsFor();
      if (!coords.length) return msg('Není označena žádná vesnice.');
      await copyText(coords.join('\n'));
      msg(`Zkopírováno celkem: ${coords.length} vesnic.`);
    };



    const exportTargetsCsv = () => {
      const entries = Object.entries(marks)
        .filter(([coord, mark]) => /^\d{1,3}\|\d{1,3}$/.test(coord) && mark?.key)
        .sort((a, b) => {
          const pa = { black: 1, green: 2, pink: 3, off_train: 4 }[a[1].key] || 99;
          const pb = { black: 1, green: 2, pink: 3, off_train: 4 }[b[1].key] || 99;
          if (pa !== pb) return pa - pb;
          const [ax, ay] = a[0].split('|').map(Number);
          const [bx, by] = b[0].split('|').map(Number);
          return ax - bx || ay - by;
        });

      if (!entries.length) {
        msg('Není označena žádná cílová vesnice.');
        return;
      }

      const colorLabel = { black: 'Černá', green: 'Zelená', pink: 'Pink', off_train: 'OFF + VLAK' };
      const priority = { black: 1, green: 2, pink: 3, off_train: 4 };
      const targetType = { black: 'NORMAL', green: 'NORMAL', pink: 'NORMAL', off_train: 'OFF_TRAIN' };
      const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
      const rows = [
        ['Barva', 'Souřadnice', 'Priorita', 'Typ', 'Počet útoků', 'Poznámka'],
        ...entries.map(([coord, mark]) => [
          colorLabel[mark.key] || mark.key,
          coord,
          priority[mark.key] || '',
          targetType[mark.key] || 'NORMAL',
          1,
          ''
        ])
      ];

      const csv = '\ufeff' + rows.map((row) => row.map(csvCell).join(';')).join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);

      const now = new Date();
      const pad = (n) => String(n).padStart(2, '0');
      link.download = `export_cilu_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}.csv`;

      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(link.href), 1000);
      msg(`Exportováno: ${entries.length} cílových vesnic.`);
    };

    $('#mkmm_exportcsv').onclick = exportTargetsCsv;

    $('#mkmm_clear').onclick = () => {
      if (!confirm('Opravdu vymazat všechna barevná označení?')) return;
      Object.keys(marks).forEach((key) => delete marks[key]);
      saveMarks();
      clearVisible();
      updateCounts();
      msg('Všechna označení byla vymazána.');
    };

    const unhookMap = () => {
      if (hookedHandler && originalOnClick && hookedHandler.onClick !== originalOnClick) {
        hookedHandler.onClick = originalOnClick;
      }
      hookedHandler = null;
      originalOnClick = null;
      observer?.disconnect();
      observer = null;
      observedMapRoot = null;
    };

    const currentMapRoot = () =>
      document.querySelector('#map_wrap, #map, #map_container, .map_container, .map-wrapper') ||
      document.querySelector('[id^="map_village_"]')?.parentElement ||
      null;

    const ensureObserver = () => {
      const root = currentMapRoot();
      if (!root) return false;
      if (observer && observedMapRoot === root && root.isConnected) return true;
      observer?.disconnect();
      observedMapRoot = root;
      observer = new MutationObserver(() => repaintAll());
      observer.observe(root, { childList: true, subtree: true });
      repaintAll();
      return true;
    };

    const hookMap = () => {
      const handler = window.TWMap?.map?.handler;
      if (!handler || !window.TWMap?.villages) return false;
      if (handler === hookedHandler && handler.onClick?.__mkMarkerV9) {
        repaintAll();
        return true;
      }

      unhookMap();
      hookedHandler = handler;
      originalOnClick = handler.onClick;

      const wrappedOnClick = function (x, y, event) {
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
          msg(`${coord}: označení odstraněno.`);
        } else {
          marks[coord] = { key: selected.key, color: selected.color, shape: (selected.forceCircle || settings.circle) ? 'circle' : 'square', type: selected.key === 'off_train' ? 'OFF_TRAIN' : 'NORMAL' };
          msg(`${coord}: ${selected.label}.`);
        }
        saveMarks();
        paint(x, y);
        updateCounts();
        return false;
      };
      wrappedOnClick.__mkMarkerV9 = true;
      handler.onClick = wrappedOnClick;

      ensureObserver();
      repaintAll();
      setTimeout(repaintAll, 100);
      setTimeout(repaintAll, 300);
      return true;
    };

    const monitor = () => {
      const handler = window.TWMap?.map?.handler;

      if (handler) {
        if (handler !== hookedHandler || !handler.onClick?.__mkMarkerV9) {
          hookMap();
        } else {
          ensureObserver();
        }
      }

      // Permanent lightweight scan: paints only onto the currently existing nodes.
      repaintAll();
    };

    const applyMinimized = () => {
      $('#mkmm_body').style.display = settings.panelMinimized ? 'none' : '';
      $('#mkmm_min').textContent = settings.panelMinimized ? '+' : '−';
    };

    $('#mkmm_min').onclick = () => {
      settings.panelMinimized = !settings.panelMinimized;
      saveSettings();
      applyMinimized();
    };
    $('#mkmm_hide').onclick = () => { panel.style.display = 'none'; };

    const destroy = () => {
      unhookMap();
      clearInterval(monitorTimer);
      pageObserver?.disconnect();
      clearVisible();
      markerStyle.remove();
      panel.remove();
      delete window.__mkMapMarkerV9;
    };

    window.__mkMapMarkerV9 = {
      destroy,
      repaintAll,
      showPanel() {
        panel.style.display = '';
        hookMap();
        repaintAll();
      },
    };

    pageObserver = new MutationObserver(() => repaintAll());
    pageObserver.observe(document.body, { childList: true, subtree: true });

    // FreeMap has no reliable public reopen event, so keep a small 250 ms rescan.
    monitorTimer = window.setInterval(monitor, 250);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(monitor, 50);
    });
    window.addEventListener('focus', monitor);

    applyMinimized();
    updateCounts();
    hookMap();
    repaintAll();
    msg('Aktivní. Shift + klik označuje; OFF + VLAK se exportuje jako OFF_TRAIN.');
  } catch (error) {
    console.error('Map Marker v9', error);
    alert('Chyba označovače mapy: ' + error.message);
  }
})();
