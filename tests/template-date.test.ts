// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('template dates', () => {
  it('renders per-entry committer dates in blog and timeline entries', async () => {
    const blogTemplate = await readFile(
      'scaffold/.templates/blog-entry.html',
      'utf8'
    );
    const timelineTemplate = await readFile(
      'scaffold/.templates/timeline-entry.html',
      'utf8'
    );

    expect(blogTemplate).toContain(
      "{{getMessage 'date'}}: {{formatDate 'YYYY/MM/DD' git.committer.date}}"
    );
    expect(timelineTemplate).toContain(
      "{{getMessage 'date'}}: {{formatDate 'YYYY/MM/DD' git.committer.date}}"
    );
  });

  it('uses the latest category committer date for category pages and metadata', async () => {
    const categoryTemplate = await readFile(
      'scaffold/.templates/index-category.html',
      'utf8'
    );
    const commonHeader = await readFile(
      'scaffold/.templates/common-header.html',
      'utf8'
    );

    expect(categoryTemplate).toContain(
      'set committerDates (sort (collect (map (fun articleEntry articleEntry.git?.committer.date) articleEntries)))'
    );
    expect(categoryTemplate).toContain(
      "{{getMessage 'date'}}: {{formatDate 'YYYY/MM/DD' (last committerDates)}}"
    );
    expect(commonHeader).toContain(
      '<meta property="article:modified_time" content="{{last committerDates}}">'
    );
  });
});
