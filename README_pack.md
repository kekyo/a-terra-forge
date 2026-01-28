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

![System theme (light/dark)](./images/light-dark.png)

Features:

- As a static site generator, no server is required. You can deploy and publish to any web server, such as GitHub Pages.
- The timeline page also statically generates the latest documents, while older articles use infinite scroll (on-demand loading).
- Documents are written in Markdown. Markdown supports syntax highlighting for code, card display for oEmbed/OGP sources, and Mermaid rendering by default.
- HTML rendering uses [mark-deco](https://github.com/kekyo/mark-deco/), while page composition performs script-based processing via [funcity](https://github.com/kekyo/funcity/).
  Therefore, pages can be highly customized.
- With the Vite plugin, you can write documents while previewing pages in your browser.
- Document management assumes Git. Document timestamps and author information are automatically collected from Git, so manual frontmatter management is mostly unnecessary.
  Document writing management can follow standard Git workflows and is suitable for users who regularly write code.
- Since everything is built with TypeScript/NPM, you can start using it immediately as long as Node.js is installed.
- Standard support for publishing information via sitemaps, RSS, and Atom is included.
- The default template assets deliver simple, modern pages using [Bootstrap](https://getbootstrap.jp/).
  Of course, it is flexible enough to use a completely different UI framework without Bootstrap.

## How to use

Install a-terra-forge CLI interface via NPM:

```bash
$ npm i -g a-terra-forge
```

### Initialize an editing space

```bash
$ atr init
```

To use the Vite plugin, run the following command once (the output may differ slightly):

```bash
$ npm i
added 306 packages, and audited 307 packages in 16s

152 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

After that, you can preview by running the following command when you want to edit.
Your system's default web browser will open automatically to display a preview of the site:

```bash
$ npm run dev
```

---

## Documentation

For detailed documentation and advanced features, please visit our [GitHub repository](https://github.com/kekyo/a-terra-forge/).

## License

Under MIT.
