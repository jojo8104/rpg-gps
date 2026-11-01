import { EQUIPMENT_ART } from "./equipment-art.js";
// Catalogue de conception : cinq objets par famille. Les bonus restent des données.
const G = ["warrior"],
  E = ["ranger"],
  M = ["mage"];
const GE = ["warrior", "ranger"],
  ALL = ["warrior", "ranger", "mage"];
const families = [
  [
    "melee",
    "mainHand",
    "⚔",
    1,
    [
      ["iron_sword", "Épée de fer", GE, { attack: 2 }],
      ["steel_sword", "Épée d’acier", GE, { attack: 4 }],
      ["pathfinder_dagger", "Dague du pisteur", E, { attack: 2, mobility: 1 }],
      ["captain_mace", "Marteau du capitaine", G, { attack: 3, command: 1 }],
      [
        "standard_bearer_blade",
        "Lame du porte-étendard",
        G,
        { attack: 4, morale: 1 },
      ],
    ],
  ],
  [
    "bow",
    "mainHand",
    "🏹",
    2,
    [
      ["hunting_bow", "Arc de chasse", GE, { attack: 2 }],
      ["recon_bow", "Arc de reconnaissance", E, { attack: 2, mobility: 1 }],
      ["war_longbow", "Arbalète de guerre", GE, { attack: 4 }],
      ["watcher_bow", "Arbalète du guetteur", E, { attack: 3, defense: 1 }],
      [
        "sylvan_wind_bow",
        "Arc du vent sylvestre",
        E,
        { attack: 4, mobility: 2 },
      ],
    ],
  ],
  [
    "throwing",
    "mainHand",
    "➶",
    1,
    [
      ["travel_sling", "Couteau de voyage", ALL, { attack: 1 }],
      ["balanced_knives", "Couteaux de lancer équilibrés", GE, { attack: 2 }],
      [
        "border_javelins",
        "Javelots du garde-frontière",
        GE,
        { attack: 2, defense: 1 },
      ],
      [
        "berserker_axes",
        "Hachettes du berserker",
        G,
        { attack: 4, defense: -1 },
      ],
      ["mist_blades", "Lames de brume", E, { attack: 3, mobility: 1 }],
    ],
  ],
  [
    "staff",
    "mainHand",
    "⚚",
    2,
    [
      ["apprentice_staff", "Bâton d’apprenti", M, { attack: 1, defense: 1 }],
      ["ember_staff", "Bâton de braise", M, { attack: 3 }],
      ["guardian_staff", "Bâton du gardien", M, { defense: 2, health: 5 }],
      ["rally_staff", "Bâton du rassemblement", M, { command: 2, morale: 1 }],
      [
        "archmage_staff",
        "Bâton de l’archimage",
        M,
        { attack: 3, defense: 2, command: 1 },
      ],
    ],
  ],
  [
    "shield",
    "offHand",
    "◉",
    1,
    [
      ["round_shield", "Bouclier rond", GE, { defense: 2 }],
      [
        "traveler_buckler",
        "Rondache du voyageur",
        GE,
        { defense: 1, mobility: 1 },
      ],
      ["sergeant_shield", "Écu du sergent", G, { defense: 2, command: 1 }],
      ["iron_pavise", "Pavois renforcé", G, { defense: 4, mobility: -1 }],
      ["oath_shield", "Bouclier du serment", G, { defense: 3, morale: 1 }],
    ],
  ],
  [
    "focus",
    "offHand",
    "🔮",
    1,
    [
      ["initiation_grimoire", "Grimoire d’initiation", M, { attack: 1 }],
      ["protection_orb", "Cube de protection", M, { defense: 2 }],
      ["vitality_crystal", "Pierre de vitalité", M, { health: 5, morale: 1 }],
      ["united_voices_book", "Livre des voix unies", M, { command: 2 }],
      [
        "astral_lantern",
        "Lanterne astrale",
        M,
        { attack: 1, defense: 1, mobility: 1 },
      ],
    ],
  ],
  [
    "helmet",
    "head",
    "♜",
    0,
    [
      ["militia_helmet", "Casque de milicien", GE, { defense: 1 }],
      ["reinforced_skullcap", "Cervelière renforcée", GE, { defense: 2 }],
      ["veteran_helm", "Heaume du vétéran", G, { defense: 2, morale: 1 }],
      ["captain_helmet", "Casque du capitaine", G, { defense: 1, command: 2 }],
      [
        "last_stand_helm",
        "Heaume du dernier rempart",
        G,
        { defense: 3, health: 5, mobility: -1 },
      ],
    ],
  ],
  [
    "hood",
    "head",
    "⌃",
    0,
    [
      ["travel_cap", "Bonnet de voyage", ALL, { morale: 1 }],
      ["scout_hood", "Capuche d'éclaireur", E, { mobility: 1 }],
      ["runic_cap", "Chapeau runique", M, { attack: 1, defense: 1 }],
      ["secret_paths_hood", "Capuche des sentiers secrets", E, { mobility: 2 }],
      ["sage_headdress", "Coiffe du sage", M, { command: 2, morale: 1 }],
    ],
  ],
  [
    "heavyArmor",
    "torso",
    "🛡",
    0,
    [
      ["chainmail", "Cotte de mailles", G, { defense: 3, mobility: -1 }],
      ["war_brigandine", "Brigandine de guerre", G, { defense: 2, health: 5 }],
      [
        "captain_cuirass",
        "Cuirasse du capitaine",
        G,
        { defense: 3, command: 1, mobility: -1 },
      ],
      [
        "veteran_harness",
        "Harnois du vétéran",
        G,
        { defense: 4, morale: 1, mobility: -1 },
      ],
      [
        "citadel_armor",
        "Armure de la citadelle",
        G,
        { defense: 5, health: 10, mobility: -2 },
      ],
    ],
  ],
  [
    "lightArmor",
    "torso",
    "🛡",
    0,
    [
      ["leather_armor", "Armure de cuir", GE, { defense: 1, mobility: 1 }],
      ["travel_gambeson", "Gambison de voyage", ALL, { defense: 1, health: 5 }],
      ["studded_leather", "Cuir clouté", GE, { defense: 2 }],
      ["pathfinder_vest", "Veste du pisteur", E, { defense: 1, mobility: 2 }],
      [
        "steel_leaf_armor",
        "Armure de la feuille d’acier",
        E,
        { defense: 3, mobility: 1 },
      ],
    ],
  ],
  [
    "robe",
    "torso",
    "♙",
    0,
    [
      ["apprentice_robe", "Robe d’apprenti", M, { defense: 1 }],
      [
        "protective_circle_robe",
        "Robe du cercle protecteur",
        M,
        { defense: 2, health: 5 },
      ],
      ["ember_robe", "Robe des braises", M, { attack: 2, defense: 1 }],
      ["counselor_garb", "Robe du seigneur", M, { command: 2, morale: 1 }],
      [
        "firmament_robe",
        "Robe du firmament",
        M,
        { attack: 2, defense: 2, health: 5 },
      ],
    ],
  ],
  [
    "cloak",
    "accessory",
    "◈",
    0,
    [
      ["travel_coat", "Manteau de voyage", ALL, { health: 5 }],
      ["messenger_cape", "Cape du messager", ALL, { mobility: 1, morale: 1 }],
      ["command_coat", "Manteau de commandement", G, { command: 2 }],
      ["woodland_cape", "Cape des sous-bois", E, { mobility: 2 }],
      [
        "constellation_coat",
        "Manteau des constellations",
        M,
        { attack: 1, defense: 1, morale: 1 },
      ],
    ],
  ],
  [
    "boots",
    "feet",
    "♟",
    0,
    [
      ["marching_boots", "Bottes de marche", ALL, { mobility: 2 }],
      ["iron_boots", "Bottes ferrées", G, { defense: 1, mobility: 1 }],
      ["tracker_boots", "Bottes du traqueur", E, { mobility: 2, attack: 1 }],
      ["pilgrim_boots", "Bottes du pèlerin", ALL, { mobility: 1, health: 5 }],
      [
        "astral_boots",
        "Bottes du passage astral",
        M,
        { mobility: 2, defense: 1 },
      ],
    ],
  ],
  [
    "ring",
    "accessory",
    "○",
    0,
    [
      ["lucky_ring", "Anneau de chance", ALL, { morale: 1 }],
      ["iron_ring", "Anneau de fer", ALL, { defense: 1 }],
      ["vigor_ring", "Anneau de vigueur", ALL, { health: 5 }],
      ["duelist_ring", "Anneau du duelliste", GE, { attack: 2 }],
      ["conclave_ring", "Anneau du conclave", M, { attack: 1, command: 1 }],
    ],
  ],
  [
    "necklace",
    "neck",
    "✦",
    0,
    [
      [
        "command_amulet",
        "Amulette de commandement",
        ALL,
        { command: 1, morale: 1 },
      ],
      ["vitality_pendant", "Pendentif de vitalité", ALL, { health: 5 }],
      ["conqueror_torc", "Torque du conquérant", G, { attack: 2, command: 1 }],
      [
        "forgotten_paths_necklace",
        "Collier des chemins oubliés",
        E,
        { mobility: 2, morale: 1 },
      ],
      [
        "balance_medallion",
        "Médaillon de l’équilibre",
        M,
        { attack: 1, defense: 1, command: 1 },
      ],
    ],
  ],
];

