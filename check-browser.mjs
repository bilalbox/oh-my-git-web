// Plays through the sandbox in the browser, in sequence order.

import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.setDefaultTimeout(180000);
page.on("console", (message) => console.log(`browser ${message.type()}: ${message.text()}`));
page.on("pageerror", (error) => console.log(`pageerror: ${error.message}`));

async function dump(label) {
  console.log(`${label} title: ${await page.locator("#title").textContent()}`);
  console.log(`${label} status: ${await page.locator("#status").textContent()}`);
  console.log(`${label} wins: ${JSON.stringify(await page.locator("#wins li").allTextContents())}`);
  console.log(`${label} term: ${JSON.stringify(await page.locator(".xterm-rows").innerText())}`);
}

async function waitWins(passed) {
  await page.waitForFunction((want) => {
    const items = [...document.querySelectorAll("#wins li")];
    return items.length > 0 && items.every((item) => item.dataset.passed === (want ? "yes" : "no"));
  }, passed);
}

async function at(levelTitle) {
  await page.waitForFunction((expected) => document.querySelector("#title")?.textContent === expected, levelTitle);
  await page.waitForFunction(() => {
    const items = [...document.querySelectorAll("#wins li")];
    return items.length > 0 && items.some((item) => item.dataset.passed === "no");
  });
}

async function onward(levelTitle) {
  await page.getByRole("button", { name: "Next level" }).click();
  await at(levelTitle);
}

