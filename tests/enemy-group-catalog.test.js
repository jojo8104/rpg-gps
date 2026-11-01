import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { AutonomousGroup } from "../app/js/core/autonomous-group.js";
import { AUTONOMOUS_GROUP_ARCHETYPES } from "../app/js/core/autonomous-group-catalog.js";
import { AutonomousGroupDetectionService } from "../app/js/core/autonomous-group-detection-service.js";
import {
  autonomousGroupPoseStyle,
  autonomousGroupSpriteKind,
} from "../app/js/map/autonomous-group-sprite.js";
import { addAsset } from "../editor/js/asset-model.js";
import { validateEditorAssets } from "../server/editor/editor-assets.js";
import { triggerAutonomousHeroAttacks } from "../app/js/core/autonomous-hero-attacks.js";
import { AutonomousGroupService } from "../app/js/core/autonomous-group-service.js";

const definition = {
  id: "g1",
  type: "rogue",
  owner: { kind: "independent", id: "independent" },
  position: { latitude: 0, longitude: 0 },
};

test("les six modèles et trois alignements passent de l’éditeur au modèle serveur et à la détection", () => {
  for (const entry of AUTONOMOUS_GROUP_ARCHETYPES)
    for (const alignment of ["enemy", "neutral", "ally"]) {
      const project = {
        editor: { map: { latitude: 0, longitude: 0 } },
        world: { locations: [] },
      };
      const asset = addAsset(project, "groups", { archetypeId: entry.id });
      asset.alignment = alignment;
      const errors = [];
      const result = validateEditorAssets(project, {
        error: (...args) => errors.push(args),
        warn: () => {},
      });
      assert.deepEqual(errors, []);
      const group = new AutonomousGroup(asset);
      const restored = new AutonomousGroup(group.toJSON());
      assert.equal(restored.archetypeId, entry.id);
      assert.equal(restored.alignment, alignment);
      const [detected] = new AutonomousGroupDetectionService().detect({
        observer: { position: group.position },
        groups: [restored],
      });
      assert.equal(detected.archetypeId, entry.id);
      assert.equal(detected.alignment, alignment);
      assert.equal(autonomousGroupSpriteKind(detected), entry.id);
      assert.ok(result);
      assert.ok(
        existsSync(
          new URL(`../app/assets/groups/${entry.sprite}`, import.meta.url),
        ),
      );
    }
});

test("apparences et alignements invalides refusés, anciens groupes compatibles", () => {
  for (const extra of [
    { alignment: "friendly" },
    { archetypeId: "../../invalide" },
  ])
    assert.throws(() => new AutonomousGroup({ ...definition, ...extra }));
  const old = new AutonomousGroup(definition).toJSON();
  assert.equal("alignment" in old, false);
  assert.equal("archetypeId" in old, false);
});

test("face/dos uniquement : aucun pas ou miroir ajouté et pieds ancrés", () => {
  for (const { id } of AUTONOMOUS_GROUP_ARCHETYPES)
    for (let direction = 0; direction < 8; direction++) {
      const pose = autonomousGroupPoseStyle(id, direction, 0);
      assert.deepEqual(pose, autonomousGroupPoseStyle(id, direction, 2));
      assert.equal(pose.transform, "none");
      assert.ok(
        Math.abs(parseFloat(pose.top) + parseFloat(pose.height) - 76) < 1e-8,
      );
      assert.ok(
        Math.abs(parseFloat(pose.left) + parseFloat(pose.width) / 2 - 40) <
          1e-8,
      );
      assert.equal(
        pose.backgroundPosition,
        autonomousGroupPoseStyle(id, [0, 1, 7].includes(direction) ? 0 : 4, 0)
          .backgroundPosition,
      );
    }
});

test("alliés et neutres agressifs ne déclenchent pas d’attaque de héros, en GPS et simulation", () => {
  for (const coordinateMode of ["gps", "simulation"])
    for (const alignment of ["enemy", "neutral", "ally"]) {
      const group = new AutonomousGroup({
        ...definition,
        alignment,
        behavior: "aggressive",
        army: {
          units: [
            {
              id: "u",
              ownerPlayerId: "independent",
              typeId: "militia",
              quantity: 1,
            },
          ],
        },
      });
      const game = {
        coordinateMode,
        setup: { rules: { engagementRadiusMeters: 8 } },
        heroes: [
          { id: "h", playerId: "p", state: "active", position: group.position },
        ],
        battles: [],
        autonomousGroups: [group],
        createBattle: () => ({ id: "battle" }),
      };
      const result = triggerAutonomousHeroAttacks(game, new Set(["p"]));
      assert.equal(result.length, alignment === "enemy" ? 1 : 0);
    }
});

test("les embuscades neutres et alliées ignorent aussi les héros", () => {
  for (const alignment of ["enemy", "neutral", "ally"]) {
    const group = new AutonomousGroup({
      ...definition,
      alignment,
      status: "ambushing",
      behavior: "aggressive",
      ambush: { radiusMeters: 10 },
    });
    const { events } = new AutonomousGroupService().advance({
      groups: [group],
      targets: [
        {
          kind: "hero",
          id: "h",
          playerId: "p",
          position: group.position,
          hostile: true,
        },
      ],
      now: 100,
    });
    assert.equal(
      events.some(
        (entry) => entry.type === "autonomous_group_ambush_attack_requested",
      ),
      alignment === "enemy",
    );
  }
});
