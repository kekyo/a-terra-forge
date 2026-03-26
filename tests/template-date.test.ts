// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

import { readFile } from 'fs/promises';
import { describe, expect, it } from 'vitest';

describe('template dates', () => {
  it('renders created and updated dates in blog and timeline entries', async () => {
    const blogTemplate = await readFile(
      'scaffold/.templates/default/blog-entry.html',
      'utf8'
    );
    const timelineTemplate = await readFile(
      'scaffold/.templates/default/timeline-entry.html',
      'utf8'
    );

    expect(blogTemplate).toContain("{{getMessage 'createdDate'}}");
    expect(blogTemplate).toContain("{{getMessage 'updatedDate'}}");
    expect(blogTemplate).toContain('git.created.committer.date');
    expect(blogTemplate).toContain('git.updated.committer.date');
    expect(blogTemplate).toContain(
      'not (eq git.updated.committer.date git.created.committer.date)'
    );

    expect(timelineTemplate).toContain("{{getMessage 'createdDate'}}");
    expect(timelineTemplate).toContain("{{getMessage 'updatedDate'}}");
    expect(timelineTemplate).toContain('git.created.committer.date');
    expect(timelineTemplate).toContain('git.updated.committer.date');
    expect(timelineTemplate).toContain(
      'not (eq git.updated.committer.date git.created.committer.date)'
    );
  });

  it('uses aggregated created and updated dates for category pages and metadata', async () => {
    const categoryTemplate = await readFile(
      'scaffold/.templates/default/index-category.html',
      'utf8'
    );
    const commonHeader = await readFile(
      'scaffold/.templates/default/common-header.html',
      'utf8'
    );

    expect(categoryTemplate).toContain(
      'set createdDates (sort (collect (map (fun articleEntry articleEntry.git?.created.committer.date) articleEntries)))'
    );
    expect(categoryTemplate).toContain(
      'set updatedDates (sort (collect (map (fun articleEntry articleEntry.git?.updated.committer.date) articleEntries)))'
    );
    expect(categoryTemplate).toContain(
      "{{getMessage 'createdDate'}}: {{formatDate 'YYYY/MM/DD' (first createdDates)}}"
    );
    expect(categoryTemplate).toContain(
      "{{getMessage 'updatedDate'}}: {{formatDate 'YYYY/MM/DD' (last updatedDates)}}"
    );
    expect(commonHeader).toContain(
      '<meta property="article:modified_time" content="{{last committerDates}}">'
    );
    expect(commonHeader).toContain(
      '<meta property="og:image" content="{{toAbsolutePath ogImagePath}}">'
    );
    expect(commonHeader).toContain(
      '<meta name="twitter:image" content="{{toAbsolutePath ogImagePath}}">'
    );
  });
});
