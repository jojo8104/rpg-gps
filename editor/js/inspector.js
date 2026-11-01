import {
  PARTICIPATION,
  COOPERATION,
} from "../../app/js/core/cooperation-definition.js";
import { fieldHelp, renderFieldRoles } from "./field-help.js";
import { renderVisualFields } from "./media-view.js";
import { renderStructuredField } from "./structured-fields.js";
import { referenceOptions } from "./reference-options.js";
import { MODIFICATION_PROPERTIES } from "../../app/js/core/quest-modification.js";
import {
  ACTION_META,
  actionOutputs,
  renameAction,
  renameLocation,
  uniqueId,
} from "./project.js";
const escape = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ],
  );
const attribute = (path) => escape(JSON.stringify(path));
const types = {
  condition: {
    locationPlaced: { locationId: "" },
    locationVisible: { locationId: "" },
    questCompleted: { questId: "" },
    actionCompleted: { actionId: "" },
    hasResource: { resource: "gold", amount: 1 },
    hasItem: { itemId: "", amount: 1 },
    flag: { path: "quest.flag", equals: true },
    territoryOccupation: { minimumRatio: 0.5 },
  },
  effect: {
    xp: { amount: 10 },
    resource: { resource: "gold", amount: 10 },
    item: { itemId: "", amount: 1 },
    revealLocation: { locationId: "" },
    flag: { path: "quest.flag", value: true },
    narration: { text: "" },
    failQuest: {},
  },
  prerequisite: {
    ga: {
      locationId: "",
      belongsToLocation: false,
      dependsOn: [],
      when: "accepted",
      properties: {
        type: "army",
        owner: { kind: "independent", id: "bandits" },
        behavior: "passive",
        army: { units: [] },
      },
    },
    ressource: {
      resource: "food",
      quantity: 1,
      locationId: "",
      when: "accepted",
    },
    item: { itemId: "", quantity: 1, locationId: "", when: "accepted" },
    lieu: {
      properties: {
        name: "Nouveau lieu",
        type: "quest",
        position: { latitude: 48.8566, longitude: 2.3522 },
        interactionRadius: 15,
        detectionRadius: 40,
      },
      when: "accepted",
    },
    marqueur: {
      properties: {
        name: "Indice",
        type: "quest",
        position: { latitude: 48.8566, longitude: 2.3522 },
        interactionRadius: 15,
        detectionRadius: 40,
      },
      when: "accepted",
    },
  },
};

