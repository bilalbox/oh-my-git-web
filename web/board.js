import { layoutGraph } from "../src/graph.mjs";
import { stepForces } from "../src/forces.mjs";

const svgNs = "http://www.w3.org/2000/svg";
const padTop = 36;
const sims = new Map();
const scales = new Map();
let edgeSerial = 0;

function simFor(repoName) {
  let sim = sims.get(repoName);
  if (!sim) {
    sim = {
      bodies: new Map(),
      panel: null,
      origin: { x: 0, y: 0 },
      scroll: { left: 0, top: 0 },
      edgeKey: "",
      asleep: true,
      still: 0,
      frame: 0,
    };
    sims.set(repoName, sim);
  }
  return sim;
}

function isContainedScroll(host) {
  const style = getComputedStyle(host);
  return style.overflowY === "auto" || style.overflowY === "scroll" || style.overflowX === "auto" || style.overflowX === "scroll";
}

function scrollGraphBy(host, sim, dx, dy) {
  if (dx === 0 && dy === 0) return;
  if (isContainedScroll(host)) {
    host.scrollBy(dx, dy);
    sim.scroll.left = host.scrollLeft;
    sim.scroll.top = host.scrollTop;
    return;
  }
  window.scrollBy(dx, dy);
}

function stopSim(sim) {
  if (!sim.frame) return;
  cancelAnimationFrame(sim.frame);
  sim.frame = 0;
}

function graphScale(repoName) {
  return scales.get(repoName) ?? 1;
}

function svg(name, attrs = {}) {
  const element = document.createElementNS(svgNs, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
}

export function clearPlaced() {
  for (const sim of sims.values()) stopSim(sim);
  sims.clear();
  scales.clear();
}

function straight(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const cut = Math.min(16, length / 2);
  return [
    { x: from.x + (dx / length) * cut, y: from.y + (dy / length) * cut },
    { x: to.x - (dx / length) * cut, y: to.y - (dy / length) * cut },
  ];
}

function pointerDrag(element, { onStart, onMove, onDrop, onCancel }) {
  let suppressClick = false;

  element.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || element.disabled) return;
    const origin = { x: event.clientX, y: event.clientY };
    let moved = false;
    const move = (ev) => {
      const dx = ev.clientX - origin.x;
      const dy = ev.clientY - origin.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) onStart?.(ev);
      moved = true;
      onMove?.(dx, dy, ev);
    };
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
    };
    const up = (ev) => {
      finish();
      if (!moved) return;
      suppressClick = true;
      onDrop?.(ev);
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    };
    const cancel = () => {
      finish();
      if (moved) onCancel?.();
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
  });

  element.addEventListener("click", (event) => {
    if (!suppressClick) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  });
}

const dropSelector = "button.commit, button.ref, button.remote, #files button";

function acceptsDrop(element) {
  const armed = document.querySelector("#repos")?.dataset.armed ?? "no";
  const filesArmed = document.querySelector("#files")?.dataset.armed === "yes";
  const home = element.closest(".repo[data-home='yes']");
  if (element.matches("button.commit")) return Boolean(home) && (armed === "commit" || armed === "either");
  if (element.matches("button.ref")) return Boolean(home) && (armed === "ref" || armed === "either");
  if (element.matches("button.remote")) return armed === "remote";
  if (element.matches("#files button")) return filesArmed;
  return false;
}

function hotspot(element) {
  if (element.matches(".commit")) return element.querySelector(".dot") ?? element;
  return element;
}

function nearestValid(x, y, limit) {
  let best = null;
  let bestDist = limit + 1;
  for (const element of document.querySelectorAll(dropSelector)) {
    if (!acceptsDrop(element)) continue;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const dx = x < rect.left ? rect.left - x : x > rect.right ? x - rect.right : 0;
    const dy = y < rect.top ? rect.top - y : y > rect.bottom ? y - rect.bottom : 0;
    const dist = Math.hypot(dx, dy);
    if (dist < bestDist) {
      best = element;
      bestDist = dist;
    }
  }
  return best;
}

