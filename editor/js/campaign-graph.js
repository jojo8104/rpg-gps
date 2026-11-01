import { ensureCampaign, linkCampaignQuests } from "./campaign-model.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function campaignGraphModel(project) {
  const campaign = ensureCampaign(project);
  project.editor.campaignPositions ??= {};
  const nodes = campaign.quests.map((saved, index) => {
    const quest = saved.id === project.quest.id ? project.quest : saved;
    const position = (project.editor.campaignPositions[quest.id] ??= {
      x: 40 + (index % 3) * 350,
      y: 50 + Math.floor(index / 3) * 420,
    });
    return {
      quest,
      position,
      start: campaign.initialQuestIds.includes(quest.id),
    };
  });
  return {
    nodes,
    links: nodes.flatMap(({ quest }) =>
      (quest.transitions ?? []).map((link) => ({
        from: quest.id,
        to: link.questId,
        outcome: link.outcome ?? "success",
      })),
    ),
  };
}
export function createCampaignGraph({ element, getProject, changed, notify }) {
  let pending = null,
    drag = null;
  function paths(model) {
    return model.links
      .map((link) => {
        const first = model.nodes.find((node) => node.quest.id === link.from),
          second = model.nodes.find((node) => node.quest.id === link.to);
        if (!first || !second) return "";
        const source = element.querySelector(
            `[data-campaign-node="${CSS.escape(link.from)}"] [data-outcome="${CSS.escape(link.outcome)}"]`,
          ),
          input = element.querySelector(
            `[data-campaign-node="${CSS.escape(link.to)}"] [data-campaign-input]`,
          );
        const x = first.position.x + 260,
          y =
            first.position.y +
            (source ? source.offsetTop + source.offsetHeight / 2 : 180),
          to = second.position,
          endY = to.y + (input ? input.offsetTop + input.offsetHeight / 2 : 80);
        return `<path d="M ${x} ${y} C ${x + 70} ${y}, ${to.x - 70} ${endY}, ${to.x} ${endY}" fill="none" stroke="#a7c7ac" stroke-width="2" marker-end="url(#campaign-arrow)"/>`;
      })
      .join("");
  }
  function render() {
    const model = campaignGraphModel(getProject());
    const width = Math.max(
        1100,
        ...model.nodes.map((node) => node.position.x + 320),
      ),
      height = Math.max(
        360,
        ...model.nodes.map((node) => node.position.y + 410),
      );
    return `<p class="help">${pending ? "Choisissez l’entrée de la quête suivante." : "Reliez une sortie à l’entrée d’une quête. Plusieurs quêtes peuvent être cochées Départ ; une quête peut rester sans lien."}</p><div class="campaign-canvas" tabindex="0" aria-label="Schéma du scénario"><div class="campaign-world" style="width:${width}px;height:${height}px"><svg class="campaign-wires" width="${width}" height="${height}"><defs><marker id="campaign-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7c7ac"/></marker></defs>${paths(model)}</svg>${model.nodes.map(({ quest, position, start }) => `<article class="campaign-diagram-node" data-campaign-node="${escape(quest.id)}" style="left:${position.x}px;top:${position.y}px"><div class="campaign-drag" data-campaign-drag="${escape(quest.id)}">${start ? "▶ DÉPART · " : ""}${escape(quest.title)}</div><button class="button small" data-campaign-input="${escape(quest.id)}">← Entrée</button><label><input type="checkbox" data-start-quest="${escape(quest.id)}" ${start ? "checked" : ""}> Départ du scénario</label><button class="button small" data-open-quest="${escape(quest.id)}">Ouvrir la proposition et les actions</button>${["success", "failure", "abandoned"].map((outcome) => `<button class="campaign-output" data-campaign-output="${escape(quest.id)}" data-outcome="${outcome}">${{ success: "Réussite", failure: "Échec", abandoned: "Abandon" }[outcome]} →</button>`).join("")}<button class="button small" data-remove-quest="${escape(quest.id)}">Retirer du scénario</button></article>`).join("")}</div></div>`;
  }
  element.addEventListener("click", (event) => {
    const output = event.target.closest("[data-campaign-output]"),
      input = event.target.closest("[data-campaign-input]");
    if (output) {
      pending = {
        from: output.dataset.campaignOutput,
        outcome: output.dataset.outcome,
      };
      notify("Sélectionnez l’entrée de la quête suivante.");
      return;
    }
    if (input && pending) {
      try {
        linkCampaignQuests(
          getProject(),
          pending.from,
          input.dataset.campaignInput,
          pending.outcome,
        );
        pending = null;
        changed(true);
      } catch (error) {
        notify(error.message, true);
      }
    }
  });
  element.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      pending = null;
      notify("Liaison annulée.");
    }
  });
  element.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-campaign-drag]");
    if (!handle || event.button !== 0) return;
    const id = handle.dataset.campaignDrag;
    drag = {
      id,
      x: event.clientX,
      y: event.clientY,
      position: { ...getProject().editor.campaignPositions[id] },
      node: handle.closest("[data-campaign-node]"),
    };
    element.setPointerCapture(event.pointerId);
    event.preventDefault();
  });
  element.addEventListener("pointermove", (event) => {
    if (!drag) return;
    const p = getProject().editor.campaignPositions[drag.id];
    p.x = Math.max(0, drag.position.x + event.clientX - drag.x);
    p.y = Math.max(0, drag.position.y + event.clientY - drag.y);
    drag.node.style.left = `${p.x}px`;
    drag.node.style.top = `${p.y}px`;
    const svg = element.querySelector(".campaign-wires");
    if (svg)
      svg.innerHTML = `<defs><marker id="campaign-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#a7c7ac"/></marker></defs>${paths(campaignGraphModel(getProject()))}`;
  });
  element.addEventListener("pointerup", () => {
    if (drag) {
      drag = null;
      changed(false);
    }
  });
  element.addEventListener("pointercancel", () => {
    drag = null;
  });
  return {
    render,
    refresh() {
      const svg = element.querySelector(".campaign-wires");
      if (svg)
        svg.innerHTML =
          (svg.querySelector("defs")?.outerHTML ?? "") +
          paths(campaignGraphModel(getProject()));
    },
  };
}