export function createInspector({
  element,
  getProject,
  getSelection,
  catalog,
  changed,
  select,
  notify,
  remove,
  duplicate,
}) {
  const valueAt = (path) =>
    path.reduce((value, key) => value?.[key], getProject());
  const setAt = (path, value) => {
    let target = getProject();
    for (const key of path.slice(0, -1)) {
      target[key] ??= {};
      target = target[key];
    }
    if (value === undefined) delete target[path.at(-1)];
    else target[path.at(-1)] = value;
  };
  const options = (entries, value) =>
    entries
      .map((entry) => {
        const id = typeof entry === "string" ? entry : entry.id,
          label =
            typeof entry === "string"
              ? entry
              : (entry.label ?? entry.name ?? entry.id);
        return `<option value="${escape(id)}" ${id === value ? "selected" : ""}>${escape(label)}</option>`;
      })
      .join("");
  function field(label, path, config = {}) {
    if (
      !config.options &&
      !config.special &&
      !config.json &&
      !config.primitive
    ) {
      const choices = referenceOptions(path, getProject(), catalog);
      if (choices) {
        const current = valueAt(path);
        if (current && !choices.some((choice) => choice.id === current))
          choices.push({
            id: current,
            name: `${current} · référence importée`,
          });
        config = { ...config, options: choices };
      }
    }
    const value = valueAt(path),
      attrs = `data-bind="${attribute(path)}" ${config.special ? `data-special="${config.special}"` : ""}`;
    let control;
    if (config.json || config.primitive)
      control = renderStructuredField(
        value === undefined
          ? "fallback" in config
            ? config.fallback
            : config.primitive
              ? true
              : []
          : value,
        path,
        label.replace(/\s*\(JSON[^)]*\)|\s*JSON/g, ""),
        0,
        undefined,
        { project: getProject(), catalog },
      );
    else if (config.options)
      control = `<select ${attrs}>${options(config.options, value ?? "")}</select>`;
    else if (config.multiline)
      control = `<textarea ${attrs} ${config.json ? 'data-json="true" class="json-field" spellcheck="false"' : ""}>${escape(config.json ? JSON.stringify(value === undefined ? ("fallback" in config ? config.fallback : []) : value, null, 2) : value)}</textarea>`;
    else
      control = `<input ${attrs} type="${config.number ? "number" : "text"}" ${config.number ? 'step="any"' : ""} ${config.list ? `list="${config.list}"` : ""} ${config.primitive ? 'data-primitive="true"' : ""} value="${escape(config.primitive ? JSON.stringify(value ?? true) : (value ?? ""))}" ${config.placeholder ? `placeholder="${escape(config.placeholder)}"` : ""}>`;
    return `<div class="field">${config.json || config.primitive ? control : `<label><span>${escape(label)}</span>${control}</label>`}<details class="field-help" data-help="${attribute(path)}"><summary>ⓘ À quoi sert ce champ ?</summary>${renderFieldRoles(path)}<p>${escape(config.help || fieldHelp(path, label))}</p></details></div>`;
  }
  const locations = () => [
    { id: "", name: "Choisir un lieu…" },
    ...getProject().world.locations,
    ...getProject()
      .quest.prerequisites.filter((entry) =>
        ["lieu", "marqueur"].includes(entry.type),
      )
      .map((entry) => ({
        id: entry.id,
        name: entry.properties?.name ?? entry.id,
      })),
  ];
  const actionOptions = () => [
    { id: "", name: "Choisir une action…" },
    ...getProject().quest.actions.map((action) => ({
      id: action.id,
      name: action.label || action.id,
    })),
  ];
  const section = (title, html, open = false) =>
    `<details class="form-section" ${open ? "open" : ""}><summary>${escape(title)}</summary>${html}</details>`;
  function rows(kind, path, title, allowFailure = false) {
    const list = valueAt(path) ?? [],
      entries = Object.keys(types[kind]).filter(
        (type) => allowFailure || type !== "failQuest",
      );
    return section(
      title,
      list
        .map((row, index) => {
          const base = [...path, index];
          let html = `<div class="sub-editor"><header><span>${escape(kind === "prerequisite" ? row.id : `Élément ${index + 1}`)}</span><button type="button" class="remove" data-remove-row="${attribute(base)}" aria-label="Retirer cet élément">×</button></header>`;
          if (kind === "prerequisite")
            html += field("Identifiant", [...base, "id"]);
          html += `<label class="field"><span>Type</span><select data-row-type="${attribute(base)}" data-kind="${kind}">${options(entries, row.type)}</select></label>`;
          if (
            row.locationId !== undefined ||
            row.type === "ga" ||
            ["locationPlaced", "locationVisible", "revealLocation"].includes(
              row.type,
            )
          )
            html += field("Lieu", [...base, "locationId"], {
              options: locations(),
            });
          if (row.resource !== undefined)
            html += field("Ressource", [...base, "resource"], {
              options: catalog.resources,
            });
          if (row.itemId !== undefined)
            html += field("Objet", [...base, "itemId"], { list: "items-list" });
          if (row.amount !== undefined)
            html += field("Quantité", [...base, "amount"], { number: true });
          if (row.quantity !== undefined)
            html += field("Quantité créée", [...base, "quantity"], {
              number: true,
            });
          if (row.questId !== undefined)
            html += field("Quête", [...base, "questId"]);
          if (row.actionId !== undefined)
            html += field("Action", [...base, "actionId"], {
              options: actionOptions(),
            });
          if (row.minimumRatio !== undefined)
            html += field("Taux minimal (0 à 1)", [...base, "minimumRatio"], {
              number: true,
            });
          if (row.path !== undefined)
            html += field("Clé du monde", [...base, "path"]);
          if (row.equals !== undefined)
            html += field("Valeur attendue (JSON)", [...base, "equals"], {
              primitive: true,
            });
          if (row.value !== undefined)
            html += field("Valeur (JSON)", [...base, "value"], {
              primitive: true,
            });
          if (row.text !== undefined)
            html += field("Texte", [...base, "text"], { multiline: true });
          if (kind === "effect" && row.type !== "failQuest")
            html += field("Bénéficiaire", [...base, "recipient"], {
              options: [
                { id: "", name: "Acteur" },
                { id: "participants", name: "Chaque participant" },
              ],
            });
          if (kind === "prerequisite") {
            if (row.properties)
              html += renderVisualFields(
                row.properties,
                [...base, "properties"],
                getProject(),
              );
            html += field(
              "Dépendances de création (JSON)",
              [...base, "dependsOn"],
              {
                multiline: true,
                json: true,
                fallback: [],
                help: "Liste des identifiants à créer avant cet élément. Pour un GA, le lieu créé indiqué devient automatiquement une dépendance.",
              },
            );
            if (row.type === "ga") {
              html += field(
                "Appartient au lieu (JSON : true / false)",
                [...base, "belongsToLocation"],
                {
                  primitive: true,
                  help: "true : le lieu devient propriétaire du groupe. false : le groupe conserve le propriétaire de sa fiche et utilise le lieu comme origine.",
                },
              );
            }
            html += field("Moment de création", [...base, "when"], {
              placeholder: "accepted, published ou événement officiel",
            });
            if (row.when === "ActionCompleted") {
              html += field("Après quelle action ?", [...base, "actionId"], {
                options: actionOptions(),
              });
              html += field(
                "Sortie attendue (optionnelle)",
                [...base, "output"],
                {
                  help: "Exemple : victory. Vide : toute sortie de l’action choisie déclenche cette création.",
                },
              );
            }
            html += field("Portée", [...base, "scope"], {
              options: [
                { id: "", name: "Réservé à cette quête" },
                { id: "world", name: "Commun au monde" },
              ],
            });
            if (row.properties)
              html += field(
                row.type === "ga"
                  ? "Fiche du GA (JSON)"
                  : "Propriétés du lieu / marqueur",
                [...base, "properties"],
                {
                  multiline: true,
                  json: true,
                  fallback: {},
                  help:
                    row.type === "ga"
                      ? "Définition AutonomousGroup : type, owner, behavior, army, mission… Copiez une fiche du catalogue GA. L’identifiant vient de la création ; la position vient du lieu choisi. Une armée exige des unités valides (id, ownerPlayerId, typeId, quantity)."
                      : undefined,
                },
              );
          }
          return html + "</div>";
        })
        .join("") +
        `<button class="add-row" type="button" data-add-row="${attribute(path)}" data-kind="${kind}">+ Ajouter ${kind === "condition" ? "une condition" : kind === "effect" ? "un effet" : "une création"}</button>`,
      list.length > 0,
    );
  }
  function dialogueEditor(action) {
    const id = action.dialogue?.id,
      dialogue = getProject().dialogues[id],
      path = ["dialogues", id];
    if (!dialogue)
      return `<div class="form-section"><p class="help">Ce dialogue n’existe pas encore.</p><button class="add-row" data-create-dialogue="${escape(id)}">+ Créer le dialogue</button></div>`;
    return section(
      "Conversation & choix",
      field("Premier nœud", [...path, "initialNodeId"], {
        options: dialogue.nodes.map((node) => node.id),
      }) +
        dialogue.nodes
          .map((node, index) => {
            const base = [...path, "nodes", index];
            return `<div class="sub-editor"><header><span>NŒUD ${index + 1}</span><button class="remove" data-remove-row="${attribute(base)}" aria-label="Retirer le nœud">×</button></header>${field("Identifiant du nœud", [...base, "id"])}${node.lines.map((line, lineIndex) => `<div class="sub-editor"><header><span>Réplique</span><button class="remove" data-remove-row="${attribute([...base, "lines", lineIndex])}" aria-label="Retirer la réplique">×</button></header>${field("Personnage", [...base, "lines", lineIndex, "speaker"])}${field("Texte", [...base, "lines", lineIndex, "text"], { multiline: true })}</div>`).join("")}<button class="add-row" data-add-dialogue="line" data-path="${attribute([...base, "lines"])}">+ Réplique</button><h4 class="help">Choix du joueur</h4>${node.choices
              .map((choice, choiceIndex) => {
                const cp = [...base, "choices", choiceIndex];
                return `<div class="sub-editor"><header><span>CHOIX ${choiceIndex + 1}</span><button class="remove" data-remove-row="${attribute(cp)}" aria-label="Retirer le choix">×</button></header>${field("Identifiant", [...cp, "id"])}${field("Réponse affichée", [...cp, "label"])}${field("Résultat / sortie", [...cp, "goal"], { placeholder: actionOutputs(action).join(", "), help: "Doit correspondre à une sortie, ou au résultat attendu sans sorties nommées." })}${field("Ou poursuivre au nœud", [...cp, "nextNodeId"], { options: [{ id: "", name: "Fin de conversation" }, ...dialogue.nodes.map((entry) => ({ id: entry.id, name: entry.id }))] })}${rows("condition", [...cp, "conditions"], "Conditions du choix")}</div>`;
              })
              .join(
                "",
              )}<button class="add-row" data-add-dialogue="choice" data-path="${attribute([...base, "choices"])}">+ Choix</button></div>`;
          })
          .join("") +
        `<button class="add-row" data-add-dialogue="node" data-path="${attribute([...path, "nodes"])}">+ Nœud de dialogue</button>`,
      true,
    );
  }
  function renderAction(id) {
    const project = getProject(),
      index = project.quest.actions.findIndex((entry) => entry.id === id),
      action = project.quest.actions[index];
    if (!action) return renderQuest();
    const path = ["quest", "actions", index],
      meta = ACTION_META[action.action];
    document.querySelector("#inspector-title").textContent = action.action;
    let html = `<div class="action-info"><span>${meta.icon}</span><span>${escape(meta.description)}. Les champs ci-dessous définissent l’action exécutée par le serveur.</span></div>`;
    html +=
      field("Nom du bloc", [...path, "label"]) +
      field("Identifiant de l’action", [...path, "id"], {
        special: "action-id",
      });
    html += field(
      "Mécanique de coopération",
      [...path, "cooperation", "type"],
      {
        options: [
          { id: "", name: "Aucune" },
          ...Object.entries(COOPERATION).map(([id, name]) => ({ id, name })),
        ],
        help: "Hérite du groupe de la quête. Conception : exécution serveur à développer.",
      },
    );
    if (["Atteindre", "Parler", "Construire"].includes(action.action))
      html += field("Lieu", [...path, "lieu"], { options: locations() });
    if (action.action === "Parcourir")
      html += field("Distance (mètres)", [...path, "distance"], {
        number: true,
      });
    if (action.action === "Modifier") {
      const p = [...path, "modification"],
        m = action.modification;
      html += field("Modifier qui ou quoi", [...p, "target"], {
        special: "modify-target",
        options: [
          { id: "hero", name: "Héros qui accomplit l’action" },
          { id: "location", name: "Lieu" },
          { id: "ga", name: "Groupe autonome" },
        ],
      });
      if (m.target !== "hero")
        html += field("Cible", [...p, "targetId"], {
          options:
            m.target === "location"
              ? locations()
              : [
                  { id: "", name: "Choisir…" },
                  ...(getProject().assets?.groups ?? []).map((g) => ({
                    id: g.id,
                    name: g.id,
                  })),
                  ...getProject()
                    .quest.prerequisites.filter((e) => e.type === "ga")
                    .map((e) => ({ id: e.id, name: e.id })),
                ],
        });
      html += field("Propriété", [...p, "property"], {
        special: "modify-property",
        options: MODIFICATION_PROPERTIES[m.target].map((id) => ({
          id,
          name: {
            resource: "Ressource",
            item: "Objet transporté",
            xp: "Expérience",
            stat: "Statistique de base",
            appearance: "Apparence",
            existence: "Existence",
          }[id],
        })),
      });
      if (["resource", "item"].includes(m.property))
        html += field("Opération", [...p, "operation"], {
          options: [
            { id: "add", name: "Ajouter" },
            { id: "remove", name: "Retirer" },
          ],
        });
      if (m.property === "existence")
        html +=
          '<p class="help">Retirer le GA du monde. Pour le faire apparaître, utiliser les créations de la quête.</p>';
      if (["resource", "item", "stat"].includes(m.property))
        html += field("Élément à modifier", [...p, "key"], {
          options:
            m.property === "resource"
              ? catalog.resources
              : m.property === "item"
                ? [...catalog.items, ...(getProject().assets?.items ?? [])]
                : [
                    "attack",
                    "defense",
                    "morale",
                    "mobility",
                    "command",
                    "health",
                  ],
        });
      if (["resource", "item", "stat", "xp"].includes(m.property))
        html += field(
          m.property === "stat"
            ? "Variation (positive ou négative)"
            : "Quantité",
          [...p, "amount"],
          {
            number: true,
            help:
              m.property === "resource" && m.operation === "remove"
                ? "Prélève jusqu’au montant disponible, sans dette. Appliqué une seule fois quand cette action est accomplie."
                : "Modification appliquée par le serveur. Les objets doivent exister dans le catalogue actif.",
          },
        );
      if (m.property === "appearance")
        html +=
          m.target === "hero"
            ? field("Genre du portrait", [...p, "key"], {
                options: [
                  { id: "male", name: "Masculin" },
                  { id: "female", name: "Féminin" },
                ],
              })
            : renderVisualFields(m, p, getProject());
    }
    if (["Prendre", "Donner"].includes(action.action))
      html +=
        field(
          action.action === "Prendre" ? "Lieu d’origine" : "Lieu de livraison",
          [...path, action.action === "Prendre" ? "origine" : "destinataire"],
          { options: locations() },
        ) +
        `<div class="field-row">${field("Objet / ressource", [...path, "quoi"], { list: "items-list" })}${field("Quantité", [...path, "combien"], { number: true })}</div>`;
    if (action.action === "Parler")
      html +=
        field("Interlocuteur (identifiant)", [...path, "dialogue", "qui"]) +
        field("Dialogue (identifiant)", [...path, "dialogue", "id"]) +
        (!action.outputs
          ? field("Résultat attendu", [...path, "dialogue", "goal"])
          : "");
    if (action.action === "Construire")
      html +=
        field("Amélioration attendue", [...path, "goal", "improvementId"], {
          placeholder: "Ex. muraille (optionnel)",
        }) +
        field("Ou type du lieu attendu", [...path, "goal", "type"], {
          options: [{ id: "", name: "Aucun" }, ...catalog.locationTypes],
        }) +
        field("Niveau minimal", [...path, "goal", "level"], { number: true });
    if (action.action === "Combattre")
      html +=
        field("Cible (lieu, héros ou groupe)", [...path, "qui"], {
          list: "locations-list",
        }) +
        field(
          "Lieu cible du scénario (optionnel)",
          [...path, "targetLocationId"],
          { options: locations() },
        );
    html += field("Texte du bouton (optionnel)", [...path, "interaction"]);
    html += section(
      "Sorties & enchaînement",
      (["Parler", "Combattre"].includes(action.action)
        ? field("Sorties nommées", [...path, "outputs"], {
            special: "outputs",
            placeholder:
              action.action === "Combattre"
                ? "victory, defeat, draw"
                : "livraison, exploration",
            help: "Séparez les noms par des virgules. Vide conserve le comportement historique.",
          })
        : '<p class="help">Cette action possède une sortie « success ».</p>') +
        field("Jonction des liens entrants", [...path, "join"], {
          options: [
            { id: "any", name: "Un lien suffit (OU)" },
            { id: "all", name: "Tous les liens sont requis (ET)" },
          ],
        }) +
        field("Fin de la quête", [...path, "terminalOutcome"], {
          options: [
            { id: "", name: "Continuer le parcours" },
            { id: "success", name: "Terminer par une réussite" },
            { id: "failure", name: "Terminer par un échec" },
          ],
        }) +
        `<p class="help">Dépendances obligatoires (en plus des liens)</p>${project.quest.actions
          .filter((entry) => entry.id !== id)
          .map(
            (entry) =>
              `<label class="check-row"><input type="checkbox" data-requires="${escape(entry.id)}" ${(action.requires ?? []).includes(entry.id) ? "checked" : ""}>${escape(entry.label || entry.id)}</label>`,
          )
          .join("")}`,
      true,
    );
    html += rows("effect", [...path, "rewards"], "Récompenses de l’action");
    if (action.action === "Parler") html += dialogueEditor(action);
    html += section(
      "Réglages avancés",
      field("Joueur affecté (optionnel)", [...path, "assignedPlayerId"]) +
        field("Bloc JSON complet", path, {
          multiline: true,
          json: true,
          fallback: {},
        }) +
        '<p class="help">Les champs supplémentaires importés sont conservés. Après un changement d’identifiant dans le JSON, vérifiez les références.</p>',
    );
    html += `<div class="inspector-actions"><button class="button" data-duplicate="${escape(id)}">Dupliquer</button><button class="button danger" data-delete="action">Supprimer</button></div>`;
    return html;
  }
  function renderQuest() {
    const q = ["quest"],
      project = getProject();
    document.querySelector("#inspector-title").textContent = "Fiche de quête";
    return (
      field("Titre de la quête", [...q, "title"]) +
      field("Identifiant", [...q, "id"]) +
      field("Description", [...q, "description"], { multiline: true }) +
      section(
        "Proposition de la mission",
        field("Lieu de proposition", [...q, "locationSlotId"], {
          options: locations(),
        }) +
          field("PNJ donneur", [...q, "giverNpcId"]) +
          field("Texte du bouton", [...q, "interactionLabel"]) +
          field("Dialogue de proposition (optionnel)", [...q, "dialogueId"]),
      ) +
      section(
        "Participation",
        ["solo", "equipe", "competition"]
          .map(
            (mode) =>
              `<label class="check-row"><input type="checkbox" data-mode="${mode}" ${(project.quest.participationModes ?? ["solo"]).includes(mode) ? "checked" : ""}>${{ solo: "Solo", equipe: "Équipe", competition: "Compétition" }[mode]}</label>`,
          )
          .join(""),
      ) +
      section(
        "Coopération de la quête",
        field("Mode de participation", [...q, "cooperation", "mode"], {
          options: [
            { id: "", name: "Non configuré (ancien format)" },
            ...Object.entries(PARTICIPATION).map(([id, name]) => ({
              id,
              name,
            })),
          ],
          help: "Réglage de conception de toute la quête. Aucun redémarrage individuel de la progression commune. Exécution multijoueur à développer.",
        }) +
          field("Joueurs minimum", [...q, "cooperation", "minimumPlayers"], {
            number: true,
          }) +
          field("Joueurs maximum", [...q, "cooperation", "maximumPlayers"], {
            number: true,
          }) +
          field("Invitations", [...q, "cooperation", "invitation"], {
            options: [
              { id: "ga-messenger", name: "Messager GA (arrivée différée)" },
            ],
          }) +
          field("Rejoindre en cours", [...q, "cooperation", "joinInProgress"], {
            options: [
              { id: "allowed", name: "Autorisé" },
              { id: "closed", name: "Fermé" },
            ],
          }),
      ) +
      rows("condition", [...q, "accessConditions"], "Conditions d’accès") +
      section(
        "Condition de publication",
        field("Condition JSON (ou null)", [...q, "publicationCondition"], {
          multiline: true,
          json: true,
          fallback: null,
        }),
      ) +
      rows("prerequisite", [...q, "prerequisites"], "Créations de la quête") +
      rows("effect", [...q, "outcomes", "success"], "Récompenses de réussite") +
      rows("effect", [...q, "outcomes", "failure"], "Conséquences de l’échec") +
      rows(
        "effect",
        [...q, "outcomes", "abandoned"],
        "Conséquences de l’abandon",
      ) +
      section(
        "Réactions & quêtes suivantes",
        field("Événements (JSON)", [...q, "events"], {
          multiline: true,
          json: true,
        }) +
          field("Transitions (JSON)", [...q, "transitions"], {
            multiline: true,
            json: true,
          }),
      ) +
      section(
        "Définition complète",
        field("Quête JSON", q, { multiline: true, json: true, fallback: {} }) +
          field("Catalogue de dialogues JSON", ["dialogues"], {
            multiline: true,
            json: true,
            fallback: {},
          }),
      )
    );
  }
  function renderLink(id) {
    const index = getProject().quest.links.findIndex(
        (entry) => entry.id === id,
      ),
      link = getProject().quest.links[index];
    if (!link) return renderQuest();
    document.querySelector("#inspector-title").textContent =
      "Lien conditionnel";
    const path = ["quest", "links", index],
      source = getProject().quest.actions.find(
        (entry) => entry.id === link.from,
      );
    return (
      '<div class="action-info"><span>⑂</span><span>La sortie et les conditions sont vérifiées à la résolution de l’action source. La décision est conservée.</span></div>' +
      field("Identifiant", [...path, "id"]) +
      field("Action source", [...path, "from"], { options: actionOptions() }) +
      field("Sortie", [...path, "output"], {
        options: source ? actionOutputs(source) : ["success"],
      }) +
      field("Action suivante", [...path, "to"], { options: actionOptions() }) +
      rows("condition", [...path, "conditions"], "Conditions du lien") +
      `<div class="inspector-actions"><button class="button danger" data-delete="link">Supprimer le lien</button></div>`
    );
  }
  function renderLocation(id) {
    const project = getProject(),
      index = project.world.locations.findIndex((entry) => entry.id === id),
      slotIndex = project.world.locationSlots.findIndex(
        (entry) => entry.id === id,
      );
    if (index < 0 || slotIndex < 0) return renderWorld();
    const path = ["world", "locations", index],
      slotPath = ["world", "locationSlots", slotIndex],
      location = project.world.locations[index],
      slot = project.world.locationSlots[slotIndex];
    document.querySelector("#inspector-title").textContent = "Lieu du monde";
    return (
      field("Nom du lieu", [...path, "name"]) +
      field("Identifiant logique", [...path, "id"], {
        special: "location-id",
      }) +
      field("Type", [...path, "type"], {
        special: "location-type",
        options: [
          ...new Set([
            ...catalog.locationTypes,
            "quest",
            "village",
            "capital",
            "camp",
            "fort",
            "mine",
            "lumber-camp",
            "quarry",
            location.type,
          ]),
        ],
      }) +
      `<div class="field-row">${field("Rayon d’interaction (m)", [...path, "interactionRadius"], { number: true })}${field("Détection (m)", [...path, "detectionRadius"], { number: true })}</div>` +
      renderVisualFields(location, path, getProject()) +
      `<p class="help">Cliquez sur la carte pour placer ce lieu. Sans position, son placement reste libre.</p>${location.position ? `<div class="field-row">${field("Latitude", [...path, "position", "latitude"], { number: true })}${field("Longitude", [...path, "position", "longitude"], { number: true })}</div><button class="add-row" data-unplace="${escape(id)}">Retirer la position imposée</button>` : ""}` +
      section(
        "Visibilité & cycle de vie",
        field("Rôle", [...slotPath, "world", "role"], {
          options: [
            { id: "starting-point", name: "Point de départ" },
            { id: "world", name: "Lieu du monde" },
            { id: "quest", name: "Élément de quête" },
          ],
        }) +
          field("Visibilité", [...slotPath, "world", "visibility"], {
            options: [
              { id: "known", name: "Connu" },
              { id: "discoverable", name: "À découvrir" },
              { id: "quest", name: "Selon la quête" },
            ],
          }) +
          field("Durée de vie", [...slotPath, "world", "lifetime"], {
            special: "lifetime",
            options: [
              { id: "persistent", name: "Durable" },
              { id: "ephemeral", name: "Éphémère" },
            ],
          }) +
          (slot.world?.lifetime === "ephemeral"
            ? field("Quête de disparition", [
                ...slotPath,
                "world",
                "removal",
                "questId",
              ]) +
              field(
                "Après cette action (optionnel)",
                [...slotPath, "world", "removal", "actionId"],
                { options: actionOptions() },
              )
            : "") +
          field("Apparition", [...slotPath, "appearance", "on"], {
            special: "appearance",
            options: [
              { id: "immediate", name: "Dès le placement" },
              { id: "QuestAccepted", name: "À l’acceptation" },
              { id: "ActionCompleted", name: "Après une action" },
            ],
          }) +
          (slot.appearance?.on !== "immediate"
            ? field("Quête d’apparition", [
                ...slotPath,
                "appearance",
                "questId",
              ]) +
              (slot.appearance?.on === "ActionCompleted"
                ? field(
                    "Action d’apparition",
                    [...slotPath, "appearance", "actionId"],
                    { options: actionOptions() },
                  )
                : "")
            : ""),
        true,
      ) +
      section(
        "Propriétés avancées",
        field("Lieu JSON", path, {
          multiline: true,
          json: true,
          fallback: {},
        }) +
          field("Emplacement du scénario JSON", slotPath, {
            multiline: true,
            json: true,
            fallback: {},
          }),
      ) +
      `<div class="inspector-actions"><button class="button danger" data-delete="location">Supprimer le lieu</button></div>`
    );
  }
  function renderWorld() {
    document.querySelector("#inspector-title").textContent = "Monde & terrain";
    const project = getProject();
    return (
      field("Nom du monde", ["world", "name"]) +
      field("Identifiant du scénario", ["world", "scenarioId"]) +
      `<div class="form-section"><h3>Lieux du monde · ${project.world.locations.length}</h3>${project.world.locations.map((location) => `<button class="example-button" data-select-location="${escape(location.id)}">◇ <span>${escape(location.name)}<small>${escape(location.type)} · ${location.position ? "placé" : "à placer"}</small></span></button>`).join("")}<button class="add-row" data-add-location>+ Ajouter un lieu</button></div>` +
      section(
        "Play area (optionnelle)",
        '<p class="help">Tracez une zone avec l’outil Play area sur la carte, ou importez sa définition JSON ci-dessous.</p>' +
          field("Zone et exclusions JSON", ["world", "playArea"], {
            multiline: true,
            json: true,
            fallback: null,
          }) +
          (project.world.playArea
            ? '<button class="add-row" data-clear-area>Détacher le terrain</button><button class="add-row" style="margin-top:9px" data-clear-exclusions>Retirer les exclusions</button>'
            : ""),
        true,
      )
    );
  }
  let renderedSelection = null;
  function render(tab = "graph") {
    if (tab === "campaign") {
      document.querySelector("#inspector-title").textContent =
        "Composer le scénario";
      element.innerHTML =
        '<p class="help">Ajoutez les quêtes, choisissez celles de départ puis reliez leurs issues. Éditer les actions ouvre la quête dans le schéma.</p><p class="help">Une transition publie la suivante ; le joueur doit encore l’accepter. Le monde, les dialogues et les catalogues sont communs au scénario.</p>';
      renderedSelection = null;
      return;
    }
    if (tab === "assets") {
      document.querySelector("#inspector-title").textContent =
        "Catalogues du projet";
      element.innerHTML =
        '<p class="help">Les fiches se remplissent au centre. Ouvrez « À quoi sert ce champ ? » pour obtenir une explication.</p><p class="help">Les PNJ sont narratifs. GA signifie groupe autonome. Les contenus créés doivent être intégrés au serveur après export.</p>';
      renderedSelection = null;
      return;
    }
    const scroll = element.scrollTop,
      selection = getSelection();
    const key = tab + ":" + JSON.stringify(selection);
    const keepScroll = key === renderedSelection;
    const expanded =
      key === renderedSelection
        ? new Map(
            [...element.querySelectorAll("details")].map((detail) => [
              detail.dataset.help ??
                detail.querySelector("summary")?.textContent,
              detail.open,
            ]),
          )
        : new Map();
    renderedSelection = key;
    const html =
      selection?.kind === "action"
        ? renderAction(selection.id)
        : selection?.kind === "link"
          ? renderLink(selection.id)
          : selection?.kind === "location"
            ? renderLocation(selection.id)
            : tab === "map"
              ? renderWorld()
              : renderQuest();
    element.innerHTML =
      html +
      `<datalist id="items-list">${options(
        [
          ...catalog.resources,
          ...catalog.items.map((item) => ({ id: item.id, name: item.name })),
          ...(getProject().assets?.items ?? []).map((item) => ({
            id: item.id,
            name: item.name,
          })),
          ...getProject()
            .quest.prerequisites.filter((entry) => entry.itemId)
            .map((entry) => entry.itemId),
        ],
        "",
      )}</datalist><datalist id="locations-list">${options(locations(), "")}</datalist>`;
    for (const detail of element.querySelectorAll("details")) {
      const title =
        detail.dataset.help ?? detail.querySelector("summary")?.textContent;
      if (expanded.has(title)) detail.open = expanded.get(title);
    }
    element.scrollTop = keepScroll ? scroll : 0;
  }
  const updateField = (event) => {
    const target = event.target,
      project = getProject(),
      selection = getSelection();
    if (
      event.type === "input" &&
      (!target.dataset.bind ||
        target.dataset.json ||
        target.dataset.primitive ||
        target.dataset.special)
    )
      return;
    try {
      if (target.dataset.rowType) {
        const path = JSON.parse(target.dataset.rowType),
          current = valueAt(path),
          type = target.value;
        setAt(path, {
          ...(current.id ? { id: current.id } : {}),
          type,
          ...structuredClone(types[target.dataset.kind][type]),
        });
      } else if (target.dataset.requires) {
        const action = project.quest.actions.find(
            (entry) => entry.id === selection.id,
          ),
          requires = new Set(action.requires ?? []);
        if (target.checked) requires.add(target.dataset.requires);
        else requires.delete(target.dataset.requires);
        action.requires = [...requires];
      } else if (target.dataset.mode) {
        const modes = new Set(project.quest.participationModes ?? ["solo"]);
        if (target.checked) modes.add(target.dataset.mode);
        else modes.delete(target.dataset.mode);
        project.quest.participationModes = [...modes];
      } else if (target.dataset.bind) {
        const path = JSON.parse(target.dataset.bind),
          before = valueAt(path);
        let value =
          target.dataset.json || target.dataset.primitive
            ? JSON.parse(target.value)
            : target.type === "number"
              ? target.value === ""
                ? undefined
                : Number(target.value)
              : target.value;
        if (target.dataset.special === "modify-target") {
          const action = getProject().quest.actions.find(
            (action) => action.id === getSelection().id,
          );
          action.modification = {
            target: value,
            property: value === "hero" ? "resource" : "appearance",
            operation: "remove",
            key: value === "hero" ? "gold" : "",
            amount: 20,
            targetId: "",
          };
          changed(true);
          return;
        }
        if (target.dataset.special === "modify-property") {
          const action = getProject().quest.actions.find(
            (action) => action.id === getSelection().id,
          );
          action.modification = {
            target: action.modification.target,
            targetId: action.modification.targetId,
            property: value,
            operation: value === "existence" ? "remove" : "add",
            key:
              {
                resource: "gold",
                item: catalog.items[0]?.id ?? "",
                stat: "attack",
                appearance: "male",
              }[value] ?? "",
            amount: value === "stat" ? 1 : 20,
          };
          changed(true);
          return;
        }
        if (target.dataset.special === "action-id") {
          renameAction(project, before, value);
          select({ kind: "action", id: value });
        } else if (target.dataset.special === "location-id") {
          renameLocation(project, before, value);
          select({ kind: "location", id: value });
        } else if (target.dataset.special === "outputs") {
          value = value
            .split(",")
            .map((entry) => entry.trim())
            .filter(Boolean);
          setAt(path, value.length ? [...new Set(value)] : undefined);
          const action = project.quest.actions.find(
            (entry) => entry.id === selection.id,
          );
          project.quest.links = project.quest.links.filter(
            (link) =>
              link.from !== action.id ||
              actionOutputs(action).includes(link.output),
          );
        } else {
          if (
            value === "" &&
            !["label", "description", "text"].includes(path.at(-1))
          )
            value = undefined;
          if (path.at(-2) === "cooperation" && path.at(-1) === "mode") {
            setAt(
              path.slice(0, -1),
              value
                ? {
                    mode: value,
                    minimumPlayers: value === "together" ? 2 : 1,
                    maximumPlayers: value === "solo" ? 1 : 4,
                    invitation: "ga-messenger",
                    joinInProgress: value === "open" ? "allowed" : "closed",
                  }
                : undefined,
            );
          } else if (
            path.at(-2) === "cooperation" &&
            path.at(-1) === "type" &&
            !value
          )
            setAt(path.slice(0, -1), undefined);
          else setAt(path, value);
          if (target.dataset.special === "location-type")
            project.world.locationSlots.find(
              (entry) => entry.id === selection.id,
            ).type = value;
          if (target.dataset.special === "lifetime") {
            const slot = project.world.locationSlots.find(
              (entry) => entry.id === selection.id,
            );
            if (value === "ephemeral")
              slot.world.removal = { questId: project.quest.id };
            else delete slot.world.removal;
          }
          if (target.dataset.special === "appearance") {
            const slot = project.world.locationSlots.find(
              (entry) => entry.id === selection.id,
            );
            slot.appearance =
              value === "immediate"
                ? { on: value }
                : {
                    on: value,
                    questId: project.quest.id,
                    ...(value === "ActionCompleted" ? { actionId: "" } : {}),
                  };
          }
          if (selection?.kind === "action") {
            const action = project.quest.actions.find(
              (entry) => entry.id === selection.id,
            );
            if (
              action?.action === "Parler" &&
              project.dialogues[action.dialogue?.id]
            )
              Object.assign(project.dialogues[action.dialogue.id], {
                speakerId: action.dialogue.qui,
                locationId: action.lieu,
              });
          }
          if (selection?.kind === "location" && path.includes("position")) {
            const location = project.world.locations.find(
              (entry) => entry.id === selection.id,
            );
            project.world.locationSlots.find(
              (entry) => entry.id === selection.id,
            ).defaultPlacement = {
              strategy: "fixed",
              position: structuredClone(location.position),
            };
          }
        }
      } else return;
      changed(true, event.type !== "input");
    } catch (issue) {
      notify(issue.message, true);
      target.setAttribute("aria-invalid", "true");
    }
  };
  element.addEventListener("change", updateField);
  element.addEventListener("input", updateField);
  element.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const project = getProject(),
      selection = getSelection();
    try {
      if (button.dataset.addRow) {
        const path = JSON.parse(button.dataset.addRow),
          kind = button.dataset.kind;
        const type =
          kind === "condition"
            ? "locationPlaced"
            : kind === "effect"
              ? "xp"
              : "ressource";
        const array = valueAt(path) ?? [];
        array.push({
          ...(kind === "prerequisite"
            ? { id: uniqueId("creation", array) }
            : {}),
          type,
          ...structuredClone(types[kind][type]),
        });
        setAt(path, array);
      } else if (button.dataset.removeRow) {
        const path = JSON.parse(button.dataset.removeRow);
        valueAt(path.slice(0, -1)).splice(path.at(-1), 1);
      } else if (button.dataset.addDialogue) {
        const array = valueAt(JSON.parse(button.dataset.path)),
          kind = button.dataset.addDialogue;
        array.push(
          kind === "node"
            ? { id: uniqueId("noeud", array), lines: [], choices: [] }
            : kind === "line"
              ? { speaker: "Interlocuteur", text: "" }
              : {
                  id: uniqueId("choix", array),
                  label: "Nouvelle réponse",
                  goal: "",
                },
        );
      } else if (button.dataset.createDialogue !== undefined) {
        const action = project.quest.actions.find(
            (entry) => entry.id === selection.id,
          ),
          id = action.dialogue.id;
        if (!id) throw new Error("Précisez d’abord l’identifiant du dialogue.");
        project.dialogues[id] = {
          speakerId: action.dialogue.qui,
          locationId: action.lieu,
          initialNodeId: "accueil",
          nodes: [
            {
              id: "accueil",
              lines: [{ speaker: "Interlocuteur", text: "Bonjour." }],
              choices: [
                {
                  id: "continuer",
                  label: "Continuer",
                  goal:
                    action.dialogue.goal ?? action.outputs?.[0] ?? "success",
                },
              ],
            },
          ],
        };
      } else if (button.dataset.delete) {
        remove(selection);
        return;
      } else if (button.dataset.duplicate) {
        duplicate(button.dataset.duplicate);
        return;
      } else if (button.dataset.selectLocation) {
        select({ kind: "location", id: button.dataset.selectLocation });
        return;
      } else if (button.hasAttribute("data-add-location")) {
        document.querySelector("#add-location").click();
        return;
      } else if (button.dataset.unplace) {
        delete project.world.locations.find(
          (entry) => entry.id === button.dataset.unplace,
        ).position;
        project.world.locationSlots.find(
          (entry) => entry.id === button.dataset.unplace,
        ).defaultPlacement = { strategy: "random" };
      } else if (button.hasAttribute("data-clear-area"))
        project.world.playArea = null;
      else if (button.hasAttribute("data-clear-exclusions"))
        project.world.playArea.excludedPolygons = [];
      else return;
      changed(true);
    } catch (issue) {
      notify(issue.message, true);
    }
  });
  return { render };
}