function coveredValid(ghostRect) {
  const pad = 10;
  const left = ghostRect.left - pad;
  const right = ghostRect.right + pad;
  const top = ghostRect.top - pad;
  const bottom = ghostRect.bottom + pad;
  const midX = (ghostRect.left + ghostRect.right) / 2;
  const midY = (ghostRect.top + ghostRect.bottom) / 2;
  let best = null;
  let bestDist = Infinity;
  for (const element of document.querySelectorAll(dropSelector)) {
    if (!acceptsDrop(element)) continue;
    const rect = hotspot(element).getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    if (cx < left || cx > right || cy < top || cy > bottom) continue;
    const dist = Math.hypot(cx - midX, cy - midY);
    if (dist < bestDist) {
      best = element;
      bestDist = dist;
    }
  }
  return best;
}

function dropTargetAt(x, y, ghost) {
  const previous = ghost.style.visibility;
  ghost.style.visibility = "hidden";
  try {
    const direct = document.elementFromPoint(x, y)?.closest(dropSelector) ?? null;
    if (direct) return acceptsDrop(direct) ? direct : null;
    return nearestValid(x, y, 18) ?? coveredValid(ghost.getBoundingClientRect());
  } finally {
    ghost.style.visibility = previous;
  }
}

function readTarget(element) {
  const ref = element?.closest(".ref");
  if (ref?.dataset.full) {
    return { repo: ref.closest(".repo")?.dataset.repo, kind: "ref", name: ref.dataset.full };
  }
  const commit = element?.closest(".commit");
  if (commit) {
    const node = commit.closest(".node");
    return { repo: commit.closest(".repo")?.dataset.repo, kind: "commit", id: node?.dataset.id };
  }
  const remote = element?.closest(".remote");
  if (remote) {
    const repo = remote.closest(".repo")?.dataset.repo;
    return { repo, kind: "remote", name: repo };
  }
  const file = element?.closest("#files button");
  if (file) return { kind: "file", path: file.dataset.path };
  return null;
}