async function merge(label) {
  await page.getByRole("button", { name: "git merge [commit, ref]" }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await settled();
}

async function travel(label) {
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.getByRole("button", { name: label, exact: true }).click();
  await page.waitForFunction((wanted) => {
    const current = document.querySelector(".graph .node[data-current='yes']");
    if (!current) return false;
    if (current.dataset.message === wanted) return true;
    return [...current.querySelectorAll(".ref")].some((ref) => ref.textContent === wanted);
  }, label);
  await settled();
}

async function makeCommit(message) {
  await page.getByRole("button", { name: "git add .; git commit" }).click();
  await page.locator("#commit-message").fill(message);
  await page.getByRole("button", { name: "Make the commit" }).click();
  await page.waitForFunction((text) => document.querySelector(`.graph [data-message="${text}"]`), message);
}

async function commitStaged(message) {
  await page.getByRole("button", { name: "git commit", exact: true }).click();
  await page.locator("#commit-message").fill(message);
  await page.getByRole("button", { name: "Make the commit" }).click();
  await page.waitForFunction((text) => document.querySelector(`.graph [data-message="${text}"]`), message);
}

async function addFile(name) {
  await page.getByRole("button", { name: "git add [file]" }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForFunction((file) => document.querySelector(`#files button[aria-label="${file}"]`)?.dataset.state === "staged", name);
}

async function resetFile(name) {
  await page.getByRole("button", { name: "git reset [file]" }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await settled();
}

async function pull() {
  await page.getByRole("button", { name: "git pull", exact: true }).click();
  await settled();
}

async function push() {
  await page.getByRole("button", { name: "git push", exact: true }).click();
  await settled();
}

async function rebaseOnto(message) {
  await page.getByRole("button", { name: "git rebase [commit]", exact: true }).click();
  await page.getByRole("button", { name: message, exact: true }).click();
  await settled();
}

async function rebaseOntoRef(name) {
  await page.getByRole("button", { name: "git rebase [commit]", exact: true }).click();
  await page.locator(".node").filter({ has: page.locator(`.ref[aria-label="${name}"]`) }).locator(".commit").click();
  await settled();
}

async function resetOntoRef(name) {
  await page.getByRole("button", { name: "git reset --hard [commit]" }).click();
  await page.locator(".node").filter({ has: page.locator(`.ref[aria-label="${name}"]`) }).locator(".commit").click();
  await settled();
}

async function replaceFile(file, text) {
  await page.getByRole("button", { name: file, exact: true }).click();
  await page.waitForFunction((name) => document.querySelector("#file-text")?.getAttribute("aria-label") === name, file);
  await settled();
  await page.locator("#file-text").fill(text);
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction((name) => document.querySelector("#status")?.textContent === `Saved ${name}.`, file);
}

async function nameBranch(name) {
  await page.getByRole("button", { name: "git branch [string]" }).click();
  await page.locator("#commit-message").fill(name);
  await page.getByRole("button", { name: "Play card" }).click();
  await page.waitForFunction((branch) => [...document.querySelectorAll(".graph .ref")].some((node) => node.textContent === branch), name);
}

async function deleteBranch(name) {
  await page.getByRole("button", { name: "git branch -D [ref]" }).click();
  await page.getByRole("button", { name, exact: true }).click();
  await page.waitForFunction((branch) => ![...document.querySelectorAll(".graph .ref")].some((node) => node.textContent === branch), name);
}

async function resetHard(message) {
  await page.getByRole("button", { name: "git reset --hard [commit]" }).click();
  await page.getByRole("button", { name: message, exact: true }).click();
  await page.waitForFunction((label) => document.querySelector(".graph .node[data-current='yes']")?.dataset.message === label, message);
}

async function settled() {
  await page.waitForFunction(() => document.body.dataset.busy !== "yes");
}

async function openAndAppend(file, extra) {
  await page.getByRole("button", { name: file, exact: true }).click();
  await page.waitForFunction((name) => {
    const field = document.querySelector("#file-text");
    return field && !field.hidden && field.getAttribute("aria-label") === name && field.value.length > 0;
  }, file);
  await settled();
  const current = await page.locator("#file-text").inputValue();
  await page.locator("#file-text").fill(`${current}${extra}`);
  await page.getByRole("button", { name: "Save" }).click();
  await settled();
}

try {
  await page.goto("http://127.0.0.1:5173/#intro/risky", { waitUntil: "domcontentloaded" });
  const isolated = await page.evaluate(() => crossOriginIsolated);
  console.log(`crossOriginIsolated ${isolated}`);
  if (!isolated) throw new Error("The page is not cross-origin isolated");

  await at("Living dangerously");
  await openAndAppend("form.txt", "- Because I want the story back\n");
  await waitWins(true);
  console.log("risky solved");
  await onward("Making backups");

  await openAndAppend("form2_really_final.txt", "- And one more copy is enough\n");
  await waitWins(true);
  console.log("copies solved");
  await onward("Enter the time machine");

  await page.getByRole("button", { name: "git init" }).click();
  await waitWins(true);
  console.log("init solved");
  await onward("The command line");

  const hint = await page.locator("#cli").innerText();
  if (!hint.includes("git init")) throw new Error(`Missing command hint: ${hint}`);
  await page.locator("#term textarea").click();
  await page.keyboard.type("git init");
  await page.keyboard.press("Enter");
  await waitWins(true);
  console.log("cli solved");
  await onward("Your first commit");

  await page.getByRole("button", { name: "git add .; git commit" }).click();
  await page.locator("#commit-message").fill("full");
  await page.getByRole("button", { name: "Make the commit" }).click();
  await page.waitForFunction(() => document.querySelector('[data-repo="yours"] [data-message="full"]'));
  await page.getByRole("button", { name: "glass", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#file-text")?.value.includes("full of water"));
  await page.locator("#file-text").fill("The glass is empty.");
  await page.getByRole("button", { name: "Save" }).click();
  await page.waitForFunction(() => document.querySelector("#files button")?.dataset.state === "changed");
  await page.getByRole("button", { name: "git add .; git commit" }).click();
  await page.locator("#commit-message").fill("empty");
  await page.getByRole("button", { name: "Make the commit" }).click();
  await waitWins(true);
  console.log("commit solved");
  await onward("Working together");

  await page.waitForFunction(() => document.querySelector('[data-repo="teacher"] .graph')?.textContent.includes("Added two students"));
  await page.getByRole("button", { name: "git pull" }).click();
  await page.waitForFunction(() => document.querySelector('[data-repo="yours"] .graph')?.textContent.includes("Added two students"));
  await openAndAppend("students", "- You\n");
  await page.waitForFunction(() => document.querySelector("#status")?.textContent === "Saved students.");
  await page.getByRole("button", { name: "git add .; git commit" }).click();
  await page.locator("#commit-message").fill("Added you");
  await page.getByRole("button", { name: "Make the commit" }).click();
  await page.waitForFunction(() => document.querySelector('[data-repo="yours"] [data-message="Added you"]'));
  await page.getByRole("button", { name: "git push" }).click();
  await waitWins(true);
  console.log("remote solved");
  await onward("Unexpected Roommates");

  for (const file of ["tiny_web", "big_web", "thick_web"]) {
    await page.getByRole("button", { name: "rm [file]" }).click();
    await page.getByRole("button", { name: file, exact: true }).click();
    await page.waitForFunction((gone) => ![...document.querySelectorAll("#files button")].some((button) => button.textContent === gone), file);
  }
  await waitWins(true);
  console.log("files-delete solved");
  await onward("Interior design");

  for (const [index, name] of ["chair", "lamp"].entries()) {
    await page.getByRole("button", { name: "touch [string]" }).click();
    await page.locator("#commit-message").fill(name);
    await page.getByRole("button", { name: "Play card" }).click();
    await page.waitForFunction((file) => [...document.querySelectorAll("#files button")].some((button) => button.textContent === file), name);
    await page.getByRole("button", { name: name, exact: true }).click();
    await page.waitForFunction((file) => document.querySelector("#file-text")?.getAttribute("aria-label") === file, name);
    await page.locator("#file-text").fill(`A yellow ${name}.`);
    await page.getByRole("button", { name: "Save" }).click();
    if (index === 0) {
      await page.waitForFunction((file) => document.querySelector("#status")?.textContent === `Saved ${file}.`, name);
    }
  }
  await waitWins(true);
  console.log("files-add solved");
  await onward("Moving through time");

  await travel("Little sister does something");
  await replaceFile("piggy_bank", "This piggy bank belongs to the big sister.\nIt contains 10 coins.");
  await replaceFile("little_sister", "A young girl with brown, curly hair.");
  await makeCommit("Sisterly peace");
  await waitWins(true);
  console.log("checkout-commit solved");
  await onward("Make parallel commits");

  await travel("The child buys something");
  await replaceFile("cage/lion", "Looks happy. :)");
  await makeCommit("Everyone is happy");
  await waitWins(true);
  console.log("fork solved");
  await onward("Creating branches");

  await travel("Go to the birthday");
  await nameBranch("birthday");
  await travel("Go to the concert");
  await nameBranch("concert");
  await waitWins(true);
  console.log("branch-create solved");
  await onward("Branches grow with you!");

  await travel("Go to the birthday");
  await openAndAppend("you", "You stay a little longer.\n");
  await makeCommit("Stay longer");
  await travel("concert");
  await openAndAppend("you", "Encore.\n");
  await makeCommit("Encore");
  await waitWins(true);
  console.log("grow solved");
  await onward("Deleting branches");

  for (const name of ["friend", "music", "ice-cream"]) await deleteBranch(name);
  await waitWins(true);
  console.log("branch-remove solved");
  await onward("Moving branches around");

  await travel("baguette");
  await resetHard("You eat the baguette");
  await travel("coffee");
  await resetHard("You drink the coffee");
  await travel("donut");
  await replaceFile("you", "You do not have a baguette.\n\nYou do not have coffee.\n\nYou ate a donut.");
  await makeCommit("You eat the donut");
  await waitWins(true);
  console.log("reorder solved");
  await onward("Merging timelines");

  await merge("You eat the baguette");
  await merge("You drink the coffee");
  await waitWins(true);
  console.log("merge solved");
  await onward("Contradictions");

  await merge("pancakes");
  await merge("muesli");
  await page.waitForFunction(() => document.querySelector("#files button")?.dataset.state === "conflict");
  await replaceFile("sam", "Had blueberry pancakes and muesli for breakfast.\n\nIs at work.");
  await makeCommit("Breakfast compromise");
  await waitWins(true);
  console.log("conflict solved");
  await onward("Step by step");

  await travel("step-by-step");
  await replaceFile("smoke_detector", "The alarm is going off.");
  await makeCommit("The alarm goes off");
  await waitWins(true);
  console.log("compare solved");
  await onward("Add new files to the index");

  await page.waitForFunction(() => document.querySelector("#files button[aria-label='candle']")?.dataset.state === "new");
  await addFile("candle");
  await commitStaged("Add the candle");
  await waitWins(true);
  console.log("new solved");
  await onward("Update files in the index");

  await replaceFile("candle", "The candle has been blown out.");
  await page.waitForFunction(() => document.querySelector("#files button[aria-label='candle']")?.dataset.state === "changed");
  await addFile("candle");
  await commitStaged("Blow out the candle");
  await waitWins(true);
  console.log("change solved");
  await onward("Resetting files in the index");

  await resetFile("green_candle");
  await resetFile("blue_candle");
  await commitStaged("Only the red candle");
  await waitWins(true);
  console.log("reset solved");
  await onward("Adding changes step by step");

  await replaceFile("hammer", "The hammer has fallen.");
  await replaceFile("bottle", "The bottle has spilled.");
  await replaceFile("sugar_cube", "The sugar has dissolved.");
  await addFile("hammer");
  await commitStaged("The hammer falls");
  await addFile("bottle");
  await commitStaged("The bottle spills");
  await addFile("sugar_cube");
  await commitStaged("The sugar dissolves");
  await waitWins(true);
  console.log("steps solved");
  await onward("Friend");

  await pull();
  await openAndAppend("essay", "Line 3\n");
  await makeCommit("A third line");
  await push();
  await pull();
  await openAndAppend("essay", "Line 5\n");
  await makeCommit("A fifth line");
  await push();
  await waitWins(true);
  console.log("friend solved");
  await onward("Problems");

  await makeCommit("The bike shed should be green");
  await pull();
  await page.waitForFunction(() => document.querySelector("#files button[aria-label='file']")?.dataset.state === "conflict");
  await replaceFile("file", "The bike shed should be green and blue.");
  await makeCommit("A compromise");
  await push();
  await waitWins(true);
  console.log("problems solved");
  await onward("Rebasing");

  await travel("coffee");
  await rebaseOnto("You eat the baguette");
  await travel("donut");
  await rebaseOntoRef("coffee");
  await travel("main");
  await resetOntoRef("donut");
  await waitWins(true);
  console.log("rebase solved");
  await onward("Reordering events");

  await page.getByRole("button", { name: "git rebase -i [commit]" }).click();
  await page.getByRole("button", { name: "The Beginning", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#file-text")?.getAttribute("aria-label") === "Rebase plan");
  const plan = await page.locator("#file-text").inputValue();
  const lines = plan.split("\n");
  const picks = lines.filter((line) => line.startsWith("pick "));
  const rest = lines.filter((line) => !line.startsWith("pick "));
  const order = ["underwear", "pants", "shirt", "shoes"].map((word) => picks.find((line) => line.includes(word)));
  if (order.some((line) => !line)) throw new Error(`rebase plan missing a commit\n${plan}`);
  await page.locator("#file-text").fill(`${order.join("\n")}\n${rest.join("\n")}`);
  await page.getByRole("button", { name: "Save" }).click();
  await waitWins(true);
  console.log("reorder solved");
  await onward("Restore a deleted file");

  await page.waitForFunction(() => document.querySelector("#files button[aria-label='essay']")?.dataset.state === "deleted");
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.getByRole("button", { name: "essay", exact: true }).click();
  await waitWins(true);
  console.log("restore solved");
  await onward("Restore a file from the past");

  await page.getByRole("button", { name: "git checkout [commit, ref] [file]" }).click();
  await page.getByRole("button", { name: "Initial commit", exact: true }).click();
  await page.getByRole("button", { name: "essay", exact: true }).click();
  await settled();
  await commitStaged("Restore the essay");
  await waitWins(true);
  console.log("restore from the past solved");
  await onward("Undo a bad commit");

  await page.getByRole("button", { name: "git reset [commit]", exact: true }).click();
  await page.getByRole("button", { name: "Initial commit", exact: true }).click();
  await settled();
  await replaceFile("numbers", "1 2 3 4 5 6 7 8 9 10");
  await page.getByRole("button", { name: "git commit -a", exact: true }).click();
  await page.locator("#commit-message").fill("More numbers");
  await page.getByRole("button", { name: "Make the commit" }).click();
  await page.waitForFunction(() => document.querySelector(`.graph [data-message="More numbers"]`));
  await waitWins(true);
  console.log("bad commit solved");
  await onward("I pushed something broken");

  await page.getByRole("button", { name: "git revert [commit]" }).click();
  await page.locator(".repo[data-repo='yours']").getByRole("button", { name: "very bad", exact: true }).click();
  await settled();
  await push();
  await waitWins(true);
  console.log("revert solved");
  await onward("Go back to where you were before");

  await page.getByRole("button", { name: "git reflog [ref, head]" }).click();
  await page.getByRole("button", { name: "HEAD", exact: true }).click();
  await settled();
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.locator(".ref[aria-label='3']").click();
  await waitWins(true);
  console.log("reflog solved");
  await onward("Cloning a repo");

  await page.getByRole("button", { name: "git clone ../[remote] ." }).click();
  await page.getByRole("button", { name: "friend", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("#files button[aria-label='file']"));
  await page.getByRole("button", { name: "git branch [string]" }).click();
  await page.locator("#commit-message").fill("solution");
  await page.getByRole("button", { name: "Play card" }).click();
  await page.waitForFunction(() => [...document.querySelectorAll(".graph .ref")].some((node) => node.textContent === "solution"));
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.getByRole("button", { name: "solution", exact: true }).click();
  await settled();
  await replaceFile("file", "2 + 3 = 5");
  await makeCommit("The answer is 5");
  await page.locator("#term textarea").click();
  await page.keyboard.type("git tag pr");
  await page.keyboard.press("Enter");
  await waitWins(true);
  console.log("clone solved");
  await onward("Yellow brick road");

  await page.getByRole("button", { name: "git bisect start", exact: true }).click();
  await settled();
  await page.getByRole("button", { name: "git bisect bad", exact: true }).click();
  await settled();
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.getByRole("button", { name: "1", exact: true }).click();
  await settled();
  await page.getByRole("button", { name: "git bisect good", exact: true }).click();
  await settled();
  for (let step = 0; step < 12; step += 1) {
    const term = await page.locator(".xterm-rows").innerText();
    if (term.includes("first bad commit")) break;
    const message = await page.locator(".node[data-current='yes']").getAttribute("data-message");
    const mark = Number(message) <= 11 ? "git bisect good" : "git bisect bad";
    await page.getByRole("button", { name: mark, exact: true }).click();
    await settled();
  }
  await page.getByRole("button", { name: "git checkout [commit, ref]" }).click();
  await page.getByRole("button", { name: "main", exact: true }).click();
  await settled();
  await page.getByRole("button", { name: "git reset --hard [commit]" }).click();
  await page.getByRole("button", { name: "11", exact: true }).click();
  await waitWins(true);
  console.log("bisect solved");
  await onward("Stashing");

  async function type(command) {
    await page.locator("#term textarea").click();
    await page.keyboard.type(command);
    await page.keyboard.press("Enter");
    await settled();
  }

  await type("git stash push");
  await waitWins(true);
  console.log("stash solved");
  await onward("Pop from Stash");

  await type("git stash pop");
  await waitWins(true);
  console.log("stash pop solved");
  await onward("Clear the Stash");

  await type("git stash clear");
  await waitWins(true);
  console.log("stash clear solved");
  await onward("Branch from stash");

  await type("git stash branch filling");
  await page.waitForFunction(() => [...document.querySelectorAll(".graph .ref")].some((node) => node.textContent === "filling"));
  await waitWins(true);
  console.log("stash branch solved");
  await onward("Merging popped stash");

  await type("git stash pop");
  await page.waitForFunction(() => document.querySelector("#files button[aria-label='recipe']")?.dataset.state === "conflict");
  await replaceFile("recipe", "Apple Pie:\n- 4 Apples\n- 500g Flour\n- Pinch of Salt");
  await makeCommit("Both ingredients");
  await type("git stash clear");
  await waitWins(true);
  console.log("stash merge solved");
  await onward("Creating tags");

  await type("git tag v1");
  await page.waitForFunction(() => [...document.querySelectorAll(".graph .ref")].some((node) => node.textContent === "v1"));
  await waitWins(true);
  console.log("add tag solved");
  await onward("Removing tags");

  await type("git tag -d v1 v2 v3");
  await waitWins(true);
  console.log("remove tag solved");
  await onward("Tagging later");

  await type("git tag v1 HEAD~1");
  await page.waitForFunction(() => {
    const node = document.querySelector(".node[data-message='Adding feature 2']");
    return [...(node?.querySelectorAll(".ref") ?? [])].some((ref) => ref.textContent === "v1");
  });
  await waitWins(true);
  console.log("tag later solved");
  await onward("Remote Tags");

  await type("git tag v2");
  await type("git push friend v2");
  await type("git pull");
  await waitWins(true);
  console.log("remote tags solved");
  await page.getByRole("button", { name: "Next level" }).click();
  await page.waitForFunction(() => document.querySelector("#title")?.textContent === "Empty sandbox" && document.body.dataset.busy !== "yes");
  if (await page.locator("#wins li").count() !== 0) throw new Error("Empty sandbox has a goal");
  if (await page.locator("#card-section").isVisible()) throw new Error("Empty sandbox offers cards");
  if (await page.locator("#next").isVisible()) throw new Error("Empty sandbox offers a next level");
  await page.locator("#term textarea").click();
  await page.keyboard.type("git status");
  await page.keyboard.press("Enter");
  await settled();
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await page.getByRole("button", { name: "Sandbox with a remote", exact: true }).click();
  await page.waitForFunction(() => {
    const messages = [...document.querySelectorAll(".commit")].map((node) => node.getAttribute("aria-label"));
    return document.querySelector("#title")?.textContent === "Sandbox with a remote"
      && document.body.dataset.busy !== "yes"
      && messages.includes("Initial commit")
      && messages.includes("Another line");
  });
  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await page.getByRole("button", { name: "Sandbox with three commits", exact: true }).click();
  await page.waitForFunction(() => {
    const refs = [...document.querySelectorAll(".graph .ref")];
    return document.querySelector("#title")?.textContent === "Sandbox with three commits"
      && document.body.dataset.busy !== "yes"
      && document.querySelector(".node[data-message=\"Who's there?\"]")
      && refs.some((ref) => ref.textContent === "not_main");
  });
  console.log("played through the sandbox in the browser");
  await page.screenshot({ path: "/tmp/omg-chapter.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 800 });
  await page.screenshot({ path: "/tmp/omg-chapter-narrow.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.getByRole("button", { name: "Levels", exact: true }).click();
  await page.waitForFunction(() => {
    const buttons = [...document.querySelectorAll("#level-list button")];
    const here = buttons.find((button) => button.getAttribute("aria-current") === "true");
    const risky = buttons.find((button) => button.textContent === "Living dangerously");
    const typed = buttons.find((button) => button.textContent === "The command line");
    const initLevel = buttons.find((button) => button.textContent === "Enter the time machine");
    const step = buttons.find((button) => button.textContent === "Step by step");
    const friend = buttons.find((button) => button.textContent === "Friend");
    const rebasing = buttons.find((button) => button.textContent === "Rebasing");
    const restored = buttons.find((button) => button.textContent === "Restore a deleted file");
    const remoteTags = buttons.find((button) => button.textContent === "Remote Tags");
    const empty = buttons.find((button) => button.textContent === "Empty sandbox");
    return here?.textContent === "Sandbox with three commits"
      && empty
      && remoteTags?.dataset.solved === "yes"
      && step?.dataset.solved === "yes"
      && friend?.dataset.solved === "yes"
      && rebasing?.dataset.solved === "yes"
      && restored?.dataset.solved === "yes"
      && remoteTags.dataset.solved === "yes"
      && remoteTags.dataset.cli === "yes"
      && risky?.dataset.solved === "yes"
      && risky.dataset.cli === "yes"
      && typed?.dataset.cli === "yes"
      && initLevel?.dataset.solved === "yes"
      && initLevel.dataset.cli === "no";
  });
  await page.screenshot({ path: "/tmp/omg-levels.png", fullPage: true });
  await page.getByRole("button", { name: "Living dangerously", exact: true }).click();
  await at("Living dangerously");
  console.log("level list opens a chosen level");
} catch (error) {
  await dump("failed").catch(() => {});
  throw error;
} finally {
  await browser.close();
}
