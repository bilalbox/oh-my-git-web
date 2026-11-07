// Step 2. Run a remote level, a rebase, and a plumbing command through one session.
// A failure here names the git feature the sandbox still lacks.

import { readLevel } from "./src/level.mjs";
import { openSession } from "./src/node.mjs";

const plays = [
  {
    id: "intro/remote",
    repo: "yours",
    script: `
git pull teacher main
echo "- You" >> students
git add students
git commit -m "Added you"
git push teacher main
`,
  },
  {
    id: "changing-the-past/rebase",
    repo: "yours",
    script: `
git checkout coffee
git rebase baguette
git checkout donut
git rebase coffee
git checkout main
git reset --hard donut
`,
  },
  {
    id: "low-level/blob-create",
    repo: "yours",
    script: `
echo a | git hash-object -w --stdin
echo b | git hash-object -w --stdin
echo c | git hash-object -w --stdin
`,
  },
];

const session = await openSession();
let failed = 0;
try {
  for (const play of plays) {
    console.log(`\n== ${play.id}`);
    try {
      const level = await session.load(readLevel(play.id));
      console.log(`loaded ${level.title} (${level.repos.join(", ")})`);
      const played = await session.run(play.repo, play.script);
      if (played.stdout.trim()) console.log(played.stdout.trim());
      if (played.exitCode !== 0) {
        console.log(played.stderr.trim());
        console.log(`command failed (${played.exitCode})`);
        failed += 1;
        continue;
      }
      const wins = await session.wins();
      for (const check of wins) {
        console.log(`${check.passed ? "yes" : "no "}  [${check.repo}] ${check.description}`);
      }
      const ok = wins.length > 0 && wins.every((check) => check.passed);
      console.log(ok ? "passed" : "win checks failed");
      if (!ok) failed += 1;
    } catch (error) {
      console.log(error.message);
      console.log("failed");
      failed += 1;
    }
  }
} finally {
  await session.close();
}

console.log(failed === 0 ? "\nlevels passed" : `\n${failed} level(s) failed`);
if (failed !== 0) process.exitCode = 1;