export function renderGraph(host, repoName, repo, onChoose, onInsert) {
  const graph = layoutGraph(repo);
  const sim = simFor(repoName);
  stopSim(sim);
  host.replaceChildren();
  if (graph.nodes.length === 0) {
    sim.bodies.clear();
    const empty = document.createElement("p");
    empty.className = "empty";
    empty.textContent = "No commits yet.";
    host.append(empty);
    return;
  }

  const seen = new Set();
  let added = false;
  for (const node of graph.nodes) {
    seen.add(node.id);
    const label = node.label ?? node.message.length * 8.8;
    const body = sim.bodies.get(node.id);
    if (body) {
      body.label = label;
      continue;
    }
    added = true;
    const parents = graph.edges
      .filter((edge) => edge.from === node.id)
      .map((edge) => sim.bodies.get(edge.to))
      .filter(Boolean);
    const x = parents.length
      ? parents.reduce((sum, parent) => sum + parent.x, 0) / parents.length
      : node.x;
    const y = parents.length
      ? parents.reduce((sum, parent) => sum + parent.y, 0) / parents.length - 150
      : node.y;
    sim.bodies.set(node.id, { id: node.id, x, y, label, held: false });
  }
  for (const id of [...sim.bodies.keys()]) {
    if (!seen.has(id)) sim.bodies.delete(id);
  }

  const xs = graph.nodes.map((node) => node.x);
  const ys = graph.nodes.map((node) => node.y);
  sim.panel = {
    cx: (Math.min(...xs) + Math.max(...xs)) / 2,
    cy: (Math.min(...ys) + Math.max(...ys)) / 2,
    width: Math.max(graph.width, Math.max(...xs) - Math.min(...xs) + 200),
    height: Math.max(graph.height, Math.max(...ys) - Math.min(...ys) + 200),
  };
  const edgeKey = graph.edges.map((edge) => `${edge.from}:${edge.to}`).join("|");
  if (added || edgeKey !== sim.edgeKey) {
    sim.asleep = false;
    sim.still = 0;
  }
  sim.edgeKey = edgeKey;

  const stage = document.createElement("div");
  stage.className = "stage";

  const picture = svg("svg", { class: "edges", width: "280", height: "120" });
  const markerId = `edge-${edgeSerial += 1}`;
  const marker = svg("marker", {
    id: markerId,
    viewBox: "0 0 8 8",
    refX: "7",
    refY: "4",
    markerWidth: "7",
    markerHeight: "7",
    orient: "auto",
  });
  marker.append(svg("path", { d: "M0,0 L8,4 L0,8 Z", fill: "currentColor" }));
  const defs = svg("defs");
  defs.append(marker);
  picture.append(defs);
  const links = [];
  const pointsOf = (points) => points.map((point) => `${point.x},${point.y}`).join(" ");
  for (const edge of graph.edges) {
    const route = svg("polyline", { points: "0,0 0,0", "marker-end": `url(#${markerId})` });
    picture.append(route);
    links.push({ from: edge.from, to: edge.to, route });
  }
  stage.append(picture);

  const frame = document.createElement("div");
  frame.className = "frame";
  const applyScale = () => {
    const factor = graphScale(repoName);
    const nextWidth = Number.parseFloat(stage.style.width);
    const nextHeight = Number.parseFloat(stage.style.height);
    frame.style.width = `${nextWidth * factor}px`;
    frame.style.height = `${nextHeight * factor}px`;
    stage.style.transformOrigin = "0 0";
    stage.style.transform = `scale(${factor})`;
  };

  const rows = new Map();
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  let restoreScroll = true;

  const paint = () => {
    const bodies = [...sim.bodies.values()];
    let minX = 0;
    let minY = 0;
    let maxX = 280;
    let maxY = 120;
    for (const body of bodies) {
      minX = Math.min(minX, body.x - 32);
      minY = Math.min(minY, body.y - 56);
      maxX = Math.max(maxX, body.x + 28 + body.label + 24);
      maxY = Math.max(maxY, body.y + 40);
    }
    const originX = sim.origin.x;
    const originY = sim.origin.y;
    if (minX < sim.origin.x) sim.origin.x = minX;
    if (minY < sim.origin.y) sim.origin.y = minY;
    const grewX = originX - sim.origin.x;
    const grewY = originY - sim.origin.y;
    const width = Math.max(280, maxX - sim.origin.x + 24);
    const height = Math.max(120, maxY - sim.origin.y + padTop + 24);
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    picture.setAttribute("width", String(width));
    picture.setAttribute("height", String(height));
    const centers = new Map();
    for (const body of bodies) {
      const left = body.x - sim.origin.x - 14;
      const top = body.y - sim.origin.y - 14 + padTop;
      const row = rows.get(body.id);
      if (row) {
        row.style.left = `${left}px`;
        row.style.top = `${top}px`;
      }
      centers.set(body.id, { x: left + 14, y: top + 14 });
    }
    for (const link of links) {
      const from = centers.get(link.from);
      const to = centers.get(link.to);
      if (from && to) link.route.setAttribute("points", pointsOf(straight(from, to)));
    }
    applyScale();
    if (restoreScroll) {
      restoreScroll = false;
      host.scrollLeft = sim.scroll.left;
      host.scrollTop = sim.scroll.top;
    }
    if (grewX > 0 || grewY > 0) {
      const factor = graphScale(repoName);
      scrollGraphBy(host, sim, grewX * factor, grewY * factor);
    }
  };

  const bodiesNow = () => [...sim.bodies.values()];
  const settleNow = () => {
    const bodies = bodiesNow();
    let steps = 0;
    while (steps < 240 && stepForces(bodies, graph.edges, sim.panel)) steps += 1;
    sim.asleep = true;
    sim.still = 31;
    paint();
  };
  const tick = () => {
    sim.frame = 0;
    const bodies = bodiesNow();
    const moved = stepForces(bodies, graph.edges, sim.panel);
    const holding = bodies.some((body) => body.held);
    sim.still = holding || moved ? 0 : sim.still + 1;
    paint();
    if (!holding && sim.still > 30) {
      sim.asleep = true;
      return;
    }
    sim.frame = requestAnimationFrame(tick);
  };
  const wake = () => {
    sim.asleep = false;
    sim.still = 0;
    if (reduceMotion) {
      settleNow();
      return;
    }
    if (sim.frame) return;
    sim.frame = requestAnimationFrame(tick);
  };

  for (const node of graph.nodes) {
    const row = document.createElement("div");
    rows.set(node.id, row);
    row.className = "node";
    row.dataset.message = node.message;
    row.dataset.id = node.id;
    if (node.current) row.dataset.current = "yes";

    if (node.refs.length > 0) {
      const refs = document.createElement("div");
      refs.className = "refs";
      for (const ref of node.refs) {
        const label = document.createElement(ref.full ? "button" : "span");
        label.className = ref.current ? "ref current" : "ref";
        label.textContent = ref.name;
        if (!ref.full) {
          refs.append(label);
          continue;
        }
        label.type = "button";
        label.setAttribute("aria-label", ref.name);
        label.dataset.full = ref.full;
        label.addEventListener("click", () => onChoose?.({ kind: "ref", name: ref.full }));
        label.addEventListener("contextmenu", (event) => {
          event.preventDefault();
          event.stopPropagation();
          onInsert?.(ref.name);
        });
        refs.append(label);
      }
      row.append(refs);
    }

    const commit = document.createElement("button");
    commit.type = "button";
    commit.className = "commit";
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.setAttribute("aria-hidden", "true");
    const name = document.createElement("span");
    name.className = "name";
    name.textContent = node.message;
    commit.append(dot, name);

    const body = sim.bodies.get(node.id);
    let start = null;
    pointerDrag(commit, {
      onStart: () => {
        start = { x: body.x, y: body.y };
        body.held = true;
        commit.classList.add("is-dragging");
        if (!reduceMotion) wake();
      },
      onMove: (dx, dy) => {
        const factor = graphScale(repoName);
        body.x = start.x + dx / factor;
        body.y = start.y + dy / factor;
        paint();
      },
      onDrop: () => {
        body.held = false;
        commit.classList.remove("is-dragging");
        if (reduceMotion) settleNow();
        else wake();
      },
      onCancel: () => {
        body.held = false;
        body.x = start?.x ?? body.x;
        body.y = start?.y ?? body.y;
        commit.classList.remove("is-dragging");
        if (reduceMotion) settleNow();
        else wake();
      },
    });
    commit.addEventListener("click", () => onChoose?.({ kind: "commit", id: node.id }));
    commit.addEventListener("contextmenu", (event) => {
      event.preventDefault();
      onInsert?.(node.id);
    });
    row.append(commit);
    stage.append(row);
  }

  frame.append(stage);
  host.append(frame);
  host.addEventListener("scroll", () => {
    sim.scroll.left = host.scrollLeft;
    sim.scroll.top = host.scrollTop;
  }, { passive: true });
  if (reduceMotion && !sim.asleep) settleNow();
  else {
    paint();
    if (!sim.asleep) wake();
  }
  host.addEventListener("wheel", (event) => {
    if (event.deltaY === 0 || (!event.ctrlKey && !event.metaKey)) return;
    const current = graphScale(repoName);
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaMode === 2 ? event.deltaY * host.clientHeight : event.deltaY;
    const next = Math.min(2, Math.max(0.3, current - (delta / 100) * 0.05));
    event.preventDefault();
    if (Math.abs(next - current) < 0.0001) return;
    const before = stage.getBoundingClientRect();
    const layoutX = (event.clientX - before.left) / current;
    const layoutY = (event.clientY - before.top) / current;
    scales.set(repoName, next);
    applyScale();
    const after = stage.getBoundingClientRect();
    scrollGraphBy(host, sim, after.left + layoutX * next - event.clientX, after.top + layoutY * next - event.clientY);
  }, { passive: false });
}

