// One Wasmer sandbox per play. Bash commands run one at a time on its filesystem.
// The desktop game's level construct and win-function protocol are preserved.
// Pass a Wasmer client from @wasmer/sdk/node or @wasmer/sdk/browser.

import { repoScript, winChecks } from "./level-format.mjs";
import { collectScriptSource, commitsFrom, parseBatch, parseSnapshot } from "./snapshot.mjs";

const packages = [
  "wasmer/bash@=1.0.25",
  "wasmer/coreutils@=1.0.27",
  "wasmer/findutils@=0.10.1",
  "wasmer/grep@=3.12.0",
  "kilyanni/git@=2.52.0",
];

const gitconfig = `[user]
	email = you@time.agency
	name = You
[core]
	fsync = none
	pager = cat
[init]
	defaultBranch = main
[commit]
	gpgsign = false
[advice]
	defaultBranchName = false
	detachedHead = false
[pull]
	rebase = false
[receive]
	denyCurrentBranch = ignore
`;

const shellRc = String.raw`PS1='$ '
PROMPT_COMMAND='printf "\033]999;ready\007"'
`;

// This coreutils build ignores -r inside a cluster such as -rf, and while
// deleting a directory it skips entries. Level scripts use `rm -rf`, so every
// bash sees a wrapper that splits flags and repeats until the tree is gone.
const rmShim = `
rm() {
  local args=() arg chars try=0
  for arg in "$@"; do
    if [[ $arg == -?* && $arg != --* ]]; then
      chars=\${arg#-}
      while [[ -n $chars ]]; do
        args+=("-\${chars:0:1}")
        chars=\${chars:1}
      done
    else
      args+=("$arg")
    fi
  done
  while [[ $try -lt 7 ]]; do
    if command rm "\${args[@]}" >/dev/null 2>&1; then
      return 0
    fi
    try=$((try + 1))
  done
  command rm "\${args[@]}"
}
file() {
  # Index levels record a passed goal with \`file -f marker\`. GNU file
  # succeeds when that list file exists, which this sandbox does not ship.
  if [[ \$1 == -f ]]; then
    [[ -f \$2 ]]
    return
  fi
  echo "file: unsupported" >&2
  return 1
}
hint() { :; }
perl() {
  # Reordering events checks the log with one Perl slurp. This sandbox has no perl.
  if [[ $1 == -0777 && $2 == '-neexit(1) if not /shoes[\\s\\S]*pants[\\s\\S]*underwear/' ]]; then
    local text
    text=$(cat)
    text=\${text//$'\\n'/ }
    [[ $text == *shoes*pants*underwear* ]]
    return
  fi
  echo "perl: unsupported" >&2
  return 1
}
git() {
  # This filesystem keeps a file's old size when git truncates FETCH_HEAD,
  # so the next pull appends after a run of zero bytes and then ignores it.
  if [[ $1 == pull || $1 == fetch ]]; then
    command rm -f .git/FETCH_HEAD
  fi
  # A local clone hardlinks object files, and those links do not survive here.
  # The clone keeps its refs and worktree, then every later command says the
  # commit is missing. Copy the objects instead.
  if [[ $1 == clone ]]; then
    command git clone --no-hardlinks "\${@:2}"
    return
  fi
  command git "$@"
}
`;

function textOf(output, stream) {
  const value = output?.[stream];
  if (!value) return "";
  if (typeof value.text === "function") return value.text();
  if (typeof value === "string") return value;
  return "";
}

export class Session {
  static async connect(wasmer, hooks = {}) {
    const session = new Session(wasmer, hooks);
    await session.#openSandbox();
    return session;
  }

  constructor(wasmer, hooks) {
    this.#wasmer = wasmer;
    this.#hooks = hooks;
  }

  // Later commands wait until the current one finishes, including its failure.
  async bash(script, cwd = "/workspace") {
    const run = this.#queue.then(() => this.#bash(script, cwd));
    this.#queue = run.then(() => {}, () => {});
    return run;
  }

