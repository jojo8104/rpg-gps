import test from 'node:test';
import assert from 'node:assert/strict';
import { buildHistoryMap } from '../dashboard/history-map.js';
const position = longitude => ({ latitude: 48.005, longitude });
const party = {
  configuration: { positionMode: 'gps' }, players: [{ id: 'player' }], samples: [], heatmap: [], groups: [],
  playArea: { id: 'zone', name: 'Zone', polygon: [
    { latitude: 48, longitude: 2 }, { latitude: 48, longitude: 2.01 },
    { latitude: 48.01, longitude: 2.01 }, { latitude: 48.01, longitude: 2 },
  ] },
};
const history = [1, 2, 3].map(at => ({ at, heroes: [{ playerId: 'player', position: position(2.004 + at / 10000) }],
  groups: at === 3 ? [] : [{ id: 'convoy', position: position(2.005 + at / 10000) }],
}));
test('les parcours et la heatmap cumulent aussi les mesures antérieures et les GA disparus', () => {
  const view = buildHistoryMap(party, history);
  assert.equal(view.samples.length, 3);
  assert.equal(view.groupTrails.get('convoy').length, 2);
  assert.equal(view.heatmap.reduce((sum, cell) => sum + cell.visits, 0), 3);
  assert.deepEqual(view.players.get('player'), history[2].heroes[0].position);
});
test('la chronologie exclut les positions futures de la heatmap et des trajets', () => {
  const view = buildHistoryMap(party, history, 0);
  assert.equal(view.samples.length, 1);
  assert.equal(view.heatmap.reduce((sum, cell) => sum + cell.visits, 0), 1);
  assert.deepEqual(view.groups, history[0].groups);
});

test('les relevés des joueurs déconnectés ne gonflent pas la heatmap', () => {
  const offline=structuredClone(history);offline[2].heroes[0].connected=false;
  const view=buildHistoryMap(party,offline);
  assert.equal(view.samples.length,2);
  assert.equal(view.heatmap.reduce((sum,cell)=>sum+cell.visits,0),2);
  assert.deepEqual(view.players.get('player'),offline[2].heroes[0].position);
});
