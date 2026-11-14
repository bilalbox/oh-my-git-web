import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { Wasmer } from "@wasmer/sdk/browser";
import { levelFromText } from "../src/level-format.mjs";
import { prepareCard } from "../src/cards.mjs";
import { chaptersThrough, levelIds as idsInChapter, parseSequence } from "../src/sequence.mjs";
import { Session } from "../src/session.mjs";
import { progressKey, readProgress, rememberSolve } from "../src/progress.mjs";
import { clearPlaced, renderCards, renderFiles, renderRepos } from "./board.js";
import { createEditor, takeKeys } from "./line-edit.mjs";
import { completionsFor } from "./complete.mjs";
import { renderLevelList } from "./picker.js";

const title = document.querySelector("#title");
const description = document.querySelector("#description");
const cli = document.querySelector("#cli");
const congrats = document.querySelector("#congrats");
const next = document.querySelector("#next");
const status = document.querySelector("#status");
const wins = document.querySelector("#wins");
const reposHost = document.querySelector("#repos");
const filesHost = document.querySelector("#files");
const cardSection = document.querySelector("#card-section");
const cardsHost = document.querySelector("#cards");
const fileForm = document.querySelector("#file-form");
const fileText = document.querySelector("#file-text");
const editorHeading = document.querySelector("#editor-heading");
const commitForm = document.querySelector("#commit-form");
const commitLabel = commitForm.querySelector("label");
const commitInput = document.querySelector("#commit-message");
const commitSubmit = commitForm.querySelector("button[type='submit']");
const commitCancel = document.querySelector("#commit-cancel");
const termHost = document.querySelector("#term");
const termHeading = document.querySelector(".terminal-wrap h2");
const completions = document.querySelector("#completions");
const play = document.querySelector("#play");
const workspace = document.querySelector("#workspace");
const missionToggle = document.querySelector("#mission-toggle");
const missionCollapse = document.querySelector("#mission-collapse");
const missionTally = document.querySelector("#mission-tally");
const cardsToggle = document.querySelector("#cards-toggle");
const cardHint = document.querySelector("#card-hint");
const picker = document.querySelector("#picker");
const levelList = document.querySelector("#level-list");
const boot = document.querySelector("#boot");
const bootMessage = document.querySelector("#boot-message");
const bootPercent = document.querySelector("#boot-percent");
const bootMeter = document.querySelector("#boot-meter");
const bootBar = document.querySelector("#boot-bar");
const page = document.querySelector("main");

const idle = "Play a card, edit a file, or type a command.";
const defaultCardHint = "Drag a card onto a file, commit, or branch, or click to play.";
const storageKey = "oh-my-git-level";
const themeKey = "oh-my-git-theme";
const themeButtons = document.querySelectorAll(".theme");
const schemeMeta = document.querySelector('meta[name="color-scheme"]');

function storedScheme() {
  try {
    const saved = localStorage.getItem(themeKey);
    return saved === "dark" || saved === "light" ? saved : null;
  } catch (error) {
    return null;
  }
}

function systemDark() {
  return matchMedia("(prefers-color-scheme: dark)").matches;
}

function renderedDark() {
  if (schemeMeta?.content === "dark") return true;
  if (schemeMeta?.content === "light") return false;
  return systemDark();
}

function applyTheme() {
  const dark = renderedDark();
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? "#16130f" : "#f4efe6";
  term.options.theme = {
    background: dark ? "#0c0a08" : "#1c1915",
    foreground: "#f3eee4",
    cursor: "#f3eee4",
  };
}

function setScheme(content) {
  if (schemeMeta) schemeMeta.content = content;
  applyTheme();
}

function toggleTheme() {
  const targetDark = !renderedDark();
  const content = targetDark === systemDark() ? "light dark" : (targetDark ? "dark" : "light");
  try {
    if (content === "light dark") localStorage.removeItem(themeKey);
    else localStorage.setItem(themeKey, content);
  } catch (error) {}
  setScheme(content);
}

