(async () => {
  try {
    if (document.getElementById("mk-group-counter-v3")) return;

    const parser = new DOMParser();
    const get = async (url) => {
      const r = await fetch(url, { credentials: "same-origin" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.text();
    };
    const esc = (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c]);

    const overlay = document.createElement("div");
    overlay.id = "mk-group-counter-v3";
    overlay.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:99998"></div>
      <div style="position:fixed;top:4%;left:50%;transform:translateX(-50%);
        z-index:99999;width:min(800px,95vw);max-height:90vh;overflow:auto;
        background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;
        padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b style="font-size:20px">Počet vesnic – vybrané skupiny</b>
          <button id="mk-close">✕</button>
        </div>
        <div style="margin-top:12px">
          <button id="mk-load" style="font-weight:bold">Načíst znovu</button>
          <button id="mk-copy">Kopírovat výsledky</button>
        </div>
        <div id="mk-status" style="margin:12px 0;font-weight:bold">Připravuji načtení…</div>
        <table style="width:100%;border-collapse:collapse;background:#fff7df">
          <thead>
            <tr>
              <th style="text-align:left;border:1px solid #9b6b22;padding:7px">Požadovaná skupina</th>
              <th style="text-align:left;border:1px solid #9b6b22;padding:7px">Nalezený název / ID</th>
              <th style="text-align:right;border:1px solid #9b6b22;padding:7px;width:130px">Počet vesnic</th>
            </tr>
          </thead>
          <tbody id="mk-body"></tbody>
        </table>
      </div>`;
    document.body.appendChild(overlay);

    const $ = (s) => overlay.querySelector(s);
    const setStatus = (s) => ($("#mk-status").textContent = s);

    const normalize = (name) =>
      String(name || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    const wanted = [
      { key: "plny utok", label: "Plný útok" },
      { key: "1/2 off", label: "1/2 off" },
      { key: "mala off", label: "Malá off" },
    ];

    function addGroupsFromDoc(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((a) => {
        const id = (a.getAttribute("href") || "").match(/[?&]group=(\d+)/)?.[1];
        const name = a.textContent.replace(/\s+/g, " ").trim();
        if (id && name) groups.set(String(id), name);
      });

      doc.querySelectorAll(
        'select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]'
      ).forEach((o) => {
        const raw = String(o.value || "");
        const id =
          raw.match(/[?&]group=(\d+)/)?.[1] ||
          raw.match(/^(\d+)$/)?.[1] ||
          o.dataset.groupId ||
          o.dataset.id;
        const name = o.textContent.replace(/\s+/g, " ").trim();
        if (id && /^\d+$/.test(String(id)) && name) groups.set(String(id), name);
      });
    }

    async function loadAllGroups() {
      const groups = new Map();
      const urls = [
        "/game.php?screen=groups",
        "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
        "/game.php?screen=overview_villages&mode=combined",
      ];

      for (const url of urls) {
        try {
          const html = await get(url);
          addGroupsFromDoc(parser.parseFromString(html, "text/html"), groups);
        } catch (e) {}
      }

      try {
        const r = await fetch("/game.php?screen=groups&ajax=load_group_menu", {
          credentials: "same-origin",
          headers: { "TribalWars-Ajax": "1" },
        });
        const txt = await r.text();
        try {
          const json = JSON.parse(txt);
          const walk = (o) => {
            if (!o || typeof o !== "object") return;
            if (Array.isArray(o)) return o.forEach(walk);
            const id = o.group_id ?? o.id ?? o.value;
            const name = o.name ?? o.label ?? o.text;
            if (id !== undefined && /^\d+$/.test(String(id)) && name) {
              groups.set(String(id), String(name).trim());
            }
            Object.values(o).forEach(walk);
          };
          walk(json);
        } catch (e) {
          addGroupsFromDoc(parser.parseFromString(txt, "text/html"), groups);
        }
      } catch (e) {}

      return groups;
    }

    async function countGroup(groupId) {
      const html = await get(
        `/game.php?screen=overview_villages&mode=combined&group=${encodeURIComponent(groupId)}&page=-1`
      );
      const doc = parser.parseFromString(html, "text/html");
      const ids = new Set();

      doc.querySelectorAll("tr").forEach((tr) => {
        const link = [...tr.querySelectorAll('a[href*="village="]')].find((a) =>
          /[?&]village=\d+/.test(a.getAttribute("href") || "")
        );
        const id = (link?.getAttribute("href") || "").match(/[?&]village=(\d+)/)?.[1];
        if (id) ids.add(id);
      });

      return ids.size;
    }

    let results = [];

    function render() {
      $("#mk-body").innerHTML = results.map((r) => `
        <tr>
          <td style="border:1px solid #9b6b22;padding:7px">${esc(r.label)}</td>
          <td style="border:1px solid #9b6b22;padding:7px">${esc(r.match)}</td>
          <td style="border:1px solid #9b6b22;padding:7px;text-align:right;font-weight:bold">${esc(r.count)}</td>
        </tr>
      `).join("");
    }

    async function run() {
      results = [];
      render();
      setStatus("Načítám seznam skupin…");

      const groups = await loadAllGroups();
      const entries = [...groups];

      for (let i = 0; i < wanted.length; i++) {
        const item = wanted[i];
        const exact = entries.find(([id, name]) => normalize(name) === item.key);
        const partial = entries.find(([id, name]) => normalize(name).includes(item.key));
        const found = exact || partial;

        if (!found) {
          results.push({
            label: item.label,
            match: "NENALEZENA",
            count: "—",
          });
          render();
          continue;
        }

        const [id, name] = found;
        setStatus(`Načítám ${i + 1}/3: ${name} (ID ${id})`);
        let count;
        try {
          count = await countGroup(id);
        } catch (e) {
          count = "CHYBA";
        }

        results.push({
          label: item.label,
          match: `${name} (ID ${id})`,
          count,
        });
        render();
      }

      setStatus("Hotovo. Zkontroluj hlavně nalezený název a ID u každé skupiny.");
    }

    $("#mk-close").onclick = () => overlay.remove();
    $("#mk-load").onclick = run;
    $("#mk-copy").onclick = async () => {
      const text = results
        .map((r) => `${r.label}: ${r.count} | ${r.match}`)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
      } catch (e) {
        const ta = document.createElement("textarea");
        ta.value = text;
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
      }
      setStatus("Výsledky byly zkopírovány.");
    };

    await run();
  } catch (e) {
    alert("Chyba počítadla skupin: " + e.message);
  }
})();