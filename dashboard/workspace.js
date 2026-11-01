import { mountSavedGames } from "./saved-games.js";

/** Organisation de la supervision ; chaque onglet dispose de son propre panneau. */
export function mountDashboardWorkspace({ api, onShow = () => {} }) {
  const nav = document.createElement("nav");
  nav.id = "workspace-tabs";
  nav.setAttribute("role", "tablist");
  nav.setAttribute("aria-label", "Fonctionnalités du Dashboard");
  const workspace = document.createElement("div");
  workspace.id = "workspace";
  const panels = new Map(),
    buttons = new Map();
  const login = document.getElementById("login");
  login.after(nav, workspace);
  const main = document.querySelector("main");
  const definitions = [
    [
      "parties",
      "Parties",
      [
        document.getElementById("metrics"),
        document.getElementById("tabs"),
        main,
      ],
    ],
    ["charts", "Graphiques", [document.getElementById("history-charts")]],
    ["maps", "Cartes", [document.getElementById("map-manager")]],
    ["saves", "Sauvegardes", []],
  ];
  let selected = "parties",
    authenticated = false;
  let savedGames;
  function show(id) {
    selected = id;
    for (const [key, panel] of panels) {
      panel.hidden = key !== id;
      buttons.get(key).setAttribute("aria-selected", String(key === id));
      buttons.get(key).tabIndex = key === id ? 0 : -1;
    }
    if (authenticated && id === "maps")
      document.getElementById("map-manager").open = true;
    if (authenticated && id === "saves") void savedGames.load();
    onShow(id);
    window.dispatchEvent(new Event("resize"));
  }
  for (const [id, label, children] of definitions) {
    const button = document.createElement("button");
    button.id = `workspace-tab-${id}`;
    button.type = "button";
    button.textContent = label;
    button.setAttribute("role", "tab");
    button.setAttribute("aria-controls", `workspace-${id}`);
    button.onclick = () => show(id);
    button.onkeydown = (event) => {
      const ids = definitions.map(([key]) => key);
      let index = ids.indexOf(id);
      if (event.key === "ArrowRight") index = (index + 1) % ids.length;
      else if (event.key === "ArrowLeft")
        index = (index + ids.length - 1) % ids.length;
      else if (event.key === "Home") index = 0;
      else if (event.key === "End") index = ids.length - 1;
      else return;
      event.preventDefault();
      show(ids[index]);
      buttons.get(ids[index]).focus();
    };
    const panel = document.createElement("section");
    panel.id = `workspace-${id}`;
    panel.className = "workspace-panel";
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", button.id);
    panel.append(...children);
    panels.set(id, panel);
    buttons.set(id, button);
    nav.append(button);
    workspace.append(panel);
  }
  savedGames = mountSavedGames(panels.get("saves"), { api });
  const logout = document.getElementById("logout");
  document.querySelector("header").append(logout);
  logout.hidden = true;
  // L'état initial ne dépend pas encore des variables du contrôleur principal.
  for (const [key, panel] of panels) {
    panel.hidden = key !== selected;
    buttons.get(key).setAttribute("aria-selected", String(key === selected));
    buttons.get(key).tabIndex = key === selected ? 0 : -1;
  }
  nav.hidden = workspace.hidden = true;
  return {
    setAuthenticated(value) {
      if (authenticated === value) return;
      authenticated = value;
      logout.hidden = !value;
      nav.hidden = workspace.hidden = !value;
      savedGames.setAuthenticated(value);
      if (value) show(selected);
    },
  };
}
