// Chapter and level order, from the desktop game's sequence files.

export function parseSequence(text) {
  return text.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#"));
}

export function chaptersThrough(chapters, name) {
  const end = chapters.indexOf(name);
  if (end < 0) throw new Error(`No chapter ${name}`);
  return chapters.slice(0, end + 1);
}

export function levelIds(chapter, slugs) {
  return slugs.map((slug) => {
    const id = `${chapter}/${slug}`;
    if (!/^[a-z0-9][a-z0-9/_-]*$/.test(id)) throw new Error(`Bad level id ${id}`);
    return id;
  });
}
