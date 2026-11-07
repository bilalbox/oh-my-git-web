// Regression for the session: levels/intro/commit starts unsolved and is solved
// by the two commits a player makes.

import { readLevel } from "./src/level.mjs";
import { openSession } from "./src/node.mjs";

const session = await openSession();
try {
  const level = await session.load(readLevel("intro/commit"));
  console.log(`loaded ${level.id} — ${level.title}`);

  const before = await session.wins();
  for (const check of before) {
    console.log(`before  ${check.passed ? "yes" : "no"}  ${check.description}`);
  }

  const played = await session.run("yours", `
git add glass
git commit -m full
echo "The glass is empty." > glass
git add glass
git commit -m empty
`);
  if (played.exitCode !== 0) {
    console.error(played.stderr || played.stdout);
    process.exitCode = 1;
  } else {
    const after = await session.wins();
    for (const check of after) {
      console.log(`after   ${check.passed ? "yes" : "no"}  ${check.description}`);
    }
    const shot = await session.snapshot();
    const yours = shot.repos.yours;
    const full = yours.commits.find((commit) => commit.message === "full");
    const empty = yours.commits.find((commit) => commit.message === "empty");
    const glass = yours.files.find((file) => file.path === "glass");
    const graphOk = Boolean(full && empty && empty.parents.includes(full.id)
      && yours.refs.HEAD === "refs/heads/main"
      && yours.refs["refs/heads/main"] === empty.id
      && glass?.worktree
      && glass.worktreeHash
      && glass.worktreeHash === glass.headHash
      && glass.indexHashes.includes(glass.worktreeHash));
    console.log(graphOk
      ? `graph ${yours.commits.length} commits, main is "${empty.message}", glass matches`
      : "graph failed");
    const ok = before.length === 3 && before.every((check) => !check.passed)
      && after.length === 3 && after.every((check) => check.passed)
      && graphOk;
    console.log(ok ? "intro/commit passed" : "intro/commit failed");
    if (!ok) process.exitCode = 1;
  }
} finally {
  await session.close();
}
