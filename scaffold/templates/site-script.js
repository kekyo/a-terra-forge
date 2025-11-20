// a-terra-gorge - Universal document-oriented markdown site generator
// Copyright (c) Kouji Matsui. (@kekyo@mi.kekyo.net)
// Under MIT.
// https://github.com/kekyo/a-terra-gorge

(() => {
  const pageSize = 5;
  const toggleId = 'themeToggle';
  const storageKey = 'preferred-theme';
  const themeAttr = 'data-bs-theme';
  const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const copyButtonClass = 'code-copy-button';
  const copiedClass = 'code-copy-button-copied';
  const imageModalId = 'imageModal';
  const imageModalImageClass = 'image-modal-image';
  const endOfTimeline = "{{getMessage 'endOfTimeline' 'End of timeline.'}}";
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
      <img class="img-fluid ${imageModalImageClass}" alt="" />
    </div>
  </div>
</div>`;
    document.body.appendChild(modal);
    return modal;
  };

  const openImageModal = (image) => {
    const bootstrapApi = window.bootstrap;
    if (!bootstrapApi || typeof bootstrapApi.Modal !== 'function') {
      return;
    }
    const modal = ensureImageModal();
    const modalImage = modal.querySelector(`.${imageModalImageClass}`);
    if (!(modalImage instanceof HTMLImageElement)) {
      return;
    }
    modalImage.src = image.currentSrc || image.src;
    modalImage.alt = image.alt || '';
    bootstrapApi.Modal.getOrCreateInstance(modal, {
      backdrop: true,
      focus: true,
      keyboard: true,
    }).show();
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

  document.addEventListener(
    'click',
    (event) => {
      handleImageModalClick(event);
    },
    { capture: true }
  );

  document.addEventListener('click', (event) => {
    void handleCopyClick(event);
  });

  const initTimeline = async () => {
    const listElement = document.getElementById('timeline-list');
    const statusElement = document.getElementById('timeline-status');
    const sentinel = document.getElementById('timeline-sentinel');
    if (
      !(listElement instanceof HTMLElement) ||
      !(statusElement instanceof HTMLElement) ||
      !(sentinel instanceof HTMLElement)
    ) {
      return;
    }

    const rootElement = listElement.closest('.docs');
    const indexPath =
      rootElement instanceof HTMLElement && rootElement.dataset.timelineIndex
        ? rootElement.dataset.timelineIndex
        : 'timeline.json';
    const prerenderCountRaw = listElement.dataset.timelinePrerender;
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
        updateStatus('Failed to load timeline index.');
        return [];
      }
    };

    const createTemplateFragment = (html) => {
      const template = document.createElement('template');
      template.innerHTML = html.trim();
      return template.content.childNodes.length > 0 ? template.content : null;
    };

    const buildErrorEntry = (message = 'Failed to load content.') => {
      const article = document.createElement('article');
      article.className = 'article-entry timeline-entry timeline-entry-error';
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
        updateStatus(entries.length === 0 ? noArticlesYet : endOfTimeline);
        return;
      }

      loading = true;
      updateStatus('Loading...');

      const slice = entries.slice(cursor, cursor + pageSize);
      cursor += slice.length;

      const nodes = await Promise.all(slice.map((entry) => buildEntry(entry)));
      nodes.forEach((node) => listElement.appendChild(node));
      addCopyButtons(listElement);
      renderMermaid(listElement);

      loading = false;
      updateStatus(cursor >= entries.length ? endOfTimeline : '');

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
    renderMermaid(document);
    void initTimeline();
  });

  mediaQuery.addEventListener('change', (event) => {
    if (getStoredTheme()) {
      return;
    }
    applyTheme(event.matches ? 'dark' : 'light');
    renderMermaid(document);
  });
})();
