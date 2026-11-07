// Desktop terminal completion: git subcommands you have already used, then file names.

const gitCommands = new Set(["add","am","archive","bisect","branch","bundle","checkout","cherry-pick","citool","clean","clone","commit","describe","diff","fetch","format-patch","gc","gitk","grep","gui","init","log","merge","mv","notes","pull","push","range-diff","rebase","reset","restore","revert","rm","shortlog","show","sparse-checkout","stash","status","submodule","switch","tag","worktree","config","fast-export","fast-import","filter-branch","mergetool","pack-refs","prune","reflog","remote","repack","replace","annotate","blame","bugreport","count-objects","difftool","fsck","gitweb","help","instaweb","merge-tree","rerere","show-branch","verify-commit","verify-tag","whatchanged","archimport","cvsexportcommit","cvsimport","cvsserver","imap-send","p","quiltimport","request-pull","send-email","svn","apply","checkout-index","commit-graph","commit-tree","hash-object","index-pack","merge-file","merge-index","mktag","mktree","multi-pack-index","pack-objects","prune-packed","read-tree","symbolic-ref","unpack-objects","update-index","update-ref","write-tree","cat-file","cherry","diff-files","diff-index","diff-tree","for-each-ref","get-tar-commit-id","ls-files","ls-remote","ls-tree","merge-base","name-rev","pack-redundant","rev-list","rev-parse","show-index","show-ref","unpack-file","var","verify-pack","daemon","fetch-pack","http-backend","send-pack","update-server-info","check-attr","check-ignore","check-mailmap","check-ref-format","column","credential","credential-cache","credential-store","fmt-merge-msg","interpret-trailers","mailinfo","mailsplit","merge-one-file","patch-id","sh-i","sh-setup"]);

export function completionsFor(line, history, files) {
  const results = [];
  if (line.startsWith("git ")) {
    const rest = line.slice(4);
    const counts = new Map();
    for (const command of history) {
      const parts = command.split(" ");
      if (parts.length < 2 || parts[0] !== "git" || !gitCommands.has(parts[1])) continue;
      const seen = counts.get(parts[1]);
      if (seen) seen.count += 1;
      else counts.set(parts[1], { count: 1, order: counts.size });
    }
    const ranked = [...counts.entries()].sort((a, b) => b[1].count - a[1].count || a[1].order - b[1].order);
    for (const [name] of ranked) {
      if (name.startsWith(rest)) results.push(`git ${name}`);
    }
  }
  const words = line.split(" ");
  const gitBare = line.startsWith("git ") && words.length <= 2;
  if (!gitBare && words.length > 1) {
    const last = words[words.length - 1];
    for (const path of files) {
      if (path.startsWith(".git") || !path.startsWith(last)) continue;
      results.push(`${line}${path.slice(last.length)}`);
    }
  }
  return results.filter((item) => item !== line);
}
