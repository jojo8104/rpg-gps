import { ACTION_META, actionOutputs } from "./project.js";
import { questEntry } from "./quest-entry-model.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const outputLabel = (value) =>
  ({
    success: "Terminé",
    victory: "Victoire",
    defeat: "Défaite",
    draw: "Égalité",
  })[value] ?? value;

export function createGraphView({
  canvas,
  getProject,
  getSelection,
  select,
  connect,
  changed,
  notify,
}) {
  const world = canvas.querySelector("#graph-world"),
    nodes = canvas.querySelector("#graph-nodes"),
    svg = canvas.querySelector("#graph-links");
  let pending = null,
    dragging = null;
  const screenPosition = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  const toWorld = (event) => {
    const point = screenPosition(event),
      view = getProject().editor.viewport;
    return {
      x: (point.x - view.x) / view.zoom,
      y: (point.y - view.y) / view.zoom,
    };
  };
  function applyViewport() {
    const view = getProject().editor.viewport;
    world.style.transform = `translate(${view.x}px,${view.y}px) scale(${view.zoom})`;
    document.querySelector("#zoom-label").textContent =
      Math.round(view.zoom * 100) + " %";
    canvas.style.backgroundSize = `${22 * view.zoom}px ${22 * view.zoom}px`;
    canvas.style.backgroundPosition = `${view.x}px ${view.y}px`;
  }
  function renderLinks() {
    const project = getProject(),
      selected = getSelection();
    const path = (from, to, output, dependency, id, label) => {
      const first = project.editor.positions[from],
        second = project.editor.positions[to];
      const source = project.quest.actions.find((entry) => entry.id === from);
      if (!first || !second || !source) return "";
      const index = actionOutputs(source).indexOf(output);
      const element = nodes.querySelector(`[data-node="${CSS.escape(from)}"]`);
      const port = element?.querySelectorAll(".output-row")[Math.max(0, index)];
      const y = first.y + (port ? port.offsetTop + 13 : 141),
        x = first.x + 250,
        endX = second.x,
        endY = second.y + 36;
      const bend = Math.max(65, Math.abs(endX - x) * 0.45),
        d = `M ${x} ${y} C ${x + bend} ${y}, ${endX - bend} ${endY}, ${endX} ${endY}`;
      return `<g data-link="${escape(id)}"><path class="link-hit" d="${d}"/><path class="link-line ${dependency ? "dependency" : ""} ${selected?.kind === "link" && selected.id === id ? "link-selected" : ""}" d="${d}" marker-end="url(#arrow)"/>${label ? `<text x="${(x + endX) / 2}" y="${(y + endY) / 2 - 8}" text-anchor="middle">${escape(label)}</text>` : ""}</g>`;
    };
    const entry = questEntry(project);
    const entryLinks = entry.roots
      .map((action) => {
        const p = project.editor.positions[action.id];
        return p
          ? `<path class="link-line dependency" d="M ${entry.x + 250} ${entry.y + 100} C ${entry.x + 310} ${entry.y + 100}, ${p.x - 60} ${p.y + 36}, ${p.x} ${p.y + 36}" marker-end="url(#arrow)"/>`
          : "";
      })
      .join("");
    svg.innerHTML =
      `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#79928b"/></marker></defs>` +
      entryLinks +
      project.quest.links
        .map((link) =>
          path(
            link.from,
            link.to,
            link.output,
            false,
            link.id,
            link.conditions?.length
              ? "Sous condition"
              : actionOutputs(
                    project.quest.actions.find(
                      (action) => action.id === link.from,
                    ) ?? {},
                  ).length > 1
                ? outputLabel(link.output)
                : "",
          ),
        )
        .join("") +
      project.quest.actions
        .flatMap((action) =>
          (action.requires ?? []).map((from) =>
            path(
              from,
              action.id,
              "success",
              true,
              `requires:${action.id}:${from}`,
              "Requis",
            ),
          ),
        )
        .join("");
  }
  function render() {
    const project = getProject(),
      selected = getSelection();
    const entry = questEntry(project);
    const start = `<article class="quest-node quest-entry" style="left:${entry.x}px;top:${entry.y}px;--node-color:var(--green)"><button class="button" data-quest-entry>▶ Proposition de quête</button><div class="node-body"><strong>${escape(project.quest.title)}</strong><small>Conditions de publication : ${project.quest.publicationCondition ? "définies" : "aucune"}</small><small>Conditions d’accès : ${project.quest.accessConditions?.length ?? 0}</small><small>Cliquer pour éditer la fiche de départ.</small></div><div class="node-id">Acceptation → actions de départ</div></article>`;
    nodes.innerHTML =
      start +
      project.quest.actions
        .map((action) => {
          const meta = ACTION_META[action.action] ?? ACTION_META.Atteindre,
            point = project.editor.positions[action.id] ?? { x: 0, y: 0 };
          const locationId =
            action.lieu ??
            action.origine ??
            action.destinataire ??
            action.targetLocationId;
          const name =
            project.world.locations.find((entry) => entry.id === locationId)
              ?.name ??
            locationId ??
            "Lieu à définir";
          const description =
            action.action === "Modifier"
              ? `<strong>${escape(action.modification.target)} · ${escape(action.modification.property)}</strong><small>${escape(action.modification.operation ?? "modifier")} ${escape(action.modification.amount ?? "")} ${escape(action.modification.key ?? "")}</small>`
              : action.action === "Parcourir"
                ? `<strong>${escape(action.distance)} m</strong> à parcourir`
                : ["Prendre", "Donner"].includes(action.action)
                  ? `<strong>${escape(action.combien)} × ${escape(action.quoi)}</strong><small>${escape(name)}</small>`
                  : action.action === "Combattre"
                    ? `<strong>${escape(action.qui || "Cible à définir")}</strong>`
                    : action.action === "Parler"
                      ? `<strong>${escape(action.dialogue?.qui || "Interlocuteur à définir")}</strong><small>${escape(name)}</small>`
                      : `<strong>${escape(name)}</strong>${action.action === "Construire" ? `<small>${escape(action.goal?.improvementId ?? action.goal?.type ?? "Niveau")} · ${escape(action.goal?.level ?? 1)}</small>` : ""}`;
          return `<article class="quest-node ${selected?.kind === "action" && selected.id === action.id ? "selected" : ""}" data-node="${escape(action.id)}" style="left:${point.x}px;top:${point.y}px;--node-color:var(--${meta.color})" tabindex="0" aria-label="${escape(action.action + " : " + (action.label || action.id))}">${action.terminalOutcome ? `<span class="node-end ${action.terminalOutcome === "failure" ? "failure" : ""}">FIN · ${action.terminalOutcome === "failure" ? "ÉCHEC" : "RÉUSSITE"}</span>` : ""}<button class="port input" data-input="${escape(action.id)}" title="Relier une sortie à cette entrée" aria-label="Entrée de ${escape(action.id)}"></button><div class="node-top"><span class="action-icon">${meta.icon}</span><div><span class="node-type">${escape(action.action.toUpperCase())}</span><span class="node-title">${escape(action.label || action.id)}</span></div></div><div class="node-body">${description}</div><div class="node-ports">${actionOutputs(
            action,
          )
            .map(
              (output) =>
                `<div class="output-row"><span>${escape(outputLabel(output))}</span><button class="port output ${pending?.from === action.id && pending.output === output ? "linking" : ""}" data-output="${escape(output)}" data-from="${escape(action.id)}" title="Créer un lien depuis ${escape(output)}" aria-label="Sortie ${escape(output)} de ${escape(action.id)}"></button></div>`,
            )
            .join(
              "",
            )}</div><div class="node-id">${escape(action.id)}${action.join === "all" ? " · jonction ET" : ""}</div></article>`;
        })
        .join("");
    document.querySelector("#graph-empty").hidden =
      project.quest.actions.length > 0;
    document.querySelector("#link-hint").hidden = !pending;
    document.querySelector("#action-count").textContent =
      `${project.quest.actions.length} action${project.quest.actions.length === 1 ? "" : "s"}`;
    applyViewport();
    renderLinks();
  }
  canvas.addEventListener("click", (event) => {
    if (event.target.closest("[data-quest-entry]")) {
      select(null);
      return;
    }
    const output = event.target.closest("[data-output]"),
      input = event.target.closest("[data-input]");
    if (output) {
      pending = { from: output.dataset.from, output: output.dataset.output };
      render();
      return;
    }
    if (input && pending) {
      try {
        connect(pending.from, pending.output, input.dataset.input);
        pending = null;
        render();
      } catch (issue) {
        notify(issue.message, true);
      }
      return;
    }
    const link = event.target.closest("[data-link]");
    if (link && !link.dataset.link.startsWith("requires:"))
      select({ kind: "link", id: link.dataset.link });
  });
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest("button,[data-link]"))
      return;
    const node = event.target.closest("[data-node]"),
      point = screenPosition(event),
      project = getProject();
    if (node) {
      const id = node.dataset.node,
        pos = project.editor.positions[id];
      dragging = {
        kind: "node",
        id,
        start: point,
        origin: { ...pos },
        zoom: project.editor.viewport.zoom,
      };
      select({ kind: "action", id });
    } else if (!event.target.closest(".empty-canvas"))
      dragging = {
        kind: "pan",
        start: point,
        origin: { ...project.editor.viewport },
      };
    if (dragging) {
      canvas.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging) return;
    const point = screenPosition(event),
      dx = point.x - dragging.start.x,
      dy = point.y - dragging.start.y;
    if (dragging.kind === "node") {
      const pos = getProject().editor.positions[dragging.id];
      pos.x = Math.round(dragging.origin.x + dx / dragging.zoom);
      pos.y = Math.round(dragging.origin.y + dy / dragging.zoom);
      const node = nodes.querySelector(
        `[data-node="${CSS.escape(dragging.id)}"]`,
      );
      if (node) {
        node.style.left = pos.x + "px";
        node.style.top = pos.y + "px";
      }
      renderLinks();
    } else {
      Object.assign(getProject().editor.viewport, {
        x: dragging.origin.x + dx,
        y: dragging.origin.y + dy,
      });
      applyViewport();
    }
  });
  const endDrag = () => {
    if (dragging) {
      dragging = null;
      changed(false);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(event.deltaY > 0 ? 0.9 : 1.1, screenPosition(event));
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      pending = null;
      render();
    }
    if (event.key === "Enter" && event.target.dataset.node)
      select({ kind: "action", id: event.target.dataset.node });
  });
  function zoom(
    factor,
    anchor = { x: canvas.clientWidth / 2, y: canvas.clientHeight / 2 },
  ) {
    const view = getProject().editor.viewport,
      value = Math.max(0.25, Math.min(1.8, view.zoom * factor)),
      ratio = value / view.zoom;
    view.x = anchor.x - (anchor.x - view.x) * ratio;
    view.y = anchor.y - (anchor.y - view.y) * ratio;
    view.zoom = value;
    applyViewport();
    changed(false);
  }
  function fit() {
    const positions = [
      ...Object.values(getProject().editor.positions),
      questEntry(getProject()),
    ];
    if (!positions.length) return;
    const minX = Math.min(...positions.map((point) => point.x)),
      minY = Math.min(...positions.map((point) => point.y));
    const width = Math.max(...positions.map((point) => point.x)) - minX + 280,
      height = Math.max(...positions.map((point) => point.y)) - minY + 200;
    const scale = Math.max(
      0.25,
      Math.min(
        1,
        (canvas.clientWidth - 100) / width,
        (canvas.clientHeight - 110) / height,
      ),
    );
    Object.assign(getProject().editor.viewport, {
      zoom: scale,
      x: (canvas.clientWidth - width * scale) / 2 - minX * scale,
      y: (canvas.clientHeight - height * scale) / 2 - minY * scale,
    });
    applyViewport();
    changed(false);
  }
  return {
    render,
    fit,
    zoom,
    cancelLink() {
      pending = null;
      render();
    },
    insertionPoint: () => ({
      x:
        (canvas.clientWidth / 2 - getProject().editor.viewport.x) /
          getProject().editor.viewport.zoom -
        125,
      y:
        (canvas.clientHeight / 2 - getProject().editor.viewport.y) /
          getProject().editor.viewport.zoom -
        80,
    }),
  };
}