export function renderFiles(host, files, { selected, onOpen }) {
  const scrollTop = host.scrollTop;
  host.replaceChildren();
  const list = document.createElement("ul");
  for (const file of files) {
    const item = document.createElement("li");
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.path = file.path;
    button.dataset.state = file.state;
    const fileName = document.createElement("span");
    fileName.className = "file-name";
    fileName.textContent = file.path;
    button.append(fileName);
    if (file.state !== "same") {
      const state = document.createElement("span");
      state.className = "file-state";
      state.textContent = file.state;
      button.append(state);
    }
    if (file.path === selected) button.setAttribute("aria-current", "true");
    button.addEventListener("click", () => onOpen(file.path));
    item.append(button);
    list.append(item);
  }
  host.append(list);
  host.scrollTop = scrollTop;
}

export function renderRepos(host, repos, order, onChoose, onInsert, homeName) {
  for (const section of host.querySelectorAll(".repo")) {
    const repoName = section.dataset.repo;
    const graphEl = section.querySelector(".graph");
    if (repoName && graphEl && sims.has(repoName)) {
      const sim = sims.get(repoName);
      sim.scroll.left = graphEl.scrollLeft;
      sim.scroll.top = graphEl.scrollTop;
    }
  }
  host.replaceChildren();
  const several = order.length > 1;
  for (const name of order) {
    const section = document.createElement("section");
    section.className = "repo";
    section.dataset.repo = name;
    if (name === homeName) section.dataset.home = "yes";
    const heading = document.createElement("h2");
    if (several) {
      heading.className = "repo-name";
      const remote = document.createElement("button");
      remote.type = "button";
      remote.className = "remote";
      remote.textContent = name;
      remote.addEventListener("click", () => onChoose?.(name, { kind: "remote", name }));
      heading.append(remote);
    } else {
      heading.textContent = "Commits";
    }
    const picture = document.createElement("div");
    picture.className = "graph";
    renderGraph(picture, name, repos[name] ?? { commits: [], refs: {}, files: [] }, (target) => onChoose?.(name, target), onInsert);
    section.append(heading, picture);
    host.append(section);
  }
}

