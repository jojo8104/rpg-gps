import test from "node:test";
import assert from "node:assert/strict";
import { createLocationController } from "../app/js/controllers/location-controller.js";

function fixture({ nearby = true } = {}) {
  const sheet = {
    hidden: false,
    dataset: {},
    classList: { remove() {} },
    querySelector: () => null,
  };
  const location = { id: "camp", heroIds: ["hero"] };
  const calls = {};
  let session = {
    hero: { id: "hero" },
    playerId: "local",
    game: {
      getLocation: () => location,
      locationAccessPolicy: { can: () => true },
      tradeAtLocation: () => ({ success: true }),
      garrisonUnit: () => true,
    },
  };
  let landscape = false;
  const controller = createLocationController({
    sheet,
    getSession: () => session,
    mappedLocations: () => [{ id: "camp", nearby }],
    descriptions: {},
    positionFor: () => null,
    switchView: (name) => {
      calls.view = name;
    },
    focusMap() {},
    onAction: (action) => {
      calls.action = action;
    },
    onChange: () => {
      calls.changes = (calls.changes ?? 0) + 1;
    },
    applyAuthoritativeGameState: (state) => {
      calls.state = state;
    },
    isPaused: () => false,
    isLandscape: () => landscape,
    isWorldVisible: () => false,
    onDeferredRender() {},
    views: {
      tab: (props) => {
        calls.tab = props;
      },
      sheetView: (props) => {
        calls.sheet = props;
      },
      market: (props) => {
        calls.market = props;
      },
      updateMarket: () => false,
      garrison: (props) => {
        calls.garrison = props;
      },
    },
  });
  return {
    controller,
    calls,
    sheet,
    session,
    replace: (value) => {
      session = value;
    },
    landscape: () => {
      landscape = true;
    },
  };
}

test("sélection, ouverture et intentions de la fiche restent dans le contrôleur", async () => {
  const { controller, calls } = fixture();
  await controller.select("camp");
  assert.equal(controller.selectedId, "camp");
  calls.tab.onOpen();
  calls.sheet.onAction("heal-units");
  assert.equal(calls.action, "heal-units");
  calls.sheet.onOpenReserves();
  assert.equal(calls.view, "world");
});

test("la garnison utilise la session actuelle après une synchronisation", async () => {
  const f = fixture();
  await f.controller.openGarrison("camp");
  const transfer = f.calls.garrison.onTransfer;
  let input;
  f.replace({
    ...f.session,
    hero: { id: "replacement" },
    game: {
      ...f.session.game,
      garrisonUnit: (value) => {
        input = value;
        return true;
      },
    },
  });
  await transfer({ direction: "deposit", unitId: "unit" });
  assert.equal(input.heroId, "replacement");
  assert.equal(f.calls.garrison.hero.id, "replacement");
  await f.controller.reset();
  assert.equal(f.controller.selectedId, null);
  assert.equal(f.controller.garrisonId, null);
});

test("le marché utilise la session actuelle et ignore une réponse d'une partie précédente", async () => {
  const f = fixture();
  await f.controller.openMarket("camp");
  const trade = f.calls.market.onTrade;
  let complete, input;
  f.replace({
    ...f.session,
    hero: { id: "replacement" },
    authoritative: true,
    client: {
      sendGameCommand: (name, args) => {
        assert.equal(name, "tradeAtLocation");
        input = args[0];
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
  });
  const pending = trade({ resourceId: "food", amount: 1 });
  assert.equal(input.heroId, "replacement");
  await f.controller.reset();
  complete({ result: { success: true }, game: { state: { obsolete: true } } });
  await pending;
  assert.equal(f.calls.state, undefined);
  assert.equal(f.calls.changes, undefined);
});

test("la sélection en paysage ouvre la fiche dans l'annuaire", async () => {
  const f = fixture();
  f.landscape();
  await f.controller.select("camp", { expanded: true });
  f.calls.tab.onOpen();
  assert.equal(f.calls.view, "world");
  assert.equal(f.calls.sheet, undefined);
});

test("un lieu cliqué à distance garde une seule languette en paysage", () => {
  const f = fixture({ nearby: false });
  f.landscape();
  f.controller.select("camp");
  assert.equal(f.controller.selectedId, "camp");
  assert.equal(f.calls.tab.location.id, "camp");
  assert.equal(f.calls.tab.location.nearby, false);
  f.controller.select(null);
  assert.equal(f.controller.selectedId, null);
  assert.equal(f.sheet.hidden, true);
});
