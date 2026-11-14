export function renderLevelList(host, chapters, currentId, progress, onPick) {
  host.replaceChildren();
  for (const chapter of chapters) {
    const section = document.createElement("section");
    const heading = document.createElement("h2");
    heading.textContent = chapter.name;
    const list = document.createElement("ul");
    for (const level of chapter.levels) {
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = level.title;
      const solved = progress.solved.includes(level.id);
      const cli = progress.cli.includes(level.id);
      button.dataset.solved = solved ? "yes" : "no";
      button.dataset.cli = cli ? "yes" : "no";
      if (level.id === currentId) button.setAttribute("aria-current", "true");
      button.addEventListener("click", () => onPick(level.id));
      item.append(button);
      const marks = document.createElement("div");
      marks.className = "marks";
      if (solved) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Solved";
        marks.append(badge);
      }
      if (cli) {
        const badge = document.createElement("span");
        badge.className = "badge";
        badge.textContent = "Command line";
        marks.append(badge);
      }
      if (marks.childElementCount > 0) item.append(marks);
      list.append(item);
    }
    section.append(heading, list);
    host.append(section);
  }
}
