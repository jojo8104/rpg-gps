/** Choix du scénario avant le tracé, pour utiliser son terrain enregistré. */
export function mountScenarioTerrainChoice(root, onChange) {
  const terrain = root.querySelector("#lobby-terrain");
  if (!terrain) return { render() {} };
  const label = document.createElement("label");
  label.className = "field";
  const title = document.createElement("span");
  title.textContent = "Scénario et terrain";
  const select = document.createElement("select");
  select.id = "terrain-scenario";
  const help = document.createElement("small");
  help.textContent =
    "Un scénario avec terrain enregistré charge sa zone validée par le serveur. Vous pouvez ensuite la modifier.";
  label.append(title, select, help);
  const details = document.createElement("details");
  details.className = "setup-advanced";
  const summary = document.createElement("summary");
  summary.textContent = "Utiliser le terrain d’un scénario";
  details.append(summary, label);
  terrain.prepend(details);
  select.addEventListener("change", () => onChange(select.value));
  return {
    render(lobby, current) {
      select.replaceChildren(
        ...(lobby.scenarios ?? []).map((scenario) => {
          const option = document.createElement("option");
          option.value = scenario.id;
          option.textContent =
            scenario.name +
            (scenario.hasPlayArea ? " · terrain enregistré" : "");
          return option;
        }),
      );
      select.value = lobby.configuration.scenarioId;
      select.disabled = !current?.isHost || lobby.status !== "waiting";
    },
  };
}