const term = new Terminal({
  cursorBlink: true,
  fontFamily: "ui-monospace, monospace",
  fontSize: 14,
  theme: { background: "#1c1915", foreground: "#f4efe6", cursor: "#f4efe6" },
});
const fit = new FitAddon();
term.loadAddon(fit);
term.open(termHost);
term.textarea?.setAttribute("aria-controls", "completions");
term.textarea?.setAttribute("aria-autocomplete", "list");
term.textarea?.setAttribute("aria-expanded", "false");
term.attachCustomKeyEventHandler((event) => {
  if (event.type === "keydown" && event.key === "Tab" && event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey) {
    return false;
  }
  return true;
});
fit.fit();
let fitFrame = 0;
const scheduleFit = () => {
  if (fitFrame) return;
  fitFrame = requestAnimationFrame(() => {
    fitFrame = 0;
    if (!play.hidden) fit.fit();
  });
};
window.addEventListener("resize", scheduleFit);
if (typeof ResizeObserver !== "undefined") {
  new ResizeObserver(scheduleFit).observe(termHost);
}
applyTheme();
for (const button of themeButtons) button.addEventListener("click", toggleTheme);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  if (storedScheme()) return;
  applyTheme();
});
window.addEventListener("storage", (event) => {
  if (event.key !== themeKey) return;
  setScheme(event.newValue === "dark" || event.newValue === "light" ? event.newValue : "light dark");
});

let session;
let catalog;
let levels = [];
let chapters = [];
let currentId = "";
let usedCards = false;
let currentLevel = null;
let home = "yours";
const editor = createEditor();
let drawn = 0;
let anchorX = 2;
let inputReady = false;
let keyTail = "";
let worktreeFiles = [];
let suggestions = [];
let busy = false;
let pending = "";
let openPath = null;
let pendingCard = null;
let pendingSequence = null;
let pendingTarget = null;
let fileList = [];
let editorDirty = false;
let booting = true;
let bootGeneration = 0;
let coverLevel = false;

function setStatus(text, kind = "info") {
  status.textContent = text;
  status.title = text;
  status.dataset.kind = kind;
}

function setEditorTitle(label) {
  editorHeading.textContent = label || "Editor";
}

function setMissionOpen(open) {
  workspace.dataset.mission = open ? "open" : "closed";
  missionToggle.setAttribute("aria-expanded", open ? "true" : "false");
  missionCollapse.setAttribute("aria-expanded", open ? "true" : "false");
  scheduleFit();
}

function setCardsOpen(open) {
  cardSection.dataset.collapsed = open ? "no" : "yes";
  cardsToggle.setAttribute("aria-expanded", open ? "true" : "false");
  cardsToggle.textContent = open ? "Hide cards" : "Show cards";
  scheduleFit();
}

function updateMissionTally(checks) {
  if (!checks || checks.length === 0) {
    missionTally.hidden = true;
    missionTally.textContent = "";
    delete missionTally.dataset.all;
    return;
  }
  const passed = checks.filter((check) => check.passed).length;
  missionTally.hidden = false;
  missionTally.textContent = `${passed}/${checks.length}`;
  missionTally.dataset.all = passed === checks.length ? "yes" : "no";
}

function inspectCard(card) {
  if (!card) {
    cardHint.textContent = defaultCardHint;
    delete cardHint.dataset.active;
    return;
  }
  cardHint.textContent = card.description || card.command;
  cardHint.dataset.active = "yes";
}

function setBoot(text, kind = "info") {
  if (!booting) return;
  bootMessage.textContent = text;
  boot.dataset.kind = kind;
}

function setBootProgress(percent) {
  if (!booting) return;
  if (percent == null || Number.isNaN(percent)) {
    bootPercent.textContent = "";
    bootMeter.dataset.empty = "yes";
    bootBar.style.transform = "scaleX(0)";
    return;
  }
  const value = Math.max(0, Math.min(100, percent));
  bootPercent.textContent = `${Math.round(value)}%`;
  delete bootMeter.dataset.empty;
  bootBar.style.transform = `scaleX(${value / 100})`;
}

