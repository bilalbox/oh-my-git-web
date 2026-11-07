// Commit graph geometry from a snapshot. Newest commits sit on the top row,
// and each branch keeps its own column. Branch names come from refs; the one
// HEAD points at is current.

function firstLine(message) {
  return (message ?? "").split("\n")[0].trim();
}

function shortRef(name) {
  if (name.startsWith("refs/heads/")) return name.slice("refs/heads/".length);
  if (name.startsWith("refs/tags/")) return name.slice("refs/tags/".length);
  if (name.startsWith("refs/remotes/")) return name.slice("refs/remotes/".length);
  if (name.startsWith("refs/bisect/")) return `bisect/${name.slice("refs/bisect/".length)}`;
  if (name === "refs/stash") return "stash";
  return name;
}

function headCommit(repo, byId) {
  const head = repo.refs?.HEAD ?? "";
  if (byId.has(head)) return head;
  const target = repo.refs?.[head];
  return byId.has(target) ? target : null;
}

function refLabels(repo, byId) {
  const labels = new Map();
  const head = repo.refs?.HEAD ?? "";
  for (const [name, target] of Object.entries(repo.refs ?? {})) {
    if (name === "HEAD" || !byId.has(target)) continue;
    if (name.startsWith("refs/remotes/") && name.endsWith("/HEAD")) continue;
    if (name.startsWith("refs/bisect/good-")) continue;
    const list = labels.get(target) ?? [];
    list.push({ name: shortRef(name), full: name, current: head === name });
    labels.set(target, list);
  }
  const headId = headCommit(repo, byId);
  if (headId) {
    const list = labels.get(headId) ?? [];
    list.push({ name: "HEAD", full: "HEAD", current: true });
    labels.set(headId, list);
  }
  for (const list of labels.values()) {
    list.sort((a, b) => Number(b.current) - Number(a.current) || a.name.localeCompare(b.name));
  }
  return labels;
}

function historyRank(commits, byId) {
  const rank = new Map();
  const visiting = new Set();
  const depth = (id) => {
    if (rank.has(id)) return rank.get(id);
    if (!byId.has(id) || visiting.has(id)) return 0;
    visiting.add(id);
    const parents = byId.get(id).parents.filter((parent) => byId.has(parent));
    const value = parents.reduce((max, parent) => Math.max(max, depth(parent) + 1), 0);
    visiting.delete(id);
    rank.set(id, value);
    return value;
  };
  for (const commit of commits) depth(commit.id);
  return rank;
}

function mainLine(byId, headId) {
  const line = new Set();
  let cursor = headId;
  while (cursor && byId.has(cursor) && !line.has(cursor)) {
    line.add(cursor);
    cursor = byId.get(cursor).parents.find((parent) => byId.has(parent));
  }
  return line;
}

// One commit per row, newest at the top. The first parent keeps the column,
// the same way `git log --graph` draws a lane, and other parents step aside.
function assignLanes(commits, byId, rank, headId) {
  const main = mainLine(byId, headId);
  const ordered = [...commits].sort((a, b) => {
    const newer = rank.get(b.id) - rank.get(a.id);
    if (newer) return newer;
    const preferred = Number(main.has(b.id)) - Number(main.has(a.id));
    if (preferred) return preferred;
    return a.id.localeCompare(b.id);
  });
  const columns = [];
  const columnOf = new Map();
  for (const [row, commit] of ordered.entries()) {
    let column = columns.indexOf(commit.id);
    if (column === -1) column = columns.findIndex((slot) => slot == null);
    if (column === -1) column = columns.length;
    if (column === columns.length) columns.push(null);
    columns[column] = null;
    columnOf.set(commit.id, { column, row });
    (commit.parents ?? []).filter((parent) => byId.has(parent)).forEach((parent, index) => {
      if (columns.includes(parent)) return;
      let slot = index === 0 && columns[column] == null ? column : -1;
      if (slot === -1) {
        slot = columns.findIndex((value, at) => at > column && value == null);
      }
      if (slot === -1) columns.push(parent);
      else columns[slot] = parent;
    });
  }
  const used = [...new Set(columnOf.values().map((place) => place.column))].sort((a, b) => a - b);
  const compact = new Map(used.map((column, index) => [column, index]));
  for (const place of columnOf.values()) place.column = compact.get(place.column);
  return { ordered, columnOf, laneCount: used.length };
}

export function layoutGraph(repo) {
  const commits = (repo.commits ?? []).filter((commit) => commit.type === "commit");
  const byId = new Map(commits.map((commit) => [commit.id, commit]));
  const rank = historyRank(commits, byId);
  const labels = refLabels(repo, byId);
  const currentId = headCommit(repo, byId);
  const { ordered, columnOf, laneCount } = assignLanes(commits, byId, rank, currentId);

  const rowHeight = 76;
  const charWidth = 8.8;
  const square = 28;
  const drafts = ordered.map((commit) => {
    const message = firstLine(commit.message) || commit.id.slice(0, 7);
    const refs = labels.get(commit.id) ?? [];
    const refWidth = refs.reduce((sum, ref) => sum + ref.name.length * charWidth + 12, 0);
    return {
      id: commit.id,
      message,
      column: columnOf.get(commit.id).column,
      row: columnOf.get(commit.id).row,
      label: Math.max(message.length * charWidth, refWidth),
      current: commit.id === currentId,
      refs,
    };
  });

  const laneLabel = Array(laneCount).fill(0);
  for (const draft of drafts) laneLabel[draft.column] = Math.max(laneLabel[draft.column], draft.label);
  const laneX = [];
  let cursor = 24 + square / 2;
  for (let lane = 0; lane < laneCount; lane += 1) {
    laneX.push(cursor);
    cursor += square / 2 + 16 + laneLabel[lane] + 48 + square / 2;
  }

  let width = 280;
  const nodes = drafts.map((draft) => {
    const x = laneX[draft.column] ?? cursor;
    const y = 32 + draft.row * rowHeight;
    width = Math.max(width, x + square / 2 + 16 + draft.label + 24);
    return {
      id: draft.id,
      message: draft.message,
      x,
      y,
      current: draft.current,
      refs: draft.refs,
      label: draft.label,
    };
  });

  const known = new Set(nodes.map((node) => node.id));
  const edges = [];
  for (const commit of commits) {
    for (const parent of commit.parents) {
      if (known.has(parent)) edges.push({ from: commit.id, to: parent });
    }
  }

  return {
    nodes,
    edges,
    width,
    height: Math.max(rowHeight, 32 + Math.max(0, ordered.length - 1) * rowHeight + square + 20),
  };
}
