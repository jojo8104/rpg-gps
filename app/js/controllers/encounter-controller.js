import { astralTargetInReach } from "../core/astral-interaction.js";
import { closeSheet } from "../ui/bottom-sheet.js";
import { createEncounterView } from "../ui/encounter-view.js";
import { autonomousAttackPolicy } from "../core/location-interaction-policy.js";
/** Route les événements de proximité et les intentions des fiches de rencontre. */
export function createEncounterController(context) {
  const {
    session,
    ui,
    quests,
    locations,
    visibleAutonomousGroups,
    beginAutonomousBattle,
    openBattle,
    isManagementOpen,
    selectLocation,
  } = context;
  const view = createEncounterView({
    ...context,
    onEncounterChoice: async (choice) => {
      session.currentEncounter.choose(choice);
      if (choice === "fight") await openBattle();
      else closeSheet(ui.sheet);
    },
  });
  function selectAutonomousGroup(groupId) {
    const group = session.game.getAutonomousGroup(groupId);
    if (!group) return;
    const snapshot = visibleAutonomousGroups().find(
      (item) => item.id === groupId,
    );
    if (!snapshot || quests.tryOpenGroup(group, snapshot)) return;
    const policy = autonomousAttackPolicy(snapshot);
    if (
      !policy.ownGroup &&
      astralTargetInReach(session.game, session.hero, "group", group)
    )
      policy.canAttack = true;
    view.showGroup(group, snapshot, policy);
  }
  async function handleLocationEvent(event, { isCurrent = () => true } = {}) {
    await quests.dispatchLocationEvent(event);
    if (!isCurrent()) return;
    const interaction = session.interactionEngine.handle(event);
    if (!interaction || isManagementOpen()) return;
    if (event.type === "LocationExited") {
      if (locations.selectedId === event.locationId) {
        locations.selectedId = null;
        locations.garrisonId = null;
        session.locationMessage = "";
        if (session.currentEncounter?.locationId === event.locationId)
          session.currentEncounter = null;
        closeSheet(ui.sheet);
      }
      return;
    }
    locations.selectedId = event.locationId;
    if (interaction.type === "encounter") {
      session.currentEncounter = interaction.encounter;
      interaction.autoBattle
        ? await openBattle({ ambushTeamId: "bandits" })
        : view.showEncounter();
    } else {
      selectLocation(event.locationId, { compact: true });
    }
  }
  return { selectAutonomousGroup, handleLocationEvent };
}