const itemDescriptions = {
  "melee": [
    "Une lame de fer au fil patiné, fidèle compagne des premières escarmouches.",
    "Un acier soigneusement poli et une garde sobre témoignent du savoir-faire de son forgeron.",
    "Sa lame courte se glisse entre les branches aussi aisément que dans son fourreau de cuir.",
    "Les marques de coups sur sa tête massive racontent les combats menés en première ligne.",
    "Un lambeau de bannière noué à sa garde porte encore les couleurs d’une ancienne compagnie."
  ],
  "bow": [
    "Le bois souple de cet arc garde une légère odeur de résine et de feu de camp.",
    "Sa poignée enveloppée de cuir sombre est usée par les longues veilles aux frontières.",
    "Un mécanisme robuste tend la corde de cette arbalète taillée pour les sièges.",
    "La crosse porte les entailles laissées par des nuits de guet sur les remparts.",
    "Sa corde frémit doucement, comme si une brise invisible traversait encore son bois."
  ],
  "throwing": [
    "Un couteau sans ornements, passé de la table du bivouac aux chemins les plus incertains.",
    "Chaque lame repose naturellement dans la paume, froide et parfaitement équilibrée.",
    "Des rubans délavés flottent sous leurs pointes, vestiges des postes de garde lointains.",
    "Leurs manches portent de profondes empreintes et leur acier les traces d’une fureur ancienne.",
    "Une pâleur laiteuse court sur leurs tranchants, pareille à la brume entre les arbres."
  ],
  "staff": [
    "Les premières runes de son propriétaire sont gravées de travers dans le bois clair.",
    "Une lueur rouge couve dans ses fissures, comme un feu qui refuse de mourir.",
    "Des entrelacs sculptés entourent une pierre lisse, tiède au creux de la main.",
    "De petits anneaux tintent à son sommet, rappelant les cloches qui réunissent les voyageurs.",
    "Des signes presque effacés parcourent ce bois ancien, dont nul ne connaît plus l’arbre d’origine."
  ],
  "shield": [
    "Des cercles de métal retiennent ses planches, marquées par la pluie et les chocs.",
    "Une rondache compacte dont les sangles ont été réparées au fil des étapes.",
    "Un insigne de compagnie subsiste sous les éraflures de sa face peinte.",
    "Ses renforts de fer et son bois épais évoquent une porte arrachée à une forteresse.",
    "Une promesse est gravée sur son revers, là où seul son porteur peut la lire."
  ],
  "focus": [
    "Des notes hésitantes couvrent les marges de ce petit ouvrage taché d’encre.",
    "Des lignes argentées relient les faces de ce cube, dessinant un motif sans commencement.",
    "Une chaleur douce émane de la pierre, au rythme d’un battement imperceptible.",
    "En tournant ses pages, on croit entendre le murmure d’une assemblée lointaine.",
    "Une clarté d’étoile repose derrière ses vitres, sans huile ni flamme pour la nourrir."
  ],
  "helmet": [
    "Un casque simple, cabossé par les exercices et noirci par les feux de garde.",
    "Des bandes de métal rivetées doublent la calotte sombre de cette cervelière.",
    "Chaque bosse de ce heaume semble avoir son histoire, rarement racontée deux fois.",
    "Une crête discrète permet de le reconnaître au-dessus de la poussière des combats.",
    "Sa visière étroite conserve la suie d’un siège dont les chansons ont oublié le nom."
  ],
  "hood": [
    "Un bonnet de laine épaisse qui sent encore la fumée des haltes sous les étoiles.",
    "Son tissu mat se confond avec l’ombre des haies et des lisières.",
    "De fines runes sont brodées sous le bord, à l’abri des regards curieux.",
    "Des feuilles séchées restent prises dans les coutures de cette capuche aux teintes de mousse.",
    "Des fils décolorés dessinent les symboles d’une école de sages aujourd’hui dispersée."
  ],
  "heavyArmor": [
    "Des milliers d’anneaux s’entrechoquent dans un bruissement familier aux soldats en marche.",
    "Sous son étoffe sombre, des plaques rivetées gardent les marques des anciens combats.",
    "Une bordure gravée distingue cette cuirasse parmi les armures ordinaires du camp.",
    "Poli et réparé au fil des campagnes, ce harnois épouse les habitudes de son porteur.",
    "Ses plaques imposantes portent le sceau d’une citadelle bâtie pour défier les siècles."
  ],
  "lightArmor": [
    "Un cuir assoupli par l’usage, soigneusement huilé pour affronter la pluie des chemins.",
    "Ses couches de toile matelassée gardent la chaleur des longues nuits à la belle étoile.",
    "Des clous ternis ponctuent ce cuir épais, dont les attaches ont été refaites à la main.",
    "De petites poches dissimulent des ficelles, des brindilles et les souvenirs de pistes anciennes.",
    "Ses fines plaques se chevauchent comme un feuillage métallique sous la lumière."
  ],
  "robe": [
    "Des taches d’encre et quelques brûlures discrètes trahissent les leçons de son propriétaire.",
    "Un cercle de fil pâle court autour de l’ourlet, sans que sa couture soit visible.",
    "Des reflets cuivrés dansent sur ses plis, même lorsque le foyer s’est éteint.",
    "Une étoffe ample aux broderies sobres, conçue pour les salles de conseil et les audiences.",
    "Sur le tissu sombre, de minuscules points d’argent dessinent un ciel inconnu."
  ],
  "cloak": [
    "Un manteau épais aux poches profondes, raccommodé après bien des hivers sur la route.",
    "La pluie perle sur cette cape courte, dont le fermoir porte le signe des relais.",
    "Une doublure aux couleurs de la compagnie apparaît lorsque le vent soulève ses pans.",
    "Ses teintes brunes et vertes rappellent les feuilles humides du sous-bois.",
    "Des constellations brodées se dévoilent dans ses plis lorsque la lumière baisse."
  ],
  "boots": [
    "Leurs semelles portent la poussière de nombreuses routes, mais leurs coutures tiennent bon.",
    "Des pièces de fer protègent le cuir, tintant sourdement sur les dalles.",
    "Un cuir souple et des lacets sombres composent ces bottes marquées de terre forestière.",
    "Des réparations patientes témoignent d’un voyage plus long que celui de bien des soldats.",
    "Une poussière scintillante demeure dans leurs coutures, étrangère à tous les chemins connus."
  ],
  "ring": [
    "Un petit anneau poli par les doigts de ceux qui l’ont serré avant de tenter leur chance.",
    "Ce cercle de fer sans pierre ni gravure conserve la rudesse de sa forge.",
    "Une veine rouge traverse sa pierre, semblable à une braise sous la cendre.",
    "Un fin motif de lames croisées orne cet anneau au métal soigneusement entretenu.",
    "Son sceau réunit plusieurs signes anciens autour d’une pierre couleur d’encre."
  ],
  "necklace": [
    "Un emblème usé repose contre la poitrine, souvenir des serments prêtés autour du feu.",
    "Une pierre aux teintes chaudes est suspendue à un cordon patiné par les voyages.",
    "Ce torque ouvragé porte des motifs de conquête que le temps n’a pas effacés.",
    "Ses perles irrégulières ressemblent aux pierres levées qui jalonnent les vieilles routes.",
    "Deux métaux s’entrelacent sur ce médaillon, dessinant une harmonie sans jointure apparente."
  ]
};