function showBoot(text, kind = "info") {
  bootGeneration += 1;
  booting = true;
  coverLevel = true;
  boot.style.transition = "none";
  boot.classList.remove("is-done");
  boot.hidden = false;
  boot.inert = false;
  void boot.offsetWidth;
  boot.style.transition = "";
  page.setAttribute("inert", "");
  page.setAttribute("aria-hidden", "true");
  setBoot(text, kind);
  setBootProgress(null);
}

function finishBoot() {
  if (!booting) return;
  booting = false;
  const generation = bootGeneration;
  const reveal = () => {
    if (generation !== bootGeneration || boot.hidden) return;
    boot.hidden = true;
    boot.inert = true;
    page.removeAttribute("inert");
    page.removeAttribute("aria-hidden");
  };
  boot.inert = true;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
    reveal();
    return;
  }
  const onEnd = (event) => {
    if (event.target !== boot || event.propertyName !== "opacity") return;
    boot.removeEventListener("transitionend", onEnd);
    reveal();
  };
  boot.addEventListener("transitionend", onEnd);
  boot.classList.add("is-done");
  setTimeout(() => {
    boot.removeEventListener("transitionend", onEnd);
    reveal();
  }, 400);
}

function fileState(file) {
  if (file.indexHashes.length > 1) return "conflict";
  const indexHash = file.indexHashes.length === 1 ? file.indexHashes[0] : "";
  if (!file.worktree && (file.headHash || indexHash)) return "deleted";
  if (file.worktree && indexHash && file.worktreeHash !== indexHash) return "changed";
  if (file.worktree && !indexHash && !file.headHash) return "new";
  if (indexHash && indexHash !== file.headHash) return "staged";
  if (file.worktree && file.headHash && file.worktreeHash !== file.headHash) return "changed";
  return "same";
}

function fileRows(repo) {
  return repo.files
    .filter((file) => file.worktree || file.headHash || file.indexHashes.length > 0)
    .map((file) => ({
      path: file.path,
      state: fileState(file),
    }))
    .sort((a, b) => {
      const aDot = a.path.startsWith(".");
      const bDot = b.path.startsWith(".");
      if (aDot !== bDot) return aDot ? 1 : -1;
      return a.path.localeCompare(b.path);
    });
}

function render(shot) {
  const several = Object.keys(shot.repos).length > 1;
  wins.replaceChildren(...shot.wins.map((check) => {
    const item = document.createElement("li");
    item.dataset.passed = check.passed ? "yes" : "no";
    item.dataset.repo = check.repo;
    item.textContent = several ? `${check.repo}: ${check.description}` : check.description;
    return item;
  }));
  const order = currentLevel.repos.filter((name) => shot.repos[name]);
  renderRepos(reposHost, shot.repos, order, chooseGraph, insertAtPrompt, home);
  const repo = shot.repos[home];
  worktreeFiles = (repo?.files ?? []).filter((file) => file.worktree).map((file) => file.path);
  fileList = repo ? fileRows(repo) : [];
  if (openPath && !fileList.some((file) => file.path === openPath)) {
    openPath = null;
    fileForm.hidden = true;
    setEditorTitle(null);
  }
  renderFiles(filesHost, fileList, { selected: openPath, onOpen: (path) => chooseFile(path) });
  updateMissionTally(shot.wins);
  const solved = shot.wins.length > 0 && shot.wins.every((check) => check.passed);
  const last = levels.indexOf(currentId) === levels.length - 1;
  description.hidden = solved;
  cli.hidden = solved || cli.textContent === "";
  congrats.hidden = !solved;
  next.hidden = !solved || last;
  next.disabled = busy;
  if (solved) setStatus(noteSolve().cli.includes(currentId) ? "Level solved. Command-line badge earned." : "Level solved.");
  return solved;
}

function noteSolve() {
  const current = readProgress(localStorage.getItem(progressKey));
  const nextProgress = rememberSolve(current, currentId, usedCards);
  if (nextProgress.solved !== current.solved || nextProgress.cli !== current.cli) {
    localStorage.setItem(progressKey, JSON.stringify(nextProgress));
  }
  return nextProgress;
}

