# Oh My Git! on the web

Unofficial web port of [Oh My Git!](https://github.com/git-learning-game/oh-my-git), an open-source game about learning Git.

bleeptrack and blinry created Oh My Git! in 2020/2021, with six months of funding from the [Prototype Fund](https://www.prototypefund.de). Desktop builds for Linux, macOS, and Windows are on [itch.io](https://blinry.itch.io/oh-my-git).

This port plays those levels in the browser. Git runs in a [Wasmer](https://wasmer.io) sandbox. The Godot game remains the original project.

## License

This port is under the [Blue Oak Model License 1.0.0](LICENSE.md), the same license as Oh My Git!. The license text is in this repository. It is also published at <https://blueoakcouncil.org/license/1.0.0>.

The original game is copyright its contributors and licensed under that same Blue Oak license: [LICENSE.md](https://github.com/git-learning-game/oh-my-git/blob/main/LICENSE.md). That covers the level files, the card and node artwork, and the level format. This repository does not relicense any of that material.

Anyone who receives this port, or a build that includes those level files and images, also needs the license text or the link above. `pnpm build` copies `LICENSE.md` and `NOTICE` into `web/dist` for that reason. Attribution for the original game is in [NOTICE](NOTICE).

## Credit

- Game, levels, and artwork: bleeptrack and blinry, [Oh My Git!](https://github.com/git-learning-game/oh-my-git)
- Funding: [Prototype Fund](https://www.prototypefund.de)
- Desktop game: [blinry.itch.io/oh-my-git](https://blinry.itch.io/oh-my-git)

## Play it locally

You need Node.js 22 or newer, pnpm 12, and a checkout of the original game in a sibling directory named `oh-my-git`.

```
parent/
  oh-my-git/       # https://github.com/git-learning-game/oh-my-git
  oh-my-git-web/   # this repository
```

```sh
git clone https://github.com/git-learning-game/oh-my-git.git
cd oh-my-git-web
pnpm install
pnpm dev
```

Open <http://127.0.0.1:5173>. The first launch downloads Wasmer packages and needs a network connection.

## Checks

`pnpm check` plays the sandbox chapters in Node. It reads levels from the sibling checkout.

`pnpm check:browser` drives the page with Playwright. Start `pnpm dev` first. The first time, install the browser:

```sh
pnpm exec playwright install chromium
```

## Build

`pnpm build` writes a static site to `web/dist`, including the levels and SVG art from the sibling checkout.

Wasmer needs the page to be cross-origin isolated. The dev server sends these response headers, and the build writes the same headers to `web/dist/_headers`:

```
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: credentialless
```

Serve `web/dist` with those headers.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). It includes the original project's contribution guidelines and code of conduct. Changes to levels, artwork, and the Godot game belong in [git-learning-game/oh-my-git](https://github.com/git-learning-game/oh-my-git).
