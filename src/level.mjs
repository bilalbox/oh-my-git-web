// Node reader for level files. The parser itself lives in level-format.mjs.
// Levels come from a sibling checkout of the original game: ../oh-my-git/levels.

import fs from "node:fs";
import path from "node:path";
import { assertLevelId, levelFromText } from "./level-format.mjs";

export const levelsRoot = path.resolve(import.meta.dirname, "../../oh-my-git/levels");

export function levelPath(id) {
  assertLevelId(id);
  const file = path.resolve(levelsRoot, id);
  if (file !== levelsRoot && !file.startsWith(levelsRoot + path.sep)) {
    throw new Error(`Level ${id} escapes the levels directory`);
  }
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    throw new Error(`Level ${id} does not exist`);
  }
  return file;
}

export function readLevel(id) {
  return levelFromText(id, fs.readFileSync(levelPath(id), "utf8"));
}