function showPlay() {
  const returnFocus = !picker.hidden;
  picker.hidden = true;
  play.hidden = false;
  fit.fit();
  if (returnFocus) document.querySelector("#levels-open").focus();
}

function showPicker() {
  renderLevelList(levelList, chapters, currentId, readProgress(localStorage.getItem(progressKey)), (id) => {
    showPlay();
    if (id !== currentId) void showLevel(id);
  });
  play.hidden = true;
  picker.hidden = false;
  document.querySelector("#levels-close").focus();
}

async function paint() {
  const solved = render(await session.snapshot());
  const path = openPath;
  if (path && !editorDirty) {
    const text = await session.readFile(home, path);
    if (path === openPath && !editorDirty) fileText.value = text;
  }
  return solved;
}

function writeBlock(text) {
  if (!text) return;
  const normalized = text.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n");
  term.write(normalized.endsWith("\r\n") ? normalized : `${normalized}\r\n`);
}

function cursorCell(index) {
  const cols = Math.max(1, term.cols);
  const offset = anchorX + index;
  return { row: Math.floor(offset / cols), col: offset % cols };
}

function moveBetween(from, to) {
  const start = cursorCell(from);
  const end = cursorCell(to);
  let out = "";
  const dy = end.row - start.row;
  if (dy > 0) out += `\x1b[${dy}B`;
  else if (dy < 0) out += `\x1b[${-dy}A`;
  const dx = end.col - start.col;
  if (dx > 0) out += `\x1b[${dx}C`;
  else if (dx < 0) out += `\x1b[${-dx}D`;
  return out;
}

function paintInput() {
  const seq = `${moveBetween(drawn, 0)}\x1b[J${editor.line}${moveBetween(editor.line.length, editor.cursor)}`;
  drawn = editor.cursor;
  term.write(seq);
}

function showPrompt(prefix = "") {
  editor.clear();
  drawn = 0;
  inputReady = false;
  term.write(`${prefix}$ `, () => {
    anchorX = term.buffer.active.cursorX;
    inputReady = true;
    if (!keyTail) return;
    const rest = keyTail;
    keyTail = "";
    handle(rest);
  });
}

function prompt() {
  showPrompt("\r\n");
}

async function occupy(fn) {
  if (busy) return;
  busy = true;
  document.body.dataset.busy = "yes";
  document.body.setAttribute("aria-busy", "true");
  try {
    await fn();
  } catch (error) {
    writeBlock(error.message);
    setStatus(error.message, "error");
  } finally {
    busy = false;
    delete document.body.dataset.busy;
    document.body.removeAttribute("aria-busy");
    next.disabled = false;
    if (pending) {
      const rest = pending;
      pending = "";
      handle(rest);
    }
  }
}

function showCommand(script) {
  const prefix = editor.line.length > 0 ? `${moveBetween(drawn, editor.line.length)}^C\r\n$ ` : "";
  editor.clear();
  drawn = 0;
  inputReady = false;
  hideCompletions();
  term.write(`${prefix}${script}\r\n`);
}

