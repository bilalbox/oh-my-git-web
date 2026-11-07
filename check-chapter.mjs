// Plays through the sandbox the way the page does: one sandbox, levels in sequence order.

import fs from "node:fs";
import path from "node:path";
import { openSession } from "./src/node.mjs";
import { levelsRoot, readLevel } from "./src/level.mjs";
import { chaptersThrough, levelIds, parseSequence } from "./src/sequence.mjs";

function fail(id, shot, extra = "") {
  const lines = shot.wins.map((win) => `${win.passed ? "yes" : "no"} [${win.repo}] ${win.description}`);
  throw new Error(`${id} ${extra}\n${lines.join("\n")}`.trim());
}

function commitId(shot, prefix) {
  const commit = shot.repos.yours.commits.find((item) => item.type === "commit" && item.message.startsWith(prefix));
  if (!commit) fail("lookup", shot, `no commit ${prefix}`);
  return commit.id;
}

async function git(session, id, shot, script, options) {
  const result = await session.run("yours", script, options);
  if (result.exitCode !== 0) fail(id, shot, `${script}\n${result.stderr || result.stdout}`);
}

function messages(shot, repo) {
  return shot.repos[repo].commits.filter((item) => item.type === "commit").map((item) => item.message);
}

async function expectSandbox(session, id, shot) {
  if (id === "sandbox/empty") {
    if (messages(shot, "yours").length !== 0) fail(id, shot, "empty sandbox has commits");
    return;
  }
  if (id === "sandbox/remote") {
    if (!messages(shot, "yours").includes("Initial commit") || !messages(shot, "friend").includes("Another line")) {
      fail(id, shot, "remote sandbox is missing a commit");
    }
    const yours = await session.readFile("yours", "essay");
    const friend = await session.readFile("friend", "essay");
    if (yours !== "Line 1\n" || friend !== "Line 1\nLine 2\n") fail(id, shot, `essays\n${yours}\n${friend}`);
    return;
  }
  if (id === "sandbox/three-commits") {
    for (const message of ["The beginning", "First things first", "Who's there?"]) {
      if (!messages(shot, "yours").includes(message)) fail(id, shot, `missing ${message}`);
    }
    if (!shot.repos.yours.refs["refs/heads/not_main"]) fail(id, shot, "missing not_main");
    return;
  }
  fail(id, shot, "unknown sandbox");
}

