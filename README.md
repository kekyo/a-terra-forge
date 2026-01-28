# a-terra-forge

General-purpose Markdown document site generator

![a-terra-forge](./images/a-terra-forge.120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM](https://img.shields.io/npm/v/a-terra-forge.svg)](https://www.npmjs.com/package/a-terra-forge)

---

[(Japanese language is here)](./README_ja.md)

TODO: WIP

## What is this?

Have you ever felt like writing documents that are somewhat organized, bit by bit?
General blog systems are cumbersome to manage, and simple blog generators are primarily designed for writing "blogs," so documents tend to lack cohesion and can be hard for readers to follow smoothly.

"a-terra-forge" is a document site generator that lets you track documents in progress via a timeline page and also group and display documents by category.
The site is built fully static, so no server code is required.
Documents can be written in Markdown, and it also supports rich expressions such as:

### Images and popup

![Image popup](./images/image-popup.png)

### Embedded content, cards, and graphs (Mermaid)

![oEmbed, card and mermaid](./images/oembed-card-mermaid.png)

### Block quotes and syntax highlighting

![Block quote and code](./images/quote-code.png)

### Light/Dark theme

![System theme (light/dark)](./images/light-dark.png)

### Responsive design

![Responsive design](./images/responsive.png)

It has the following features:

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

---

## Getting started with writing

First, install the a-terra-forge CLI (command line interface) via NPM.
If Node.js is installed on your system, you can start using it immediately.

- For example, Ubuntu often has a system Node.js installed, so you can use that. You can check with `node --version`. If it does not exist, install it with `sudo apt install nodejs`.
- In other environments, you can install from [Download Node.js](https://nodejs.org/ja/download).

Then you can install the CLI with the following NPM command:

```bash
$ npm i -g a-terra-forge
```

There are two main usage patterns: using the CLI directly, and using the Vite plugin.
In either case, there is a scaffold generation feature.

- Using the CLI directly is the basic way to use a-terra-forge. There are commands to generate a new document scaffold and to build the site.
- The Vite plugin uses [Vite](https://ja.vite.dev/) for web development to preview the built site in a browser.
  When you save documents, the page preview updates automatically, enabling a pseudo [WYSIWYG](https://ja.wikipedia.org/wiki/WYSIWYG) experience where you can always write while watching the page.

Unless there is a particular reason, it is recommended to write using the Vite plugin.
Even so, the usage is very simple, so there is no need to worry.

Writing itself can be done with a text editor/Markdown editor such as [Visual Studio Code](https://code.visualstudio.com/).
No special word processor application is required.

To write documents, you need to create a directory called an "editing space" to store your documents.
By managing this editing space with Git, you can easily implement version control for documents.

The following sections show the steps to initialize the editing space and prepare for writing.

### Initialize an editing space (using Vite)

If you use the Vite plugin, run the following command to generate an editing space in the current directory:

```bash
$ atr init
a-terra-forge - Universal document-oriented markdown site generator
Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
License under MIT
https://github.com/kekyo/a-terra-forge

Scaffold created at /home/kouji/my-site
```

This creates the following files:

```
my-page
├── atr.json
├── dist
├── docs
│   ├── about
│   │   ├── a-terra-forge.png
│   │   └── index.md
│   └── hello
│       ├── article-demo.md
│       ├── demo-image.jpg
│       ├── index.md
│       └── rich-demo.md
├── package.json
├── templates
│   ├── atom.xml
│   ├── category-entry.html
│   ├── feed.xml
│   ├── index-category.html
│   ├── index-timeline.html
│   ├── navigation-bar.html
│   ├── sitemap.xml
│   ├── site-script.js
│   ├── site-site-style.css
│   └── timeline-entry.html
├── vite.config.ts
├── .github
│   └── workflows
│       └── build.yml
└── .gitignore
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
[atr-vite-plugin] a-terra-forge - Universal document-oriented markdown site generator
[atr-vite-plugin] Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
[atr-vite-plugin] License under MIT
[atr-vite-plugin] https://github.com/kekyo/a-terra-forge
[atr-vite-plugin] [0.0.3-c3878308d52ba4d64b67d2aeb59436eb86953241] Started.

  VITE v7.3.1  ready in 597 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
  ➜  press h + enter to show help
[atr-vite-plugin] Preparing...
[atr-vite-plugin] Render each articles [4]...
[atr-vite-plugin] renderer: entry time max=2144.04ms avg=686.66ms (4 entries)
[atr-vite-plugin] renderer: total time 2493.13ms
[atr-vite-plugin] Finalizing now...
[atr-vite-plugin] built: dist/about/index.html
[atr-vite-plugin] built: dist/hello/index.html
[atr-vite-plugin] built: dist/index.html
[atr-vite-plugin] built: dist/site-script.js
[atr-vite-plugin] built: dist/sitemap.xml
[atr-vite-plugin] built: dist/atom.xml
[atr-vite-plugin] built: dist/feed.xml
[atr-vite-plugin] built: dist/site-style.css
```

![Preview](images/preview.png)

The page shown includes the scaffold's sample documents and images.
You might feel uneasy if documents already exist or everything is bright blue, but there is no need to worry.
You can quickly delete them, start writing from scratch, and adjust the appearance (At least, the accent color can be easily changed).

When the preview is displayed, the document site has already been built, but to build it manually, use the following command:

```bash
$ npm run build
```

The built files are output to the `dist/` directory.
At this point, it should look like this:

```
dist/
├── about
│   ├── a-terra-forge.png
│   └── index.html
├── article-bodies
│   ├── 0.html
│   ├── 1.html
│   ├── 2.html
│   └── 3.html
├── atom.xml
├── feed.xml
├── hello
│   ├── demo-image.jpg
│   └── index.html
├── index.html
├── sitemap.xml
├── site-script.js
├── site-style.css
└── timeline.json
```

Deploy these files to a server to publish.
As you can see, feeds such as sitemaps and RSS/Atom are generated automatically.

To automatically deploy to GitHub Pages, see the section below.

### Initialize an editing space (using the CLI)

If you do not use the Vite plugin, generate the document site editing space with the following command:

```bash
$ atr init --no-vite
a-terra-forge - Universal document-oriented markdown site generator
Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
License under MIT
https://github.com/kekyo/a-terra-forge

Scaffold created at /home/kouji/my-page
```

This creates the following files:

```
my-page
├── atr.json
├── dist
├── docs
│   ├── about
│   │   ├── a-terra-forge.png
│   │   └── index.md
│   └── hello
│       ├── article-demo.md
│       ├── demo-image.jpg
│       ├── index.md
│       └── rich-demo.md
├── templates
│   ├── atom.xml
│   ├── category-entry.html
│   ├── feed.xml
│   ├── index-category.html
│   ├── index-timeline.html
│   ├── navigation-bar.html
│   ├── sitemap.xml
│   ├── site-script.js
│   ├── style.css
│   └── timeline-entry.html
├── .github
│   └── workflows
│       └── build.yml
└── .gitignore
```

To build the document site, use the following command:

```bash
$ atr build
a-terra-forge - Universal document-oriented markdown site generator
Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
License under MIT
https://github.com/kekyo/a-terra-forge

Preparing...
Render each articles [4]...
renderer: entry time max=2630.03ms avg=784.29ms (4 entries)
renderer: total time 2966.43ms
Finalizing now...
built: dist/about/index.html
built: dist/hello/index.html
built: dist/index.html
built: dist/atom.xml
built: dist/feed.xml
built: dist/sitemap.xml
built: dist/site-script.js
built: dist/site-style.css
```

The built files are output to the `dist/` directory.
At this point, it should look like this (the same as when using the Vite plugin):

```
dist
├── about
│   ├── a-terra-forge.png
│   └── index.html
├── article-bodies
│   ├── 0.html
│   ├── 1.html
│   ├── 2.html
│   └── 3.html
├── atom.xml
├── feed.xml
├── hello
│   ├── demo-image.jpg
│   └── index.html
├── index.html
├── sitemap.xml
├── site-script.js
├── style.css
└── timeline.json
```

Deploy these files to a server to publish.
As you can see, feeds such as sitemaps and RSS/Atom are generated automatically.

To automatically deploy to GitHub Pages, see the section below.

---

## Managing documents

You may have experienced not liking the documents you wrote, writing several candidates and choosing one, or polishing them later.
In such cases, using Git for version control allows editing work to be flexible and safe.

For software developers, who manage source code with Git daily, this should be easy to understand.

In this chapter, we prepare to manage the editing space with Git and extend it to automatically publish the site.
Once these preparations are complete, you should have an environment that lets you focus on writing.

### Manage the editing space with Git

First, manage the editing space with Git so you can perform version control.
That way, incorrect edits, page customizations, or text you do not like can easily be reverted.

Register the current state of the editing space as the first version (commit) in Git with the following commands:

```bash
$ git init
Initialized empty Git repository in /home/kouji/my-page/.git/
$ git add -A
$ git commit -m "Initial commit"
[main (root-commit) e5fc1c0] Initial commit
 19 files changed, 2547 insertions(+)
 create mode 100644 .github/workflows/build.yml
 create mode 100644 .gitignore
 create mode 100644 atr.json
    :
    :
    :
```

Now the editing space is managed by Git.

Do you remember the preview being entirely bright blue?
In fact, a-terra-forge uses a blue background to show documents that are being edited and have not been committed to Git.

If you check after committing, you will see that the background is white (or black).
The date and author name obtained from Git will also be displayed:

![After committed](images/comitted.png)

There are many explanations and books about how to use Git. Referring to them will deepen your understanding of version control.
Also, these days you can just ask ChatGPT to explain what to do.

### Publish pages fully automatically

The scaffold generated by the `atr init` command includes a GitHub Actions script:

```
├── .github
│   └── workflows
│       └── build.yml
```

If you store the editing space on GitHub, you can use this script to publish pages fully automatically.

- Note: This script can only be used when you manage versions with Git and store them on GitHub.
  It is not impossible to do the same thing in other environments, but you will need to do it yourself.
  Therefore, the following steps assume that you have registered a GitHub account and created a remote repository to store the editing space.

If you allow publishing from GitHub Actions in the GitHub Pages settings, you can deploy the site just by pushing to GitHub.

Below is an example of the GitHub Pages settings.
Click the `Settings` tab of the remote repository, then `Pages`, and select `GitHub Actions` from the dropdown list:

![GitHub Pages settings](./images/gh-pages.png)

When you are ready, push your branch to the remote repository. GitHub Actions will run automatically, and the page will be published in tens of seconds to a few minutes.
The site URL should be `https://<account-name>.github.io/<repository-name>/`.

If you want to check the status of GitHub Actions, see the following page:

![GitHub Actions status](./images/gh-actions.png)

### Overall configuration of the document space

a-terra-forge manages the overall document space using a file called `atr.json`.
This file is in JSON format (strictly speaking, JSON5) and includes site-wide settings, message lists, and more.
Below is a partial excerpt of `atr.json`:

```json
{
  "variables": {
    "baseUrl": "https://atr-doc-site.github.io",
    "siteName": "atr-doc-site",
    "siteDescription": "Sample a-terra-forge site",
    "locale": "en",
    "frontPage": "timeline",
    "headerIcon": "activity",
    "primaryColor": "#0080ff",
    "secondaryColor": "#40ff40",
    "inlineCodeColor": "#0080ff",
    "siteTemplates": [
      "site-style.css",
      "site-script.js",
      "feed.xml",
      "atom.xml",
      "sitemap.xml"
    ],
    "contentFiles": ["./**/*.png", "./**/*.jpg"],
    "categories": ["timeline", "hello"],
    "categoriesAfter": ["about"]
  }
  // :
  // :
  // :
}
```

The definitions included in `variables` above are treated as "variables" and are defined so they can be referenced by a-terra-forge's internal processing and template scripts (described later). These values can be used to adjust overall site generation and appearance.

Below is an explanation of these values:

|Variable name|Details|
|:----|:----|
|`baseUrl`|Specifies the base URL where this site will be published after deployment. It does not affect the navigation menu, but it is required for sitemap generation, so be sure to set it. |
|`siteName`|The site name of this site, used for the left end of the navigation menu and for embedding page metadata.  |
|`siteDescription`|The site description, used for embedding page metadata.  |
|`locale`|The language setting for the entire site. You can also specify it per document, but this value is used when it is omitted. For example, `en` for English and `ja` for Japanese. This setting does not automatically translate content. |
|`frontPage`|Specifies which category to display as the site's front page (top page). The default is `timeline`, which is a special category name that shows the timeline. |
|`headerIcon`|The icon displayed in document titles. The name is specified using [Bootstrap Icons](https://icons.getbootstrap.com/). You can also specify it per document, but this value is used when omitted.                                                                                                                          |
|`primaryColor`|Specifies the primary accent color for the site. The scaffold uses many blue accents because of this setting. If you change this color, you can use your preferred accent color. However, do not forget to try colors that are well balanced between the system light and dark themes.                                     |
|`secondaryColor`|Specifies the secondary accent color for the site. The secondary color is currently used only in block quotes. |
|`inlineCodeColor`|Specifies the inline code color for the site. This is the color of text enclosed in backticks in Markdown (inline code). The background color of inline code is also colored based on this setting. |
|`siteTemplates`|Site-wide asset files and a group of template files that are processed with funcity scripts. CSS and JavaScript files, RSS/Atom, and sitemaps are all processed as scripts and output. If you add files that require additional script processing to this list, they will also be recognized as script processing targets. |
|`contentFiles`|Specifies glob patterns for static files to copy from under `docs` during build. Use this to publish assets like images alongside generated pages. |
|`categories`|A list that determines the order in which recognized categories are displayed in the navigation menu. Categories not explicitly listed here are placed at the end of the list. Categories explicitly listed but not present are ignored. |
|`categoriesAfter`|A list that determines the order in which recognized categories are displayed in the navigation menu. However, this list is displayed right-aligned in the navigation menu. Use this if you want to separate them from general categories. |

For example, changing `primaryColor` to `#ff4040` will alter the accent color as follows:

![Accent color](./images/accent-color.png)

The variables above include several items for adjusting categories. These are settings based on categories, so you should check them again after referring to the categories described later.

---

## How to write documents

TODO:

### Categories and timeline

TODO:

- Categories can split documents into groups.
- The timeline is fully automatic.
- Navigation bar menu.
- Selecting the front page.

### Insert images

TODO:

### Insert cards

TODO:

- oEmbed
- OGP

### Insert code

TODO:

### Insert Mermaid

TODO:

### Category arrangement

TODO:

- Title handling (H1)
- order
- Category icon
- Subcategory
- Fix as a static page (remove metadata)

---

## Customize templates

TODO:

---

## Other

The initial idea for this generator dates back about 10 years, and [I once tried to realize it in .NET](https://github.com/kekyo/MarkTheRipper/), but various (non-software) issues piled up and it was left abandoned.
Now, I rewrote it in TypeScript, and it has finally taken shape. I believe I've refined several lessons learned from the .NET implementation and produced a solid result.

Soon, I will replace my blog site from WordPress to a-terra-forge and dogfood it.

[So, what exactly is "a-terra-forge"? (in japanese)](<https://ja.wikipedia.org/wiki/%E9%98%BF%E5%AF%BA%E5%B7%9D_(%E9%95%B7%E9%87%8E%E7%9C%8C)>) Well, it's mostly an afterthought ;)

## License

Under MIT.