function scrub(text) {
  return text
    .replaceAll(/\u001b\[[0-9;]*[A-Za-z]/g, "")
    .replaceAll("hint: Waiting for your editor to close the file...", "")
    .replaceAll("\r", "");
}

function closePlan() {
  if (!pendingSequence) return;
  pendingSequence = null;
  if (fileText.getAttribute("aria-label") === "Rebase plan") {
    fileForm.hidden = true;
    fileText.value = "";
    setEditorTitle(null);
  }
}

async function afterCommand(result) {
  writeBlock(scrub(result.stdout));
  writeBlock(scrub(result.stderr));
  if (result.sequence) {
    pendingSequence = result.command;
    openPath = null;
    editorDirty = false;
    fileForm.hidden = false;
    fileText.value = result.sequence.endsWith("\n") ? result.sequence : `${result.sequence}\n`;
    fileText.setAttribute("aria-label", "Rebase plan");
    setEditorTitle("Rebase plan");
    fileText.focus();
    setStatus("Reorder the lines, then save.");
    prompt();
    return;
  }
  const solved = await paint();
  if (result.exitCode !== 0) {
    const detail = scrub(result.stderr || result.stdout).trim();
    setStatus(detail || `Command exited ${result.exitCode}`, "error");
  } else if (!solved) {
    setStatus(idle);
  }
  prompt();
}

function handFor(level) {
  return level.cards.map((id) => {
    const card = catalog.get(id);
    const command = card?.command ?? "";
    return {
      id,
      command,
      description: card?.description ?? "",
      playable: command !== "" && prepareCard(command).playable,
    };
  });
}

function aimHint(needs) {
  if (needs === "file") return "Choose a file.";
  if (needs === "commit") return "Choose a commit.";
  if (needs === "ref") return "Choose a branch.";
  if (needs === "checkout") return "Choose a commit, a branch, or a file.";
  if (needs === "commit-and-file") return pendingTarget ? "Choose a file." : "Choose a commit or a branch.";
  if (needs === "remote") return "Choose another repository.";
  return "Choose a commit or a branch.";
}

function markArmed(command) {
  const needs = command ? prepareCard(command).needs : null;
  for (const button of cardsHost.querySelectorAll("button")) {
    button.setAttribute("aria-pressed", button.dataset.command === command ? "true" : "false");
  }
  const fileArmed = needs === "file" || needs === "checkout" || (needs === "commit-and-file" && pendingTarget);
  const graphArmed = needs === "commit" || needs === "ref" || needs === "either" || needs === "checkout" || (needs === "commit-and-file" && !pendingTarget);
  filesHost.dataset.armed = fileArmed ? "yes" : "no";
  reposHost.dataset.armed = needs === "remote" ? "remote" : graphArmed ? (needs === "commit" || needs === "ref" ? needs : "either") : "no";
}

function runCard(script, options) {
  void occupy(async () => {
    usedCards = true;
    showCommand(script);
    await afterCommand(await session.run(home, script, options));
  });
}

function dropCard(card, target) {
  if (busy) return;
  const needs = prepareCard(card.command).needs;
  const continuing = pendingCard === card.command && pendingTarget != null;
  if (target.kind === "file") {
    if (needs !== "file" && needs !== "checkout" && !(needs === "commit-and-file" && continuing)) return;
  } else if (target.kind === "remote") {
    if (needs !== "remote") return;
  } else if (needs !== "commit" && needs !== "ref" && needs !== "either" && needs !== "checkout" && needs !== "commit-and-file") {
    return;
  }
  const previous = pendingCard;
  const previousTarget = pendingTarget;
  closePlan();
  pendingCard = card.command;
  if (target.kind !== "file") pendingTarget = null;
  markArmed(card.command);
  if (target.kind === "file") chooseFile(target.path);
  else chooseGraph(target.repo, target);
  if (pendingCard !== card.command || pendingTarget != null) return;
  pendingCard = previous;
  pendingTarget = previousTarget;
  markArmed(pendingCard);
}

function playCard(card) {
  if (busy) return;
  closePlan();
  const plan = prepareCard(card.command);
  if (!plan.playable) return;
  if (plan.needs === "file" || plan.needs === "commit" || plan.needs === "ref" || plan.needs === "either" || plan.needs === "checkout" || plan.needs === "commit-and-file" || plan.needs === "remote") {
    const arming = pendingCard !== card.command;
    pendingTarget = null;
    pendingCard = arming ? card.command : null;
    commitForm.hidden = true;
    markArmed(pendingCard);
    setStatus(arming ? aimHint(plan.needs) : idle);
    return;
  }
  markArmed(null);
  if (plan.needs) {
    pendingCard = card.command;
    commitLabel.textContent = plan.needs === "message" ? "Description of what changed" : "Text for this card";
    commitSubmit.textContent = plan.needs === "message" ? "Make the commit" : "Play card";
    commitForm.hidden = false;
    commitInput.value = "";
    commitInput.focus();
    return;
  }
  runCard(plan.script);
}

function startingId(ids) {
  const hash = decodeURIComponent(location.hash.replace(/^#/, ""));
  if (ids.includes(hash)) return hash;
  const saved = localStorage.getItem(storageKey);
  if (saved && ids.includes(saved)) return saved;
  return ids[0];
}

async function showLevel(id) {
  if (busy) return;
  showBoot("Setting up the level…");
  showPlay();
  await occupy(async () => {
    const response = await fetch(`/levels/${id}`);
    if (!response.ok) throw new Error(`Could not load ${id} (${response.status})`);
    const level = levelFromText(id, await response.text());
    currentId = id;
    currentLevel = level;
    localStorage.setItem(storageKey, id);
    history.replaceState(null, "", `#${id}`);
    document.title = `${level.title} · Oh My Git!`;
    title.textContent = level.title;
    description.textContent = level.description;
    description.hidden = false;
    cli.textContent = level.cli;
    cli.hidden = level.cli === "";
    congrats.textContent = level.congrats;
    congrats.hidden = true;
    next.hidden = true;
    openPath = null;
    editorDirty = false;
    pendingSequence = null;
    pendingTarget = null;
    fileForm.hidden = true;
    commitForm.hidden = true;
    pendingCard = null;
    usedCards = false;
    clearPlaced();
    filesHost.dataset.armed = "no";
    reposHost.dataset.armed = "no";
    editor.clear();
    drawn = 0;
    hideCompletions();
    setEditorTitle(null);
    setMissionOpen(true);
    inspectCard(null);
    home = level.repos.includes("yours") ? "yours" : level.repos[0];
    termHeading.textContent = home;
    cardSection.hidden = level.cards.length === 0;
    renderCards(cardsHost, handFor(level), {
      onPlay: playCard,
      onDrop: dropCard,
      onDragStart: (card) => markArmed(card.command),
      onDragEnd: () => markArmed(pendingCard),
      onInspect: inspectCard,
    });
    term.reset();
    setStatus("Setting up the level…");
    await session.load(level);
    const solved = render(await session.snapshot());
    showPrompt();
    if (!solved) setStatus(idle);
  });
  finishBoot();
}

function chooseGraph(repo, target) {
  if (busy || !pendingCard) return;
  const needs = prepareCard(pendingCard).needs;
  if (target.kind === "remote") {
    if (needs !== "remote") return;
    const plan = prepareCard(pendingCard, target.name);
    if (!plan.script) return;
    pendingCard = null;
    pendingTarget = null;
    markArmed(null);
    runCard(plan.script);
    return;
  }
  if (repo !== home) return;
  if (needs === "commit-and-file") {
    if (target.kind !== "commit" && target.kind !== "ref") return;
    pendingTarget = target;
    markArmed(pendingCard);
    setStatus("Choose a file.");
    return;
  }
  if (needs !== "commit" && needs !== "ref" && needs !== "either" && needs !== "checkout") return;
  if (needs === "commit" && target.kind !== "commit") return;
  if (needs === "ref" && target.kind !== "ref") return;
  const plan = prepareCard(pendingCard, target);
  if (!plan.script) return;
  pendingCard = null;
  pendingTarget = null;
  markArmed(null);
  runCard(plan.script);
}

function chooseFile(path) {
  if (busy) return;
  closePlan();
  const needs = pendingCard ? prepareCard(pendingCard).needs : null;
  if (needs === "file" || needs === "checkout") {
    const plan = prepareCard(pendingCard, path);
    pendingCard = null;
    pendingTarget = null;
    markArmed(null);
    if (plan.script) runCard(plan.script);
    return;
  }
  if (needs === "commit-and-file") {
    if (!pendingTarget) {
      setStatus("Choose a commit or a branch.");
      return;
    }
    const plan = prepareCard(pendingCard, { graph: pendingTarget, file: path });
    pendingCard = null;
    pendingTarget = null;
    markArmed(null);
    if (plan.script) runCard(plan.script);
    return;
  }
  void openFile(path);
}

async function openFile(path) {
  if (fileList.find((file) => file.path === path)?.state === "deleted") {
    setStatus("That file is deleted. Check it out to bring it back.");
    return;
  }
  await occupy(async () => {
    const text = await session.readFile(home, path);
    if (editorDirty) return;
    openPath = path;
    editorDirty = false;
    fileForm.hidden = false;
    fileText.value = text;
    fileText.setAttribute("aria-label", path);
    setEditorTitle(path);
    fileText.focus();
    renderFiles(filesHost, fileList, { selected: openPath, onOpen: (nextPath) => chooseFile(nextPath) });
  });
}

async function main() {
  if (!crossOriginIsolated) {
    const message = "This page is not cross-origin isolated, so the shell cannot start.";
    setStatus(message, "error");
    setBoot(message, "error");
    return;
  }
  const [sequenceResponse, cardResponse] = await Promise.all([
    fetch("/levels/sequence"),
    fetch("/cards.json"),
  ]);
  if (!sequenceResponse.ok) throw new Error(`Could not load the chapter list (${sequenceResponse.status})`);
  if (!cardResponse.ok) throw new Error(`Could not load cards (${cardResponse.status})`);
  const chapterNames = chaptersThrough(parseSequence(await sequenceResponse.text()), "sandbox");
  levels = [];
  chapters = [];
  for (const name of chapterNames) {
    const chapterResponse = await fetch(`/levels/${name}/sequence`);
    if (!chapterResponse.ok) throw new Error(`Could not load ${name} (${chapterResponse.status})`);
    const ids = idsInChapter(name, parseSequence(await chapterResponse.text()));
    levels.push(...ids);
    const listed = [];
    for (const id of ids) {
      const response = await fetch(`/levels/${id}`);
      if (!response.ok) throw new Error(`Could not load ${id} (${response.status})`);
      listed.push({ id, title: levelFromText(id, await response.text()).title });
    }
    chapters.push({ name, levels: listed });
  }
  catalog = new Map((await cardResponse.json()).map((card) => [card.id, card]));

  const loading = "Loading bash and git…";
  setStatus(loading);
  setBoot(loading);
  const createClient = () => new Wasmer({ parallelism: 1 });
  const wasmer = createClient();
  await wasmer.ready();
  session = await Session.connect(wasmer, {
    createClient,
    onProgress(progress) {
      const percent = progress.download?.percent;
      setStatus(percent == null ? loading : `${loading} ${Math.round(percent)}%`);
      if (coverLevel) return;
      setBoot(loading);
      setBootProgress(percent);
    },
  });
  term.onData(handle);
  await showLevel(startingId(levels));
}

fileText.addEventListener("input", () => {
  editorDirty = true;
});

fileForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (busy) return;
  if (pendingSequence) {
    const script = pendingSequence;
    const text = fileText.value;
    pendingSequence = null;
    editorDirty = false;
    fileForm.hidden = true;
    setEditorTitle(null);
    void occupy(async () => {
      showCommand(script);
      await afterCommand(await session.run(home, script, { sequence: text }));
    });
    return;
  }
  if (!openPath) return;
  const path = openPath;
  const text = fileText.value;
  editorDirty = false;
  void occupy(async () => {
    await session.writeFile(home, path, text);
    fileText.value = text.length > 0 && !text.endsWith("\n") ? `${text}\n` : text;
    const solved = await paint();
    if (!solved) setStatus(`Saved ${path}.`);
  });
});

commitForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const value = commitInput.value.trim();
  if (busy || !pendingCard || value === "") {
    commitInput.focus();
    return;
  }
  const plan = prepareCard(pendingCard, value);
  pendingCard = null;
  commitForm.hidden = true;
  commitForm.reset();
  runCard(plan.script, { commitMessage: plan.commitMessage });
});

