import assert from "node:assert/strict";
import test from "node:test";
import { MultiplayerClient } from "../app/js/multiplayer-client.js";

function fixture({ respond } = {}) {
  let token = "saved-session";
  const events = new Map(),
    requests = [];
  const socket = {
    on: (event, callback) => events.set(event, callback),
    timeout() {
      return this;
    },
    emit(event, payload, callback) {
      requests.push(event);
      if (respond) return respond(event, payload, callback);
      callback(null, {
        ok: true,
        session: { token, playerId: "player" },
        lobby: { code: "PARTIE" },
      });
    },
  };
  const client = new MultiplayerClient({
    socketFactory: () => socket,
    storage: {
      getItem: () => token,
      setItem: (_, value) => {
        token = value;
      },
      removeItem: () => {
        token = null;
      },
    },
  });
  return { client, events, requests };
}

test("une partie détruite efface la reprise et notifie le retour au menu", async () => {
  const f = fixture();
  await f.client.resume();
  let notice;
  f.client.onGameSaved((value) => {
    notice = value;
  });
  await f.client.destroyGame();
  assert.equal(f.requests.at(-1), "game:destroy");
  f.events.get("game:ended")({ message: "Partie détruite" });
  assert.equal(f.client.hasStoredSession(), false);
  assert.equal(notice.message, "Partie détruite");
  f.events.get("connect")();
  assert.equal(f.requests.at(-1), "game:destroy");
});

test("une session enregistrée ne se reconnecte pas à l'ouverture", async () => {
  const f = fixture();
  f.events.get("connect")();
  await Promise.resolve();
  assert.deepEqual(f.requests, []);
  assert.equal(f.client.hasStoredSession(), true);
  await f.client.resume();
  assert.deepEqual(f.requests, ["lobby:resume"]);
});

test("les commandes attendent la restauration de la session après reconnexion", async () => {
  let acknowledge;
  const f = fixture({
    respond(event, payload, callback) {
      if (event === "lobby:resume") acknowledge = callback;
      else callback(null, { ok: true });
    },
  });
  const initial = f.client.resume();
  acknowledge(null, { ok: true, session: { token: "saved-session" } });
  await initial;
  f.events.get("disconnect")();
  f.events.get("connect")();
  const position = f.client.sendPosition({ latitude: 48, longitude: 2 });
  await Promise.resolve();
  assert.deepEqual(f.requests, ["lobby:resume", "lobby:resume"]);
  acknowledge(null, { ok: true, session: { token: "saved-session" } });
  await position;
  assert.deepEqual(f.requests, [
    "lobby:resume",
    "lobby:resume",
    "game:position",
  ]);
});

test("un délai réseau conserve le jeton et permet une nouvelle reprise", async () => {
  let attempts = 0;
  const f = fixture({
    respond(event, payload, callback) {
      if (++attempts === 1) callback(new Error("timeout"));
      else callback(null, { ok: true, session: { token: "saved-session" } });
    },
  });
  await assert.rejects(f.client.resume(), /ne répond pas/);
  assert.equal(f.client.hasStoredSession(), true);
  await f.client.resume();
  assert.equal(f.client.sessionActive, true);
});

test("seule une session réellement expirée efface le jeton", async () => {
  const f = fixture({
    respond(event, payload, callback) {
      callback(null, {
        ok: false,
        error: { code: "session_expired", message: "La session a expiré." },
      });
    },
  });
  await assert.rejects(f.client.resume(), { code: "session_expired" });
  assert.equal(f.client.hasStoredSession(), false);
});

test("une partie reprise se reconnecte après une coupure mais plus après la sortie", async () => {
  const f = fixture();
  await f.client.resume();
  f.events.get("disconnect")();
  f.events.get("connect")();
  await Promise.resolve();
  assert.deepEqual(f.requests, ["lobby:resume", "lobby:resume"]);
  await f.client.leave();
  f.events.get("connect")();
  await Promise.resolve();
  assert.equal(
    f.requests.filter((event) => event === "lobby:resume").length,
    2,
  );
});
