import { composeScenario } from "./core/scenario-composer.js";
export async function loadData() {
  const load = async (path) => {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`Données indisponibles : ${path}`);
    return response.json();
  };
  const [
    baseScenario,
    repression,
    granaries,
    heroClasses,
    heroAptitudes,
    unitDefinitions,
    locations,
    repressionLocations,
    granariesLocations,
  ] = await Promise.all([
    load("../data/scenarios/chaos.json"),
    load("../data/scenarios/repression.json"),
    load("../data/scenarios/granaries-of-the-king.json"),
    load("../data/hero-classes.json"),
    load("../data/hero-aptitudes.json"),
    load("../data/units.json"),
    load("../data/locations.json"),
    load("../data/repression-locations.json"),
    load("../data/granaries-locations.json"),
  ]);
  return {
    scenario: composeScenario(
      composeScenario(baseScenario, repression),
      granaries,
    ),
    heroClasses,
    heroAptitudes,
    unitDefinitions,
    locations: [...locations, ...repressionLocations, ...granariesLocations],
  };
}
