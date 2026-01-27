# a-terra-forge

Universal document-oriented markdown site generator

![a-terra-forge](./images/a-terra-forge.120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## What is this?

Have you ever felt like writing documents that are somewhat organized, bit by bit?
General blog systems are cumbersome to manage, and simple blog generators are primarily designed for writing “blogs,” making it difficult to present documents cohesively and ensure readers can follow them smoothly.

a-terra-forge is a document site generator that lets you track documents in progress via a timeline page while also grouping and displaying documents by category.
It features:

- As a static site generator, no server is required. Deploy and publish to any web server, such as GitHub Pages.
- The timeline page also statically generates the latest documents, while older articles use infinite scroll (demand loading).
- Documents are written in Markdown. Markdown supports syntax highlighting for code, card display for oEmbed/OGP sources, and Mermaid rendering by default.
- HTML rendering uses [mark-deco](https://github.com/kekyo/mark-deco/), while page composition employs script-based processing via [funcity](https://github.com/kekyo/funcity/).
  This enables high page customizability.
- Document management assumes the use of Git. Document dates and author information are automatically collected from Git, eliminating the need for manual frontmatter management.
  Document writing management follows standard Git workflows, making it ideal for users who regularly write code.
- Built entirely with TypeScript/NPM, it can be used immediately with Node.js installed.
- Standard support for publishing information via sitemaps, RSS, and Atom is included.
- The default template assets utilize [Bootstrap](https://getbootstrap.jp/) to deliver simple, modern pages.
  Of course, it's flexible enough to use a completely different UI framework instead of Bootstrap.

TODO:

## How to use

Install a-terra-forge CLI interface via NPM:

```bash
$ npm i -g a-terra-forge
```

### Initialize a document site space

```bash
$ atr init
```
