(() => {
  const ID = 'btf-page-jumper';
  if (document.getElementById(ID)) return; // prevent duplicate injects

  // === HELPERS ===
  const clamp = (n, min = 1, max = 999999) => Math.max(min, Math.min(max, n));
  const safeParseInt = (v, d=1) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };
  const getPage = () => {
    try {
      const u = new URL(window.location.href);
      const p = safeParseInt(u.searchParams.get('page') || '1', 1);
      return clamp(p);
    } catch { return 1; }
  };
  const gotoPage = (page) => {
    try {
      const u = new URL(window.location.href);
      u.searchParams.set('page', String(clamp(page)));
      window.location.assign(u.toString());
    } catch (e) {
      console.warn('btf-jumper: failed to gotoPage', e);
    }
  };

  // --- Bookmarks store ---
  const STORE_KEY = 'btfBookmarksV1';
  const UI_STATE_KEY = 'btfUiStateV1';
  const loadStore = () => {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; }
  };
  const saveStore = (obj) => localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  const isBookmarked = (id) => !!loadStore()[id];
  const addBookmark = (entry) => { const s = loadStore(); s[entry.id] = entry; saveStore(s); renderList(); };
  const removeBookmark = (id) => { const s = loadStore(); delete s[id]; saveStore(s); renderList(); markStars(); };
  const clearBookmarks = () => { saveStore({}); renderList(); markStars(); };

  // === UI CREATION ===
  const root = document.createElement('div');
  root.id = ID;
  root.innerHTML = `
    <div class="btf-header">
      <span>BackpackTF Page</span>
      <span class="btf-close" title="Minimize">✕</span>
    </div>

    <div class="btf-body">
      <div id="btf-control-top">
        <div id="btf-control-left">
          <button data-delta="-100">-100</button>
          <button data-delta="-10">-10</button>
          <button data-delta="-1">-1</button>
        </div>
        <input id="btf-input" type="number" min="1" step="1" />
        <div id="btf-control-right">
          <button data-delta="1">+1</button>
          <button data-delta="10">+10</button>
          <button data-delta="100">+100</button>
        </div>
      </div>

      <div id="btf-control-bottom">
        <button id="btf-prev">Prev</button>
        <button id="btf-go">Go</button>
        <button id="btf-next">Next</button>
      </div>

      <div class="btf-subtle">Drag top bar • Press Enter to jump</div>

      <div id="btf-bookmarks">
        <header>
          <strong>Bookmarks</strong>
          <div>
            <button id="btf-bm-toggle">Hide</button>
            <button id="btf-bm-clear">Clear</button>
          </div>
        </header>
        <div class="list" id="btf-bm-list"></div>
        <div class="muted" id="btf-bm-empty" style="display:none">
          No items yet — click ⭐ on a listing.
        </div>
      </div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(root);

  // === ELEMENTS ===
  const input = root.querySelector('#btf-input');
  const goBtn = root.querySelector('#btf-go');
  const prevBtn = root.querySelector('#btf-prev');
  const nextBtn = root.querySelector('#btf-next');
  const header = root.querySelector('.btf-header');
  const close = root.querySelector('.btf-close');
  const body = root.querySelector('.btf-body');

  const bmList = root.querySelector('#btf-bm-list');
  const bmEmpty = root.querySelector('#btf-bm-empty');
  const bmToggle = root.querySelector('#btf-bm-toggle');
  const bmClear = root.querySelector('#btf-bm-clear');

  if (input) input.value = String(getPage());

  // === UI STATE SAVE / LOAD ===
  function saveUIState() {
    const rect = root.getBoundingClientRect();
    const minimized = body?.classList.contains('hidden');
    const state = {
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      minimized
    };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  }

  function loadUIState() {
    try {
      const s = JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}');
      if (typeof s.left === 'number') root.style.left = `${s.left}px`;
      if (typeof s.top === 'number') root.style.top = `${s.top}px`;
      if (typeof s.width === 'number') root.style.width = `${s.width}px`;
      if (typeof s.height === 'number') root.style.height = `${s.height}px`;
      if (s.minimized) body?.classList.add('hidden');
    } catch {}
  }

  loadUIState();

  // === HANDLERS ===
  root.querySelectorAll('button[data-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (!input) return;
      const delta = safeParseInt(btn.getAttribute('data-delta') || '0', 0);
      const next = clamp(safeParseInt(input.value || '1', 1) + delta);
      input.value = String(next);
    });
  });
  if (goBtn && input) goBtn.addEventListener('click', () => gotoPage(safeParseInt(input.value || '1', 1)));
  if (input) input.addEventListener('keydown', (e) => { if (e.key === 'Enter') gotoPage(safeParseInt(input.value || '1', 1)); });
  if (prevBtn) prevBtn.addEventListener('click', () => gotoPage(getPage() - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => gotoPage(getPage() + 1));

  if (close) close.addEventListener('click', () => {
    const isHidden = body.classList.toggle('hidden');
    if (isHidden) {
      root.style.height = 'auto';
      root.style.minHeight = 'unset';
      root.style.resize = 'none';
    } else {
      root.style.height = '';
      root.style.minHeight = '';
      root.style.resize = 'both';
    }
    saveUIState();
  });

  // Save position/size after moving/resizing
  document.addEventListener('mouseup', () => saveUIState());
  root.addEventListener('mouseup', () => saveUIState());

  // --- Bookmarks rendering ---
  function renderList() {
    if (!bmList || !bmEmpty) return;
    const store = loadStore();
    const entries = Object.values(store);
    bmList.innerHTML = '';
    if (!entries.length) {
      bmList.style.display = 'none';
      bmEmpty.style.display = 'block';
      return;
    }
    bmList.style.display = 'block';
    bmEmpty.style.display = 'none';
    entries.sort((a, b) => (b.time || 0) - (a.time || 0));
    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'row';

      const a = document.createElement('a');
      a.href = e.statsUrl || e.listingUrl;
      a.textContent = e.title || e.id;
      a.target = '_blank';

      const pg = document.createElement('a');
      pg.textContent = `pg ${e.page ?? '?'}`;
      pg.href = e.listingUrl;
      pg.target = '_blank';

      const openTrade = document.createElement('a');
      openTrade.textContent = 'Trade';
      openTrade.href = e.tradeUrl || e.listingUrl;
      openTrade.target = '_blank';

      const rm = document.createElement('button');
      rm.className = 'rm';
      rm.textContent = 'Remove';
      rm.addEventListener('click', () => removeBookmark(e.id));

      row.appendChild(a);
      row.appendChild(pg);
      row.appendChild(openTrade);
      row.appendChild(rm);
      bmList.appendChild(row);
    }
  }

  if (bmToggle && bmList && bmEmpty) {
    bmToggle.addEventListener('click', () => {
      const hidden = bmList.style.display === 'none' || bmList.style.display === '';
      if (hidden) {
        bmList.style.display = 'block';
        bmEmpty.style.display = loadStore() && Object.keys(loadStore()).length ? 'none' : 'block';
        bmToggle.textContent = 'Hide';
      } else {
        bmList.style.display = 'none';
        bmEmpty.style.display = 'none';
        bmToggle.textContent = 'Show';
      }
      saveUIState();
    });
  }
  if (bmClear) bmClear.addEventListener('click', clearBookmarks);

  renderList();

  // === DRAG ===
  let drag = false, sx = 0, sy = 0, sl = 0, st = 0;
  if (header) {
    header.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      drag = true;
      const rect = root.getBoundingClientRect();
      sx = e.clientX; sy = e.clientY; sl = rect.left; st = rect.top;
    });
    document.addEventListener('mousemove', (e) => {
      if (!drag) return;
      root.style.left = sl + (e.clientX - sx) + 'px';
      root.style.top = st + (e.clientY - sy) + 'px';
      root.style.right = 'auto';
      root.style.position = 'fixed';
    });
    document.addEventListener('mouseup', () => {
      if (drag) saveUIState();
      drag = false;
    });
  }

  // --- Stars on listings ---
  function markStars() {
    document.querySelectorAll('.btf-star').forEach((b) => {
      const id = b.getAttribute('data-btf-id');
      if (!id) return;
      b.classList.toggle('active', isBookmarked(id));
      b.title = isBookmarked(id) ? 'Unbookmark' : 'Bookmark';
    });
  }

  function buildStatsUrl(li, titleFallback, effectIdFallback) {
    try {
      const itemDiv = li.querySelector('.item');
      const ds = itemDiv ? itemDiv.dataset : {};
      const titleEl = li.querySelector('.listing-title h5');
      const title = titleEl ? titleEl.textContent.trim() : (titleFallback || '');
      const itemName = (ds.base_name || ds.name || title).trim();
      const effectId = (ds.effect_id || effectIdFallback || '').toString().trim();
      if (!itemName) return null;
      return `${location.origin}/stats/Unusual/${encodeURIComponent(itemName)}/Tradable/Craftable` + (effectId ? `/${effectId}` : '');
    } catch { return null; }
  }

  function processListings(rootEl = document) {
    const listings = rootEl.querySelectorAll('ul.media-list > li.listing');
    listings.forEach(li => {
      if (li.querySelector('.btf-star')) return; // already processed
      const id = (li.id || '').replace('listing-', '');
      const buttonsBar = li.querySelector('.listing-buttons');
      if (!buttonsBar || !id) return;

      const star = document.createElement('a');
      star.className = 'btn btn-bottom btn-xs btf-star';
      star.setAttribute('data-btf-id', id);
      star.setAttribute('data-tip', 'top');
      star.title = 'Bookmark';
      star.innerHTML = '<i class="fa fa-sw fa-star"></i>';
      buttonsBar.appendChild(star);

      star.addEventListener('click', (e) => {
        e.preventDefault();
        const listingUrl = `${location.origin}${location.pathname}${location.search}#${li.id}`;
        const tradeLink = li.querySelector('.listing-buttons a[href*="tradeoffer"]');
        const titleEl = li.querySelector('.listing-title h5');
        const priceEl = li.querySelector('.tag.bottom-right span');
        const title = titleEl ? titleEl.textContent.trim() : id;
        const price = priceEl ? priceEl.textContent.trim() : '';
        const statsUrl = buildStatsUrl(li, title, '');

        const entry = {
          id,
          title: price ? `${title} — ${price}` : title,
          listingUrl,
          statsUrl,
          tradeUrl: tradeLink ? tradeLink.href : null,
          page: getPage(),
          time: Date.now()
        };

        if (isBookmarked(id)) {
          removeBookmark(id);
        } else {
          addBookmark(entry);
        }
        markStars();
      });
    });
    markStars();
  }

  // Run once immediately
  processListings();

  // Observe for dynamically loaded listings
  try {
    const mo = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) {
          processListings();
          break;
        }
      }
    });
    mo.observe(document.body || document.documentElement, { childList: true, subtree: true });
  } catch (e) {
    console.warn('btf-jumper: MutationObserver failed', e);
  }
})();
