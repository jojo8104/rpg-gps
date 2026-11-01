import { newProject } from "./project.js";

export function branchExample() {
  const project = newProject();
  project.quest = {
    ...project.quest,
    id: "poste-frontieres",
    title: "Le poste des frontières",
    description:
      "Le poste a besoin de vivres et de renseignements. Choisissez votre mission auprès de l’intendant.",
    locationSlotId: "capital",
    giverNpcId: "intendant",
    interactionLabel: "Choisir une mission",
    prerequisites: [
      {
        id: "rations",
        type: "ressource",
        resource: "food",
        quantity: 5,
        locationId: "capital",
        when: "accepted",
      },
    ],
    actions: [
      {
        id: "choisir",
        action: "Parler",
        label: "Recevoir une mission",
        lieu: "capital",
        interaction: "Parler à l’intendant",
        dialogue: { id: "briefing", qui: "intendant" },
        outputs: ["ravitaillement", "reconnaissance"],
      },
      {
        id: "collecter",
        action: "Prendre",
        label: "Réunir les provisions",
        origine: "capital",
        quoi: "food",
        combien: 5,
        interaction: "Prendre les provisions",
      },
      {
        id: "livrer",
        action: "Donner",
        label: "Ravitailler le poste",
        destinataire: "fort",
        quoi: "food",
        combien: 5,
        interaction: "Livrer les provisions",
      },
      {
        id: "explorer",
        action: "Atteindre",
        label: "Reconnaître le camp",
        lieu: "camp",
      },
      {
        id: "combattre",
        action: "Combattre",
        label: "Affronter les éclaireurs",
        qui: "camp",
        targetLocationId: "camp",
        outputs: ["victory", "defeat"],
      },
      {
        id: "rapport",
        action: "Parler",
        label: "Faire le rapport",
        lieu: "capital",
        interaction: "Présenter le rapport",
        dialogue: { id: "rapport", qui: "intendant", goal: "rapport-recu" },
        join: "any",
        terminalOutcome: "success",
      },
      {
        id: "repli",
        action: "Atteindre",
        label: "Se replier à la capitale",
        lieu: "capital",
        terminalOutcome: "failure",
      },
    ],
    links: [
      {
        id: "voie-vivres",
        from: "choisir",
        output: "ravitaillement",
        to: "collecter",
      },
      {
        id: "voie-reconnaissance",
        from: "choisir",
        output: "reconnaissance",
        to: "explorer",
      },
      { id: "livraison", from: "collecter", output: "success", to: "livrer" },
      { id: "arrivee", from: "explorer", output: "success", to: "combattre" },
      {
        id: "rapport-vivres",
        from: "livrer",
        output: "success",
        to: "rapport",
      },
      {
        id: "rapport-victoire",
        from: "combattre",
        output: "victory",
        to: "rapport",
      },
      { id: "retraite", from: "combattre", output: "defeat", to: "repli" },
    ],
    outcomes: {
      success: [
        { type: "xp", amount: 50 },
        { type: "narration", text: "Le poste des frontières vous remercie." },
      ],
      failure: [
        {
          type: "narration",
          text: "Vous revenez à la capitale pour préparer une nouvelle stratégie.",
        },
      ],
      abandoned: [],
    },
  };
  project.dialogues = {
    briefing: {
      speakerId: "intendant",
      locationId: "capital",
      initialNodeId: "accueil",
      nodes: [
        {
          id: "accueil",
          lines: [
            {
              speaker: "L’intendant",
              text: "Le poste manque de vivres, et des éclaireurs ennemis rôdent. Que préférez-vous faire ?",
            },
          ],
          choices: [
            {
              id: "vivres",
              label: "Je livrerai les provisions",
              goal: "ravitaillement",
            },
            {
              id: "camp",
              label: "Je reconnaîtrai le camp",
              goal: "reconnaissance",
            },
          ],
        },
      ],
    },
    rapport: {
      speakerId: "intendant",
      locationId: "capital",
      initialNodeId: "merci",
      nodes: [
        {
          id: "merci",
          lines: [
            {
              speaker: "L’intendant",
              text: "Merci. Votre mission est accomplie.",
            },
          ],
          choices: [
            {
              id: "terminer",
              label: "Présenter mon rapport",
              goal: "rapport-recu",
            },
          ],
        },
      ],
    },
  };
  project.world = {
    name: "Les frontières du royaume",
    scenarioId: "poste-frontieres-monde",
    playArea: null,
    locationSlots: ["capital", "fort", "camp"].map((id) => ({
      id,
      type: id,
      defaultPlacement: { strategy: "random" },
      world: {
        role: id === "capital" ? "starting-point" : "world",
        visibility: "known",
        lifetime: "persistent",
      },
      appearance: { on: "immediate" },
    })),
    locations: [
      { id: "capital", name: "Capitale", type: "capital" },
      { id: "fort", name: "Poste des frontières", type: "fort" },
      { id: "camp", name: "Camp des éclaireurs", type: "camp" },
    ].map((entry) => ({
      ...entry,
      source: "scenario",
      interactionRadius: 25,
      detectionRadius: 75,
    })),
  };
  project.editor.positions = {
    choisir: { x: 0, y: 160 },
    collecter: { x: 330, y: 40 },
    livrer: { x: 660, y: 40 },
    explorer: { x: 330, y: 330 },
    combattre: { x: 660, y: 330 },
    rapport: { x: 1000, y: 40 },
    repli: { x: 1000, y: 500 },
  };
  return project;
}
