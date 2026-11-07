// The board's data, from the same git reads the desktop repository uses.
// One shell script collects refs, objects, and files. Commit bodies come from
// a second `git cat-file --batch`.

function lines(text) {
  if (!text) return [];
  return text.split("\n").filter((line) => line.length > 0);
}

const utf8 = new TextEncoder();
const utf8Decoder = new TextDecoder();

function parseBatch(text) {
  const data = utf8.encode(text);
  const result = new Map();
  let i = 0;
  while (i < data.length) {
    const nl = data.indexOf(10, i);
    if (nl < 0) break;
    const header = utf8Decoder.decode(data.subarray(i, nl)).split(" ");
    if (header[1] === "missing") {
      i = nl + 1;
      continue;
    }
    if (header.length < 3) break;
    const size = Number(header[2]);
    const start = nl + 1;
    const body = utf8Decoder.decode(data.subarray(start, start + size));
    result.set(header[0], { type: header[1], body });
    i = start + size + 1;
  }
  return result;
}

function parseCommit(body) {
  const parents = [];
  const message = [];
  let header = true;
  for (const line of body.split("\n")) {
    if (header) {
      if (line === "") {
        header = false;
        continue;
      }
      if (line.startsWith("parent ")) parents.push(line.slice(7));
    } else {
      message.push(line);
    }
  }
  return { parents, message: message.join("\n").trim() };
}

function parseTag(body) {
  let target = "";
  const message = [];
  let header = true;
  for (const line of body.split("\n")) {
    if (header) {
      if (line === "") {
        header = false;
        continue;
      }
      if (line.startsWith("object ")) target = line.slice(7);
    } else {
      message.push(line);
    }
  }
  return { target, message: message.join("\n").trim() };
}

const collectScript = `
set -o pipefail
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git_ok=1
else
  git_ok=0
fi
echo '## refs'
if [ "$git_ok" -eq 1 ]; then
  git for-each-ref --format='%(refname) %(objectname)'
fi
echo '## head'
if [ "$git_ok" -eq 1 ]; then
  git symbolic-ref -q HEAD || git rev-parse --verify -q HEAD || true
fi
echo '## objects'
if [ "$git_ok" -eq 1 ]; then
  git cat-file --batch-check='%(objectname) %(objecttype)' --batch-all-objects || true
fi
echo '## files'
find . -type f -not -path '*/.git/*' | sort | while IFS= read -r file; do
  rel=\${file#./}
  hash=
  if [ "$git_ok" -eq 1 ]; then
    hash=$(git hash-object -- "$rel")
  fi
  printf '%s\\t%s\\n' "$rel" "$hash"
done
echo '## index'
if [ "$git_ok" -eq 1 ]; then
  git ls-files -s || true
fi
echo '## tree'
if [ "$git_ok" -eq 1 ]; then
  git ls-tree -r HEAD || true
fi
echo '## end'
`;

function section(text, name) {
  const start = text.indexOf(`## ${name}\n`);
  if (start < 0) return "";
  const from = start + name.length + 4;
  const end = text.indexOf("\n## ", from);
  return text.slice(from, end < 0 ? text.length : end).replace(/^\n/, "").replace(/\n$/, "");
}

export function parseSnapshot(stdout) {
  const refs = {};
  for (const line of lines(section(stdout, "refs"))) {
    const space = line.indexOf(" ");
    if (space > 0) refs[line.slice(0, space)] = line.slice(space + 1);
  }
  const head = section(stdout, "head").trim();
  if (head) refs.HEAD = head;

  const objects = lines(section(stdout, "objects")).map((line) => {
    const [id, type] = line.split(" ");
    return { id, type };
  }).filter((object) => object.id && object.type);

  const files = new Map();
  for (const line of lines(section(stdout, "files"))) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    files.set(line.slice(0, tab), { path: line.slice(0, tab), worktree: true, worktreeHash: line.slice(tab + 1), indexHashes: [], headHash: "" });
  }
  for (const line of lines(section(stdout, "index"))) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const meta = line.slice(0, tab).split(" ");
    const path = line.slice(tab + 1);
    const file = files.get(path) ?? { path, worktree: false, worktreeHash: "", indexHashes: [], headHash: "" };
    if (meta[1]) file.indexHashes.push(meta[1]);
    files.set(path, file);
  }
  for (const line of lines(section(stdout, "tree"))) {
    const tab = line.indexOf("\t");
    if (tab < 0) continue;
    const meta = line.slice(0, tab).split(" ");
    const path = line.slice(tab + 1);
    const file = files.get(path) ?? { path, worktree: false, worktreeHash: "", indexHashes: [], headHash: "" };
    file.headHash = meta[2] ?? "";
    files.set(path, file);
  }

  return { refs, objects, files: [...files.values()] };
}

export function commitsFrom(objects, batch) {
  const commits = [];
  for (const object of objects) {
    if (object.type !== "commit" && object.type !== "tag") continue;
    const parsed = batch.get(object.id);
    if (!parsed) continue;
    if (object.type === "commit") {
      const commit = parseCommit(parsed.body);
      commits.push({ id: object.id, type: "commit", message: commit.message, parents: commit.parents });
    } else {
      const tag = parseTag(parsed.body);
      commits.push({ id: object.id, type: "tag", message: tag.message, parents: tag.target ? [tag.target] : [] });
    }
  }
  return commits;
}

export function collectScriptSource() {
  return collectScript;
}

export { parseBatch };
