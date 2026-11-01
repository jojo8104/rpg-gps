import test from "node:test";
import assert from "node:assert/strict";
import { createRelayController } from "../app/js/controllers/relay-controller.js";

function fixture() {
  const panels = [],
    calls = [];
  const element = { hidden: false, dataset: {}, classList: { remove() {} } };
  let session = {
    playerId: "player",
    hero: { id: "hero" },
    game: {
      getLocation: () => ({}),
      players: [{ id: "player" }, { id: "other", name: "Autre" }],
      getPlayer: (id) => ({
        name: id,
        informationRecords: [
          { kind: "unrelated", text: "hidden" },
          { kind: "player_message", text: "first", senderPlayerId: "other" },
          { kind: "watch_alert", text: "last" },
        ],
      }),
    },
  };
  const view = (props) => {
    const panel = { props, open: true };
    panels.forEach((old) => {
      old.open = false;
    });
    panels.push(panel);
    return {
      isOpen: () => panel.open && !element.hidden,
      setBusy: (value) => calls.push(["busy", value]),
      setFeedback: (text) => calls.push(["feedback", text]),
      clearMessage: () => calls.push(["clear"]),
    };
  };
  const controller = createRelayController({
    element,
    getSession: () => session,
    applyServerState: (state) => calls.push(["state", state]),
    beforeOpen: () => {},
    views: { compose: view, inbox: view },
  });
  return {
    controller,
    panels,
    calls,
    session,
    replace(value) {
      session = value;
    },
    last: () => panels.at(-1),
  };
}

test("le courrier est filtré et affiché du plus récent au plus ancien", () => {
  const f = fixture();
  assert.equal(f.controller.messages().length, 2);
  f.controller.openInbox();
  assert.deepEqual(
    f.last().props.messages.map((message) => message.text),
    ["last", "first"],
  );
  assert.equal(f.last().props.messages[1].senderName, "other");
});

test("l'envoi relit la session et efface le brouillon uniquement après un succès", async () => {
  const f = fixture();
  f.controller.openCompose("relay");
  assert.equal(f.last().props.recipients.length, 1);
  let input;
  f.replace({
    ...f.session,
    hero: { id: "new-hero" },
    game: {
      ...f.session.game,
      sendRelayMessage: (value) => {
        input = value;
        return { success: true };
      },
    },
  });
  await f.last().props.onSend({ recipientPlayerId: "other", text: "Bonjour" });
  assert.equal(input.heroId, "new-hero");
  assert.equal(input.text, "Bonjour");
  assert.deepEqual(f.calls.at(-1), ["busy", false]);
  assert.equal(
    f.calls.some(([name]) => name === "clear"),
    true,
  );
});

test("les doubles envois sont ignorés et une réponse ne modifie pas une autre vue", async () => {
  const f = fixture();
  let complete,
    commands = 0;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () => {
        commands++;
        return new Promise((resolve) => {
          complete = resolve;
        });
      },
    },
  });
  f.controller.openCompose("relay");
  const compose = f.last().props;
  const pending = compose.onSend({
    recipientPlayerId: "other",
    text: "Bonjour",
  });
  await compose.onSend({ recipientPlayerId: "other", text: "Bonjour" });
  f.controller.openInbox();
  complete({ result: { success: true }, game: { state: { updated: true } } });
  await pending;
  assert.equal(commands, 1);
  assert.deepEqual(f.calls, [
    ["busy", true],
    ["state", { updated: true }],
  ]);
});

test("reset ignore une réponse d'une partie précédente", async () => {
  const f = fixture();
  let complete;
  f.replace({
    ...f.session,
    authoritative: true,
    client: {
      sendGameCommand: () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    },
  });
  f.controller.openCompose("relay");
  const pending = f
    .last()
    .props.onSend({ recipientPlayerId: "other", text: "Bonjour" });
  f.controller.reset();
  complete({ result: { success: true }, game: { state: {} } });
  await pending;
  assert.deepEqual(f.calls, [["busy", true]]);
});

test("un envoi refusé ou une erreur conserve le brouillon et permet de réessayer", async () => {
  const f = fixture();
  f.session.game.sendRelayMessage = () => ({ success: false });
  f.controller.openCompose("relay");
  await f.last().props.onSend({ text: "Bonjour" });
  assert.equal(
    f.calls.some(([name]) => name === "clear"),
    false,
  );
  f.session.game.sendRelayMessage = () => {
    throw new Error("offline");
  };
  await f.last().props.onSend({ text: "Bonjour" });
  assert.match(f.calls.at(-2)[1], /non confirmé/);
  assert.deepEqual(f.calls.at(-1), ["busy", false]);
});
