// a-terra-forge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-forge

(() => {
  const pageSize = 5;
  const toggleId = 'themeToggle';
  const storageKey = 'preferred-theme';
  const themeAttr = 'data-bs-theme';
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const copyButtonClass = 'code-copy-button';
  const copiedClass = 'code-copy-button-copied';
  const headingAnchorClass = 'heading-anchor';
  const headingAnchorCopiedClass = 'heading-anchor--copied';
  const headingLinkClass = 'heading-link';
  const headingHasLinkClass = 'heading-has-link';
  const imageModalId = 'imageModal';
  const imageModalImageClass = 'image-modal-image';
  const imageModalContentClass = 'image-modal-content-body';
  const endOfArticle = "{{getMessage 'endOfArticle' 'End of article.'}}";
  const noArticlesYet = "{{getMessage 'noArticlesYet' 'No articles yet.'}}";
  let mermaidInitialized = false;
  let mermaidThemeKey = '';

  const getStoredTheme = () => {
    const saved = localStorage.getItem(storageKey);
    return saved === 'dark' || saved === 'light' ? saved : null;
  };

  const getPreferredTheme = () =>
    getStoredTheme() ?? (mediaQuery.matches ? 'dark' : 'light');

  const getMermaidTheme = () =>
    document.documentElement.getAttribute(themeAttr) === 'dark'
      ? 'dark'
      : 'default';

  const resolveCssColor = (value, fallback) => {
    if (!value) {
      return fallback;
    }
    const normalizeColor = (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return null;
      }
      if (!trimmed.startsWith('color(')) {
        const lowered = trimmed.toLowerCase();
        if (lowered.startsWith('oklch(') || lowered.startsWith('oklab(')) {
          return null;
        }
        return trimmed;
      }
      const match = trimmed.match(
        /^color\(srgb\s+([0-9.]+)\s+([0-9.]+)\s+([0-9.]+)(?:\s*\/\s*([0-9.]+))?\)$/i
      );
      if (!match) {
        return null;
      }
      const toChannel = (value) =>
        Math.round(Math.min(Math.max(Number.parseFloat(value), 0), 1) * 255);
      const r = toChannel(match[1]);
      const g = toChannel(match[2]);
      const b = toChannel(match[3]);
      const alphaRaw = match[4];
      if (alphaRaw !== undefined) {
        const alpha = Math.min(Math.max(Number.parseFloat(alphaRaw), 0), 1);
        if (alpha < 1) {
          return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        }
      }
      return `rgb(${r}, ${g}, ${b})`;
    };
    const normalizeWithCanvas = (input) => {
      const trimmed = input.trim();
      if (!trimmed) {
        return null;
      }
      const canvas =
        resolveCssColor.canvas ??
        (resolveCssColor.canvas = document.createElement('canvas'));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        return null;
      }
      const sentinel = '#010203';
      ctx.fillStyle = sentinel;
      ctx.fillStyle = trimmed;
      const normalized = ctx.fillStyle;
      if (normalized === sentinel && trimmed.toLowerCase() !== sentinel) {
        return null;
      }
      return normalized;
    };
    const probe = document.createElement('span');
    probe.style.color = value;
    document.body.appendChild(probe);
    const resolved = getComputedStyle(probe).color;
    probe.remove();
    return (
      normalizeColor(resolved) ?? normalizeWithCanvas(resolved) ?? fallback
    );
  };

  const getMermaidThemeVariables = () => {
    const styles = getComputedStyle(document.documentElement);
    const theme = getMermaidTheme();
    const inkBase =
      styles.getPropertyValue('--panel-ink').trim() ||
      (theme === 'dark' ? '#f5f8ff' : '#102640');
    const surfaceBase =
      styles.getPropertyValue('--panel-surface').trim() ||
      (theme === 'dark' ? '#141414' : '#ffffff');
    const borderBase = styles.getPropertyValue('--panel-border').trim() || inkBase;
    const ink = resolveCssColor(inkBase, theme === 'dark' ? '#f5f8ff' : '#102640');
    const surface = resolveCssColor(
      surfaceBase,
      theme === 'dark' ? '#141414' : '#ffffff'
    );
    const border = resolveCssColor(borderBase, ink);

    return {
      lineColor: ink,
      arrowheadColor: ink,
      primaryTextColor: ink,
      primaryBorderColor: border,
      primaryColor: surface,
      secondaryColor: surface,
      tertiaryColor: surface,
    };
  };

  const configureMermaid = () => {
    const mermaidApi = window.mermaid;
    if (!mermaidApi || typeof mermaidApi.initialize !== 'function') {
      return false;
    }
    const theme = getMermaidTheme();
    const themeVariables = getMermaidThemeVariables();
    const themeKey = [
      theme,
      themeVariables.lineColor,
      themeVariables.primaryColor,
      themeVariables.primaryBorderColor,
    ].join('|');
    if (mermaidInitialized && mermaidThemeKey === themeKey) {
      return true;
    }
    mermaidApi.initialize({ startOnLoad: false, theme, themeVariables });
    mermaidInitialized = true;
    mermaidThemeKey = themeKey;
    return true;
  };

  const applyTheme = (theme, persist = false) => {
    document.documentElement.setAttribute(themeAttr, theme);
    const toggle = document.getElementById(toggleId);
    if (toggle instanceof HTMLInputElement) {
      toggle.checked = theme === 'dark';
    }
    if (persist) {
      localStorage.setItem(storageKey, theme);
    }
  };

  applyTheme(getPreferredTheme());

  const createCopyButton = () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = copyButtonClass;
    button.setAttribute('aria-label', 'Copy code');
    button.setAttribute('title', 'Copy code');
    button.innerHTML =
      '<i class="bi bi-clipboard" aria-hidden="true"></i><span class="visually-hidden">Copy code</span>';
    return button;
  };

  const createHeadingAnchorButton = (anchorId, href) => {
    const link = document.createElement('a');
    link.className = headingAnchorClass;
    link.dataset.anchor = anchorId;
    link.setAttribute('aria-label', 'Copy link');
    link.setAttribute('title', 'Copy link');
    link.href = href || `#${anchorId}`;
    link.innerHTML =
      '<i class="bi bi-link-45deg" aria-hidden="true"></i><span class="visually-hidden">Copy link</span>';
    return link;
  };

  const ensureImageModal = () => {
    const existing = document.getElementById(imageModalId);
    if (existing instanceof HTMLElement) {
      return existing;
    }
    const modal = document.createElement('div');
    modal.id = imageModalId;
    modal.className = 'modal fade image-modal';
    modal.tabIndex = -1;
    modal.setAttribute('aria-hidden', 'true');
    modal.innerHTML = `<div class="modal-dialog modal-dialog-centered image-modal-dialog">
  <div class="modal-content image-modal-content">
    <div class="modal-body image-modal-body">
      <div class="${imageModalContentClass}"></div>
    </div>
  </div>
</div>`;
    document.body.appendChild(modal);
    return modal;
  };

  const setModalVariant = (modal, variant) => {
    const variants = ['image-modal--image', 'image-modal--media'];
    variants.forEach((name) => modal.classList.remove(name));
    if (variant === 'image') {
      modal.classList.add('image-modal--image');
    } else if (variant === 'media') {
      modal.classList.add('image-modal--media');
    }
  };

  const openModalWithContent = (content, onShown, variant) => {
    const bootstrapApi = window.bootstrap;
    if (!bootstrapApi || typeof bootstrapApi.Modal !== 'function') {
      return;
    }
    const modal = ensureImageModal();
    setModalVariant(modal, variant);
    const modalContent = modal.querySelector(`.${imageModalContentClass}`);
    if (!(modalContent instanceof HTMLElement)) {
      return;
    }
    modalContent.replaceChildren(content);
    if (typeof onShown === 'function') {
      const handler = () => {
        modal.removeEventListener('shown.bs.modal', handler);
        onShown(modal);
      };
      modal.addEventListener('shown.bs.modal', handler);
    }
    bootstrapApi.Modal.getOrCreateInstance(modal, {
      backdrop: true,
      focus: true,
      keyboard: true,
    }).show();
  };

  const openImageModal = (image) => {
    const img = document.createElement('img');
    img.className = `img-fluid ${imageModalImageClass}`;
    img.src = image.currentSrc || image.src;
    img.alt = image.alt || '';
    img.loading = 'lazy';
    openModalWithContent(img, undefined, 'image');
  };

  const addCopyButtons = (root) => {
    const scope =
      root && typeof root.querySelectorAll === 'function' ? root : document;
    const blocks = scope.querySelectorAll('pre');
    blocks.forEach((pre) => {
      if (!(pre instanceof HTMLElement)) {
        return;
      }
      if (!pre.querySelector('code')) {
        return;
      }
      if (pre.querySelector(`.${copyButtonClass}`)) {
        return;
      }
      pre.appendChild(createCopyButton());
    });
  };

  const addHeadingPermalinks = (root) => {
    const scope =
      root && typeof root.querySelectorAll === 'function' ? root : document;
    const headings = scope.querySelectorAll(
      '.entry-body h1, .entry-body h2, .entry-header h1, .entry-header h2'
    );
    headings.forEach((heading) => {
      if (!(heading instanceof HTMLElement)) {
        return;
      }
      if (heading.querySelector(`.${headingAnchorClass}`)) {
        return;
      }
      const explicitId = heading.id?.trim();
      const dataAnchor = heading.dataset.anchor?.trim();
      const anchorId = explicitId || dataAnchor;
      if (!anchorId) {
        return;
      }
      if (!explicitId && dataAnchor) {
        const existing = document.getElementById(anchorId);
        if (!existing) {
          heading.id = anchorId;
        }
      }
      const headingUrl = buildHeadingAnchorUrl(heading, anchorId);
      const headingLink = ensureHeadingLink(heading, headingUrl);
      if (headingLink) {
        heading.classList.add(headingHasLinkClass);
      }
      heading.insertBefore(
        createHeadingAnchorButton(anchorId, headingUrl),
        heading.firstChild
      );
    });
  };

  const renderMermaid = (root) => {
    const mermaidApi = window.mermaid;
    if (!mermaidApi) {
      return;
    }
    const scope =
      root && typeof root.querySelectorAll === 'function' ? root : document;
    const nodes = Array.from(scope.querySelectorAll('.mermaid'));
    if (nodes.length === 0) {
      return;
    }
    const fallbackHtml = new Map();
    nodes.forEach((node) => {
      if (!(node instanceof HTMLElement)) {
        return;
      }
      if (!node.dataset.mermaidSource) {
        node.dataset.mermaidSource = node.innerHTML;
      }
      if (root === document) {
        fallbackHtml.set(node, node.innerHTML);
        node.innerHTML = node.dataset.mermaidSource ?? '';
        node.removeAttribute('data-processed');
      }
    });
    configureMermaid();
    if (typeof mermaidApi.run === 'function') {
      try {
        const result = mermaidApi.run({ nodes });
        if (result && typeof result.catch === 'function' && root === document) {
          result.catch((error) => {
            console.warn('Mermaid render failed.', error);
            fallbackHtml.forEach((html, node) => {
              node.innerHTML = html;
            });
          });
        }
      } catch (error) {
        console.warn('Mermaid render failed.', error);
        if (root === document) {
          fallbackHtml.forEach((html, node) => {
            node.innerHTML = html;
          });
        }
      }
      return;
    }
    if (typeof mermaidApi.init === 'function') {
      mermaidApi.init(undefined, nodes);
    }
  };

  const copyText = async (text) => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {}
    }
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const result = document.execCommand('copy');
    textarea.remove();
    return result;
  };

  const setCopyState = (button, copied) => {
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = copied ? 'bi bi-check' : 'bi bi-clipboard';
    }
    button.classList.toggle(copiedClass, copied);
    button.setAttribute('aria-label', copied ? 'Copied' : 'Copy code');
    button.setAttribute('title', copied ? 'Copied' : 'Copy code');
  };

  const setHeadingCopyState = (button, copied) => {
    const icon = button.querySelector('i');
    if (icon) {
      icon.className = copied ? 'bi bi-check' : 'bi bi-link-45deg';
    }
    button.classList.toggle(headingAnchorCopiedClass, copied);
    button.setAttribute('aria-label', copied ? 'Copied' : 'Copy link');
    button.setAttribute('title', copied ? 'Copied' : 'Copy link');
  };

  const getDirectHeadingLinks = (heading) =>
    Array.from(heading.children).filter(
      (child) => child instanceof HTMLAnchorElement
    );

  const isIgnorableTextNode = (node) =>
    node.nodeType === Node.TEXT_NODE &&
    (!node.textContent || node.textContent.trim().length === 0);

  const hasOnlyAnchorChild = (heading, anchor) => {
    const meaningfulNodes = Array.from(heading.childNodes).filter(
      (node) => !isIgnorableTextNode(node)
    );
    return meaningfulNodes.length === 1 && meaningfulNodes[0] === anchor;
  };

  const resolveHeadingLinkUrl = (heading) => {
    const directLinks = getDirectHeadingLinks(heading);
    const explicit = directLinks.find((link) =>
      link.classList.contains(headingLinkClass)
    );
    if (explicit) {
      return explicit.href;
    }
    const fallback = directLinks.find(
      (link) => !link.classList.contains(headingAnchorClass)
    );
    if (fallback) {
      return fallback.href;
    }
    return '';
  };

  const ensureHeadingLink = (heading, href) => {
    if (!href) {
      return null;
    }
    const directLinks = getDirectHeadingLinks(heading);
    const existing = directLinks.find((link) =>
      link.classList.contains(headingLinkClass)
    );
    if (existing) {
      if (!existing.getAttribute('href')) {
        existing.href = href;
      }
      return existing;
    }
    const directCandidate = directLinks.find(
      (link) => !link.classList.contains(headingAnchorClass)
    );
    if (directCandidate && hasOnlyAnchorChild(heading, directCandidate)) {
      directCandidate.classList.add(headingLinkClass);
      if (!directCandidate.getAttribute('href')) {
        directCandidate.href = href;
      }
      return directCandidate;
    }
    if (heading.querySelector('a')) {
      return null;
    }
    const link = document.createElement('a');
    link.className = headingLinkClass;
    link.href = href;
    const nodes = Array.from(heading.childNodes);
    nodes.forEach((node) => link.appendChild(node));
    heading.appendChild(link);
    return link;
  };

  const resolveEntryBaseUrl = (heading) => {
    const entry = heading.closest('.article-entry');
    if (entry instanceof HTMLElement) {
      const entryUrl = entry.dataset.entryUrl?.trim();
      if (entryUrl) {
        try {
          return new URL(entryUrl, window.location.href).toString();
        } catch {}
      }
    }
    return window.location.href.split('#')[0];
  };

  const buildHeadingAnchorUrl = (heading, anchorId) => {
    if (heading.tagName.toLowerCase() === 'h1') {
      const linkUrl = resolveHeadingLinkUrl(heading);
      if (linkUrl) {
        return linkUrl;
      }
    }
    const baseUrl = resolveEntryBaseUrl(heading);
    const baseWithoutHash = baseUrl.split('#')[0];
    return `${baseWithoutHash}#${anchorId}`;
  };

  const handleCopyClick = async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(`.${copyButtonClass}`);
    if (!(button instanceof HTMLButtonElement)) {
      return;
    }
    const pre = button.closest('pre');
    const code = pre?.querySelector('code');
    const text = code?.textContent ?? '';
    if (!text) {
      return;
    }
    const copied = await copyText(text);
    if (!copied) {
      return;
    }
    setCopyState(button, true);
    const existingTimeout = button.dataset.copyTimeoutId;
    if (existingTimeout) {
      window.clearTimeout(Number(existingTimeout));
    }
    const timeoutId = window.setTimeout(() => {
      setCopyState(button, false);
      delete button.dataset.copyTimeoutId;
    }, 2000);
    button.dataset.copyTimeoutId = String(timeoutId);
  };

  const handleHeadingAnchorClick = async (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const button = target?.closest(`.${headingAnchorClass}`);
    if (!(button instanceof HTMLAnchorElement)) {
      return;
    }
    const anchorId = button.dataset.anchor;
    event.preventDefault();
    const heading = button.closest('h1, h2');
    const href = button.getAttribute('href');
    const url =
      href && href.length > 0
        ? new URL(href, window.location.href).toString()
        : heading instanceof HTMLElement && anchorId
          ? buildHeadingAnchorUrl(heading, anchorId)
          : anchorId
            ? `${window.location.href.split('#')[0]}#${anchorId}`
            : '';
    if (!url) {
      return;
    }
    const copied = await copyText(url);
    if (!copied) {
      return;
    }
    setHeadingCopyState(button, true);
    const existingTimeout = button.dataset.copyTimeoutId;
    if (existingTimeout) {
      window.clearTimeout(Number(existingTimeout));
    }
    const timeoutId = window.setTimeout(() => {
      setHeadingCopyState(button, false);
      delete button.dataset.copyTimeoutId;
    }, 2000);
    button.dataset.copyTimeoutId = String(timeoutId);
  };

  const handleImageModalClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    // Some layouts (e.g. floated image panels followed by blockquotes or other
    // full-width blocks) can visually place text beside the image while the
    // later block still overlaps the image's hit area. In that case the click
    // target is the overlapping block, not the image container. As a fallback,
    // search elements at the click point to find the image panel.
    let container = target?.closest('.article-image-outer');
    if (!container && typeof event.clientX === 'number') {
      const stacked = document.elementsFromPoint(event.clientX, event.clientY);
      container =
        stacked.find(
          (element) =>
            element instanceof HTMLElement &&
            element.classList.contains('article-image-outer')
        ) ?? null;
    }
    if (!container) {
      return;
    }
    const image =
      target instanceof HTMLImageElement
        ? target
        : container.querySelector('img');
    if (!(image instanceof HTMLImageElement)) {
      return;
    }
    if (image.closest('a')) {
      return;
    }
    event.preventDefault();
    openImageModal(image);
  };

  const handleMermaidModalClick = (event) => {
    const target = event.target instanceof Element ? event.target : null;
    let container = target?.closest(
      '.beautiful-mermaid-wrapper, .mermaid-wrapper'
    );
    if (!container && typeof event.clientX === 'number') {
      const stacked = document.elementsFromPoint(event.clientX, event.clientY);
      container =
        stacked.find(
          (element) =>
            element instanceof HTMLElement &&
            (element.classList.contains('beautiful-mermaid-wrapper') ||
              element.classList.contains('mermaid-wrapper'))
        ) ?? null;
    }
    if (!(container instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const cloned = container.cloneNode(true);
    if (!(cloned instanceof HTMLElement)) {
      return;
    }
    cloned.classList.add('modal-media-panel');
    openModalWithContent(
      cloned,
      () => {
      renderMermaid(cloned);
      },
      'media'
    );
  };

  document.addEventListener(
    'click',
    (event) => {
      handleImageModalClick(event);
    },
    { capture: true }
  );

  document.addEventListener(
    'click',
    (event) => {
      handleMermaidModalClick(event);
    },
    { capture: true }
  );

  document.addEventListener('click', (event) => {
    void handleCopyClick(event);
  });

  document.addEventListener('click', (event) => {
    void handleHeadingAnchorClick(event);
  });

  const createTemplateFragment = (html) => {
    const template = document.createElement('template');
    template.innerHTML = html.trim();
    return template.content.childNodes.length > 0 ? template.content : null;
  };

  const buildErrorEntry = (message = 'Failed to load content.') => {
    const article = document.createElement('article');
    article.className = 'article-entry stream-entry stream-entry-error';
    article.textContent = message;
    return article;
  };

  const buildEntry = async (entry) => {
    const entryPath =
      entry && typeof entry.entryPath === 'string' ? entry.entryPath : '';
    if (!entryPath) {
      return buildErrorEntry();
    }
    try {
      const response = await fetch(entryPath, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Failed to fetch: ${entryPath}`);
      }
      const html = await response.text();
      const fragment = createTemplateFragment(html);
      return fragment ?? buildErrorEntry();
    } catch (error) {
      return buildErrorEntry();
    }
  };

  const initInfiniteListLoader = async ({
    listId,
    statusId,
    sentinelId,
    indexKey,
    prerenderKey,
    defaultIndexPath,
    indexErrorMessage,
  }) => {
    const listElement = document.getElementById(listId);
    const statusElement = document.getElementById(statusId);
    const sentinel = document.getElementById(sentinelId);
    if (
      !(listElement instanceof HTMLElement) ||
      !(statusElement instanceof HTMLElement) ||
      !(sentinel instanceof HTMLElement)
    ) {
      return;
    }

    const rootElement = listElement.closest('.docs');
    const indexPath =
      rootElement instanceof HTMLElement && rootElement.dataset[indexKey]
        ? rootElement.dataset[indexKey]
        : defaultIndexPath;
    const prerenderCountRaw = listElement.dataset[prerenderKey];
    const prerenderCount = prerenderCountRaw
      ? Number.parseInt(prerenderCountRaw, 10)
      : 0;
    const initialPrerenderCount =
      Number.isFinite(prerenderCount) && prerenderCount > 0 ? prerenderCount : 0;

    let entries = [];
    let cursor = 0;
    let loading = false;
    let indexFailed = false;
    const observerRoot = rootElement instanceof Element ? rootElement : null;

    const updateStatus = (message) => {
      console.info(message);
      statusElement.textContent = message;
      statusElement.hidden = message.length === 0;
    };

    const fetchIndex = async () => {
      try {
        updateStatus('Loading...');
        const response = await fetch(indexPath, { cache: 'no-store' });
        if (!response.ok) {
          throw new Error(`Failed to fetch: ${indexPath}`);
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        indexFailed = true;
        updateStatus(indexErrorMessage);
        return [];
      }
    };

    const isSentinelVisible = () => {
      const rootRect = observerRoot
        ? observerRoot.getBoundingClientRect()
        : { top: 0, bottom: window.innerHeight };
      const sentinelRect = sentinel.getBoundingClientRect();
      return sentinelRect.top <= rootRect.bottom + 200;
    };

    const loadNext = async () => {
      if (loading) {
        return;
      }
      if (cursor >= entries.length) {
        updateStatus(entries.length === 0 ? noArticlesYet : endOfArticle);
        return;
      }

      loading = true;
      updateStatus('Loading...');

      const slice = entries.slice(cursor, cursor + pageSize);
      cursor += slice.length;

      const nodes = await Promise.all(slice.map((entry) => buildEntry(entry)));
      nodes.forEach((node) => listElement.appendChild(node));
      addCopyButtons(listElement);
      addHeadingPermalinks(listElement);
      renderMermaid(listElement);

      loading = false;
      updateStatus(cursor >= entries.length ? endOfArticle : '');

      if (cursor < entries.length && isSentinelVisible()) {
        requestAnimationFrame(() => {
          void loadNext();
        });
      }
    };

    entries = await fetchIndex();
    if (indexFailed) {
      return;
    }
    cursor = Math.min(initialPrerenderCount, entries.length);

    if ('IntersectionObserver' in window) {
      const observer = new IntersectionObserver(
        (observed) => {
          if (observed.some((item) => item.isIntersecting)) {
            void loadNext();
          }
        },
        {
          root: observerRoot,
          rootMargin: '200px 0px',
        }
      );
      observer.observe(sentinel);
    } else if (observerRoot instanceof Element) {
      observerRoot.addEventListener('scroll', () => {
        if (
          observerRoot.scrollTop + observerRoot.clientHeight >=
          observerRoot.scrollHeight - 200
        ) {
          void loadNext();
        }
      });
    }

    if (cursor >= entries.length || cursor === 0 || isSentinelVisible()) {
      void loadNext();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById(toggleId);
    if (toggle instanceof HTMLInputElement) {
      toggle.addEventListener('change', () => {
        applyTheme(toggle.checked ? 'dark' : 'light', true);
        renderMermaid(document);
      });
    }
    addCopyButtons(document);
    addHeadingPermalinks(document);
    renderMermaid(document);
    void initInfiniteListLoader({
      listId: 'timeline-list',
      statusId: 'timeline-status',
      sentinelId: 'timeline-sentinel',
      indexKey: 'timelineIndex',
      prerenderKey: 'timelinePrerender',
      defaultIndexPath: 'timeline.json',
      indexErrorMessage: 'Failed to load timeline index.',
    });
    void initInfiniteListLoader({
      listId: 'blog-list',
      statusId: 'blog-status',
      sentinelId: 'blog-sentinel',
      indexKey: 'blogIndex',
      prerenderKey: 'blogPrerender',
      defaultIndexPath: 'blog.json',
      indexErrorMessage: 'Failed to load blog index.',
    });
  });

  mediaQuery.addEventListener('change', (event) => {
    if (getStoredTheme()) {
      return;
    }
    applyTheme(event.matches ? 'dark' : 'light');
    renderMermaid(document);
  });
})();
