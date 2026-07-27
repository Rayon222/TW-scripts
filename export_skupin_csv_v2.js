(async () => {
  try {
    if (document.getElementById("mkcsvexporter")) return;

    const P = new DOMParser();
    const get = async (u) =>
      await fetch(u, { credentials: "same-origin" }).then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.text();
      });

    const clean = (s) =>
      String(s || "")
        .replace(/\s+/g, " ")
        .trim();

    const esc = (s) =>
      String(s).replace(/[&<>"']/g, (c) => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[c]);

    const coordFromText = (s) => {
      const m = String(s || "").match(/(\d{1,3})\|(\d{1,3})/);
      return m ? `${Number(m[1])}|${Number(m[2])}` : null;
    };

    function validGroupName(name) {
      name = clean(name);
      return (
        name &&
        !/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(
          name
        )
      );
    }

    function normalizedGroupName(name) {
      return clean(name).replace(/^\[(.+)\]$/, "$1").trim();
    }

    function addGroupsFromDoc(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((a) => {
        const href = a.getAttribute("href") || "";
        const id = href.match(/[?&]group=(\d+)/)?.[1];
        const name = normalizedGroupName(a.textContent);
        if (id && validGroupName(name)) groups.set(String(id), name);
      });

      doc
        .querySelectorAll(
          'select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]'
        )
        .forEach((o) => {
          const raw = String(o.value || "");
          const id =
            raw.match(/[?&]group=(\d+)/)?.[1] ||
            raw.match(/^(\d+)$/)?.[1] ||
            o.dataset.groupId ||
            o.dataset.id;
          const name = normalizedGroupName(o.textContent);

          if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
            groups.set(String(id), name);
          }
        });

      doc.querySelectorAll("[data-group-id],[data-group]").forEach((el) => {
        const id = el.dataset.groupId || el.dataset.group;
        const name = normalizedGroupName(el.textContent);

        if (id && /^\d+$/.test(String(id)) && validGroupName(name)) {
          groups.set(String(id), name);
        }
      });
    }

    const ov = document.createElement("div");
    ov.id = "mkcsvexporter";
    ov.innerHTML = `
      <div style="position:fixed;inset:0;background:#0009;z-index:99998"></div>
      <div style="position:fixed;top:4%;left:50%;transform:translateX(-50%);
        z-index:99999;width:min(650px,95vw);max-height:92vh;overflow:auto;
        background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;
        padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <b style="font-size:20px">Export skupin do CSV pro Excel</b>
          <button id="mkclose">✕</button>
        </div>

        <div style="margin-top:12px">
          <button id="mkall">Označit vše</button>
          <button id="mknone">Zrušit označení</button>
          <button id="mkreload">Obnovit skupiny</button>
        </div>

        <select id="mkgroups" multiple size="15"
          style="width:100%;margin-top:10px;min-height:320px"></select>

        <div id="mkcount" style="margin-top:7px;font-weight:bold"></div>

        <button id="mkexport"
          style="margin-top:12px;font-size:17px;font-weight:bold;padding:9px 16px">
          Exportovat do CSV
        </button>

        <div id="mkmsg" style="margin-top:10px;font-weight:bold"></div>
      </div>`;

    document.body.appendChild(ov);

    const $ = (s) => ov.querySelector(s);
    const msg = (text, error = false) => {
      $("#mkmsg").textContent = text;
      $("#mkmsg").style.color = error ? "#a00000" : "#2b1b09";
    };

    $("#mkclose").onclick = () => ov.remove();

    async function loadGroups() {
      try {
        msg("Načítám skupiny…");

        const groups = new Map();
        const urls = [
          "/game.php?screen=groups",
          "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
          "/game.php?screen=overview_villages&mode=combined",
        ];

        for (const url of urls) {
          try {
            const html = await get(url);
            addGroupsFromDoc(P.parseFromString(html, "text/html"), groups);
          } catch (_) {}
        }

        try {
          const r = await fetch(
            "/game.php?screen=groups&ajax=load_group_menu",
            {
              credentials: "same-origin",
              headers: { "TribalWars-Ajax": "1" },
            }
          );

          const txt = await r.text();

          try {
            const json = JSON.parse(txt);

            const walk = (o) => {
              if (!o || typeof o !== "object") return;

              if (Array.isArray(o)) {
                o.forEach(walk);
                return;
              }

              const id = o.group_id ?? o.id ?? o.value;
              const name = normalizedGroupName(o.name ?? o.label ?? o.text);

              if (
                id !== undefined &&
                /^\d+$/.test(String(id)) &&
                validGroupName(name)
              ) {
                groups.set(String(id), name);
              }

              Object.values(o).forEach(walk);
            };

            walk(json);
          } catch (_) {
            addGroupsFromDoc(
              P.parseFromString(txt, "text/html"),
              groups
            );
          }
        } catch (_) {}

        const sorted = [...groups.entries()].sort((a, b) =>
          a[1].localeCompare(b[1], "cs", { sensitivity: "base" })
        );

        $("#mkgroups").innerHTML = sorted
          .map(([id, name]) =>
            `<option value="${esc(id)}">${esc(name)}</option>`
          )
          .join("");

        updateCount();

        msg(
          sorted.length
            ? `Načteno skupin: ${sorted.length}.`
            : "Skupiny se nepodařilo načíst.",
          !sorted.length
        );
      } catch (e) {
        msg("Chyba při načítání skupin: " + e.message, true);
      }
    }

    function updateCount() {
      $("#mkcount").textContent =
        `Označeno skupin: ${$("#mkgroups").selectedOptions.length} ` +
        `z ${$("#mkgroups").options.length}`;
    }

    $("#mkgroups").onchange = updateCount;

    $("#mkall").onclick = () => {
      [...$("#mkgroups").options].forEach((o) => (o.selected = true));
      updateCount();
    };

    $("#mknone").onclick = () => {
      [...$("#mkgroups").options].forEach((o) => (o.selected = false));
      updateCount();
    };

    $("#mkreload").onclick = loadGroups;

    function readPoints(tr) {
      const direct =
        tr.querySelector("td.points") ||
        tr.querySelector(".points") ||
        tr.querySelector('[data-field="points"]');

      if (direct) {
        const n = clean(direct.textContent).replace(/[.\s]/g, "");
        if (/^\d+$/.test(n)) return Number(n);
      }

      return "";
    }

    function readVillage(tr) {
      const coord = coordFromText(tr.textContent);
      if (!coord) return null;

      const links = [...tr.querySelectorAll('a[href*="village="]')];

      const a =
        links.find((link) => {
          const href = link.getAttribute("href") || "";
          const label = clean(link.textContent);

          return (
            /[?&]village=\d+/.test(href) &&
            label.includes(coord) &&
            !/[?&]screen=(main|place|smith|barracks|stable|garage|snob|market|storage|farm|wall)(?:&|$)/.test(
              href
            )
          );
        }) ||
        links.find((link) => {
          const href = link.getAttribute("href") || "";
          return (
            /[?&]village=\d+/.test(href) &&
            clean(link.textContent).includes(coord)
          );
        });

      if (!a) return null;

      const id = (a.getAttribute("href") || "").match(
        /[?&]village=(\d+)/
      )?.[1];

      if (!id) return null;

      let name = clean(a.textContent)
        .replace(
          new RegExp(`\\(?\\s*${coord.replace("|", "\\|")}\\s*\\)?`, "g"),
          ""
        )
        .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
        .trim();

      if (!name || /^(Hlavní budova|Main building)$/i.test(name)) {
        name = "";

        for (const td of tr.querySelectorAll("td")) {
          const text = clean(td.textContent);
          if (!text.includes(coord)) continue;

          const candidate = text
            .replace(
              new RegExp(
                `\\(?\\s*${coord.replace("|", "\\|")}\\s*\\)?`,
                "g"
              ),
              ""
            )
            .replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "")
            .trim();

          if (
            candidate &&
            !/^(Hlavní budova|Main building)$/i.test(candidate)
          ) {
            name = candidate;
            break;
          }
        }
      }

      const [x, y] = coord.split("|").map(Number);

      return {
        id,
        name,
        coord,
        continent: `K${Math.floor(y / 100)}${Math.floor(x / 100)}`,
        points: readPoints(tr),
      };
    }

    async function loadGroupVillages(groupId, groupName) {
      const html = await get(
        `/game.php?screen=overview_villages&mode=combined&group=` +
        `${encodeURIComponent(groupId)}&page=-1`
      );

      const doc = P.parseFromString(html, "text/html");
      const villages = new Map();

      doc.querySelectorAll("tr").forEach((tr) => {
        const village = readVillage(tr);

        if (village && !villages.has(village.id)) {
          villages.set(village.id, {
            group: groupName,
            ...village,
          });
        }
      });

      return [...villages.values()];
    }

    function csvCell(value) {
      return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }

    $("#mkexport").onclick = async () => {
      const selected = [...$("#mkgroups").selectedOptions].map((o) => ({
        id: String(o.value),
        name: clean(o.textContent),
      }));

      if (!selected.length) {
        msg("Označ alespoň jednu skupinu.", true);
        return;
      }

      $("#mkexport").disabled = true;

      try {
        const rows = [
          ["Skupina", "Název vesnice", "Souřadnice", "Kontinent", "Body"],
        ];

        for (let i = 0; i < selected.length; i++) {
          const group = selected[i];

          msg(
            `Načítám ${i + 1}/${selected.length}: ${group.name}…`
          );

          const villages = await loadGroupVillages(group.id, group.name);

          villages.forEach((v) => {
            rows.push([
              v.group,
              v.name,
              v.coord,
              v.continent,
              v.points,
            ]);
          });
        }

        if (rows.length === 1) {
          msg("Ve vybraných skupinách nebyly nalezeny vesnice.", true);
          return;
        }

        const csv =
          "\ufeff" +
          rows
            .map((row) => row.map(csvCell).join(";"))
            .join("\r\n");

        const blob = new Blob([csv], {
          type: "text/csv;charset=utf-8;",
        });

        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);

        const now = new Date();
        const pad = (n) => String(n).padStart(2, "0");

        link.download =
          `export_skupin_${now.getFullYear()}-${pad(now.getMonth() + 1)}-` +
          `${pad(now.getDate())}_${pad(now.getHours())}-${pad(
            now.getMinutes()
          )}.csv`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        setTimeout(() => URL.revokeObjectURL(link.href), 1000);

        msg(`Hotovo: exportováno ${rows.length - 1} řádků.`);
      } catch (e) {
        msg("Chyba exportu: " + e.message, true);
      } finally {
        $("#mkexport").disabled = false;
      }
    };

    await loadGroups();
  } catch (e) {
    alert("Chyba exportéru: " + e.message);
  }
})();