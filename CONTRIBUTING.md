# Contributing

This repository is an unofficial web port of [Oh My Git!](https://github.com/git-learning-game/oh-my-git). bleeptrack and blinry built the game. Levels, artwork, and the Godot project live in that repository, and changes to them belong there.

The original project's contribution guidelines live in its [README](https://github.com/git-learning-game/oh-my-git/blob/main/README.md). They are included here so this port carries the same expectations. The last section applies only to this repository.

## Maintenance

The Oh My Git! README says:

> bleeptrack and blinry developed Oh My Git! in 2020/2021, with six months of funding from the Prototype Fund.
> Currently, the project is in low-maintenance mode, and we don't have a lot of time to dedicate to it.
>
> While we can review and merge simple fixes, **please have patience with us and understand it might take a long time,** especially with larger changes.
>
> If you'd like to work on a big change, we suggest you get in touch with us before you start working on it, to discuss how to approach that best. Thanks for your interest to contribute!

## Report bugs in the game

If something in the game does not work or looks broken, describe it in the [Oh My Git! issue tracker](https://github.com/git-learning-game/oh-my-git/issues).

## Build a level

Levels live in the `levels` directory of the original repository. That directory is split into chapters, and each level is a file. The format is documented in the original README under [Build your own level!](https://github.com/git-learning-game/oh-my-git/blob/main/README.md#build-your-own-level).

1. Download [Godot 4.7.2](https://godotengine.org/download/archive/4.7.2-stable/).
2. Clone the original repository.
3. Run the game with `godot --path .` from that project directory.
4. Get familiar with the levels that are already there.
5. Copy an existing level or write a new one, using the format in the original README.
6. Test the level. When it is ready, send it in a pull request to the original repository.

A level can contain more than one repository. The original README explains `[setup <name>]` and `[win <name>]`, and the [remote](https://github.com/git-learning-game/oh-my-git/tree/main/levels/remotes) levels are the examples.

## Contribute code to the Godot game

Open the game in the Godot editor with `godot project.godot`, then run it with F5.

Improvements to the original code are welcome as pull requests. Before working on an existing `*.tscn` file, get in touch with the maintainers. Merge conflicts in Godot scene files are hard to resolve.

To build desktop binaries, install Godot 4.7.2's [export templates](https://docs.godotengine.org/en/stable/tutorials/export/exporting_projects.html), plus `zip`, `wget`, and `7z`. The Makefile calls `godot` on your `PATH`. Run `make`.

## Code of Conduct

Oh My Git! has a [Code of Conduct](https://github.com/git-learning-game/oh-my-git/blob/main/CODE_OF_CONDUCT.md), the Contributor Covenant version 2.0. It applies to all contributions to that project, including issues and pull requests.

Report abusive, harassing, or otherwise unacceptable behavior to the community leaders responsible for enforcement at <bb@morr.cc>. Complaints are reviewed and investigated promptly and fairly. The full enforcement guidelines are in the code of conduct.

This port follows that code of conduct.

## This web port

Clone the original game as a sibling of this repository. The directory name has to be `oh-my-git`:

```
parent/
  oh-my-git/
  oh-my-git-web/
```

```sh
git clone https://github.com/git-learning-game/oh-my-git.git
```

From this repository:

```sh
pnpm install
pnpm dev
```

`pnpm check` plays the sandbox levels in Node. `pnpm check:browser` drives the page in Chromium. Start `pnpm dev` before the browser check. The first time, install the browser with `pnpm exec playwright install chromium`.

Keep these out of the repository:

- `node_modules/`, `web/dist/`, and the Wasmer cache in `.wasmer/`
- Wrangler and Cloudflare configuration, including `.wrangler/`, `.dev.vars`, and account files
- `.env` files and other credentials
- Agent configuration such as `.cursor/`, `.claude/`, `.agents/`, and `.impeccable/`

Level text and SVG art are read from the sibling checkout. Edit them in the original repository.