  async load(level) {
    // The next level gets a new runtime. One browser instance otherwise keeps
    // every command's WebAssembly memory until a later level cannot allocate.
    if (this.#level) await this.#reopen();
    this.#level = level;
    const root = "/workspace/repos";
    await this.bash(`rm -rf '${root}'`, "/workspace");
    for (const repo of level.repos) {
      const dir = `${root}/${repo}`;
      await this.bash(`mkdir -p '${dir}'`, "/workspace");
      await this.bash("git init && git symbolic-ref HEAD refs/heads/main", dir);
    }
    for (const repo of level.repos) {
      const dir = `${root}/${repo}`;
      for (const other of level.repos) {
        if (other === repo) continue;
        await this.bash(`git remote add ${other} '${root}/${other}'`, dir);
      }
    }
    for (const repo of level.repos) {
      const setup = repoScript(level.fields, "setup", repo);
      if (!setup) continue;
      const result = await this.bash(setup, `${root}/${repo}`);
      if (result.exitCode !== 0) {
        throw new Error(`Setup for ${repo} failed (${result.exitCode}): ${result.stderr || result.stdout}`);
      }
    }
    return {
      id: level.id,
      title: level.title,
      description: level.description,
      cards: level.cards,
      repos: level.repos,
    };
  }

  async run(repo, script, options = {}) {
    const command = options.commitMessage == null ? script : withCommitMessage(script, options.commitMessage);
    const dir = this.#repoDir(repo);
    if (options.sequence == null && /^git rebase -i\s+\S+$/.test(command.trim())) {
      return this.#rebasePlan(dir, command.trim());
    }
    const body = options.sequence == null ? command : withSequence(command, options.sequence);
    return this.bash(body, dir);
  }

  // Interactive rebase opens a plan instead of running. This git build calls the
  // sequence editor with a literal "$@" , so the plan is the todo file it
  // already created. Exiting 1 leaves the repository unchanged.
  async #rebasePlan(dir, command) {
    const editor = "cp .git/rebase-merge/git-rebase-todo /workspace/.rebase-todo\nexit 1\n";
    await this.bash(
      [
        `printf '%s' '${encodeBase64(editor)}' | base64 -d > /workspace/sequence-editor`,
        `export GIT_SEQUENCE_EDITOR='sh /workspace/sequence-editor'`,
        command,
      ].join("\n"),
      dir,
    );
    const todo = await this.bash("cat /workspace/.rebase-todo 2>/dev/null || true", dir);
    if (!todo.stdout.trim()) {
      return { exitCode: 1, stdout: "", stderr: "The rebase plan did not open.", command };
    }
    return { exitCode: 0, stdout: "", stderr: "", sequence: todo.stdout, command };
  }

  async readFile(repo, path) {
    assertGuestPath(path);
    const result = await this.bash(`cat -- '${path}'`, this.#repoDir(repo));
    if (result.exitCode !== 0) {
      throw new Error(`Could not read ${path}: ${result.stderr || result.stdout}`);
    }
    return result.stdout;
  }

  async writeFile(repo, path, text) {
    assertGuestPath(path);
    const body = text.length > 0 && !text.endsWith("\n") ? `${text}\n` : text;
    const result = await this.bash(
      `printf '%s' '${encodeBase64(body)}' | base64 -d > '${path}'`,
      this.#repoDir(repo),
    );
    if (result.exitCode !== 0) {
      throw new Error(`Could not write ${path}: ${result.stderr || result.stdout}`);
    }
  }

  // Interactive bash for the page. Its prompt emits an OSC the page uses to
  // know the shell is idle, which is when snapshot() may run.
  async spawnShell(cwd) {
    const run = this.#queue.then(() => this.#spawnShell(cwd));
    this.#queue = run.then(() => {}, () => {});
    return run;
  }

  async snapshot() {
    const level = this.#requireLevel();
    const wins = await this.wins();
    const repos = {};
    for (const repo of level.repos) {
      const collected = await this.bash(collectScriptSource(), this.#repoDir(repo));
      if (collected.exitCode !== 0) {
        throw new Error(`Snapshot for ${repo} failed (${collected.exitCode}): ${collected.stderr || collected.stdout}`);
      }
      const parsed = parseSnapshot(collected.stdout);
      const ids = parsed.objects
        .filter((object) => object.type === "commit" || object.type === "tag")
        .map((object) => object.id);
      let commits = [];
      if (ids.length > 0) {
        const batch = await this.bash(`git cat-file --batch << 'END'\n${ids.join("\n")}\nEND`, this.#repoDir(repo));
        if (batch.exitCode !== 0) {
          throw new Error(`cat-file for ${repo} failed (${batch.exitCode}): ${batch.stderr || batch.stdout}`);
        }
        commits = commitsFrom(parsed.objects, parseBatch(batch.stdout));
      }
      repos[repo] = { refs: parsed.refs, commits, objects: parsed.objects, files: parsed.files };
    }
    return { wins, repos };
  }

  async wins() {
    const level = this.#requireLevel();
    const results = [];
    for (const repo of level.repos) {
      const actions = repoScript(level.fields, "actions", repo);
      if (actions) {
        await this.bash(
          `function actions { ${actions}\n}; actions >/dev/null 2>/dev/null || true`,
          this.#repoDir(repo),
        );
      }
      for (const check of winChecks(repoScript(level.fields, "win", repo))) {
        const result = await this.bash(
          `function win { ${check.script}\n}; win >/dev/null 2>/dev/null && echo yes || echo no`,
          this.#repoDir(repo),
        );
        results.push({
          repo,
          description: check.description,
          passed: result.stdout.trim() === "yes",
        });
      }
    }
    return results;
  }

  async close() {
    if (this.#shell) {
      await this.#shell.kill();
      this.#shell = null;
    }
    await this.#queue;
    await this.#sandbox?.close();
    this.#sandbox = null;
    await this.#wasmer.close();
  }

  async #openSandbox() {
    this.#sandbox = await this.#wasmer.sandboxes.create({
      packages,
      onPackageProgress: this.#hooks.onProgress,
      env: {
        HOME: "/workspace",
        PATH: "/usr/local/bin:/usr/local/sbin:/usr/bin:/usr/sbin:/bin:/sbin:.",
        USER: "wasmer",
        LOGNAME: "wasmer",
        TERM: "xterm-256color",
        GIT_CONFIG_GLOBAL: "/workspace/.gitconfig",
        GIT_EDITOR: "true",
        GIT_PAGER: "cat",
        PAGER: "cat",
      },
    });
    await this.#writeGitconfig();
  }