export const ITEM_STAT_LABELS = Object.freeze({
  authority: "autorité",
  attack: "attaque",
  defense: "défense",
  morale: "moral",
  mobility: "mobilité",
  command: "commandement",
  health: "santé maximale",
});
export function itemModifierLabel(modifiers) {
  return Object.entries(modifiers)
    .map(
      ([id, value]) =>
        `${value > 0 ? "+" : ""}${value} ${ITEM_STAT_LABELS[id] ?? id}`,
    )
    .join(", ");
}

export const HERO_ITEM_DEFINITIONS = Object.freeze(
  Object.fromEntries(
    families.flatMap(([family, equipmentSlot, icon, hands, rows]) =>
      rows.map(([id, name, allowedClasses, modifiers], index) => {
        const rarity = index < 2 ? "common" : index < 4 ? "uncommon" : "rare";
        const tier = { common: 1, uncommon: 2, rare: 3 }[rarity];
        return [
          id,
          Object.freeze({
            id,
            name,
            category: "equipment",
            bundleSize: 1,
            unique: true,
            worldUnique: false,
            family,
            equipmentSlot,
            icon,
            image: EQUIPMENT_ART[id],
            hands,
            allowedClasses: Object.freeze([...allowedClasses]),
            modifiers: Object.freeze(modifiers),
            rarity,
            price:
              12 * tier +
              Object.values(modifiers).reduce(
                (sum, v) => sum + Math.max(0, v),
                0,
              ) *
                3,
            worldLimit: { common: 6, uncommon: 3, rare: 1 }[rarity],
            recipe: Object.freeze({
              gold: 8 * tier,
              iron: 2 * tier,
              wood: tier,
            }),
            description: itemDescriptions[family][index],
            usage: hands === 2 ? "Se porte à deux mains." : "À équiper sur le héros pour bénéficier de ses effets.",
          }),
        ];
      }),
    ),
  ),
);
