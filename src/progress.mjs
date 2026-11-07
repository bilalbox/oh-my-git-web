// Solved levels and command-line badges, matching the desktop save.
// A badge is earned by solving without playing a card, and it is kept.

export const progressKey = "oh-my-git-progress";

export function readProgress(raw) {
  const empty = { solved: [], cli: [] };
  if (typeof raw !== "string" || raw === "") return empty;
  try {
    const parsed = JSON.parse(raw);
    return { solved: strings(parsed?.solved), cli: strings(parsed?.cli) };
  } catch {
    return empty;
  }
}

export function rememberSolve(progress, id, cardsUsed) {
  const solved = progress.solved.includes(id) ? progress.solved : [...progress.solved, id];
  const cli = cardsUsed || progress.cli.includes(id) ? progress.cli : [...progress.cli, id];
  return { solved, cli };
}

function strings(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
}
