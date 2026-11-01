export { validateStrategicProject } from "../../app/js/core/strategic-event-definition.js";
import { uniqueId } from "./project.js";
export function createStrategicEvent(project) {
  project.strategicEvents ??= [];
  const event = {
    id: uniqueId("evenement", project.strategicEvents),
    title: "Défense du village",
    description: "",
    council: {
      physicalPresence: true,
      strategyVote: true,
      strategistVote: true,
    },
    strategyCreditsPerPlayer: 3,
    invitations: "ga-messenger",
    enemySimulation: "without-ga",
    positions: [
      { id: "arriere", role: "strategist", locationSlotId: "" },
      { id: "front", role: "ally", locationSlotId: "" },
    ],
    strategies: [
      "Tenir les lignes",
      "Attirer dans un piège",
      "Défense mobile",
    ].map((title, index) => ({
      id: `strategie-${index + 1}`,
      title,
      preparationSeconds: 1800,
      challenges: [],
    })),
    phases: [],
    outcomes: ["victory", "costlyVictory", "defeat"],
  };
  project.strategicEvents.push(event);
  return event;
}
export function addStrategicBlock(project, eventId) {
  if (!project.strategicEvents?.some((event) => event.id === eventId))
    throw new Error("Événement inconnu.");
  project.strategicBlocks ??= [];
  const block = {
    id: uniqueId("bloc", project.strategicBlocks),
    eventId,
    afterQuestId: "",
    outcomes: {},
  };
  project.strategicBlocks.push(block);
  return block;
}