async function play(session, id) {
  const level = readLevel(id);
  await session.load(level);
  let shot = await session.snapshot();
  if (id.startsWith("sandbox/")) {
    await expectSandbox(session, id, shot);
    console.log(`passed ${id} (${Object.keys(shot.repos).join(", ")})`);
    return;
  }
  if (shot.wins.length === 0 || shot.wins.every((win) => win.passed)) fail(id, shot, "started solved");

  if (id.endsWith("/risky")) {
    const text = await session.readFile("yours", "form.txt");
    await session.writeFile("yours", "form.txt", `${text}- Because I want the story back\n`);
  } else if (id.endsWith("/copies")) {
    const text = await session.readFile("yours", "form2_really_final.txt");
    await session.writeFile("yours", "form2_really_final.txt", `${text}- And one more copy is enough\n`);
  } else if (id.endsWith("/init") || id.endsWith("/cli")) {
    const result = await session.run("yours", "git init");
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
  } else if (id.endsWith("/commit")) {
    let result = await session.run("yours", "git add .; git commit", { commitMessage: "full" });
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
    await session.writeFile("yours", "glass", "The glass is empty.\n");
    result = await session.run("yours", "git add .; git commit", { commitMessage: "empty" });
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
  } else if (id.endsWith("/remote")) {
    let result = await session.run("yours", "git pull");
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
    const students = await session.readFile("yours", "students");
    await session.writeFile("yours", "students", `${students}- You\n`);
    result = await session.run("yours", "git add .; git commit", { commitMessage: "Added you" });
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
    result = await session.run("yours", "git push");
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
  } else if (id.endsWith("/files-delete")) {
    for (const file of ["tiny_web", "big_web", "thick_web"]) {
      const result = await session.run("yours", `rm '${file}'`);
      if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
    }
  } else if (id.endsWith("/files-add")) {
    for (const name of ["chair", "lamp"]) {
      const created = await session.run("yours", `touch '${name}'`);
      if (created.exitCode !== 0) fail(id, shot, created.stderr || created.stdout);
      await session.writeFile("yours", name, `A yellow ${name}.\n`);
    }
  } else if (id.endsWith("/checkout-commit")) {
    await git(session, id, shot, `git checkout ${commitId(shot, "Little sister does something")}`);
    await session.writeFile("yours", "piggy_bank", "This piggy bank belongs to the big sister.\nIt contains 10 coins.\n");
    await session.writeFile("yours", "little_sister", "A young girl with brown, curly hair.\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "Sisterly peace" });
  } else if (id.endsWith("/fork")) {
    await git(session, id, shot, `git checkout ${commitId(shot, "The child buys something")}`);
    await session.writeFile("yours", "cage/lion", "Looks happy. :)\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "Everyone is happy" });
  } else if (id.endsWith("/branch-create")) {
    await git(session, id, shot, `git branch birthday ${commitId(shot, "Go to the birthday")}`);
    await git(session, id, shot, `git branch concert ${commitId(shot, "Go to the concert")}`);
  } else if (id.endsWith("/grow")) {
    await git(session, id, shot, "git checkout --detach birthday");
    const birthday = await session.readFile("yours", "you");
    await session.writeFile("yours", "you", `${birthday}You stay a little longer.\n`);
    await git(session, id, shot, "git add .; git commit", { commitMessage: "Stay longer" });
    await git(session, id, shot, "git checkout concert");
    const concert = await session.readFile("yours", "you");
    await session.writeFile("yours", "you", `${concert}Encore.\n`);
    await git(session, id, shot, "git add .; git commit", { commitMessage: "Encore" });
  } else if (id.endsWith("/branch-remove")) {
    await git(session, id, shot, "git branch -D friend music ice-cream");
  } else if (id === "branches/reorder") {
    await git(session, id, shot, `git checkout baguette && git reset --hard ${commitId(shot, "You eat the baguette")}`);
    await git(session, id, shot, `git checkout coffee && git reset --hard ${commitId(shot, "You drink the coffee")}`);
    await git(session, id, shot, "git checkout donut");
    const you = await session.readFile("yours", "you");
    await session.writeFile("yours", "you", you.replace("You have a donut.", "You ate a donut."));
    await git(session, id, shot, "git add .; git commit", { commitMessage: "You eat the donut" });
  } else if (id.endsWith("/merge")) {
    await git(session, id, shot, `git merge ${commitId(shot, "You eat the baguette")}`);
    await git(session, id, shot, `git merge ${commitId(shot, "You drink the coffee")}`);
  } else if (id.endsWith("/conflict")) {
    await git(session, id, shot, "git merge pancakes");
    const conflict = await session.run("yours", "git merge muesli");
    if (conflict.exitCode === 0) fail(id, shot, "muesli merged without a conflict");
    await session.writeFile("yours", "sam", "Had blueberry pancakes and muesli for breakfast.\n\nIs at work.\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "Breakfast compromise" });
  } else if (id.endsWith("/compare")) {
    await git(session, id, shot, "git checkout step-by-step");
    await session.writeFile("yours", "smoke_detector", "The alarm is going off.\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "The alarm goes off" });
  } else if (id.endsWith("/new")) {
    await git(session, id, shot, "git add candle");
    await session.wins();
    await git(session, id, shot, "git commit", { commitMessage: "Add the candle" });
  } else if (id.endsWith("/change")) {
    await session.writeFile("yours", "candle", "The candle has been blown out.\n");
    await session.wins();
    await git(session, id, shot, "git add candle");
    await session.wins();
    await git(session, id, shot, "git commit", { commitMessage: "Blow out the candle" });
  } else if (id.endsWith("/reset")) {
    await git(session, id, shot, "git reset green_candle");
    await git(session, id, shot, "git reset blue_candle");
    await git(session, id, shot, "git commit", { commitMessage: "Only the red candle" });
  } else if (id.endsWith("/steps")) {
    await session.writeFile("yours", "hammer", "The hammer has fallen.\n");
    await session.writeFile("yours", "bottle", "The bottle has spilled.\n");
    await session.writeFile("yours", "sugar_cube", "The sugar has dissolved.\n");
    await session.wins();
    await git(session, id, shot, "git add hammer");
    await session.wins();
    for (const [name, message] of [["hammer", "The hammer falls"], ["bottle", "The bottle spills"], ["sugar_cube", "The sugar dissolves"]]) {
      if (name !== "hammer") await git(session, id, shot, `git add ${name}`);
      await git(session, id, shot, "git commit", { commitMessage: message });
    }
  } else if (id.endsWith("/friend")) {
    await git(session, id, shot, "git pull");
    const essay = await session.readFile("yours", "essay");
    await session.writeFile("yours", "essay", `${essay}Line 3\n`);
    await git(session, id, shot, "git add .; git commit", { commitMessage: "A third line" });
    await git(session, id, shot, "git push");
    await session.wins();
    await git(session, id, shot, "git pull");
    const continued = await session.readFile("yours", "essay");
    await session.writeFile("yours", "essay", `${continued}Line 5\n`);
    await git(session, id, shot, "git add .; git commit", { commitMessage: "A fifth line" });
    await git(session, id, shot, "git push");
  } else if (id.endsWith("/problems")) {
    await git(session, id, shot, "git add .; git commit", { commitMessage: "The bike shed should be green" });
    const pull = await session.run("yours", "git pull");
    if (pull.exitCode === 0) fail(id, shot, `pull merged without a conflict\n${pull.stdout}`);
    await session.writeFile("yours", "file", "The bike shed should be green and blue.\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "A compromise" });
    await git(session, id, shot, "git push");
  } else if (id === "changing-the-past/rebase") {
    await git(session, id, shot, "git checkout coffee");
    await git(session, id, shot, "git rebase baguette");
    await git(session, id, shot, "git checkout donut");
    await git(session, id, shot, "git rebase coffee");
    await git(session, id, shot, "git checkout main");
    await git(session, id, shot, "git reset --hard donut");
  } else if (id === "changing-the-past/reorder") {
    const onto = commitId(shot, "The Beginning");
    const command = `git rebase -i ${onto}`;
    const preview = await session.run("yours", command);
    if (!preview.sequence) fail(id, shot, preview.stderr || preview.stdout || "no rebase plan");
    const lines = preview.sequence.split("\n");
    const picks = lines.filter((line) => line.startsWith("pick "));
    const rest = lines.filter((line) => !line.startsWith("pick "));
    const order = ["underwear", "pants", "shirt", "shoes"].map((word) => picks.find((line) => line.includes(word)));
    if (order.some((line) => !line)) fail(id, shot, `rebase plan missing a commit\n${preview.sequence}`);
    await git(session, id, shot, command, { sequence: `${order.join("\n")}\n${rest.join("\n")}` });
  } else if (id === "shit-happens/restore-a-file") {
    await git(session, id, shot, "git checkout essay");
  } else if (id === "shit-happens/restore-a-file-from-the-past") {
    await git(session, id, shot, `git checkout ${commitId(shot, "Initial commit")} essay`);
    await git(session, id, shot, "git commit", { commitMessage: "Restore the essay" });
  } else if (id === "shit-happens/bad-commit") {
    await git(session, id, shot, `git reset ${commitId(shot, "Initial commit")}`);
    await session.writeFile("yours", "numbers", "1 2 3 4 5 6 7 8 9 10\n");
    await git(session, id, shot, "git commit -a", { commitMessage: "More numbers" });
  } else if (id === "shit-happens/pushed-something-broken") {
    await git(session, id, shot, `git revert ${commitId(shot, "very bad")}`);
    await git(session, id, shot, "git push");
  } else if (id === "shit-happens/reflog") {
    await git(session, id, shot, "git checkout 3");
  } else if (id === "workflows/pr") {
    await git(session, id, shot, "git clone ../friend .");
    await git(session, id, shot, "git branch solution");
    await git(session, id, shot, "git checkout solution");
    await session.writeFile("yours", "file", "2 + 3 = 5\n");
    await git(session, id, shot, "git add .; git commit", { commitMessage: "The answer is 5" });
    await git(session, id, shot, "git tag pr");
  } else if (id === "bisect/bisect") {
    const byMessage = (message) => {
      const commit = shot.repos.yours.commits.find((item) => item.type === "commit" && item.message === message);
      if (!commit) fail(id, shot, `no commit ${message}`);
      return commit.id;
    };
    await git(session, id, shot, "git bisect start");
    await git(session, id, shot, "git bisect bad");
    await git(session, id, shot, `git checkout ${byMessage("1")}`);
    let result = await session.run("yours", "git bisect good");
    if (result.exitCode !== 0) fail(id, shot, result.stderr || result.stdout);
    for (let step = 0; step < 12 && !/first bad commit/.test(`${result.stdout}${result.stderr}`); step += 1) {
      const here = await session.run("yours", "git log -1 --pretty=%s");
      if (here.exitCode !== 0) fail(id, shot, here.stderr || here.stdout);
      const message = here.stdout.replace(/\u001b\[[0-9;]*m/g, "").trim();
      const mark = Number(message) <= 11 ? "git bisect good" : "git bisect bad";
      result = await session.run("yours", mark);
      if (result.exitCode !== 0) fail(id, shot, `${mark}\n${result.stderr || result.stdout}`);
    }
    if (!/first bad commit/.test(`${result.stdout}${result.stderr}`)) {
      fail(id, shot, `bisect did not finish\n${result.stdout}${result.stderr}`);
    }
    await git(session, id, shot, "git checkout main");
    await git(session, id, shot, `git reset --hard ${byMessage("11")}`);
  } else if (id === "stash/stash") {
    await git(session, id, shot, "git stash push");
  } else if (id === "stash/stash-pop") {
    await git(session, id, shot, "git stash pop");
  } else if (id === "stash/stash-clear") {
    await git(session, id, shot, "git stash clear");
  } else if (id === "stash/stash-branch") {
    await git(session, id, shot, "git stash branch filling");
  } else if (id === "stash/stash-merge") {
    const pop = await session.run("yours", "git stash pop");
    if (pop.exitCode === 0) fail(id, shot, "stash pop did not conflict");
    await session.writeFile("yours", "recipe", "Apple Pie:\n- 4 Apples\n- 500g Flour\n- Pinch of Salt\n");
    await git(session, id, shot, "git add recipe; git commit", { commitMessage: "Both ingredients" });
    await git(session, id, shot, "git stash clear");
  } else if (id === "tags/add-tag") {
    await git(session, id, shot, "git tag v1");
  } else if (id === "tags/remove-tag") {
    await git(session, id, shot, "git tag -d v1 v2 v3");
  } else if (id === "tags/add-tag-later") {
    await git(session, id, shot, "git tag v1 HEAD~1");
  } else if (id === "tags/remote-tag") {
    await git(session, id, shot, "git tag v2");
    await git(session, id, shot, "git push friend v2");
    await git(session, id, shot, "git pull");
  } else {
    throw new Error(`No play for ${id}`);
  }

  shot = await session.snapshot();
  if (!shot.wins.every((win) => win.passed)) fail(id, shot);
  const repos = Object.keys(shot.repos).join(", ");
  console.log(`passed ${id} (${repos})`);
}

const chapters = chaptersThrough(parseSequence(fs.readFileSync(path.join(levelsRoot, "sequence"), "utf8")), "sandbox");
const ids = chapters.flatMap((chapter) => levelIds(chapter, parseSequence(fs.readFileSync(path.join(levelsRoot, chapter, "sequence"), "utf8"))));
const session = await openSession();
try {
  for (const id of ids) await play(session, id);
  console.log("played through the sandbox");
} finally {
  await session.close();
}
