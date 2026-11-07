import { access, cp, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const root = import.meta.dirname;
const desktop = path.resolve(root, "../oh-my-git");
const dist = path.resolve(root, "web/dist");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

const levels = path.join(desktop, "levels");
const cardsJson = path.join(desktop, "resources/cards.json");
if (!(await exists(levels)) || !(await exists(cardsJson))) {
  throw new Error("The desktop repo must be checked out at ../oh-my-git.");
}

await cp(levels, path.join(dist, "levels"), { recursive: true });
await cp(cardsJson, path.join(dist, "cards.json"));

async function copySvgs(from, to) {
  await mkdir(to, { recursive: true });
  await cp(from, to, {
    recursive: true,
    filter(source) {
      return source === from || source.endsWith(".svg");
    },
  });
}

await copySvgs(path.join(desktop, "cards"), path.join(dist, "art/cards"));
await copySvgs(path.join(desktop, "nodes"), path.join(dist, "art/nodes"));
await cp(path.join(root, "LICENSE.md"), path.join(dist, "LICENSE.md"));
await cp(path.join(root, "NOTICE"), path.join(dist, "NOTICE"));

// Vite copies the Wasmer worker as an asset and does not follow its imports.
const sdkDist = path.resolve(root, "node_modules/@wasmer/sdk/dist");
for (const file of ["capi-worker-bridge.js", "host-filesystem.js", "node-compat.js", "node-network-rpc.js"]) {
  await cp(path.join(sdkDist, file), path.join(dist, "assets", file));
}
await cp(path.resolve(root, "node_modules/@wasmer/sdk/pkg/snippets"), path.join(dist, "assets/snippets"), { recursive: true });

// These match the dev server headers in vite.config.js. Wasmer needs them.
await writeFile(
  path.join(dist, "_headers"),
  `/*
	Cross-Origin-Opener-Policy: same-origin
	Cross-Origin-Embedder-Policy: credentialless
`,
);

for (const file of ["index.html", "_headers", "cards.json", "levels/sequence", "art/cards/init.svg", "assets/host-filesystem.js", "assets/snippets/wasmer-sdk-js-cdffbd7559c8ace2/inline0.js", "LICENSE.md", "NOTICE"]) {
  if (!(await exists(path.join(dist, file)))) throw new Error(`Build is missing ${file}`);
}