  async #reopen() {
    await this.#queue;
    if (this.#shell) {
      await this.#shell.kill();
      this.#shell = null;
    }
    await this.#sandbox.close();
    this.#sandbox = null;
    if (this.#hooks.createClient) {
      await this.#wasmer.close();
      this.#wasmer = this.#hooks.createClient();
      await this.#wasmer.ready();
    }
    await this.#openSandbox();
  }

  async #writeGitconfig() {
    const result = await this.bash(`cat > /workspace/.gitconfig << 'END'\n${gitconfig}END`);
    if (result.exitCode !== 0) {
      throw new Error(`Could not write gitconfig: ${result.stderr || result.stdout}`);
    }
  }

  async #spawnShell(cwd) {
    const wrote = await this.#bash(`cat > /workspace/.bashrc << 'END'\n${shellRc}END`);
    if (wrote.exitCode !== 0) {
      throw new Error(`Could not write bashrc: ${wrote.stderr || wrote.stdout}`);
    }
    const proc = await this.#sandbox.command(
      "bash",
      ["--noprofile", "--rcfile", "/workspace/.bashrc", "-i"],
      { cwd },
    ).spawn({
      terminal: { columns: 80, rows: 24 },
      outputBytes: 1024 * 1024,
    });
    if (!proc.stdin || !proc.stdout) throw new Error("The shell did not expose a terminal");
    this.#shell = proc;
    return proc;
  }

  async #bash(script, cwd) {
    const result = await this.#sandbox.command("bash", ["-c", `${rmShim}\n${script}`], { cwd }).run({ check: false });
    return {
      exitCode: result.exitCode,
      stdout: textOf(result, "stdout"),
      stderr: textOf(result, "stderr"),
    };
  }

  #repoDir(repo) {
    const level = this.#requireLevel();
    if (!level.repos.includes(repo)) throw new Error(`This level has no repo named ${repo}`);
    return `/workspace/repos/${repo}`;
  }

  #requireLevel() {
    if (!this.#level) throw new Error("Load a level before running commands");
    return this.#level;
  }

  #wasmer;
  #hooks;
  #sandbox = null;
  #shell = null;
  #level = null;
  #queue = Promise.resolve();
}

function assertGuestPath(path) {
  if (typeof path !== "string" || !/^[\w./-]+$/.test(path)) {
    throw new Error(`Refusing path ${path}`);
  }
  if (path.split("/").some((part) => part === "" || part === "." || part === "..")) {
    throw new Error(`Refusing path ${path}`);
  }
}

function encodeBase64(text) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// git commit without -m runs $GIT_EDITOR, then reads .git/COMMIT_EDITMSG.
// This build passes the editor a literal "$@" instead of the path, so the
// description is written straight to the message file. The card command stays intact.
function withSequence(script, text) {
  const body = text.endsWith("\n") ? text : `${text}\n`;
  const editor = "cat /workspace/.rebase-todo > .git/rebase-merge/git-rebase-todo\n";
  return [
    `printf '%s' '${encodeBase64(body)}' | base64 -d > /workspace/.rebase-todo`,
    `printf '%s' '${encodeBase64(editor)}' | base64 -d > /workspace/sequence-editor`,
    `export GIT_SEQUENCE_EDITOR='sh /workspace/sequence-editor'`,
    script,
  ].join("\n");
}

function withCommitMessage(script, message) {
  const body = message.endsWith("\n") ? message : `${message}\n`;
  const editor = "cat /workspace/.commit-msg > .git/COMMIT_EDITMSG\n";
  return [
    `printf '%s' '${encodeBase64(body)}' | base64 -d > /workspace/.commit-msg`,
    `printf '%s' '${encodeBase64(editor)}' | base64 -d > /workspace/edit-commit`,
    `export GIT_EDITOR='sh /workspace/edit-commit'`,
    script,
  ].join("\n");
}
