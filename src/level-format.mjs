// Pure level-file parser. Safe to import in the browser; it does not read disk.

const levelIdPattern = /^[a-z0-9][a-z0-9/_-]*$/;

export function assertLevelId(id) {
  if (!levelIdPattern.test(id) || id.includes("..")) {
    throw new Error(`Refusing level id ${id}`);
  }
}

export function parseLevel(text) {
  const fields = {};
  let section = null;
  const sectionRegex = /^\[(.*)\]$/;
  const assignmentRegex = /^([a-z ]+)=(.*)$/;

  for (const line of text.split("\n")) {
    if (line.startsWith(";")) continue;
    const header = line.match(sectionRegex);
    if (header) {
      section = header[1];
      fields[section] = "";
      continue;
    }
    const assignment = line.match(assignmentRegex);
    if (assignment) {
      fields[assignment[1].trim()] = assignment[2].trim();
      continue;
    }
    if (section) fields[section] += line + "\n";
  }

  for (const key of Object.keys(fields)) fields[key] = fields[key].trim();
  return fields;
}

export function levelFromText(id, text) {
  assertLevelId(id);
  const fields = parseLevel(text);
  const repos = new Set();
  for (const key of Object.keys(fields)) {
    if (!key.startsWith("setup") && !key.startsWith("win") && !key.startsWith("actions")) continue;
    const parts = key.split(" ");
    const repo = parts.length > 1 ? parts[1] : "yours";
    if (!/^[A-Za-z0-9_-]+$/.test(repo)) throw new Error(`Refusing repo name ${repo} in ${id}`);
    repos.add(repo);
  }
  return {
    id,
    title: fields.title || id,
    description: fields.description || "",
    congrats: fields.congrats || "",
    cli: fields.cli || "",
    cards: fields.cards ? fields.cards.split(" ").filter(Boolean) : [],
    fields,
    repos: [...repos],
  };
}

export function repoScript(fields, kind, repo) {
  return fields[`${kind} ${repo}`] ?? (repo === "yours" ? fields[kind] ?? "" : "");
}

export function winChecks(body) {
  const checks = [];
  let description = "Complete the goal of this level";
  let commands = [];
  const flush = () => {
    const script = commands.join("\n").trim();
    if (script) checks.push({ description, script });
    commands = [];
  };
  for (const line of body.split("\n")) {
    if (line.startsWith("#")) {
      flush();
      description = line.slice(1).trim();
    } else {
      commands.push(line);
    }
  }
  flush();
  return checks;
}
