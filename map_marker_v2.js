(async () => {
  try {
    const APP_ID = 'mk_map_marker_v2';
    const STORAGE_KEY = 'mk_map_marker_v1_data';

    if (!location.href.includes('screen=map')) {
      alert('Spusť tento skript přímo na mapě.');
      return;
    }
    if (!window.TWMap?.map?.handler || !window.TWMap?.villages) {
      alert('Mapa ještě není připravena. Počkej chvíli a spusť skript znovu.');
      return;
    }

    if (window.__mkMapMarker?.destroy) {
      window.__mkMapMarker.destroy();
      return;
    }

    const COLORS = [
      { key: 'black', label: 'Černá', color: '#000000' },
      { key: 'green', label: 'Zelená', color: '#00a000' },
      { key: 'pink', label: 'Pink', color: '#ff1493' },
    ];

    const load = () => {
      try {
        const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        return saved && typeof saved === 'object' ? saved : {};
      } catch (_) {
        return {};
      }
    };
    const marks = load();
    const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(marks));

    const villageIdByCoords = (x, y) => {
      const village = TWMap.villages[parseInt(`${x}${y}`, 10)];
      return village?.id || null;
    };

    const villageElement = (x, y) => {
      const id = villageIdByCoords(x, y);
      return id ? document.querySelector(`#map_village_${id}`) : null;
    };

    const paint = (x, y) => {
      const el = villageElement(x, y);
      if (!el) return;
      const key = `${x}|${y}`;
      const mark = marks[key];
      el.style.boxSizing = 'border-box';
      el.style.outline = mark ? `4px solid ${mark.color}` : 'none';
      el.style.outlineOffset = '-3px';
      el.style.zIndex = mark ? '20' : '';
    };

    let repaintTimer = null;
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

    const nextMark = (current) => {
      if (!current) return COLORS[0];
      const idx = COLORS.findIndex((c) => c.key === current.key);
      return idx >= 0 && idx < COLORS.length - 1 ? COLORS[idx + 1] : null;
    };

    const count = (key) => Object.values(marks).filter((m) => m.key === key).length;

    const panel = document.createElement('div');
    panel.id = APP_ID;
    panel.style.cssText = 'position:fixed;top:90px;right:18px;z-index:10000;width:245px;background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;padding:10px;font:13px Arial;color:#2b1b09;box-shadow:0 4px 18px #0008';
    panel.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <b style="font-size:16px">Označení vesnic v2</b>
        <button id="mkmm_close" title="Vypnout">✕</button>
      </div>
      <div style="margin-bottom:8px">Klikáním na vesnici měníš:</div>
      <div style="line-height:1.7">
        <span style="display:inline-block;width:12px;height:12px;border:3px solid #000"></span> Černá: <b id="mkmm_black">0</b><br>
        <span style="display:inline-block;width:12px;height:12px;border:3px solid #00a000"></span> Zelená: <b id="mkmm_green">0</b><br>
        <span style="display:inline-block;width:12px;height:12px;border:3px solid #ff1493"></span> Pink: <b id="mkmm_pink">0</b>
      </div>
      <div style="margin-top:8px;font-size:12px"><b>Pořadí:</b> bez → černá → zelená → pink → bez</div>
      <div style="display:grid;grid-template-columns:1fr;gap:5px;margin-top:10px">
        <button data-copy="black">Kopírovat černé</button>
        <button data-copy="green">Kopírovat zelené</button>
        <button data-copy="pink">Kopírovat pink</button>
        <button id="mkmm_copyall">Kopírovat všechny</button>
        <button id="mkmm_clear">Vymazat všechna označení</button>
      </div>
      <div id="mkmm_msg" style="margin-top:7px;font-weight:bold"></div>`;
    document.body.appendChild(panel);

    const $ = (s) => panel.querySelector(s);
    const msg = (text) => { $('#mkmm_msg').textContent = text; };
    const updateCounts = () => {
      $('#mkmm_black').textContent = count('black');
      $('#mkmm_green').textContent = count('green');
      $('#mkmm_pink').textContent = count('pink');
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

    const coordsFor = (colorKey = null) => Object.keys(marks)
      .filter((coord) => !colorKey || marks[coord].key === colorKey)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    panel.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const key = btn.dataset.copy;
        const coords = coordsFor(key);
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
      save();
      clearVisible();
      updateCounts();
      msg('Všechna označení byla vymazána.');
    };

    const originalOnClick = TWMap.map.handler.onClick;

    const handleMapClick = (x, y, event) => {
      if (!villageIdByCoords(x, y)) {
        return originalOnClick?.call(TWMap.map.handler, x, y, event);
      }
      event?.preventDefault?.();
      event?.stopPropagation?.();
      const coord = `${x}|${y}`;
      const next = nextMark(marks[coord]);
      if (next) marks[coord] = { key: next.key, color: next.color };
      else delete marks[coord];
      save();
      paint(x, y);
      updateCounts();
      msg(`${coord}: ${next ? next.label : 'označení odstraněno'}`);
      return false;
    };

    TWMap.map.handler.onClick = handleMapClick;

    // Mapa při posunu, zoomu, kliknutí vedle vesnice nebo zavření informačního okna
    // znovu vytváří DOM prvky vesnic. Observer a lehký kontrolní interval proto
    // po každém překreslení obnoví rámečky z localStorage.
    const mapRoot = document.querySelector('#map_wrap, #map, #map_container') || document.body;
    const observer = new MutationObserver((mutations) => {
      if (mutations.some((m) => m.addedNodes.length || m.removedNodes.length)) {
        repaintAll();
      }
    });
    observer.observe(mapRoot, { childList: true, subtree: true });

    const repaintInterval = window.setInterval(repaintAll, 700);
    const onVisibility = () => {
      if (!document.hidden) setTimeout(repaintAll, 50);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', repaintAll);

    const destroy = () => {
      TWMap.map.handler.onClick = originalOnClick;
      observer.disconnect();
      clearInterval(repaintInterval);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', repaintAll);
      if (repaintTimer) cancelAnimationFrame(repaintTimer);
      clearVisible();
      panel.remove();
      delete window.__mkMapMarker;
    };

    $('#mkmm_close').onclick = destroy;
    window.__mkMapMarker = { destroy, repaintAll };

    repaintAll();
    updateCounts();
    msg('Aktivní – klikni na vesnici.');
  } catch (error) {
    console.error('Map Marker', error);
    alert('Chyba označovače mapy: ' + error.message);
  }
})();
