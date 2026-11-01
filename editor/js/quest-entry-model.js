export function questEntry(project) {
  const positions = project.quest.actions
    .map((action) => project.editor.positions[action.id])
    .filter(Boolean);
  return {
    x: (positions.length ? Math.min(...positions.map((p) => p.x)) : 0) - 340,
    y: positions.length ? Math.min(...positions.map((p) => p.y)) : 0,
    roots: project.quest.actions.filter(
      (action) =>
        !(action.requires ?? []).length &&
        !project.quest.links.some((link) => link.to === action.id),
    ),
  };
}
