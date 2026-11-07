// One frame of the desktop graph simulation.
// Repulsion and the pull toward the middle come from scenes/repository.gd.
// The parent/child spring comes from scenes/node.gd. That spring is vertical
// here: messages sit beside the squares, and the board reads newest at the top,
// so the desktop's sideways offset would drop each message on the next square.
// The label push is the extra piece those small sprites did not need.

const still = 0.5;
const repulsionCap = 48;

function unit(x, y) {
  const length = Math.hypot(x, y);
  if (length < 1e-6) return { x: 0, y: 0, length: 0 };
  return { x: x / length, y: y / length, length };
}

function separateLabels(bodies) {
  for (let i = 0; i < bodies.length; i += 1) {
    for (let j = i + 1; j < bodies.length; j += 1) {
      const a = bodies[i];
      const b = bodies[j];
      const overlapX = Math.min(a.x + 30 + a.label, b.x + 30 + b.label) - Math.max(a.x - 20, b.x - 20);
      const overlapY = Math.min(a.y + 26, b.y + 26) - Math.max(a.y - 26, b.y - 26);
      if (overlapX <= 0 || overlapY <= 0) continue;
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const sideways = Math.abs(dx) >= Math.abs(dy);
      const sign = Math.sign(sideways ? dx : dy) || 1;
      const push = (sideways ? overlapX : overlapY) * 0.45;
      if (sideways) {
        a.x += sign * push * 0.5;
        b.x -= sign * push * 0.5;
      } else {
        a.y += sign * push * 0.5;
        b.y -= sign * push * 0.5;
      }
    }
  }
}

export function stepForces(bodies, edges, panel) {
  const start = bodies.map((body) => ({ x: body.x, y: body.y, held: Boolean(body.held) }));

  for (const body of bodies) {
    for (const other of bodies) {
      if (other === body) continue;
      const delta = unit(body.x - other.x, body.y - other.y);
      const dir = delta.length === 0 ? { x: 1, y: 0 } : delta;
      const push = Math.min(repulsionCap, 2000 / (delta.length + 0.00001) ** 1.5);
      body.x += dir.x * push;
      body.y += dir.y * push;
      other.x -= dir.x * push;
      other.y -= dir.y * push;
    }
    const away = unit(body.x - panel.cx, body.y - panel.cy);
    if (away.length > 0) {
      const span = Math.hypot(panel.height / 10, panel.width / 3) || 1;
      const reach = away.length + 0.00001;
      body.x -= away.x * reach * (panel.height / 10 / span / 30);
      body.y -= away.y * reach * (panel.width / 3 / span / 30);
    }
  }

  for (const edge of edges) {
    const body = bodies.find((item) => item.id === edge.from);
    const other = bodies.find((item) => item.id === edge.to);
    if (!body || !other) continue;
    const delta = unit(other.x - body.x, other.y - (body.y + 80));
    if (delta.length === 0) continue;
    const pull = delta.length * 0.06;
    body.x += delta.x * pull;
    body.y += delta.y * pull;
    other.x -= delta.x * pull;
    other.y -= delta.y * pull;
  }

  separateLabels(bodies);

  bodies.forEach((body, index) => {
    if (!start[index].held) return;
    body.x = start[index].x;
    body.y = start[index].y;
  });

  return bodies.some((body, index) => Math.hypot(body.x - start[index].x, body.y - start[index].y) > still);
}
