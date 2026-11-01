import test from 'node:test';
import assert from 'node:assert/strict';
import { createAssetView } from '../editor/js/asset-view.js';
import { AUTONOMOUS_GROUP_ARCHETYPES } from '../app/js/core/autonomous-group-catalog.js';
import { AutonomousGroup } from '../app/js/core/autonomous-group.js';
import { Game } from '../app/js/core/game.js';

test('l’éditeur propose six modèles et copie le choix dans les créations de quête', () => {
  const handlers = {};
  const detail = { open: false, dataset: { entry: 'groups:0' } };
  const element = { innerHTML: '', querySelectorAll: () => [detail], addEventListener: (name, handler) => { handlers[name] = handler; } };
  const project = { editor: { map: { latitude: 0, longitude: 0 } }, world: { locations: [] }, dialogues: {}, quest: { prerequisites: [] } };
  const host = {
    addEventListener: (name, handler) => { assert.equal(name, 'message'); assert.equal(typeof handler, 'function'); },
    open: () => assert.fail('les modèles de groupes ne doivent pas ouvrir un éditeur de portraits'),
  };
  const view = createAssetView({ element, getProject: () => project, changed: () => {}, notify: () => {}, host });
  view.render();
  for (const { id } of AUTONOMOUS_GROUP_ARCHETYPES) assert.ok(element.innerHTML.includes(`data-group-preset="${id}"`));
  handlers.click({ target: { closest: () => ({ dataset: { groupPreset: 'wolves' } }) } });
  assert.equal(project.assets.groups[0].alignment, 'neutral');
  assert.ok(element.innerHTML.includes('wolves-map-front-back-v1.png'));
  project.assets.groups[0].alignment = 'ally';
  handlers.click({ target: { closest: () => ({ dataset: { questGroup: '0' } }) } });
  assert.equal(project.quest.prerequisites[0].properties.archetypeId, 'wolves');
  assert.equal(project.quest.prerequisites[0].properties.alignment, 'ally');
});

test('le serveur résout le contrôleur des GA selon l’alignement explicite', () => {
  for (const [alignment, expected] of Object.entries({ ally: 'kingdom', neutral: 'neutral', enemy: 'enemy' })) {
    const group = new AutonomousGroup({ id:'g',type:'rogue',position:{latitude:0,longitude:0},owner:{kind:'independent',id:'independent'},alignment });
    assert.equal(Game.prototype.getAutonomousControllerId.call({}, group), expected);
  }
});
