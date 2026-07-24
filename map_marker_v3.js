(async () => {
  try {
    const APP_ID = 'mk_map_marker_v3';
    const STORAGE_KEY = 'mk_map_marker_v1_data';
    const SETTINGS_KEY = 'mk_map_marker_v3_settings';

    if (window.__mkMapMarkerV3?.showPanel) {
      window.__mkMapMarkerV3.showPanel();
      return;
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
    const settings = Object.assign({ activeColor: 'black', panelMinimized: false }, loadJson(SETTINGS_KEY, {}));
    const saveMarks = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));
    const saveSettings = () => localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));

    let hookedHandler = null;
    let originalOnClick = null;
    let observer = null;
    let repaintTimer = null;
    let monitorTimer = null;

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
      const el = villageElement(x, y);
      if (!el) return;
      const mark = marks[`${x}|${y}`];
      el.style.boxSizing = 'border-box';
      el.style.outline = mark ? `4px solid ${mark.color}` : 'none';
      el.style.outlineOffset = mark ? '-3px' : '';
      el.style.zIndex = mark ? '20' : '';
    };

    const repaintAll = () => {
      if (repaintTimer) cancelAnimationFrame(repaintTimer);
      repaintTimer = requestAnimationFrame(() => {
        repaintTimer = null;
        Object.keys(marks).forEach((coord) => {
          const [x, y] = coord.split('|').map(Number);
          paint(x, y);
        });
      });
    };

    const clearVisible = () => {
      document.querySelectorAll('[id^="map_village_"]').forEach((el) => {
        el.style.outline = 'none';
        el.style.outlineOffset = '';
        el.style.zIndex = '';
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
        <b style="font-size:16px">Označení vesnic v3</b>
        <div><button id="mkmm_min" title="Minimalizovat">−</button> <button id="mkmm_hide" title="Skrýt panel">✕</button></div>
      </div>
      <div id="mkmm_body" style="margin-top:8px">
        <div style="padding:7px;background:#fff7df;border:1px solid #9b6b22;border-radius:5px">
          <b>Normální kliknutí zůstává beze změny.</b><br>
          Pro označení drž <b>Shift</b> a klikni na vesnici.<br>
          Shift + klik na již stejnou barvu označení odstraní.
        </div>
        <div style="margin-top:9px"><b>Aktivní barva:</b></div>
        <div id="mkmm_colors" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:5px;margin-top:5px">
          ${COLORS.map((c) => `<button type="button" data-color="${c.key}" style="border:3px solid ${c.color};font-weight:bold">${c.label}</button>`).join('')}
        </div>
        <div style="margin-top:9px;line-height:1.7">
          ⬛ Černá: <b id="mkmm_black">0</b><br>
          🟩 Zelená: <b id="mkmm_green">0</b><br>
          🩷 Pink: <b id="mkmm_pink">0</b>
        </div>
        <div style="display:grid;gap:5px;margin-top:9px">
          <button data-copy="black">Kopírovat černé</button>
          <button data-copy="green">Kopírovat zelené</button>
          <button data-copy="pink">Kopírovat pink</button>
          <button id="mkmm_copyall">Kopírovat všechny</button>
          <button id="mkmm_clear">Vymazat všechna označení</button>
          <button id="mkmm_stop">Úplně vypnout skript</button>
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
      panel.querySelectorAll('[data-color]').forEach((btn) => {
        const active = btn.dataset.color === settings.activeColor;
        btn.style.background = active ? getColor(btn.dataset.color).color : '';
        btn.style.color = active && btn.dataset.color !== 'green' ? '#fff' : '';
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
    };

    const hookMap = () => {
      const handler = window.TWMap?.map?.handler;
      if (!handler || !window.TWMap?.villages) return false;
      if (handler === hookedHandler && handler.onClick?.__mkMarkerV3) {
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
          marks[coord] = { key: selected.key, color: selected.color };
          msg(`${coord}: ${selected.label}.`);
        }
        saveMarks();
        paint(x, y);
        updateCounts();
        return false;
      };
      wrappedOnClick.__mkMarkerV3 = true;
      handler.onClick = wrappedOnClick;

      const mapRoot = document.querySelector('#map_wrap, #map, #map_container') || document.body;
      observer = new MutationObserver(() => repaintAll());
      observer.observe(mapRoot, { childList: true, subtree: true });
      repaintAll();
      return true;
    };

    const monitor = () => {
      const handler = window.TWMap?.map?.handler;
      if (!handler) {
        if (hookedHandler) unhookMap();
        return;
      }
      if (handler !== hookedHandler || !handler.onClick?.__mkMarkerV3) hookMap();
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
      if (repaintTimer) cancelAnimationFrame(repaintTimer);
      clearVisible();
      panel.remove();
      delete window.__mkMapMarkerV3;
    };

    $('#mkmm_stop').onclick = destroy;

    window.__mkMapMarkerV3 = {
      destroy,
      repaintAll,
      showPanel() {
        panel.style.display = '';
        hookMap();
        repaintAll();
      },
    };

    monitorTimer = window.setInterval(monitor, 500);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) setTimeout(monitor, 50);
    });
    window.addEventListener('focus', monitor);

    applyMinimized();
    updateCounts();
    hookMap();
    msg('Aktivní. Normální klik funguje standardně; označení přes Shift + klik.');
  } catch (error) {
    console.error('Map Marker v3', error);
    alert('Chyba označovače mapy: ' + error.message);
  }
})();
