import { timeWindow, resourceSeries } from "./history-data.js";
const COLORS = [
  "#55d6be",
  "#64a8ff",
  "#f0b66d",
  "#dd83d8",
  "#ee7d85",
  "#b8ce67",
  "#aa9aff",
  "#79cbd5",
];
const el = (tag, value = "") => {
  const node = document.createElement(tag);
  node.textContent = value;
  return node;
};
const color = (id) =>
  COLORS[
    [...String(id)].reduce((sum, c) => sum + c.charCodeAt(0), 0) % COLORS.length
  ];
const time = (at) =>
  new Date(at).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
const sum = (types) => Object.values(types ?? {}).reduce((s, v) => s + v, 0);
function chart(
  container,
  samples,
  series,
  {
    bars = null,
    authority = null,
    battles = [],
    hidden = new Set(),
    typeNames = new Map(),
  } = {},
) {
  const wrapper = el("div");
  wrapper.className = "plot";
  const canvas = el("canvas");
  canvas.setAttribute("role", "img");
  canvas.setAttribute(
    "aria-label",
    bars
      ? "Effectifs mobiles et garnisons par type, autorité et résultats de combats"
      : series.map((s) => s.name).join(", "),
  );
  const tooltip = el("div", "Survolez le graphique pour lire les valeurs.");
  tooltip.className = "chart-tooltip";
  const legend = el("div");
  legend.className = "chart-legend";
  wrapper.append(canvas, tooltip, legend);
  container.append(wrapper);
  for (const item of series) {
    const button = el("button", item.name);
    button.style.borderColor = item.color;
    button.setAttribute("aria-pressed", String(!hidden.has(item.id)));
    button.onclick = () => {
      hidden.has(item.id) ? hidden.delete(item.id) : hidden.add(item.id);
      button.setAttribute("aria-pressed", String(!hidden.has(item.id)));
      draw();
    };
    legend.append(button);
  }
  const W = 1000,
    H = 300,
    left = 62,
    right = authority || series.some((s) => s.axis === "right") ? 72 : 20,
    top = 20,
    bottom = 44;
  canvas.width = W * 2;
  canvas.height = H * 2;
  canvas.style.width = "100%";
  canvas.style.height = "300px";
  const ctx = canvas.getContext("2d");
  ctx.scale(2, 2);
  const start = samples[0]?.at ?? 0,
    end = samples.at(-1)?.at ?? start + 1;
  const x = (at) =>
    left + ((at - start) / Math.max(1, end - start)) * (W - left - right);
  let maximum = 1;
  const count = samples.length;
  function draw() {
    ctx.clearRect(0, 0, W, H);
    const visible = series.filter((s) => !hidden.has(s.id));
    const leftSeries = visible.filter((s) => s.axis !== "right");
    const rightSeries = visible.filter((s) => s.axis === "right");
    const rightMaximum =
      Math.max(
        1,
        rightSeries.reduce(
          (max, s) => s.values.reduce((m, v) => Math.max(m, v ?? 0), max),
          0,
        ),
      ) * 1.12;
    maximum = Math.max(
      1,
      leftSeries.reduce(
        (max, s) => s.values.reduce((m, v) => Math.max(m, v ?? 0), max),
        0,
      ),
    );
    if (bars)
      maximum = Math.max(
        1,
        ...bars.map((b) => Math.max(sum(b.mobile), sum(b.garrison))),
      );
    maximum *= 1.12;
    const y = (v) => H - bottom - (v / maximum) * (H - top - bottom);
    ctx.font = "12px system-ui";
    ctx.lineWidth = 1;
    ctx.fillStyle = "#a3b4c9";
    for (let n = 0; n <= 4; n++) {
      const value = (maximum * n) / 4;
      const yy = y(value);
      ctx.strokeStyle = "#293b50";
      ctx.beginPath();
      ctx.moveTo(left, yy);
      ctx.lineTo(W - right, yy);
      ctx.stroke();
      ctx.fillText(value.toFixed(maximum < 10 ? 1 : 0), 7, yy + 4);
    }
    for (let n = 0; n <= 4; n++) {
      const at = start + ((end - start) * n) / 4;
      ctx.fillText(
        time(at),
        Math.max(left - 12, Math.min(W - 85, x(at) - 24)),
        H - 14,
      );
    }
    if (bars) {
      const step = Math.max(1, Math.ceil(count / 85));
      const width = Math.max(
        2,
        Math.min(
          8,
          (W - left - right) / Math.max(1, Math.ceil(count / step)) / 3,
        ),
      );
      const indices = new Set(
        Array.from({ length: Math.ceil(count / step) }, (_, i) => i * step),
      );
      indices.add(count - 1);
      for (const index of indices) {
        const row = bars[index];
        for (const [side, offset] of [
          ["mobile", -width],
          ["garrison", 1],
        ]) {
          let baseline = 0;
          for (const [type, value] of Object.entries(row[side])) {
            const height = (value / maximum) * (H - top - bottom);
            ctx.fillStyle = color(type);
            ctx.globalAlpha = side === "mobile" ? 1 : 0.55;
            ctx.fillRect(
              x(samples[index].at) + offset,
              y(baseline + value),
              width,
              height,
            );
            baseline += value;
          }
        }
      }
      ctx.globalAlpha = 1;
    }
    if (series.some((s) => s.axis === "right")) {
      ctx.fillStyle = "#a3b4c9";
      ctx.fillText("Stock", W - right + 8, 14);
      ctx.fillText("Prod./cycle", 7, 14);
      for (let n = 0; n <= 4; n++)
        ctx.fillText(
          ((rightMaximum * n) / 4).toFixed(0),
          W - right + 8,
          H - bottom - (n / 4) * (H - top - bottom),
        );
    }
    const columns = visible.filter((s) => s.kind === "column");
    const stride = Math.max(1, Math.ceil(count / 65));
    const indices = new Set(
      Array.from({ length: Math.ceil(count / stride) }, (_, i) => i * stride),
    );
    if (count) indices.add(count - 1);
    const columnWidth = Math.max(
      0.5,
      Math.min(
        10,
        (W - left - right) / Math.max(1, indices.size) / (columns.length + 1),
      ),
    );
    columns.forEach((item, column) => {
      ctx.fillStyle = item.color;
      ctx.globalAlpha = 0.5;
      for (const index of indices) {
        const value = item.values[index];
        if (value == null) continue;
        const height = (value / rightMaximum) * (H - top - bottom);
        const xx = Math.max(
          left,
          Math.min(
            W - right - columnWidth,
            x(samples[index].at) + (column - columns.length / 2) * columnWidth,
          ),
        );
        ctx.fillRect(xx, H - bottom - height, columnWidth, height);
      }
    });
    ctx.globalAlpha = 1;
    for (const item of visible.filter((s) => s.kind !== "column")) {
      ctx.strokeStyle = item.color;
      ctx.lineWidth = item.team ? 3.3 : 1.8;
      ctx.setLineDash(item.team ? [] : [5, 3]);
      ctx.beginPath();
      let begun = false;
      item.values.forEach((value, index) => {
        if (value === null) {
          begun = false;
          return;
        }
        const point = [x(samples[index].at), y(value)];
        begun ? ctx.lineTo(...point) : ctx.moveTo(...point);
        begun = true;
      });
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (authority) {
      const cap = Math.max(1, ...authority);
      ctx.strokeStyle = "#f5d16d";
      ctx.lineWidth = 2;
      ctx.beginPath();
      authority.forEach((value, i) => {
        const yy = H - bottom - (value / cap) * (H - top - bottom);
        i ? ctx.lineTo(x(samples[i].at), yy) : ctx.moveTo(x(samples[i].at), yy);
      });
      ctx.stroke();
      ctx.fillStyle = "#f5d16d";
      ctx.fillText("Autorité", W - 56, 14);
      for (let n = 0; n <= 4; n++)
        ctx.fillText(
          ((cap * n) / 4).toFixed(0),
          W - right + 8,
          H - bottom - (n / 4) * (H - top - bottom),
        );
    }
    for (const battle of battles) {
      ctx.fillStyle =
        battle.result === "win"
          ? "#49df91"
          : battle.result === "loss"
            ? "#fb6f79"
            : "#a5b6c9";
      ctx.beginPath();
      ctx.arc(x(battle.at), top + 8, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  canvas.onpointermove = (event) => {
    const rect = canvas.getBoundingClientRect();
    const relative = ((event.clientX - rect.left) / rect.width) * W;
    const at = start + ((relative - left) / (W - left - right)) * (end - start);
    let index = 0;
    for (let i = 1; i < count; i++)
      if (Math.abs(samples[i].at - at) < Math.abs(samples[index].at - at))
        index = i;
    const row = samples[index];
    if (!row) return;
    const parts = series
      .filter((s) => !hidden.has(s.id))
      .map(
        (s) =>
          `${s.name} : ${s.values[index] == null ? "indisponible" : s.values[index].toFixed(1)}`,
      );
    if (bars)
      parts.push(
        `Armée : ${sum(bars[index].mobile)} (${Object.entries(
          bars[index].mobile,
        )
          .map(([id, n]) => `${typeNames.get(id) ?? id} : ${n}`)
          .join(
            ", ",
          )}) · Garnisons : ${sum(bars[index].garrison)} (${Object.entries(
          bars[index].garrison,
        )
          .map(([id, n]) => `${typeNames.get(id) ?? id} : ${n}`)
          .join(", ")})`,
      );
    if (authority) parts.push(`Autorité : ${authority[index]}`);
    const markers = battles.filter((b) => Math.abs(b.at - row.at) <= 4000);
    if (markers.length)
      parts.push(
        markers
          .map((b) =>
            b.result === "win"
              ? "Victoire"
              : b.result === "loss"
                ? "Défaite"
                : "Égalité",
          )
          .join(", "),
      );
    tooltip.textContent = `${time(row.at)} — ${parts.join(" · ")}`;
  };
  draw();
}
export function createDashboardCharts(container) {
  const hiddenPower = new Set();
  const hiddenResources = new Set();
  let durationMs = 0,
    endAt = null;
  let lastSamples = [],
    lastParty = null;
  const controller = {
    rerender() {
      controller.render(lastSamples, lastParty);
    },
  };
  let heroId = null,
    locationId = null;
  return Object.assign(controller, {
    clear() {
      container.replaceChildren();
      heroId = locationId = null;
      hiddenPower.clear();
      hiddenResources.clear();
      durationMs = 0;
      endAt = null;
      lastSamples = [];
      lastParty = null;
    },
    render(allSamples, party) {
      lastSamples = allSamples;
      lastParty = party;
      const samples = timeWindow(allSamples, durationMs, endAt);
      container.replaceChildren();
      const heading = el("div");
      heading.className = "chart-heading";
      heading.append(
        el("h2", "Évolution du monde"),
        el(
          "p",
          `${samples.length} relevés affichés / ${allSamples.length} conservés · cadence 4 s · ${samples.length ? `${time(samples[0].at)} → ${time(samples.at(-1).at)}` : "En attente du premier relevé actif"}`,
        ),
      );
      container.append(heading);
      if (allSamples.length) {
        const controls = el("div");
        controls.className = "chart-time-controls";
        const label = el("label", "Période affichée ");
        const period = el("select");
        period.setAttribute("aria-label", "Période des graphiques");
        for (const [value, text] of [
          [0, "Tout l’historique"],
          [300000, "5 minutes"],
          [900000, "15 minutes"],
          [1800000, "30 minutes"],
          [3600000, "1 heure"],
        ]) {
          const option = el("option", text);
          option.value = value;
          period.append(option);
        }
        period.value = durationMs;
        period.onchange = () => {
          durationMs = Number(period.value);
          controller.rerender();
        };
        label.append(period);
        const sliderLabel = el("label", "Fin de la période ");
        const slider = el("input");
        slider.type = "range";
        slider.min = 0;
        slider.max = allSamples.length - 1;
        slider.step = 1;
        slider.value = Math.max(
          0,
          allSamples.findLastIndex((s) => s.at <= (endAt ?? Infinity)),
        );
        slider.setAttribute("aria-label", "Fin de la période affichée");
        slider.setAttribute(
          "aria-valuetext",
          time(allSamples[slider.value].at),
        );
        slider.onchange = () => {
          endAt =
            Number(slider.value) === allSamples.length - 1
              ? null
              : allSamples[slider.value].at;
          controller.rerender();
        };
        sliderLabel.append(slider);
        const live = el("button", "Revenir au direct");
        live.onclick = () => {
          endAt = null;
          controller.rerender();
        };
        controls.append(
          label,
          sliderLabel,
          live,
          el(
            "span",
            endAt === null
              ? "Suivi en direct"
              : `Historique arrêté à ${time(samples.at(-1).at)}`,
          ),
        );
        heading.append(controls);
      }
      if (!samples.length) {
        container.append(
          el(
            "p",
            "Les relevés commencent avec cette version, seulement lorsqu’un joueur est connecté. Aucun historique ancien n’est inventé.",
          ),
        );
        return;
      }
      const heroes = new Map();
      const teams = new Set();
      for (const sample of samples) {
        for (const h of sample.heroes) {
          heroes.set(h.id, h);
          teams.add(h.teamId);
        }
      }
      const card = (title) => {
        const c = el("section");
        c.className = "chart-card";
        c.append(el("h3", title));
        container.append(c);
        return c;
      };
      const power = card("Puissance comparée · héros et équipes");
      const series = [
        ...[...heroes.values()].map((h) => ({
          id: `h-${h.id}`,
          name: h.name,
          color: color(h.id),
          team: false,
          values: samples.map(
            (s) => s.heroes.find((row) => row.id === h.id)?.power ?? null,
          ),
        })),
        ...[...teams].map((id) => ({
          id: `t-${id}`,
          name: `Équipe ${id}`,
          color: color(id),
          team: true,
          values: samples.map(
            (s) => s.teams.find((row) => row.id === id)?.power ?? null,
          ),
        })),
      ];
      chart(power, samples, series, { hidden: hiddenPower });
      power.append(
        el(
          "p",
          "Courbes fines pointillées : héros · courbes épaisses : équipes. Cliquez sur la légende pour masquer une série.",
        ),
      );
      const army = card("Armée du héros · effectifs par type");
      const select = el("select");
      select.setAttribute("aria-label", "Héros à suivre");
      for (const h of heroes.values()) {
        const option = el("option", h.name);
        option.value = h.id;
        select.append(option);
      }
      heroId = heroes.has(heroId) ? heroId : heroes.keys().next().value;
      select.value = heroId;
      army.append(select);
      const plot = el("div");
      army.append(plot);
      function renderArmy() {
        heroId = select.value;
        plot.replaceChildren();
        const bars = samples.map((s) => {
          const h = s.heroes.find((h) => h.id === heroId);
          return {
            mobile: h?.mobile.types ?? {},
            garrison: h?.garrison.types ?? {},
          };
        });
        const authority = samples.map(
          (s) => s.heroes.find((h) => h.id === heroId)?.authority ?? 0,
        );
        const battles = samples
          .flatMap((s) => s.battles)
          .filter((b) => b.heroId === heroId);
        chart(plot, samples, [], {
          bars,
          authority,
          battles,
          typeNames: new Map(
            (party.unitTypes ?? []).map((u) => [u.id, u.name]),
          ),
        });
        const types = new Set(
          bars.flatMap((row) => [
            ...Object.keys(row.mobile),
            ...Object.keys(row.garrison),
          ]),
        );
        const legend = el("div");
        legend.className = "unit-legend";
        for (const type of types) {
          const label = el(
            "span",
            party.unitTypes?.find((u) => u.id === type)?.name ?? type,
          );
          label.style.color = color(type);
          legend.append(label);
        }
        plot.append(
          legend,
          el(
            "p",
            "Barre gauche : armée mobile · barre droite translucide : garnisons · ligne jaune : autorité (axe droit) · points verts / rouges : victoire / défaite.",
          ),
        );
      }
      select.onchange = renderArmy;
      renderArmy();
      const locations = new Map();
      for (const s of samples)
        for (const l of s.locations) locations.set(l.id, l);
      const places = card("Lieux · population, niveau et production");
      const chooser = el("select");
      chooser.setAttribute("aria-label", "Lieu à suivre");
      for (const l of locations.values()) {
        const option = el("option", l.name);
        option.value = l.id;
        chooser.append(option);
      }
      locationId = locations.has(locationId)
        ? locationId
        : locations.keys().next().value;
      chooser.value = locationId;
      places.append(chooser);
      const plots = el("div");
      places.append(plots);
      function renderLocation() {
        locationId = chooser.value;
        plots.replaceChildren();
        for (const [title, key] of [
          ["Population", "population"],
          ["Niveau", "level"],
        ]) {
          plots.append(el("h4", title));
          chart(plots, samples, [
            {
              id: key,
              name: title,
              color: key === "level" ? "#f0b66d" : "#55d6be",
              team: true,
              values: samples.map(
                (s) =>
                  s.locations.find((l) => l.id === locationId)?.[key] ?? null,
              ),
            },
          ]);
        }
        plots.append(el("h4", "Production par cycle et stocks"));
        chart(
          plots,
          samples,
          resourceSeries(samples, locationId).map((item) => ({
            ...item,
            color: color(item.resourceId),
            team: true,
          })),
          { hidden: hiddenResources },
        );
        plots.append(
          el(
            "p",
            "Courbes : production par cycle (axe gauche) · colonnes : stocks disponibles (axe droit). Cliquez sur la légende pour masquer une série. Les colonnes sont espacées sur les longues périodes ; le survol conserve chaque relevé.",
          ),
        );
      }
      chooser.onchange = renderLocation;
      if (locations.size) renderLocation();
      else places.append(el("p", "Aucun lieu dans cette partie."));
      const note = el("details");
      note.append(
        el("summary", "Comprendre le score de puissance"),
        el(
          "p",
          "Héros : attaque finale + défense finale + PV actuels. Unités : effectif × coefficient de qualité ; l’armée mobile reçoit un coefficient supplémentaire de 1 + 0,05 × vitesse. La qualité utilise les statistiques de base du type : attaque + défense + PV par soldat / 10 + portée + dégâts moyens par seconde + nombre de capacités. Ces coefficients initiaux sont indicatifs et ne modifient pas les combats. Les garnisons sont comptées une seule fois et attribuées au premier héros du propriétaire (identifiant stable), faute de lien historique avec un héros déposant.",
        ),
      );
      const list = el(
        "p",
        (party.unitTypes ?? [])
          .map(
            (u) =>
              `${u.name} : ${u.coefficient} × ${u.mobilityMultiplier.toFixed(2)} mobile`,
          )
          .join(" · "),
      );
      note.append(list);
      container.append(note);
    },
  });
}
