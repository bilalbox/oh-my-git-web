// How a card becomes the command the sandbox runs. Placeholders follow the
// desktop game: [string] is quoted text, [file] is a chosen file, [commit]
// and [ref] are chosen on the graph, and a commit without -m asks for the
// description the card tells the player to type.

const placeholder = /\[[^\]]+\]/g;
const supported = new Set(["[string]", "[file]", "[commit]", "[ref]", "[commit, ref]", "[ref, head]", "[remote]"]);
const graphNeeds = { "[commit, ref]": "either", "[commit]": "commit", "[ref]": "ref", "[ref, head]": "ref" };

export function commitMessageNeeded(command) {
  return command.split(/&&|\|\||;/).some((part) => {
    const trimmed = part.trim();
    return /^git commit\b/.test(trimmed)
      && !/(^|\s)-m(\s|=|$)/.test(trimmed)
      && !/(^|\s)--message(\s|=|$)/.test(trimmed);
  });
}

export function prepareCard(command, value) {
  const found = command.match(placeholder) ?? [];
  const unsupported = found.filter((item) => !supported.has(item));
  const graph = found.filter((item) => graphNeeds[item]);
  const hasString = found.includes("[string]");
  const hasFile = found.includes("[file]");
  if (unsupported.length > 0 || graph.length > 1 || (hasString && hasFile) || (graph.length > 0 && hasString)) {
    return { playable: false };
  }
  if (graph.length === 1 && hasFile) {
    const token = graph[0];
    if (value == null) return { playable: true, needs: "commit-and-file" };
    if (typeof value.file !== "string" || !acceptsTarget(graphNeeds[token], value.graph)) return { playable: false };
    const script = command
      .replaceAll(token, quote(targetArgument(command, value.graph)))
      .replaceAll("[file]", quote(value.file));
    return { playable: true, script };
  }
  if (graph.length === 1) {
    const token = graph[0];
    const needs = command === "git checkout [commit, ref]" ? "checkout" : graphNeeds[token];
    if (value == null) return { playable: true, needs };
    if (needs === "checkout" && typeof value === "string") {
      return { playable: true, script: command.replaceAll(token, quote(value)) };
    }
    if (!acceptsTarget(needs === "checkout" ? "either" : needs, value)) return { playable: false };
    return { playable: true, script: command.replaceAll(token, quote(targetArgument(command, value))) };
  }
  if (command.includes("[file]")) {
    if (value == null) return { playable: true, needs: "file" };
    return { playable: true, script: command.replaceAll("[file]", quote(value)) };
  }
  if (command.includes("[string]")) {
    if (value == null) return { playable: true, needs: "string" };
    return { playable: true, script: command.replaceAll("[string]", quote(value)) };
  }
  if (found.length === 1 && found[0] === "[remote]") {
    if (value == null) return { playable: true, needs: "remote" };
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return { playable: false };
    return { playable: true, script: command.replaceAll("[remote]", quote(value)) };
  }
  if (commitMessageNeeded(command)) {
    if (value == null) return { playable: true, needs: "message" };
    return { playable: true, script: command, commitMessage: value };
  }
  return { playable: true, script: command };
}

function quote(value) {
  return `'${String(value).replaceAll("'", `'\\''`)}'`;
}

function acceptsTarget(needs, target) {
  if (!target || typeof target !== "object") return false;
  if (target.kind === "commit") return needs !== "ref" && /^[0-9a-f]{40}$/.test(target.id ?? "");
  if (target.kind === "ref") {
    return needs !== "commit" && typeof target.name === "string" && (target.name.startsWith("refs/") || target.name === "HEAD");
  }
  return false;
}

// checkout, rebase, and branch -D take the short branch name. Other cards keep
// the full ref, which is what the desktop game drops onto the command.
function targetArgument(command, target) {
  const argument = target.kind === "commit" ? target.id : target.name;
  const shorten = command.startsWith("git checkout") || command.startsWith("git rebase") || command.startsWith("git branch -D");
  if (shorten && argument.startsWith("refs/heads/")) return argument.slice("refs/heads/".length);
  return argument;
}
