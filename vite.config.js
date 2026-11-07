import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

// Sibling checkout of the original game: https://github.com/git-learning-game/oh-my-git
const levelsRoot = path.resolve(import.meta.dirname, "../oh-my-git/levels");
const cardsFile = path.resolve(import.meta.dirname, "../oh-my-git/resources/cards.json");
const artRoots = {
  cards: path.resolve(import.meta.dirname, "../oh-my-git/cards"),
  nodes: path.resolve(import.meta.dirname, "../oh-my-git/nodes"),
};
const isolation = {
  "Cross-Origin-Opener-Policy": "same-origin",
  // credentialless keeps the page cross-origin isolated without requiring
  // Cross-Origin-Resource-Policy on Wasmer's package CDN.
  "Cross-Origin-Embedder-Policy": "credentialless",
};

function cards() {
  return {
    name: "oh-my-git-cards",
    configureServer(server) {
      server.middlewares.use("/cards.json", (req, res, next) => {
        const pathOnly = (req.url ?? "/").split("?")[0];
        if (pathOnly !== "/" && pathOnly !== "") {
          next();
          return;
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        fs.createReadStream(cardsFile).pipe(res);
      });
    },
  };
}

function art() {
  return {
    name: "oh-my-git-art",
    configureServer(server) {
      server.middlewares.use("/art", (req, res, next) => {
        const parts = decodeURIComponent((req.url ?? "/").split("?")[0]).replace(/^\//, "").split("/");
        if (parts.length !== 2) {
          next();
          return;
        }
        const [kind, file] = parts;
        const root = artRoots[kind];
        if (!root || !/^[\w.-]+\.svg$/.test(file)) {
          next();
          return;
        }
        const full = path.resolve(root, file);
        if (!full.startsWith(root + path.sep) || !fs.existsSync(full) || !fs.statSync(full).isFile()) {
          res.statusCode = 404;
          res.end("missing art");
          return;
        }
        res.setHeader("Content-Type", "image/svg+xml");
        fs.createReadStream(full).pipe(res);
      });
    },
  };
}

function levels() {
  return {
    name: "oh-my-git-levels",
    configureServer(server) {
      server.middlewares.use("/levels", (req, res, next) => {
        const id = decodeURIComponent((req.url ?? "/").split("?")[0].replace(/^\//, ""));
        if (!/^[a-z0-9][a-z0-9/_-]*$/.test(id)) {
          next();
          return;
        }
        const file = path.resolve(levelsRoot, id);
        if (!file.startsWith(levelsRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          res.statusCode = 404;
          res.end("missing level");
          return;
        }
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig({
  root: "web",
  server: { port: 5173, strictPort: true, headers: isolation },
  preview: { headers: isolation },
  plugins: [cards(), art(), levels()],
  optimizeDeps: { exclude: ["@wasmer/sdk"] },
});