export function renderCards(host, cards, { onPlay, onDrop, onDragStart, onDragEnd, onInspect }) {
  host.replaceChildren();
  cards.forEach((card) => {
    const block = document.createElement("article");
    block.className = "card";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.command = card.command;
    button.disabled = !card.playable;
    const picture = document.createElement("img");
    picture.alt = "";
    picture.src = `/art/cards/${card.id}.svg`;
    picture.addEventListener("error", () => picture.remove());
    const command = document.createElement("span");
    command.className = "command";
    command.textContent = card.command;
    button.append(picture, command);

    let ghost = null;
    let over = null;
    let grab = null;
    const clearOver = () => {
      over?.classList.remove("is-over");
      over = null;
    };
    const endDrag = () => {
      ghost?.remove();
      ghost = null;
      clearOver();
      block.classList.remove("is-dragging");
      onDragEnd?.();
    };
    pointerDrag(button, {
      onStart: (event) => {
        onDragStart?.(card);
        const rect = block.getBoundingClientRect();
        grab = { x: event.clientX - rect.left, y: event.clientY - rect.top };
        ghost = block.cloneNode(true);
        ghost.classList.add("card-ghost");
        ghost.setAttribute("aria-hidden", "true");
        ghost.querySelector("button")?.removeAttribute("disabled");
        ghost.querySelector("p")?.remove();
        ghost.style.left = `${rect.left}px`;
        ghost.style.top = `${rect.top}px`;
        document.body.append(ghost);
        block.classList.add("is-dragging");
      },
      onMove: (_dx, _dy, event) => {
        if (!ghost) return;
        ghost.style.left = `${event.clientX - grab.x}px`;
        ghost.style.top = `${event.clientY - grab.y}px`;
        const next = dropTargetAt(event.clientX, event.clientY, ghost);
        if (over !== next) {
          over?.classList.remove("is-over");
          over = next;
          over?.classList.add("is-over");
        }
      },
      onDrop: (event) => {
        const target = readTarget(ghost ? dropTargetAt(event.clientX, event.clientY, ghost) : null);
        endDrag();
        if (target) onDrop?.(card, target);
      },
      onCancel: () => {
        endDrag();
      },
    });
    button.addEventListener("pointerenter", () => onInspect?.(card));
    button.addEventListener("pointerleave", () => onInspect?.(null));
    button.addEventListener("focus", () => onInspect?.(card));
    button.addEventListener("blur", () => onInspect?.(null));
    button.addEventListener("click", () => onPlay?.(card));
    block.append(button);
    if (card.description) {
      const about = document.createElement("p");
      about.textContent = card.description;
      block.append(about);
    }
    host.append(block);
  });
}
