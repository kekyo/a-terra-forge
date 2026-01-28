# a-terra-forge

汎用的なmarkdownドキュメントサイトジェネレータ

![a-terra-forge](./images/a-terra-forge.120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM](https://img.shields.io/npm/v/a-terra-forge.svg)](https://www.npmjs.com/package/a-terra-forge)

---

[(English language is here)](./README.md)

TODO: WIP

## これは何?

ある程度整理されたドキュメントを、少しずつ執筆したいと感じたことはありませんか？
一般的なブログシステムは管理が大変で、簡易なブログジェネレータもあくまで「ブログ」を執筆することが主目的のため、文書にまとまりが無く読み手にスムーズに文書を読んでもらうことが難しくなります。

"a-terra-forge"は、執筆中の文書をタイムラインページで追うことが出来て、かつ、文書をカテゴリでまとめて表示させることができる、ドキュメントサイトジェネレータです。
サイトは完全にスタティックビルドされるので、サーバーコードは不要です。
文書はmarkdownで書くことが出来て、以下のようなリッチ表現の機能もあります:

### 画像とポップアップ

![Image popup](./images/image-popup.png)

### 埋め込みコンテンツ・カード・グラフ図(mermaid)

![oEmbed, card and mermaid](./images/oembed-card-mermaid.png)

### ブロッククオートとシンタックスハイライト

![Block quote and code](./images/quote-code.png)

### ライト・ダークテーマ

![System theme (light/dark)](./images/light-dark.png)

### レスポンシブデザイン

![Responsive design](./images/responsive.png)

以下のような特徴があります:

- スタティックサイトジェネレータなので、サーバーは不要です。GitHub Pagesなど、任意のウェブサーバーにデプロイして公開できます。
- タイムラインページも最新の文書はスタティック生成され、古い記事は無限スクロール（デマンド読み込み）が行われます。
- 文書はmarkdownで記述します。markdownは、コードのシンタックスハイライト・oEmbed/OGPソースのカード表示・mermaidのレンダリングを標準でサポートしています。
- HTMLレンダリングは [mark-deco](https://github.com/kekyo/mark-deco/) を使用し、ページの構成は [funcity](https://github.com/kekyo/funcity/) でスクリプトによるプロセッシングを行います。
  したがって、ページの高いカスタマイズ性があります。
- Viteプラグインを使って、ブラウザでページのプレビューを見ながら文書を執筆することが出来ます。
- 文書の管理はGitを使うことを前提としています。文書の日時や執筆者情報もGitから自動的に収集するため、frontmatterでの手動の管理はほとんど必要ありません。
  文書執筆の管理も、通常のGit運用を前提で行えばよく、日常的にコードを記述するユーザーに向いています。
- すべてTypeScript/NPMで作られているため、Node.jsがインストールされていればすぐに使い始めることが出来ます。
- サイトマップ・RSS・Atomによる情報公開に標準で対応しています。
- 標準のテンプレートアセットは、[bootstrap](https://getbootstrap.jp/) によるシンプルでモダンなページを実現しています。
  もちろん、bootstrapを使わず、全く別のUIフレームワークを使用することも不可能ではない柔軟性があります。

---

## 執筆開始

まずは、NPMでa-terra-forgeのCLI（コマンドラインインターフェイス）をインストールします。
システムにNode.jsがインストールされていれば、すぐに使用を始めることが出来ます。

- 例えば、Ubuntuにはシステム用Node.jsがインストールされていることが多いので、これを使うことが出来ます。`node --version`で確かめることが出来ます。存在しない場合は `sudo apt install nodejs` でインストールできます。
- 他の環境でも、[Node.jsをダウンロードする](https://nodejs.org/ja/download) からインストールできます。

その後、以下のNPMコマンドで、CLIをインストールできます:

```bash
$ npm i -g a-terra-forge
```

使用方法は大きく2通りあります。CLIを直接使用する方法と、Viteプラグインを使用する方法です。
どちらの場合も、雛形を生成（スキャフォールディング）する機能があります。

- CLIを直接使用する方法は、a-terra-forgeの基本的な使用方法です。新規に文書の雛形を生成するコマンドと、サイトをビルドするコマンドがあります。
- Viteプラグインとは、ウェブ開発向けの [Vite](https://ja.vite.dev/) を使用して、ブラウザでビルドされたサイトをプレビューできるようにするものです。
  文書を保存すると、自動的にページのプレビューが更新されるので、常にページの表示を見ながら執筆ができるという、擬似的な [WYSIWYG](https://ja.wikipedia.org/wiki/WYSIWYG) が実現出来ます。

特に理由がなければ、Viteプラグインを使用して執筆すると良いと思います。
と言っても、使用方法は非常に簡単なので、恐れる必要はありません。

執筆自体は、 [Visual Studio Code](https://code.visualstudio.com/) などのテキストエディタ/markdownエディタを使用して執筆出来ます。
特別なワードプロセッサアプリケーションなどは不要です。

文書を執筆するには、文書を格納する「編集スペース」と呼ばれるディレクトリを作っておく必要があります。
この編集スペースはGitで管理することで、文書のバージョン管理も容易に実現出来ます。

以下の節では、編集スペースを初期化して、文書執筆の準備を行う手順を示します。

### 編集スペースを初期化 (Viteを使用する)

Viteプラグインを使用する場合は、以下のコマンドで現在のディレクトリに編集スペースを生成します:

```bash
$ atr init
a-terra-forge - Universal document-oriented markdown site generator
Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
License under MIT
https://github.com/kekyo/a-terra-forge

Scaffold created at /home/kouji/my-site
```

これにより、以下のようなファイル群が生成されます:

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

Viteプラグインを使うには、以下のコマンドを最初の一度だけ実行します（表示される内容は多少異なる場合があります）:

```bash
$ npm i
added 306 packages, and audited 307 packages in 16s

152 packages are looking for funding
  run `npm fund` for details

found 0 vulnerabilities
```

その後は、編集したい時に以下のコマンドでプレビューできるようにします。
システム標準のウェブブラウザが自動的に開き、サイトのプレビューが表示されます:

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

今表示されたページは、雛形のサンプル文書や画像などが表示されています。
すでに文書が書かれていたり、全体的に真っ青だったりと不安を感じるかもしれませんが、もちろん心配無用です。
これらをサクッと削除して、一から文書を書き始め、見た目も調整することが出来ます（少なくとも、アクセントカラーは簡単に変えられます）。

プレビューが表示された時点で、ドキュメントサイトはビルドされていますが、手動でビルドする場合は、以下のコマンドを使用します:

```bash
$ npm run build
```

ビルドされたファイルは、 `dist/` ディレクトリに出力されます。
この時点では、以下のようになっているでしょう:

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

これらのファイルをサーバーにデプロイすれば公開完了です。
見ての通り、サイトマップやRSS/Atomなどのフィードディスクリプタも自動的に生成されます。

GitHub Pagesなどに自動でデプロイさせるには、後述の節を参照してください。

### 編集スペースを初期化 (CLIを使用する)

Viteプラグインを使用しない場合は、以下のコマンドでドキュメントサイト編集スペースを生成します:

```bash
$ atr init --no-vite
a-terra-forge - Universal document-oriented markdown site generator
Copyright (c) Kouji Matsui (@kekyo@mi.kekyo.net)
License under MIT
https://github.com/kekyo/a-terra-forge

Scaffold created at /home/kouji/my-page
```

これにより、以下のようなファイル群が生成されます:

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

ドキュメントサイトをビルドする場合は、以下のコマンドを使用します:

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

ビルドされたファイルは、 `dist/` ディレクトリに出力されます。
この時点では、以下のようになっているでしょう（Viteプラグインを使用した場合と同じはずです）:

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

これらのファイルをサーバーにデプロイすれば公開完了です。
見ての通り、サイトマップやRSS/Atomなどのフィードディスクリプタも自動的に生成されます。

GitHub Pagesなどに自動でデプロイさせるには、後述の節を参照してください。

---

## 文書の管理

あなたは、執筆した文書が気に入らないとか、いくつかの候補を書き上げてからどれかを選んだり、それらを元に清書するというステップを踏んだことがあるかもしれません。
そのような場合に、Gitのバージョン管理を使えば、編集作業が柔軟かつ安全に行えるようになります。

ソフトウェア開発者の場合は、日常的にソースコードの管理をGitで行っているので、より実感しやすいでしょう。

この章では、編集スペースをGitで管理する準備と、それを応用してサイトを自動的に公開することまで行います。
これらの準備が整えば、執筆作業に集中できる環境が整うはずです。

### 編集スペースをGitで管理する

まず、編集スペースをGitに管理させて、バージョン管理できるようにしましょう。
そうすれば、誤った編集やページのカスタマイズ、気に入らない記述なども容易に元に戻せます。

以下のコマンドで、編集スペースの状態をGitの最初のバージョンとして登録（コミット）します:

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

これで、編集スペースがGitで管理されるようになりました。

先程のプレビュー表示が全体的に真っ青だったことを覚えていますか？
実は、a-terra-forgeは、編集中でGitにコミットされていない文書が、青色の背景で分かるようにしていたのです。

コミット後に確認すれば、背景が白色（または黒色）となっていることが分かるでしょう。
また、Gitから得られた日時や執筆者名が表示されるようになります:

![After committed](images/comitted.png)

世界には、Gitに関する使い方の説明や書籍がたくさんあります。それらを参照すれば、バージョン管理の理解も深まるでしょう。
また、今ならChatGPTに聞くだけで、どうすれば良いのか説明してくれるはずです。

### 全自動でページを公開する

`atr init`コマンドで生成された雛形には、GitHub Actionsスクリプトが含まれています:

```
├── .github
│   └── workflows
│       └── build.yml
```

編集スペースをGitHubに保存するのであれば、このスクリプトを使用して、全自動でページを公開することが出来ます。

- 注意: このスクリプトは、バージョン管理をGitで行い、かつGitHubに保存する場合のみ使用できます。
  他の環境でも同様の事は不可能ではありませんが、その場合はご自身で作業する必要があります。
  したがって、以下の作業は、GitHubにユーザー登録を行って、編集スペースを保存するリモートリポジトリを作っていることが前提です。

予めGitHub Pagesの設定で、GitHub Actionsからの発行を許可しておけば、GitHubにpushするだけで、サイトをデプロイ出来ます。

以下は、GitHub Pagesの設定の例です。
リモートリポジトリの `Settings` タブの `Pages` をクリックし、ドロップダウンリストから `GitHub Actions` を選択します:

![GitHub Pages settings](./images/gh-pages.png)

準備が出来たら、ブランチをリモートリポジトリにpushしてください。これで、自動的にGitHub Actionsが動作して、数十秒〜数分でページが公開されます。
サイトのURLは、`https://<アカウント名>.github.io/<リポジトリ名>/` となっているはずです。

GitHub Actionsの動作状況を確認したい場合は、以下のページを参照してください:

![GitHub Actions status](./images/gh-actions.png)

### 文書スペースの全体的な設定

a-terra-forgeは、文書スペースの全体的な管理を `atr.json` というファイルで行います。
このファイルはJSON形式（正確にはJSON5）で、サイト共通の設定や、メッセージリスト等を含みます。
以下は、 `atr.json` の一部を抜き出したものです:

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

上記 `variables` に含まれる定義は「変数」として扱われ、a-terra-forgeの内部処理や、テンプレートスクリプト（後述）で参照できるように定義されています。これらの値を使用して、全体的なサイト生成の調整や、見た目の変更などが行えます。

以下に、これらの値の説明を示します:

|変数名|詳細|
|:----|:----|
|`baseUrl`| このサイトのデプロイ後の公開基底URLを指定します。ナビゲーションメニューに影響はありませんが、サイトマップの生成には必要なので、設定してください。|
|`siteName`| このサイトのサイト名で、ナビゲーションメニューの左端の表示や、ページメタデータの埋め込みに使用されます。 |
|`siteDescription`| このサイトの説明文で、ページメタデータの埋め込みに使用されます。 |
|`locale`| サイト全体の言語指定です。文書にも個別に指定することが出来ますが、省略された場合にこの値が使用されます。例えば英語の場合は`en`、日本語の場合は`ja`です。この指定を行っても、コンテンツが自動的に翻訳されることはありません。 |
|`frontPage`| サイトのフロントページ（トップページ）として、どのカテゴリを表示するかを指定します。既定は`timeline`で、これはタイムラインを表示する、特殊なカテゴリ名です。 |
|`headerIcon`| 文書のタイトルに表示するアイコンの指定です。名称は [bootstrap icons](https://icons.getbootstrap.com/) で指定します。文書にも個別に指定することが出来ますが、省略された場合にこの値が使用されます。 |
|`primaryColor`| サイトのプライマリ（優先）アクセントカラーを指定します。雛形が青色のアクセントを多用しているのはこの指定によるものです。この色を変えれば、あなたの好みのアクセントカラーに変更できます。但し、システムテーマのlightとdarkでバランスの取れている色味を試行錯誤することを忘れずに。 |
|`secondaryColor`| サイトのセカンダリ（補間）アクセントカラーを指定します。セカンダリカラーは今の所、ブロッククオートでのみ使用しています。 |
|`inlineCodeColor`| サイトのインラインコードカラーを指定します。これは、markdown上でバッククオートで囲まれた文字（インラインコード）の色です。インラインコードの背景色もこの指定から着色されます。 |
|`siteTemplates`| サイト共通のアセットファイルで、funcityによるスクリプト処理を行うテンプレートファイル群を指定します。CSSやJavaScriptファイル、RSS/Atom、サイトマップなどは、全てスクリプトとして処理されて出力されます。追加のスクリプト処理が必要なファイルはこのリストに追加することで、同じようにスクリプト処理の対象として認識させることが出来ます。 |
|`contentFiles`| ビルド時に `docs` 以下から追加でコピーする静的ファイルの glob パターンを指定します。画像などの補助ファイルを出力先に展開したい場合に使います。 |
|`categories`| 認識したカテゴリを、どの順序でナビゲーションメニューに表示させるのかを決定するリストです。ここに明示のないカテゴリは、これらのリストの終端に配置されます。また、個々に明示されているのに存在しないカテゴリは無視されます。 |
|`categoriesAfter`| 認識したカテゴリを、どの順序でナビゲーションメニューに表示させるのかを決定するリストです。但し、このリストは、ナビゲーションメニューの右寄せで表示されます。一般カテゴリとは分けて置きたい場合に使用できます。 |

例えば、 `primaryColor` を `#ff4040` に変更すると、以下のようにアクセントカラーが変わります:

![Accent color](./images/accent-color.png)

上記の変数には、カテゴリについての調整項目がいくつかあります。それらは後述のカテゴリに基づいた設定なので、そちらを参照した上で改めて確認すると良いでしょう。

---

## 文書の書き方

TODO:

### カテゴリとタイムライン

TODO:

- カテゴリが文書のまとまりで分割可能
- タイムラインは全自動
- ナビゲーションバーのメニュー
- フロントページの選択

### 画像の挿入

TODO:

### カードの挿入

TODO:

- oEmbed
- OGP

### コードの挿入

TODO:

### mermaidの挿入

TODO:

### カテゴリの配置

TODO:

- タイトルの扱い(H1)
- order
- カテゴリアイコン
- サブカテゴリ
- 固定ページ化（メタデータ消す）

---

## テンプレートのカスタマイズ

TODO:

---

## その他

このジェネレータの初期アイデアは10年ほど前に遡り、一度 [.NETで具現化](https://github.com/kekyo/MarkTheRipper/) させようとしたのですが、（ソフトウェア外の）問題が色々重なって放置状態となっていました。
今回、新たにTypeScriptで書き直して、ようやく形になりました。.NET実装での反省点をいくつかブラッシュアップして、良いものに仕上がったと思っています。

近いうちに、私のブログサイトも、WordPressからa-terra-forgeに置き換えて、ドッグフーディングします。

[それで結局、 "a-terra-forge" とは何なのか？という話なんですが...](<https://ja.wikipedia.org/wiki/%E9%98%BF%E5%AF%BA%E5%B7%9D_(%E9%95%B7%E9%87%8E%E7%9C%8C)>) まあ殆ど後付けなんだけどね ;)

## License

Under MIT.
