import test from "node:test";
import assert from "node:assert/strict";
import { dashboardLocationNpcs } from "../server/monitoring/dashboard-location-npcs.js";
import { TavernNpcService } from "../app/js/core/tavern-npc-service.js";
import { WorldState } from "../app/js/core/world-state.js";

test("les PNJ du lieu réunissent responsable, bâtiments, offres actuelles et PNJ explicitement rattachés sans mutation", () => {
  const location = {
    id: "v",
    name: "Rochegarde",
    type: "village",
    state: "active",
    infrastructure: { forge: 1, tavern: 1 },
  };
  const game = {
    tavernNpcService: new TavernNpcService({
      rotation: 1,
      cyclesUntilRotation: 4,
      assignments: { v: ["geologist"] },
      acquiredNpcIds: [],
    }),
    worldState: new WorldState({
      npcs: [
        {
          id: "messenger",
          name: "Messagère",
          role: "messenger",
          locationId: "v",
        },
        { id: "elsewhere", role: "guard", locationId: "other" },
        { id: "unplaced", role: "lord" },
      ],
    }),
  };
  const before = {
    location: structuredClone(location),
    tavern: game.tavernNpcService.toJSON(),
    world: game.worldState.toJSON(),
  };
  const entries = dashboardLocationNpcs(game, location);
  assert.deepEqual(
    entries.map((npc) => npc.source),
    ["chief", "building", "building", "tavern", "world"],
  );
  assert.ok(entries.some((npc) => npc.name === "Chef du village · Rochegarde"));
  assert.equal(
    entries.find((npc) => npc.id === "geologist").remainingCycles,
    4,
  );
  assert.equal(entries.find((npc) => npc.id === "messenger").name, "Messagère");
  assert.deepEqual(
    {
      location,
      tavern: game.tavernNpcService.toJSON(),
      world: game.worldState.toJSON(),
    },
    before,
  );
  entries.find((npc) => npc.id === "geologist").costs.gold = 999;
  assert.equal(game.tavernNpcService.getOffers(location)[0].costs.gold, 30);
});

test("la consultation n'initialise pas une rotation et n'ajoute pas d'offres dans un lieu sans taverne", () => {
  const service = new TavernNpcService();
  const before = service.toJSON();
  const location = {
    id: "empty",
    name: "Clairière",
    type: "site",
    infrastructure: {},
  };
  assert.deepEqual(
    dashboardLocationNpcs({ tavernNpcService: service }, location),
    [],
  );
  location.infrastructure.tavern = 1;
  assert.equal(
    dashboardLocationNpcs({ tavernNpcService: service }, location).filter(
      (npc) => npc.source === "tavern",
    ).length,
    0,
  );
  assert.deepEqual(service.toJSON(), before);
  const explicit = {
    ...location,
    chief: { name: "Berthe", title: "Intendante" },
  };
  assert.equal(
    dashboardLocationNpcs({}, explicit).filter((npc) => npc.source === "chief")
      .length,
    1,
  );
  assert.equal(dashboardLocationNpcs({}, explicit)[0].name, "Berthe");
});