function cancelCommitForm() {
  if (commitForm.hidden) return;
  pendingCard = null;
  commitForm.hidden = true;
  commitForm.reset();
  setStatus(idle);
}

commitCancel.addEventListener("click", cancelCommitForm);

missionToggle.addEventListener("click", () => {
  setMissionOpen(workspace.dataset.mission !== "open");
});

missionCollapse.addEventListener("click", () => {
  setMissionOpen(false);
  missionToggle.focus();
});

cardsToggle.addEventListener("click", () => {
  setCardsOpen(cardSection.dataset.collapsed === "yes");
});

document.querySelector("#levels-open").addEventListener("click", () => {
  if (busy || chapters.length === 0) return;
  showPicker();
});

document.querySelector("#levels-close").addEventListener("click", showPlay);
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (!commitForm.hidden) {
    event.preventDefault();
    cancelCommitForm();
    return;
  }
  if (picker.hidden) return;
  event.preventDefault();
  showPlay();
});

next.addEventListener("click", () => {
  const following = levels[levels.indexOf(currentId) + 1];
  if (following) void showLevel(following);
});

function hideCompletions() {
  suggestions = [];
  completions.replaceChildren();
  completions.hidden = true;
  term.textarea?.setAttribute("aria-expanded", "false");
}

function showCompletions() {
  const items = inputReady ? completionsFor(editor.line, editor.history, worktreeFiles) : [];
  suggestions = items;
  completions.replaceChildren();
  if (items.length === 0) {
    completions.hidden = true;
    term.textarea?.setAttribute("aria-expanded", "false");
    return;
  }
  items.forEach((text, index) => {
    const item = document.createElement("li");
    item.setAttribute("role", "presentation");
    const button = document.createElement("button");
    button.type = "button";
    button.tabIndex = -1;
    button.setAttribute("role", "option");
    if (index === 0) button.setAttribute("aria-selected", "true");
    button.textContent = text;
    button.addEventListener("mousedown", (event) => event.preventDefault());
    button.addEventListener("click", () => acceptSuggestion(index));
    item.append(button);
    completions.append(item);
  });
  completions.hidden = false;
  term.textarea?.setAttribute("aria-expanded", "true");
}

