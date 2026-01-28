# a-terra-forge

汎用的なmarkdownドキュメントサイトジェネレータ

![a-terra-forge](./images/a-terra-forge.120.png)

[![Project Status: WIP – Initial development is in progress, but there has not yet been a stable, usable release suitable for the public.](https://www.repostatus.org/badges/latest/wip.svg)](https://www.repostatus.org/#wip)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![NPM](https://img.shields.io/npm/v/a-terra-forge.svg)](https://www.npmjs.com/package/a-terra-forge)|

---

[(English language is here)](./README.md)

TODO: WIP

## これは何?

ある程度整理されたドキュメントを、少しずつ執筆したいと感じたことはありませんか？
一般的なブログシステムは管理が大変で、簡易なブログジェネレータもあくまで「ブログ」を執筆することが主目的のため、文書にまとまりが無く読み手にスムーズに文書を読んでもらうことが難しくなります。

a-terra-forgeは、執筆中の文書はタイムラインページで追うことが出来て、かつ、文書をカテゴリでまとめて表示させることができる、ドキュメントサイトジェネレータです。
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

## CLIの使い方

まずはNPMでa-terra-forge CLIをインストールします:

```bash
$ npm i -g a-terra-forge
```

使用方法は大きく2通りあります。CLIを直接使用する方法と、Viteプラグインを使用する方法です。
どちらの場合も、自動的に雛形を生成（スキャフォールディング）する機能があります。

- CLIを直接使用する方法は、a-terra-forgeの基本的な使用方法です。新規に文書の雛形を生成するコマンドと、サイトをビルドするコマンドがあります。
- Viteプラグインを使用する方法を使えば、ブラウザでビルドされたサイトをプレビューしつつ、文書を執筆できます。文書を保存すると、自動的にプレビューが更新されるので、常にページの表示を見ながら執筆ができるという、擬似的な [WYSIWYG](https://ja.wikipedia.org/wiki/WYSIWYG) を実現します。

### ドキュメントサイト編集スペースを初期化 (Viteを使用する)

Viteプラグインを使用する場合は、以下のコマンドでドキュメントサイト編集スペースを生成します:

```bash
$ atr init
```

これにより、以下のようなファイル群が生成されます:

```
TODO: ツリーファイル一覧
```

この方法で生成されたファイル群は、Viteプラグインを使って、文書をブラウザで常時プレビューで確認しながら執筆する事が出来ます。
Viteプラグインを使うには、以下のコマンドを一度実行し:

```bash
$ npm i
```

その後は、編集したい時に以下のコマンドでプレビューできるようにします:

```bash
$ npm run dev
```

ドキュメントサイトをビルドする場合は、以下のコマンドを使用します:

```bash
$ npm run build
```

ビルドされたファイルは、`dist/`ディレクトリに出力されます。これらのファイルをサーバーにデプロイすれば公開完了です。

### ドキュメントサイト編集スペースを初期化 (Viteを使用しない)

Viteプラグインを使用しない場合は、以下のコマンドでドキュメントサイト編集スペースを生成します:

```bash
$ atr init --no-vite
```

これにより、以下のようなファイル群が生成されます:

```
TODO: ツリーファイル一覧
```

ドキュメントサイトをビルドする場合は、以下のコマンドを使用します:

```bash
$ atr build
```

ビルドされたファイルは、`dist/`ディレクトリに出力されます。これらのファイルをサーバーにデプロイすれば公開完了です。

### GitHub Pagesにデプロイする

生成された雛形には、GitHub Actionsスクリプトも含まれています。

予めGitHub Pagesの設定を、GitHub Actionsからの発行を実行できるようにしておけば、GitHubにpushするだけで、サイトをデプロイ出来ます。
以下は、GitHub Pagesの設定の例です:

TODO:設定の画像

準備が出来たら、以下のようにこのディレクトリでGitを初期化して最初のコミットを行い:

```bash
$ git init
$ git add -A
$ git commit -m "Initial commit"
```

あなたのGitHubリポジトリにpushしてください。これで、自動的にGitHub Actionsが動作して、数分でページが公開されます。

---

## 文書の書き方

TODO:

---

## テンプレートのカスタマイズ

TODO:

---

## License

Under MIT.
