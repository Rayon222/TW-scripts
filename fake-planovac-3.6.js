(async () => {
  try {
    if (document.getElementById("mkfakeplanner")) return;
    const P = new DOMParser(),
      get = async (u) =>
        await fetch(u, { credentials: "same-origin" }).then((r) => {
          if (!r.ok) throw new Error("HTTP " + r.status);
          return r.text();
        }),
      xml = async (u) => P.parseFromString(await get(u), "text/xml"),
      cfg = await xml("/interface.php?func=get_config"),
      ui = await xml("/interface.php?func=get_unit_info"),
      us = parseFloat(cfg.querySelector("unit_speed")?.textContent || 1),
      N = {
        spear: "Kopí",
        sword: "Meč",
        axe: "Sekera",
        archer: "Luk",
        spy: "Špeh",
        light: "Lehká jízda",
        marcher: "Jízdní luk",
        heavy: "Těžká jízda",
        ram: "Beranidlo",
        catapult: "Katapult",
        knight: "Paladin",
        snob: "Šlechtic",
      },
      U = [...ui.documentElement.children]
        .map((n) => ({
          id: n.tagName,
          sp: parseFloat(n.querySelector("speed")?.textContent || 0) / us,
        }))
        .filter((u) => u.sp > 0),
      POP = { axe: 1, spy: 2, light: 4, ram: 5, catapult: 8 },
      FAKE_UNITS = ["axe", "light", "spy", "ram", "catapult"],
      SPEED = Object.fromEntries(U.map((u) => [u.id, u.sp])),
      base = location.origin + location.pathname,
      ov = document.createElement("div");
    ov.id = "mkfakeplanner";
    ov.innerHTML = `<div style="position:fixed;inset:0;background:#0009;z-index:99998"></div><div style="position:fixed;top:3%;left:50%;transform:translateX(-50%);z-index:99999;width:min(1000px,95vw);max-height:93vh;overflow:auto;background:#f4e4bc;border:3px solid #7d510f;border-radius:8px;padding:14px;font:14px Arial;color:#2b1b09;box-shadow:0 8px 35px #000"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:20px">Fake plánovač 3.6 – nejdříve první útok ze všech vesnic</b><button id="mkclose">✕</button></div><div style="margin-top:12px;padding:14px;border:2px solid #9b6b22;background:#fff7df;border-radius:8px">
  <div style="font-size:18px;font-weight:bold;margin-bottom:8px">Datum a čas dopadu – serverový čas</div>
  <div style="display:grid;grid-template-columns:minmax(210px,1fr) minmax(260px,1.4fr);gap:12px">
    <label style="font-weight:bold">Datum dopadu<br>
      <input id="mklanddate" type="date" style="width:100%;box-sizing:border-box;height:50px;font-size:20px;font-weight:bold;padding:6px">
    </label>
    <label style="font-weight:bold">Čas dopadu včetně milisekund<br>
      <input id="mklandtime" type="text" placeholder="20:00:00.000" style="width:100%;box-sizing:border-box;height:50px;font-size:20px;font-weight:bold;padding:6px">
    </label>
  </div>
  <small style="display:block;margin-top:7px">Příklad: datum 2026-07-17 a čas 20:00:00.000</small>
</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px"><label>Skupiny výchozích vesnic<br>
<select id="mkgroup" multiple style="display:none"><option value="">Načítám skupiny…</option></select>
<div id="mkgroupchecks" style="margin-top:5px;max-height:190px;overflow:auto;padding:8px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px"></div>
<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:6px">
  <button type="button" id="mkgroupall">Všechny vesnice</button>
  <button type="button" id="mkgroupnone">Zrušit výběr</button>
</div>
<small style="display:block;margin-top:5px">Zaškrtni libovolný počet skupin. Duplicitní vesnice se použijí jen jednou.</small>
</label><label>Vesnice ve vybraných skupinách<br><select id="mkvillages" multiple size="8" style="width:100%"></select><br><small>Bez označení se použijí všechny načtené vesnice.</small></label><label>Cílové vesnice<br><textarea id="mktarget" rows="8" placeholder="500|500&#10;501|501&#10;502|502" style="width:100%;box-sizing:border-box"></textarea><br><small>Cíle mohou být oddělené řádkem, mezerou, čárkou nebo středníkem.</small><div id="mktargetstatus" style="margin-top:5px;font-weight:bold"></div></label><label>Automatické složení fake<br>
<div style="padding:9px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px;line-height:1.55">
<b>Minimum požadované hrou: 1 % bodů zdrojové vesnice</b><br>
Sekera 1 · Špeh 2 · Lehká 4 · Beranidlo 5 · Katapult 8 obyvatel<br>
<small>Skript sestaví nejméně 1 % populace a pokusí se použít všech pět druhů co nejrovnoměrněji.</small>
</div></label><label>Maximální počet útoků na jeden cíl<br><input id="mkmaxpertarget" type="number" min="1" max="20" step="1" value="5" style="width:100%;box-sizing:border-box;height:32px"><br><label style="display:block;margin-top:7px"><input type="checkbox" id="mkignoremax"> Ignorovat limit a použít mnou označené vesnice</label><small id="mkmaxhelp">Při zapnutém limitu se pro každý cíl použijí nejbližší vesnice. Při ignorování se použijí všechny označené vesnice; bez označení všechny vesnice skupiny.</small></label><label>Limit zdrojové vesnice<br>
<div style="padding:9px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px;line-height:1.5">
<b>Maximálně 2 naplánované útoky z jedné vesnice</b><br>
<small>Nejdříve se použije každá vhodná vesnice jednou. Teprve potom se plánují druhé útoky.</small>
</div></label><label>Název plánu<br><input id="mktitle" value="Útok" style="width:100%;box-sizing:border-box;height:32px"></label></div><div style="margin:14px 0"><div style="margin-bottom:10px;padding:9px;border:1px solid #9b6b22;background:#fff7df;border-radius:6px"><label><input type="checkbox" id="mkblocknight"> Neplánovat útoky, které se musí odeslat v tomto čase:</label> <input type="time" id="mkblockfrom" value="23:00" style="height:30px"> až <input type="time" id="mkblockto" value="06:00" style="height:30px"><br><small>Funguje i přes půlnoc, například 23:00 až 06:00.</small></div><button id="mkcalc" style="font-weight:bold">Vypočítat plán</button> <button id="mkcalccopy" style="font-weight:bold">Vypočítat a kopírovat</button> <button id="mkcopy">Kopírovat BBCode</button></div><textarea id="mkout" rows="17" readonly style="width:100%;box-sizing:border-box;font-family:monospace"></textarea><div id="mkmsg" style="margin-top:8px;font-weight:bold"></div></div>`;
    document.body.appendChild(ov);
    const $ = (s) => ov.querySelector(s),
      msg = (t) => ($("#mkmsg").textContent = t),
      esc = (s) =>
        String(s).replace(
          /[&<>"']/g,
          (c) =>
            ({
              "&": "&amp;",
              "<": "&lt;",
              ">": "&gt;",
              '"': "&quot;",
              "'": "&#039;",
            })[c],
        ),
      C = (s) => {
        let m = String(s).match(/(\d{1,3})\|(\d{1,3})/);
        return m ? [+m[1], +m[2]] : null;
      },
      CS = (s) => {
        let out = [],
          seen = new Set();
        for (let m of String(s).matchAll(/(\d{1,3})\|(\d{1,3})/g)) {
          let x = +m[1],
            y = +m[2],
            k = `${x}|${y}`;
          if (!seen.has(k)) {
            seen.add(k);
            out.push([x, y]);
          }
        }
        return out;
      },
      T = (s) => {
        let m = String(s)
          .trim()
          .match(
            /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?$/,
          );
        return m
          ? Date.UTC(
              +m[1],
              +m[2] - 1,
              +m[3],
              +m[4],
              +m[5],
              +m[6],
              +(m[7] || "0").padEnd(3, "0"),
            )
          : NaN;
      },
      F = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())} ${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      },
      FD = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${d.getUTCFullYear()}-${z(d.getUTCMonth() + 1)}-${z(d.getUTCDate())}`;
      },
      FT = (ms) => {
        let d = new Date(ms),
          z = (n) => String(n).padStart(2, "0");
        return `${z(d.getUTCHours())}:${z(d.getUTCMinutes())}:${z(d.getUTCSeconds())}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
      },
      D = (ms) => {
        let s = Math.round(ms / 1000),
          h = Math.floor(s / 3600);
        s %= 3600;
        let m = Math.floor(s / 60);
        s %= 60;
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
      },
      HM = (s) => {
        let m = String(s || "").match(/^(\d{2}):(\d{2})$/);
        return m ? +m[1] * 60 + +m[2] : null;
      },
      blockedTime = (ms, from, to) => {
        let d = new Date(ms),
          v = d.getUTCHours() * 60 + d.getUTCMinutes();
        if (from === null || to === null || from === to) return false;
        return from < to ? v >= from && v < to : v >= from || v < to;
      },
      serverNow = () => {
        let d = (
            document.querySelector("#serverDate")?.textContent || ""
          ).trim(),
          t = (document.querySelector("#serverTime")?.textContent || "").trim(),
          a = d.match(/(\d{1,2})[.\/-](\d{1,2})[.\/-](\d{4})/),
          b = t.match(/(\d{1,2}):(\d{2}):(\d{2})/);
        return a && b
          ? `${a[3]}-${a[2].padStart(2, "0")}-${a[1].padStart(2, "0")} ${b[1].padStart(2, "0")}:${b[2]}:${b[3]}.000`
          : "";
      };
    const initialServerTime = serverNow();
    if (initialServerTime) {
      const [initialDate, initialTime] = initialServerTime.split(" ");
      $("#mklanddate").value = initialDate;
      $("#mklandtime").value = initialTime;
    }

    const landingValue = () =>
      `${$("#mklanddate").value.trim()} ${$("#mklandtime").value.trim()}`;

    const SETTINGS_KEY = "mkfakeplanner_settings_v8";
    const loadSettings = () => {
      try {
        return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      } catch (e) {
        return {};
      }
    };
    const saveSettings = () => {
      const data = {
        title: $("#mktitle").value,
        targets: $("#mktarget").value,
        blockNight: $("#mkblocknight").checked,
        blockFrom: $("#mkblockfrom").value,
        blockTo: $("#mkblockto").value,
        maxPerTarget: Number($("#mkmaxpertarget").value),
        ignoreMax: $("#mkignoremax").checked,
      };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(data));
    };
    const savedSettings = loadSettings();
    if (typeof savedSettings.title === "string")
      $("#mktitle").value = savedSettings.title;
    if (typeof savedSettings.targets === "string")
      $("#mktarget").value = savedSettings.targets;
    if (typeof savedSettings.blockNight === "boolean")
      $("#mkblocknight").checked = savedSettings.blockNight;
    if (savedSettings.blockFrom) $("#mkblockfrom").value = savedSettings.blockFrom;
    if (savedSettings.blockTo) $("#mkblockto").value = savedSettings.blockTo;
    if (
      Number.isInteger(savedSettings.maxPerTarget) &&
      savedSettings.maxPerTarget >= 1 &&
      savedSettings.maxPerTarget <= 20
    )
      $("#mkmaxpertarget").value = savedSettings.maxPerTarget;
    if (typeof savedSettings.ignoreMax === "boolean")
      $("#mkignoremax").checked = savedSettings.ignoreMax;

    const updateMaxMode = () => {
      const ignore = $("#mkignoremax").checked;
      $("#mkmaxpertarget").disabled = ignore;
      $("#mkmaxhelp").textContent = ignore
        ? "Ruční režim: na každý cíl se použijí všechny označené vesnice. Bez označení se použijí všechny načtené vesnice."
        : "Automatický režim: pro každý cíl se použije nejvýše zadaný počet nejbližších vesnic.";
      $("#mkmaxhelp").style.fontWeight = ignore ? "bold" : "normal";
    };
    updateMaxMode();

    const analyseTargets = (text) => {
      const pieces = String(text || "")
        .split(/[\s,;]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const valid = [];
      const invalid = [];
      const duplicates = [];
      const seen = new Set();

      for (const piece of pieces) {
        const match = piece.match(/^(\d{1,3})\|(\d{1,3})$/);
        if (!match) {
          invalid.push(piece);
          continue;
        }
        const x = Number(match[1]);
        const y = Number(match[2]);
        if (x > 999 || y > 999) {
          invalid.push(piece);
          continue;
        }
        const coord = `${x}|${y}`;
        if (seen.has(coord)) {
          duplicates.push(coord);
          continue;
        }
        seen.add(coord);
        valid.push([x, y]);
      }
      return { valid, invalid, duplicates };
    };

    const updateTargetStatus = () => {
      const result = analyseTargets($("#mktarget").value);
      const status = $("#mktargetstatus");
      if (!$("#mktarget").value.trim()) {
        status.textContent = "Zatím není zadán žádný cíl.";
        status.style.color = "#6b4a20";
      } else if (result.invalid.length) {
        status.textContent = `Chybné cíle: ${result.invalid.join(", ")}`;
        status.style.color = "#b00020";
      } else {
        status.textContent =
          `${result.valid.length} platných cílů` +
          (result.duplicates.length
            ? `, ${result.duplicates.length} duplicit vynecháno`
            : "");
        status.style.color = "#176b22";
      }
      return result;
    };

    let villages = [];
    function validGroupName(name) {
      name = String(name || "")
        .replace(/\s+/g, " ")
        .trim();
      return (
        name &&
        !/^(vesnice|village|villages|skupina|skupiny|groups?|přehled vesnic|overview villages)$/i.test(
          name,
        )
      );
    }
    function addGroupsFromDoc(doc, groups) {
      doc.querySelectorAll('a[href*="group="]').forEach((a) => {
        let href = a.getAttribute("href") || "",
          id = href.match(/[?&]group=(\d+)/)?.[1],
          name = a.textContent.replace(/\s+/g, " ").trim();
        if (id && validGroupName(name)) groups.set(String(id), name);
      });
      doc
        .querySelectorAll(
          'select[name="group"] option,select[name="group_id"] option,#group_select option,option[data-group-id],option[data-id]',
        )
        .forEach((o) => {
          let raw = String(o.value || ""),
            id =
              raw.match(/[?&]group=(\d+)/)?.[1] ||
              raw.match(/^(\d+)$/)?.[1] ||
              o.dataset.groupId ||
              o.dataset.id,
            name = o.textContent.replace(/\s+/g, " ").trim();
          if (id && /^\d+$/.test(String(id)) && validGroupName(name))
            groups.set(String(id), name);
        });
      doc.querySelectorAll("[data-group-id],[data-group]").forEach((el) => {
        let id = el.dataset.groupId || el.dataset.group,
          name = el.textContent.replace(/\s+/g, " ").trim();
        if (id && /^\d+$/.test(String(id)) && validGroupName(name))
          groups.set(String(id), name);
      });
    }

    const renderGroupChecks = () => {
      const box = $("#mkgroupchecks");
      if (!box) return;
      const options = [...$("#mkgroup").options].filter((o) => o.value !== "");
      box.innerHTML = options
        .map(
          (o) =>
            `<label style="display:flex;align-items:center;gap:7px;padding:4px 2px;cursor:pointer">` +
            `<input type="checkbox" class="mkgroupcheck" value="${esc(o.value)}" ${o.selected ? "checked" : ""}>` +
            `<span>${esc(o.textContent)}</span></label>`,
        )
        .join("");

      box.querySelectorAll(".mkgroupcheck").forEach((cb) => {
        cb.addEventListener("change", async () => {
          const value = String(cb.value);
          if (value === "0" && cb.checked) {
            box.querySelectorAll(".mkgroupcheck").forEach((other) => {
              other.checked = other === cb;
            });
          } else if (value !== "0" && cb.checked) {
            const all = box.querySelector('.mkgroupcheck[value="0"]');
            if (all) all.checked = false;
          }

          const checked = [...box.querySelectorAll(".mkgroupcheck:checked")].map(
            (x) => String(x.value),
          );
          [...$("#mkgroup").options].forEach((o) => {
            o.selected = checked.includes(String(o.value));
          });
          localStorage.setItem("mkfakeplanner_groups", JSON.stringify(checked));
          await loadVillages();
        });
      });
    };

    async function loadGroups() {
      try {
        msg("Načítám skupiny…");
        let groups = new Map([["0", "Všechny vesnice"]]),
          urls = [
            "/game.php?screen=groups",
            "/game.php?screen=overview_villages&mode=combined&group=0&page=-1",
            "/game.php?screen=overview_villages&mode=combined",
          ];
        for (let url of urls) {
          try {
            let html = await get(url),
              doc = P.parseFromString(html, "text/html");
            addGroupsFromDoc(doc, groups);
          } catch (e) {}
        }
        try {
          let r = await fetch("/game.php?screen=groups&ajax=load_group_menu", {
              credentials: "same-origin",
              headers: { "TribalWars-Ajax": "1" },
            }),
            txt = await r.text();
          try {
            let j = JSON.parse(txt),
              walk = (o) => {
                if (!o || typeof o !== "object") return;
                if (Array.isArray(o)) {
                  o.forEach(walk);
                  return;
                }
                let id = o.group_id ?? o.id ?? o.value,
                  name = o.name ?? o.label ?? o.text;
                if (
                  id !== undefined &&
                  /^\d+$/.test(String(id)) &&
                  validGroupName(name)
                )
                  groups.set(String(id), String(name).trim());
                Object.values(o).forEach(walk);
              };
            walk(j);
          } catch (e) {
            let doc = P.parseFromString(txt, "text/html");
            addGroupsFromDoc(doc, groups);
          }
        } catch (e) {}
        const current = [...$("#mkgroup").selectedOptions].map((o) => o.value);
        let sorted = [...groups]
            .filter(([id, name]) => id === "0" || validGroupName(name))
            .sort((a, b) =>
              a[0] === "0"
                ? -1
                : b[0] === "0"
                  ? 1
                  : a[1].localeCompare(b[1], "cs", { sensitivity: "base" }),
            );
        $("#mkgroup").innerHTML = sorted
          .map(
            ([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`,
          )
          .join("");

        let savedGroups = [];
        try {
          savedGroups = JSON.parse(
            localStorage.getItem("mkfakeplanner_groups") || "[]",
          ).map(String);
        } catch (e) {}

        const toSelect = savedGroups.length
          ? savedGroups
          : current.length
            ? current
            : ["0"];

        [...$("#mkgroup").options].forEach((o) => {
          o.selected = toSelect.includes(String(o.value));
        });

        if (![...$("#mkgroup").selectedOptions].length)
          $("#mkgroup").options[0].selected = true;

        renderGroupChecks();
        msg(`Načteno skupin: ${sorted.length}.`);
        await loadVillages();
      } catch (e) {
        $("#mkgroup").innerHTML = '<option value="0" selected>Všechny vesnice</option>';
        renderGroupChecks();
        msg("Skupiny se nepodařilo načíst.");
        await loadVillages();
      }
    }
    async function loadVillagesForGroup(gid) {
      try {
        const groupName =
          [...$("#mkgroup").options].find((o) => o.value === String(gid))?.textContent ||
          `Skupina ${gid}`;

        const combinedUrl =
          `/game.php?screen=overview_villages&mode=combined&group=${encodeURIComponent(gid)}&page=-1`;
        const unitsUrls = [
          `/game.php?screen=overview_villages&mode=units&group=${encodeURIComponent(gid)}&page=-1`,
          `/game.php?screen=overview_villages&mode=units&type=complete&group=${encodeURIComponent(gid)}&page=-1`,
        ];

        const combinedHtml = await get(combinedUrl);
        const combinedDoc = P.parseFromString(combinedHtml, "text/html");
        const map = new Map();

        // Spolehlivé body vesnic načteme z veřejných mapových dat.
        // Formát: id,name,x,y,player,points,rank
        const pointsById = new Map();
        const pointsByCoord = new Map();
        try {
          const mapText = await get("/map/village.txt");
          for (const line of mapText.split("\n")) {
            if (!line.trim()) continue;
            const parts = line.split(",");
            if (parts.length < 7) continue;
            const id = String(parts[0]);
            const x = Number(parts[2]);
            const y = Number(parts[3]);
            const points = Number(parts[5]);
            if (id && Number.isFinite(points)) {
              pointsById.set(id, points);
              pointsByCoord.set(`${x}|${y}`, points);
            }
          }
        } catch (e) {}

        const rowVillage = (tr) => {
          const co = C(tr.textContent || "");
          const links = [...tr.querySelectorAll('a[href*="village="]')];
          const a = links.find((x) =>
            (x.getAttribute("href") || "").match(/[?&]village=\d+/),
          );
          const id = (a?.getAttribute("href") || "").match(/[?&]village=(\d+)/)?.[1];
          return id && co ? { id, co, a } : null;
        };

        const parseNumber = (text) => {
          const m = String(text || "").replace(/[.\s\u00a0]/g, "").match(/\d+/);
          return m ? Number(m[0]) : 0;
        };

        // 1) Základní seznam + body.
        combinedDoc.querySelectorAll("tr").forEach((tr) => {
          const info = rowVillage(tr);
          if (!info || map.has(info.id)) return;

          let points = 0;
          const pointSelectors = [
            'td[class*="points"]',
            '[data-field="points"]',
            'span[class*="points"]',
            'td.points',
          ];
          for (const sel of pointSelectors) {
            const el = tr.querySelector(sel);
            if (el) {
              points = parseNumber(el.textContent);
              if (points) break;
            }
          }

          // Bezpečný fallback: hledá hodnotu bodů v rozumném rozsahu,
          // ale ignoruje ID a obě souřadnice.
          if (!points) {
            const coordParts = info.co.map(String);
            const nums = (String(tr.textContent || "").match(/\b\d{3,6}\b/g) || [])
              .map(Number)
              .filter((n) =>
                n >= 100 &&
                n <= 20000 &&
                String(n) !== String(info.id) &&
                !coordParts.includes(String(n)),
              );
            points = nums.length ? Math.max(...nums) : 0;
          }

          const coord = `${info.co[0]}|${info.co[1]}`;
          points = pointsById.get(String(info.id)) || pointsByCoord.get(coord) || points;

          map.set(info.id, {
            id: info.id,
            coord,
            name: (info.a.textContent || "").replace(/\s+/g, " ").trim(),
            points,
            units: Object.fromEntries(FAKE_UNITS.map((u) => [u, 0])),
          });
        });

        // 2) Jednotky načteme ze samostatného přehledu jednotek.
        // Na různých světech nemají buňky jednotek stejné CSS třídy,
        // proto nejdříve zjistíme sloupce podle ikon v hlavičce tabulky.
        let unitsLoaded = false;
        let unitsDebug = "";

        const detectUnitFromCell = (cell) => {
          const hay = [
            cell.getAttribute("data-unit") || "",
            cell.className || "",
            cell.getAttribute("title") || "",
            ...[...cell.querySelectorAll("img")].flatMap((img) => [
              img.getAttribute("data-unit") || "",
              img.getAttribute("src") || "",
              img.getAttribute("alt") || "",
              img.getAttribute("title") || "",
            ]),
          ]
            .join(" ")
            .toLowerCase();

          return FAKE_UNITS.find((u) =>
            new RegExp(`(?:^|[^a-z])${u}(?:[^a-z]|$)`).test(hay),
          ) || null;
        };

        for (const unitsUrl of unitsUrls) {
          try {
            const unitsHtml = await get(unitsUrl);
            const unitsDoc = P.parseFromString(unitsHtml, "text/html");

            const tables = [...unitsDoc.querySelectorAll("table")];
            let foundOnPage = 0;

            for (const table of tables) {
              const unitColumns = {};
              const headerRows = [...table.querySelectorAll("tr")].slice(0, 4);

              for (const hr of headerRows) {
                [...hr.children].forEach((cell, index) => {
                  const unit = detectUnitFromCell(cell);
                  if (unit) unitColumns[unit] = index;
                });
              }

              if (!Object.keys(unitColumns).length) continue;

              for (const tr of table.querySelectorAll("tr")) {
                const info = rowVillage(tr);
                if (!info) continue;

                const village = map.get(info.id);
                if (!village) continue;

                const cells = [...tr.children];
                let rowHasUnitData = false;

                for (const u of FAKE_UNITS) {
                  const index = unitColumns[u];
                  if (index === undefined || !cells[index]) continue;

                  const amount = parseNumber(cells[index].textContent);
                  village.units[u] = amount;
                  rowHasUnitData = true;
                  if (amount > 0) foundOnPage++;
                }

                if (rowHasUnitData) village.unitDataLoaded = true;
              }
            }

            const loadedRows = [...map.values()].filter((v) => v.unitDataLoaded).length;
            unitsDebug =
              `URL ${unitsUrl}: nalezené sloupce/řádky ${loadedRows}, nenulové hodnoty ${foundOnPage}`;

            if (loadedRows > 0) {
              unitsLoaded = true;
              break;
            }
          } catch (e) {
            unitsDebug = `Chyba ${unitsUrl}: ${e.message}`;
          }
        }

        return [...map.values()];
      } catch (e) {
        throw new Error(`Skupina ${gid}: ${e.message}`);
      }
    }

    async function loadVillages() {
      try {
        let selectedGroups = [...$("#mkgroup").selectedOptions]
          .map((o) => String(o.value))
          .filter(Boolean);

        if (!selectedGroups.length) selectedGroups = ["0"];
        if (selectedGroups.includes("0")) selectedGroups = ["0"];

        const selectedNames = selectedGroups.map(
          (id) =>
            [...$("#mkgroup").options].find((o) => o.value === id)?.textContent ||
            `Skupina ${id}`,
        );

        msg(
          `Načítám ${selectedGroups.length} ${
            selectedGroups.length === 1 ? "skupinu" : "skupiny"
          }: ${selectedNames.join(", ")}…`,
        );

        const mergedByCoord = new Map();
        const errors = [];

        for (const gid of selectedGroups) {
          try {
            const groupVillages = await loadVillagesForGroup(gid);
            for (const village of groupVillages) {
              // Duplicity mezi skupinami odstraňujeme podle souřadnice.
              if (!mergedByCoord.has(village.coord))
                mergedByCoord.set(village.coord, village);
            }
          } catch (e) {
            errors.push(e.message);
          }
        }

        villages = [...mergedByCoord.values()].sort((a, b) =>
          a.coord.localeCompare(b.coord),
        );

        $("#mkvillages").innerHTML = villages
          .map((v) => {
            const unitTotal = Object.values(v.units).reduce((a, b) => a + b, 0);
            const suffix =
              ` · ${v.points || "?"} b.` +
              (v.unitDataLoaded ? ` · jednotky ${unitTotal}` : ` · jednotky ?`);
            return `<option value="${esc(v.id)}">${esc(
              v.coord +
                (v.name && !v.name.includes(v.coord) ? " – " + v.name : "") +
                suffix,
            )}</option>`;
          })
          .join("");

        localStorage.setItem(
          "mkfakeplanner_groups",
          JSON.stringify(selectedGroups),
        );

        const withPoints = villages.filter((v) => v.points > 0).length;
        const withUnits = villages.filter((v) => v.unitDataLoaded).length;

        msg(
          `Skupiny: ${selectedNames.join(", ")} · ${villages.length} unikátních vesnic · body ${withPoints}/${villages.length} · jednotky ${withUnits}/${villages.length}.` +
            (errors.length ? ` Chyby: ${errors.join(" | ")}` : ""),
        );
      } catch (e) {
        villages = [];
        $("#mkvillages").innerHTML = "";
        msg("Vesnice se nepodařilo načíst: " + e.message);
      }
    }

    async function targetId(coord) {
      try {
        let r = await fetch(
            `/game.php?screen=api&ajax=target_selection&input=${encodeURIComponent(coord)}`,
            { credentials: "same-origin", headers: { "TribalWars-Ajax": "1" } },
          ),
          j = await r.json(),
          walk = (o) => {
            if (!o || typeof o !== "object") return null;
            if ((o.id || o.village_id) && C(o.coord || o.name || o.label || ""))
              return o.id || o.village_id;
            for (let k in o) {
              let z = walk(o[k]);
              if (z) return z;
            }
            return null;
          };
        return walk(j);
      } catch (e) {
        return null;
      }
    }
    $("#mkclose").onclick = () => ov.remove();
    $("#mkgroup").onchange = async () => {
      let ids = [...$("#mkgroup").selectedOptions].map((o) => String(o.value));
      if (ids.includes("0") && ids.length > 1) ids = ["0"];
      [...$("#mkgroup").options].forEach((o) => {
        o.selected = ids.includes(String(o.value));
      });
      localStorage.setItem("mkfakeplanner_groups", JSON.stringify(ids));
      renderGroupChecks();
      await loadVillages();
    };

    $("#mkgroupall").onclick = async () => {
      [...$("#mkgroup").options].forEach((o) => {
        o.selected = o.value === "0";
      });
      localStorage.setItem("mkfakeplanner_groups", JSON.stringify(["0"]));
      renderGroupChecks();
      await loadVillages();
    };

    $("#mkgroupnone").onclick = async () => {
      [...$("#mkgroup").options].forEach((o) => {
        o.selected = false;
      });
      localStorage.setItem("mkfakeplanner_groups", JSON.stringify([]));
      renderGroupChecks();
      villages = [];
      $("#mkvillages").innerHTML = "";
      msg("Není vybrána žádná skupina.");
    };

    const fakeComposition = (village) => {
      // Tribal Wars vyžaduje nejméně 1 % bodů vesnice.
      // Proto používáme CEIL, nikoliv floor.
      const target = Math.max(1, Math.ceil(Number(village.points || 0) / 100));
      const available = Object.fromEntries(
        FAKE_UNITS.map((u) => [u, Math.max(0, Number(village.units?.[u] || 0))]),
      );

      // Hledáme přesnou kombinaci s populací = target.
      // Dynamické programování zároveň preferuje co nejrovnoměrnější zastoupení druhů.
      const states = Array(target + 1).fill(null);
      states[0] = { comp: Object.fromEntries(FAKE_UNITS.map((u) => [u, 0])), score: 0 };

      for (const u of FAKE_UNITS) {
        const weight = POP[u];
        const maxCount = Math.min(available[u], Math.floor(target / weight));
        const next = states.map((s) =>
          s ? { comp: { ...s.comp }, score: s.score } : null,
        );

        for (let pop = 0; pop <= target; pop++) {
          const state = states[pop];
          if (!state) continue;

          for (let count = 1; count <= maxCount && pop + count * weight <= target; count++) {
            const np = pop + count * weight;
            const comp = { ...state.comp, [u]: count };

            const usedTypes = FAKE_UNITS.filter((x) => comp[x] > 0).length;
            const populationShares = FAKE_UNITS
              .filter((x) => comp[x] > 0)
              .map((x) => comp[x] * POP[x]);
            const spread = populationShares.length
              ? Math.max(...populationShares) - Math.min(...populationShares)
              : target;

            // Více použitých druhů je lepší; menší rozdíl populačních podílů je lepší.
            const score = usedTypes * 10000 - spread * 10 - count;

            if (!next[np] || score > next[np].score)
              next[np] = { comp, score };
          }
        }

        for (let i = 0; i <= target; i++) states[i] = next[i];
      }

      let finalState = states[target];

      // Když přesná kombinace neexistuje, hledáme nejmenší hodnotu NAD minimem.
      // To zaručí, že hra útok přijme a minimum 1 % nebude porušeno.
      let used = target;
      if (!finalState) {
        const maxExtra = 50;
        outer:
        for (let extra = 1; extra <= maxExtra; extra++) {
          const wanted = target + extra;
          for (const u of FAKE_UNITS) {
            const weight = POP[u];
            if (wanted % weight === 0 && available[u] >= wanted / weight) {
              const comp = Object.fromEntries(FAKE_UNITS.map((x) => [x, 0]));
              comp[u] = wanted / weight;
              finalState = { comp, score: 0 };
              used = wanted;
              break outer;
            }
          }
        }
      }

      if (!finalState)
        return { comp: {}, limit: target, used: 0, exact: false };

      const clean = Object.fromEntries(
        Object.entries(finalState.comp).filter(([, n]) => n > 0),
      );
      used = Object.entries(clean).reduce((s, [u, n]) => s + POP[u] * n, 0);

      return { comp: clean, limit: target, used, exact: used === target };
    };

    const slowestUsedUnit = (comp) => {
      const units = Object.keys(comp);
      if (!units.length) return null;
      return units.reduce((slow, u) => (SPEED[u] > SPEED[slow] ? u : slow), units[0]);
    };

    const unitsQuery = (comp) =>
      Object.entries(comp)
        .map(([u, n]) => `&${encodeURIComponent(u)}=${encodeURIComponent(n)}`)
        .join("");

    const unitsBB = (comp) =>
      Object.entries(comp)
        .map(([u, n]) => `[unit]${u}[/unit] ${n}`)
        .join(" ");

    const calculatePlan = async (copyAfter = false) => {
      saveSettings();
      const targetCheck = updateTargetStatus();
      let targetText = $("#mktarget").value.trim(),
        targets = targetCheck.valid,
        land = T(landingValue()),
        selected = [...$("#mkvillages").selectedOptions].map((o) => o.value),
        src = selected.length
          ? villages.filter((v) => selected.includes(v.id))
          : villages,
        blockNight = $("#mkblocknight").checked,
        blockFrom = HM($("#mkblockfrom").value),
        blockTo = HM($("#mkblockto").value),
        maxPerTarget = Number($("#mkmaxpertarget").value),
        ignoreMax = $("#mkignoremax").checked;
      if (targetCheck.invalid.length)
        return msg(`Oprav chybné cíle: ${targetCheck.invalid.join(", ")}`);
      if (!targets.length)
        return msg("Zadej alespoň jeden správný cíl, například 500|500.");
      if (!Number.isFinite(land))
        return msg(
          "Zadej datum a čas dopadu, například 2026-07-17 a 20:00:00.000.",
        );
      if (!src.length)
        return msg("Vyber skupinu s vesnicemi.");
      if (src.some((v) => !v.points))
        return msg("U některých zdrojových vesnic se nepodařilo načíst body.");
      const noUnitData = src.filter((v) => !v.unitDataLoaded);
      if (noUnitData.length)
        return msg(`U ${noUnitData.length} zdrojových vesnic se nepodařilo načíst údaje o jednotkách. Stav načtení je vidět pod výběrem skupiny.`);
      if (blockNight && (blockFrom === null || blockTo === null))
        return msg("Zadej správný časový rozsah, například 23:00 až 06:00.");
      if (
        !ignoreMax &&
        (!Number.isInteger(maxPerTarget) ||
          maxPerTarget < 1 ||
          maxPerTarget > 20)
      )
        return msg("Počet útoků na jeden cíl musí být celé číslo od 1 do 20.");
      msg(
        ignoreMax
          ? `Vytvářím ruční plán z ${src.length} vybraných vesnic na ${targets.length} cílů…`
          : `Vytvářím plán: maximálně ${maxPerTarget} útoků na každý z ${targets.length} cílů…`,
      );
      let targetData = [];
      for (let tg of targets) {
        let coord = `${tg[0]}|${tg[1]}`,
          tid = await targetId(coord);
        targetData.push({ tg, coord, tid });
      }
      const MAX_PER_SOURCE = 2;
      const sourceUsage = new Map();
      const shortages = [];
      let rows = [],
        blocked = 0;
      // Požadovaný počet útoků pro každý cíl.
      const targetNeeds = new Map(
        targetData.map((t) => [
          t.coord,
          ignoreMax ? src.length : maxPerTarget,
        ]),
      );
      const targetPlanned = new Map(targetData.map((t) => [t.coord, 0]));

      // Dva průchody:
      // 1. průchod: každá zdrojová vesnice může být použita jen poprvé.
      // 2. průchod: teprve potom je možné použít stejnou vesnici podruhé.
      for (let sourceRound = 0; sourceRound < MAX_PER_SOURCE; sourceRound++) {
        let progressInRound = true;

        while (progressInRound) {
          progressInRound = false;

          for (let t of targetData) {
            const needed = targetNeeds.get(t.coord) || 0;
            const alreadyPlanned = targetPlanned.get(t.coord) || 0;
            if (alreadyPlanned >= needed) continue;

            const candidates = src
              .map((v) => {
                const currentUsage = sourceUsage.get(v.coord) || 0;

                // V prvním průchodu bereme pouze ještě nepoužité vesnice.
                // Ve druhém průchodu pouze vesnice, které už mají právě jeden útok.
                if (currentUsage !== sourceRound) return null;

                const allocation = fakeComposition(v);
                const slowUnit = slowestUsedUnit(allocation.comp);
                if (!slowUnit) return null;

                const a = C(v.coord),
                  dist = Math.hypot(a[0] - t.tg[0], a[1] - t.tg[1]),
                  travel = dist * SPEED[slowUnit] * 60000,
                  send = land - travel,
                  unitParams = unitsQuery(allocation.comp),
                  url = t.tid
                    ? `${base}?village=${v.id}&screen=place&target=${t.tid}${unitParams}`
                    : `${base}?village=${v.id}&screen=place&x=${t.tg[0]}&y=${t.tg[1]}${unitParams}`;

                return {
                  ...v,
                  target: t.coord,
                  dist,
                  travel,
                  send,
                  url,
                  composition: allocation.comp,
                  populationLimit: allocation.limit,
                  populationUsed: allocation.used,
                  exactPopulation: allocation.exact,
                  slowUnit,
                };
              })
              .filter(Boolean)
              .sort(
                (a, b) =>
                  a.dist - b.dist ||
                  a.send - b.send ||
                  a.coord.localeCompare(b.coord),
              );

            let chosen = null;
            for (const candidate of candidates) {
              if (
                blockNight &&
                blockedTime(candidate.send, blockFrom, blockTo)
              ) {
                blocked++;
                continue;
              }
              chosen = candidate;
              break;
            }

            if (!chosen) continue;

            rows.push(chosen);
            sourceUsage.set(
              chosen.coord,
              (sourceUsage.get(chosen.coord) || 0) + 1,
            );
            targetPlanned.set(
              t.coord,
              (targetPlanned.get(t.coord) || 0) + 1,
            );
            progressInRound = true;
          }
        }
      }

      for (const t of targetData) {
        const requested = targetNeeds.get(t.coord) || 0;
        const planned = targetPlanned.get(t.coord) || 0;
        if (planned < requested) {
          shortages.push({
            target: t.coord,
            planned,
            requested,
          });
        }
      }
      rows.sort(
        (a, b) =>
          a.send - b.send ||
          a.target.localeCompare(b.target) ||
          a.coord.localeCompare(b.coord),
      );
      if (!rows.length) {
        return msg(
          "Nevznikl žádný řádek plánu. Zkontroluj načtení jednotek, čas dopadu a zakázané časy odeslání.",
        );
      }
      let title = $("#mktitle").value.trim() || "Útok",
        group = [...$("#mkgroup").selectedOptions]
          .map((o) => o.textContent)
          .join(", "),
        bb =
          `[b]${title}[/b]\n[b]Dopad:[/b] ${F(land)}\n[b]Jednotky:[/b] automaticky minimálně 1 % bodů podle populace\n[b]Režim výběru:[/b] ${ignoreMax ? "Ruční – označené vesnice" : `Max. ${maxPerTarget} útoků na cíl`}\n[b]Limit zdroje:[/b] max. 2 útoky; nejdříve každá vesnice jednou\n[b]Skupiny:[/b] ${group}\n\n[table]\n[**]Výchozí vesnice[||]Cíl[||]Vzdálenost[||]Doba[||]Datum[||]Čas[||]Pop.[||]ODESLAT[/**]\n` +
          rows
            .map(
              (r) =>
                `[*][coord]${r.coord}[/coord][|][coord]${r.target}[/coord][|]${r.dist.toFixed(2)}[|]${D(r.travel)}[|]${FD(r.send)}[|]${FT(r.send)}[|]${r.populationUsed}/${r.populationLimit}${r.exactPopulation ? "" : " [color=#b00020]NAD LIMIT[/color]"}[|][url=${r.url}][b]ODESLAT[/b][/url][/*]`,
            )
            .join("\n") +
          `\n[/table]` +
          (shortages.length
            ? `\n\n[color=#b00020][b]Upozornění:[/b] Pro ${shortages.length} cílů nebyl dostatek vhodných zdrojových vesnic při limitu max. 2 útoky z jedné vesnice.[/color]`
            : "") +
          `\n\n[i]Kliknutí na ODESLAT pouze otevře nádvoří s cílem a předvyplněnými jednotkami. Před odesláním vše zkontroluj.[/i]`;
      $("#mkout").value = bb;
      const inexact = rows.filter((r) => !r.exactPopulation).length;
      msg(
        (ignoreMax
          ? `Hotovo: ${rows.length} příkazů z ${src.length} ručně vybraných vesnic na ${targets.length} cílů.`
          : `Hotovo: ${rows.length} příkazů, maximálně ${maxPerTarget} na každý z ${targets.length} cílů.`) +
        (blocked ? ` Vynecháno kvůli nastavenému času: ${blocked}.` : "") +
        (inexact ? ` U ${inexact} příkazů bylo nutné použít populaci mírně nad přesným 1 %.` : "") +
        (shortages.length
          ? ` Nedostatek zdrojových vesnic u ${shortages.length} cílů; plán byl vytvořen jen z dostupných vesnic.`
          : "")
      );
      if (copyAfter) await copyOutput();
    };

    const copyOutput = async () => {
      if (!$("#mkout").value) {
        msg("Nejdříve vypočítej plán.");
        return false;
      }
      try {
        await navigator.clipboard.writeText($("#mkout").value);
      } catch (e) {
        $("#mkout").select();
        document.execCommand("copy");
      }
      msg("BBCode byl zkopírován.");
      return true;
    };

    $("#mkcalc").onclick = () => calculatePlan(false);
    $("#mkcalccopy").onclick = () => calculatePlan(true);
    $("#mkcopy").onclick = async () => {
      await copyOutput();
    };

    [
      "mktitle",
      "mkmaxpertarget",
      "mkignoremax",
      "mkblocknight",
      "mkblockfrom",
      "mkblockto",
    ].forEach(
      (id) => {
        $(`#${id}`).addEventListener("change", saveSettings);
      },
    );
    $("#mktitle").addEventListener("input", saveSettings);
    $("#mkignoremax").addEventListener("change", () => {
      updateMaxMode();
      saveSettings();
    });
    $("#mktarget").addEventListener("input", () => {
      saveSettings();
      updateTargetStatus();
    });
    updateTargetStatus();

    await loadGroups();
  } catch (e) {
    alert("Chyba plánovače: " + e.message);
  }
})();