function acceptSuggestion(index) {
  const text = suggestions[index];
  if (!text || busy || !inputReady) return;
  editor.replace(text);
  paintInput();
  showCompletions();
}

function insertAtPrompt(text) {
  if (busy || !inputReady || typeof text !== "string" || text === "") return;
  if (editor.insert(text) === "redraw") paintInput();
  showCompletions();
}

function submitLine() {
  const command = editor.submit();
  hideCompletions();
  term.write(`${moveBetween(drawn, command.length)}\r\n`);
  drawn = 0;
  inputReady = false;
  if (!command.trim()) {
    showPrompt("\r\n");
    return;
  }
  void occupy(async () => {
    closePlan();
    await afterCommand(await session.run(home, command));
  });
}

function cancelTyping() {
  const seq = `${moveBetween(drawn, editor.line.length)}^C`;
  editor.clear();
  drawn = 0;
  inputReady = false;
  hideCompletions();
  term.write(seq, () => showPrompt("\r\n"));
}

function handle(data) {
  if (busy) {
    pending += data;
    return;
  }
  if (!inputReady) {
    keyTail += data;
    return;
  }
  const parsed = takeKeys(`${keyTail}${data}`);
  keyTail = parsed.rest;
  let typed = "";
  const flush = () => {
    if (!typed) return;
    editor.type(typed);
    typed = "";
    paintInput();
  };
  for (let index = 0; index < parsed.keys.length; index += 1) {
    const key = parsed.keys[index];
    if (key >= " " && key !== "\u007f") {
      typed += key;
      continue;
    }
    flush();
    if (key === "\t") {
      acceptSuggestion(0);
      continue;
    }
    if (key === "\r" || key === "\n") {
      const rest = parsed.keys.slice(index + 1).join("");
      pending = `${rest}${keyTail}${pending}`;
      keyTail = "";
      submitLine();
      return;
    }
    if (key === "\u0003") {
      keyTail = `${parsed.keys.slice(index + 1).join("")}${keyTail}`;
      cancelTyping();
      return;
    }
    if (editor.press(key) === "redraw") paintInput();
  }
  flush();
  showCompletions();
}

main().catch((error) => {
  console.error(error);
  setStatus(error.message, "error");
  setBoot(error.message, "error");
  setBootProgress(null);
});
