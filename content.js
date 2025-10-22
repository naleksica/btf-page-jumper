(() => {
  const ID = 'btf-page-jumper';
  if (document.getElementById(ID)) return; // prevent duplicate injects

  // ===== Logging helpers =====
  const NS = 'btf';
  const log    = (...a) => console.log(`[${NS}]`, ...a);
  const logErr = (...a) => console.error(`[${NS}]`, ...a);

  // ===== Small helpers =====
  const clamp = (n, min = 1, max = 999999) => Math.max(min, Math.min(max, n));
  const safeParseInt = (v, d = 1) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
  };
  const getPage = () => {
    try {
      const u = new URL(location.href);
      return clamp(safeParseInt(u.searchParams.get('page') || '1', 1));
    } catch { return 1; }
  };
  const gotoPage = (page) => {
    try {
      const u = new URL(location.href);
      u.searchParams.set('page', String(clamp(page)));
      location.assign(u.toString());
    } catch (e) {
      logErr('gotoPage failed', e);
    }
  };
  const timeAgo = (ts) => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const s = Math.max(1, now - Math.floor(ts));
      const units = [[31536000, 'y'], [2592000, 'mo'], [604800, 'w'], [86400, 'd'], [3600, 'h'], [60, 'm']];
      for (const [sec, label] of units) if (s >= sec) return `${Math.floor(s / sec)}${label} ago`;
      return `${s}s ago`;
    } catch { return ''; }
  };
  const toSteam64 = (accountId) => {
    try {
      if (!accountId) return '';
      const base = 76561197960265728n;
      return String(BigInt(accountId) + base);
    } catch { return ''; }
  };

  // Parse a price string like "3.22 ref", "45 keys", "3.55–4.33 ref", "45-50 keys"
  function parsePriceString(str) {
    if (!str) return null;
    const s = String(str).replace(/,/g,'').trim();
    // split ranges by en dash or hyphen
    const parts = s.split(/\s+/);
    const unit = (parts[1] || '').toLowerCase();     // "ref", "keys", etc.
    const nums  = (parts[0] || '').split(/[–-]/);    // "3.55", "4.33"
    const f = v => {
      const n = parseFloat(String(v).replace(/[^0-9.]/g,''));
      return Number.isFinite(n) ? n : null;
    };
    const a = f(nums[0]);
    const b = nums[1] != null ? f(nums[1]) : null;
    if (a == null) return null;
    const mid = b != null ? (a + b) / 2 : a;
    return { unit, min: a, max: b ?? a, mid };
  }

  // Compute percent diff (positive = above suggested)
  function percentDiff(listVal, suggVal) {
    if (!listVal || !suggVal) return null;
    if (suggVal <= 0) return null;
    return ((listVal - suggVal) / suggVal) * 100;
  }

  // ===== Storage keys =====
  const STORE_KEY    = 'btfBookmarksV1';
  const UI_STATE_KEY = 'btfUiStateV1';
  const API_KEY_KEY  = 'btfApiKeyV1';

  const loadStore      = () => { try { return JSON.parse(localStorage.getItem(STORE_KEY) || '{}'); } catch { return {}; } };
  const saveStore      = (obj) => localStorage.setItem(STORE_KEY, JSON.stringify(obj));
  const isBookmarked   = (id) => !!loadStore()[id];
  const addBookmark    = (entry) => { const s = loadStore(); s[entry.id] = entry; saveStore(s); renderList(); };
  const removeBookmark = (id) => { const s = loadStore(); delete s[id]; saveStore(s); renderList(); markStars(); };
  const clearBookmarks = () => { saveStore({}); renderList(); markStars(); };

  const getApiKey = () => localStorage.getItem(API_KEY_KEY) || '';
  const setApiKey = (k) => localStorage.setItem(API_KEY_KEY, k || '');

  // ===== UI =====
  const root = document.createElement('div');
  root.id = ID;
  root.innerHTML = `
    <div class="btf-header" style="cursor:move">
      <span>BackpackTF Page</span>
      <div class="btf-actions">
        <span class="btf-iconbtn btf-gear" title="Settings">⚙️</span>
        <span class="btf-iconbtn btf-close" title="Minimize">✕</span>
      </div>
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
        <div class="muted" id="btf-bm-empty" style="display:none">No items yet — click ⭐ on a listing.</div>
      </div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(root);

  // El refs
  const input   = root.querySelector('#btf-input');
  const goBtn   = root.querySelector('#btf-go');
  const prevBtn = root.querySelector('#btf-prev');
  const nextBtn = root.querySelector('#btf-next');
  const header  = root.querySelector('.btf-header');
  const close   = root.querySelector('.btf-close');
  const gear    = root.querySelector('.btf-gear');
  const body    = root.querySelector('.btf-body');
  const bmList  = root.querySelector('#btf-bm-list');
  const bmEmpty = root.querySelector('#btf-bm-empty');
  const bmToggle= root.querySelector('#btf-bm-toggle');
  const bmClear = root.querySelector('#btf-bm-clear');

  if (input) input.value = String(getPage());

  // ===== UI state =====
  function saveUIState() {
    const rect = root.getBoundingClientRect();
    const minimized = body?.classList.contains('hidden');
    const state = { left: rect.left, top: rect.top, width: rect.width, height: rect.height, minimized };
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(state));
  }
  function loadUIState() {
    try {
      const s = JSON.parse(localStorage.getItem(UI_STATE_KEY) || '{}');
      if (typeof s.left === 'number')  root.style.left = `${s.left}px`;
      if (typeof s.top === 'number')   root.style.top  = `${s.top}px`;
      if (typeof s.width === 'number') root.style.width  = `${s.width}px`;
      if (typeof s.height=== 'number') root.style.height = `${s.height}px`;
      if (s.minimized) body?.classList.add('hidden');
    } catch {}
  }
  loadUIState();

  // ===== Controls =====
  root.querySelectorAll('button[data-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = safeParseInt(btn.getAttribute('data-delta') || '0', 0);
      const next = clamp(safeParseInt(input.value || '1', 1) + delta);
      input.value = String(next);
    });
  });
  goBtn?.addEventListener('click', () => gotoPage(safeParseInt(input.value || '1', 1)));
  input?.addEventListener('keydown', e => { if (e.key === 'Enter') gotoPage(safeParseInt(input.value || '1', 1)); });
  prevBtn?.addEventListener('click', () => gotoPage(getPage() - 1));
  nextBtn?.addEventListener('click', () => gotoPage(getPage() + 1));

  close?.addEventListener('click', () => {
    const isHidden = body.classList.toggle('hidden');
    if (isHidden) { root.style.height='auto'; root.style.minHeight='unset'; root.style.resize='none'; }
    else          { root.style.height='';     root.style.minHeight='';     root.style.resize='both'; }
    saveUIState();
  });

  document.addEventListener('mouseup', () => saveUIState());
  root.addEventListener('mouseup', () => saveUIState());

  // ===== Bookmarks render =====
  function renderList() {
    const store = loadStore();
    const entries = Object.values(store);
    bmList.innerHTML = '';
    if (!entries.length) { bmList.style.display='none'; bmEmpty.style.display='block'; return; }
    bmList.style.display='block'; bmEmpty.style.display='none';
    entries.sort((a,b)=>(b.time||0)-(a.time||0));

    for (const e of entries) {
      const row = document.createElement('div');
      row.className = 'row';
      row.dataset.id = e.id;

      const main = document.createElement('div');
      main.className = 'row-main';

      const chevron = document.createElement('span');
      chevron.className = 'btf-chevron';
      chevron.textContent = '▶';

      const titleWrap = document.createElement('div');
      titleWrap.className = 'title';
      const titleLink = document.createElement('a');
      titleLink.href = e.statsUrl || e.listingUrl;
      titleLink.textContent = e.title || e.id;
      titleLink.target = '_blank';
      titleWrap.appendChild(titleLink);

      const meta = document.createElement('div');
      meta.className = 'meta';
      const pg = document.createElement('a');
      pg.textContent = `pg ${e.page ?? '?'}`;
      pg.href = e.listingUrl; pg.target = '_blank';
      const openTrade = document.createElement('a');
      openTrade.textContent = 'Trade';
      openTrade.href = e.tradeUrl || e.listingUrl; openTrade.target = '_blank';
      const rm = document.createElement('button');
      rm.className = 'rm'; rm.textContent = 'Remove';
      rm.addEventListener('click', (ev)=>{ ev.stopPropagation(); removeBookmark(e.id); });
      [pg, openTrade].forEach(a => a.addEventListener('click', ev => ev.stopPropagation()));

      meta.appendChild(pg); meta.appendChild(openTrade); meta.appendChild(rm);
      main.appendChild(chevron); main.appendChild(titleWrap); main.appendChild(meta);

      const details = document.createElement('div');
      details.className = 'row-details';
      details.innerHTML = `<div class="detail-grid">
        <div class="k">🪙 Suggested</div><div class="v" data-k="suggested">…</div>
        <div class="k">💹 Trend</div><div class="v" data-k="trend">…</div>
        <div class="k">🧾 Listings</div><div class="v" data-k="listcounts">…</div>
        <div class="k">🔄 Last bumped</div><div class="v" data-k="bumped">…</div>
        <div class="k">🤝 Preference</div><div class="v" data-k="preference">…</div>
        <div class="k">⚙️ Class/Effect</div><div class="v" data-k="class">…</div>
        <div class="k">🔐 Origin</div><div class="v" data-k="origin">…</div>
        <div class="k">⭐ Trust</div><div class="v" data-k="trust">…</div>
      </div>`;

      main.addEventListener('click', () => {
        const open = !details.classList.contains('open');
        details.classList.toggle('open', open);
        chevron.classList.toggle('rot', open);
        if (open) {
          details.style.maxHeight = details.scrollHeight + 'px';
          if (!details.dataset.loaded) {
            details.dataset.loaded = '1';
            loadBookmarkDetails(e, details).catch(err => logErr('loadBookmarkDetails', err));
          }
        } else {
          details.style.maxHeight = '0px';
        }
      });

      row.appendChild(main);
      row.appendChild(details);
      bmList.appendChild(row);
    }
  }

  // ===== Data loaders =====
  async function loadBookmarkDetails(entry, detailsEl) {
    const set = (key, val) => { const n = detailsEl.querySelector(`[data-k="${key}"]`); if (n) n.textContent = val; };

    // Fill from snapshot immediately
    if (entry.snap) {
      if (entry.snap.bumpedText) set('bumped', entry.snap.bumpedText);
      set('preference', entry.snap.buyoutOnly ? 'Buyout Only' : 'Negotiable');
      if (entry.snap.classText) set('class', entry.snap.classText);
      if (entry.snap.originText) set('origin', entry.snap.originText);
    }

    // No API key => label the cells clearly
    if (!getApiKey()) {
      ['suggested','trend','listcounts','trust'].forEach(k => {
        const n = detailsEl.querySelector(`[data-k="${k}"]`);
        if (n && (n.textContent || '') === '…') n.textContent = 'Set API key (⚙️)';
      });
      return;
    }

    const baseName = entry.baseName || entry.itemName || '';
    const effectId = entry.effectId || entry.effect_id || '';

    const [suggested, trend, listInfo, trust] = await Promise.all([
      apiGetSuggestedFromHistory(baseName, effectId).catch(err => { logErr('suggested failed', err); return null; }),
      apiGetTrend(baseName, effectId).catch(err => { logErr('trend failed', err); return null; }),
      apiGetListingInfo(entry.id, entry).catch(err => { logErr('listInfo failed', err); return null; }),
      apiGetUserTrust(entry.sellerSteamId).catch(err => { logErr('trust failed', err); return null; })
    ]);

    if (suggested) set('suggested', suggested.text);
    if (trend)     set('trend',     trend.text);

    if (listInfo) {
      set('listcounts', listInfo.listCountsText || `${listInfo.sellers ?? '?'} sellers / ${listInfo.buyers ?? '?'} buyers`);
      if (listInfo.lastBumped) set('bumped', listInfo.lastBumped);
      if (listInfo.preference) set('preference', listInfo.preference);
      if (listInfo.classText)  set('class', listInfo.classText);
      if (listInfo.origin)     set('origin', listInfo.origin);
    }
    if (trust) set('trust', trust.text);

    if (detailsEl.classList.contains('open')) {
      requestAnimationFrame(() => { detailsEl.style.maxHeight = detailsEl.scrollHeight + 'px'; });
    }
  }

  // ===== API wrappers =====
  const API_BASE_WEB = 'https://api.backpack.tf/api';

  function withKey(url) {
    const k = getApiKey();
    return k ? `${url}${url.includes('?') ? '&' : '?'}key=${encodeURIComponent(k)}` : url;
    // If k is missing, caller should have handled UI already.
  }

  async function webGetJSON(url) {
    const res = await fetch(url, {
      credentials: 'omit',
      headers: { 'Accept': 'application/json' },
      cache: 'no-store',
      mode: 'cors'
    });
    if (!res.ok) {
      const txt = await res.text().catch(()=>'');
      throw new Error(`HTTP ${res.status} ${res.statusText} :: ${txt.slice(0,140)}`);
    }
    return res.json();
  }

  // Suggested from last price history point
  async function apiGetSuggestedFromHistory(baseName, effectId) {
    if (!baseName) return null;
    const url = withKey(`${API_BASE_WEB}/IGetPriceHistory/v1?appid=440&item=${encodeURIComponent(baseName)}&quality=5${effectId ? `&priceindex=${encodeURIComponent(effectId)}` : ''}`);
    const j = await webGetJSON(url);
    const hist = j?.response?.history || [];
    const last = hist[hist.length - 1];
    if (!last) return null;
    const val = last.value_high ?? last.value ?? last.value_low;
    const cur = last.currency || 'keys';
    const age = last.timestamp ? timeAgo(last.timestamp) : '';
    return { text: val ? `≈ ${val} ${cur}${age ? ` (Updated ${age})` : ''}` : '—' };
  }

  // Trend (% change across ~30 points)
  async function apiGetTrend(baseName, effectId) {
    if (!baseName) return null;
    const url = withKey(`${API_BASE_WEB}/IGetPriceHistory/v1?appid=440&item=${encodeURIComponent(baseName)}&quality=5${effectId ? `&priceindex=${encodeURIComponent(effectId)}` : ''}`);
    const j = await webGetJSON(url);
    const hist = j?.response?.history || [];
    if (hist.length < 2) return { text: '—' };
    const last = hist[hist.length - 1];
    const prev = hist[Math.max(0, hist.length - 30)];
    const avg = (pt) => {
      const lo = pt?.value || pt?.value_low;
      const hi = pt?.value_high || pt?.value;
      return (lo && hi) ? (lo + hi) / 2 : lo || hi || null;
    };
    const a = avg(last), b = avg(prev);
    if (!a || !b) return { text: '—' };
    const delta = ((a - b) / b) * 100;
    const sign = delta > 0 ? '+' : '';
    return { text: `${sign}${delta.toFixed(1)}% last 30 pts` };
  }

  // Scrape totals from the item-specific classifieds page
  async function scrapeItemClassifiedsCounts(itemClassifiedsUrl) {
    try {
      if (!itemClassifiedsUrl) return null;
      const res = await fetch(itemClassifiedsUrl, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) throw new Error(`fetch ${res.status}`);
      const html = await res.text();
      const doc  = new DOMParser().parseFromString(html, 'text/html');

      const norm = s => (s || '').replace(/\s+/g, ' ').trim();
      const pool = doc.querySelectorAll('nav, .nav, .nav-tabs, .tabs, .tabbar, .page-tabs, ul, li, a, button, span, div');

      const extractLeading = (el, word) => {
        const t = norm(el.textContent);
        const m = t.match(new RegExp(`^${word}\\s*\\((\\d{1,5})\\)`, 'i'));
        return m ? parseInt(m[1], 10) : null;
      };

      let sellers = null, buyers = null;
      pool.forEach(el => {
        if (sellers == null) {
          const n = extractLeading(el, 'Sellers');
          if (n != null) sellers = n;
        }
        if (buyers == null) {
          const n = extractLeading(el, 'Buyers');
          if (n != null) buyers = n;
        }
      });

      const sane = n => (n != null && n >= 0 && n <= 10000) ? n : null;
      sellers = sane(sellers);
      buyers  = sane(buyers);

      if (sellers == null && buyers == null) return null;
      return { sellers, buyers, listCountsText: `${sellers ?? '?'} sellers / ${buyers ?? '?'} buyers` };
    } catch (e) {
      logErr('scrapeItemClassifiedsCounts', e);
      return null;
    }
  }

  async function apiGetListingInfo(_listingId, entry) {
    const out = {
      lastBumped: entry?.snap?.bumpedText || null,
      preference: entry?.snap?.buyoutOnly ? 'Buyout Only' : 'Negotiable',
      classText:  entry?.snap?.classText || null,
      origin:     entry?.snap?.originText || null,
      sellers: null,
      buyers:  null,
      listCountsText: null
    };

    if (entry?.itemClassifiedsUrl) {
      const scr = await scrapeItemClassifiedsCounts(entry.itemClassifiedsUrl);
      if (scr) {
        out.sellers = scr.sellers;
        out.buyers  = scr.buyers;
        out.listCountsText = scr.listCountsText;
      }
    }
    if (!out.preference) out.preference = 'Negotiable';
    return out;
  }

  async function apiGetUserTrust(steamid) {
    if (!steamid) return null;
    const url = withKey(`${API_BASE_WEB}/users/info/v1?steamids=${encodeURIComponent(steamid)}`);
    const j = await webGetJSON(url);
    const u = j?.players?.[steamid] || j?.response?.players?.[steamid] || null;
    const pos = u?.backpack_tf?.trust?.positive ?? 0;
    const neg = u?.backpack_tf?.trust?.negative ?? 0;
    return { text: `+${pos} / −${neg}` };
  }

  // ===== Star button injection =====
  function markStars(){
    document.querySelectorAll('.btf-star').forEach(b=>{
      const id = b.getAttribute('data-btf-id'); if (!id) return;
      b.classList.toggle('active', isBookmarked(id));
      b.title = isBookmarked(id) ? 'Unbookmark' : 'Bookmark';
    });
  }

  // Add a green/red % badge based on listing vs suggested price.
  function addDealBadgeToListing(li) {
    try {
      const itemDiv = li.querySelector('.item');
      if (!itemDiv) return;

      // If we’ve already added a badge, don’t add again.
      if (li.querySelector('.listing-deal-label.btf')) return;

      const ds = itemDiv.dataset || {};

      // Listed price (e.g., "3.22 ref" or "45 keys")
      const listedStr = (ds.listing_price || '').trim();
      const listedMatch = listedStr.match(/([\d.]+)\s*(keys?|ref)/i);
      if (!listedMatch) return;
      const listed = parseFloat(listedMatch[1]);
      const listedUnit = listedMatch[2].toLowerCase();

      // Suggested range from Backpack.tf hint on the DOM (e.g., "3.55–4.33 ref")
      const suggStr = (ds.p_bptf || '').trim();
      const suggMatch = suggStr.match(/([\d.]+)(?:[–-]([\d.]+))?\s*(keys?|ref)/i);
      if (!suggMatch) return;
      const lo = parseFloat(suggMatch[1]);
      const hi = suggMatch[2] ? parseFloat(suggMatch[2]) : lo;
      const suggested = (lo + hi) / 2;
      const suggUnit = suggMatch[3].toLowerCase();

      // Only compare if the units match (keys-to-keys or ref-to-ref)
      if (listedUnit !== suggUnit || !isFinite(listed) || !isFinite(suggested) || suggested <= 0) return;

      const pct = ((listed - suggested) / suggested) * 100;

      const badge = document.createElement('span');
      badge.className = 'listing-deal-label btf ' + (pct <= 0 ? 'under' : 'over');
      badge.textContent = `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;

      // Place it like the site does—inside the .listing-item container.
      const container = li.querySelector('.listing-item') || li;
      container.prepend(badge);
    } catch (e) {
      // Non-fatal; just don’t show a badge if something goes wrong
      console.debug('deal badge error', e);
    }
  }

  function processListings(rootEl = document) {
    const listings = rootEl.querySelectorAll('ul.media-list > li.listing');
    listings.forEach(li => {
      if (li.querySelector('.btf-star')) return;
      const id = (li.id || '').replace('listing-','');
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
        e.preventDefault(); e.stopPropagation();
        const listingUrl = `${location.origin}${location.pathname}${location.search}#${li.id}`;
        const tradeLink  = li.querySelector('.listing-buttons a[href*="tradeoffer"]');
        const titleEl    = li.querySelector('.listing-title h5');
        const priceEl    = li.querySelector('.tag.bottom-right span');
        const itemDiv    = li.querySelector('.item');
        const ds         = itemDiv ? itemDiv.dataset : {};
        const title      = titleEl ? titleEl.textContent.trim() : id;
        const price      = priceEl ? priceEl.textContent.trim() : '';
        const baseName   = (ds.base_name || ds.name || title).trim();
        const effectId   = (ds.effect_id || '').toString().trim();
        const statsUrl   = `${location.origin}/stats/Unusual/${encodeURIComponent(baseName)}/Tradable/Craftable${effectId ? `/${effectId}` : ''}`;

        const itemClassifiedsUrl =
          `${location.origin}/classifieds?item=${encodeURIComponent(baseName)}` +
          `&quality=5&tradable=1&craftable=1${effectId ? `&particle=${encodeURIComponent(effectId)}` : ''}`;

        const bumpedText = li.querySelector('.timeago')?.textContent?.trim() || '';
        const buyoutOnly = (ds.listing_buyout === '1' || ds.listingBuyout === '1');
        const classText  = [
          (ds.q_name || 'Unusual'),
          (ds.class || ds.class_name || ds.className || ''),
          (ds.slot ? `• ${ds.slot}` : ''),
          (ds.effect_name ? `• Effect: ${ds.effect_name}` : '')
        ].filter(Boolean).join(' ').replace(/\s+•\s+•/g,' • ');
        const originText = ds.original_id ? 'Original copy ✅'
                          : (ds.duped ? 'Duped ⚠️' : (ds.origin ? ds.origin : '—'));

        const entry = {
          id,
          title: price ? `${title} — ${price}` : title,
          listingUrl,
          statsUrl,
          tradeUrl: tradeLink ? tradeLink.href : null,
          page: getPage(),
          time: Date.now(),
          baseName,
          effectId,
          itemClassifiedsUrl,
          sellerSteamId: toSteam64(ds.listingAccountId || ds.listing_account_id || ''),
          snap: { bumpedText, buyoutOnly, classText, originText }
        };

        if (isBookmarked(id)) removeBookmark(id); else addBookmark(entry);
        markStars();
      });
      // NEW: inject deal % badge
      addDealBadgeToListing(li);
    });

    markStars();
  }

  processListings();
  try {
    const mo = new MutationObserver((muts)=>{
      for (const m of muts) {
        if (m.addedNodes && m.addedNodes.length) { processListings(); break; }
      }
    });
    mo.observe(document.body || document.documentElement, { childList:true, subtree:true });
  } catch(e){ logErr('MO failed', e); }

  // ===== Bookmarks behavior =====
  bmToggle?.addEventListener('click', ()=>{
    const hidden = bmList.style.display === 'none' || bmList.style.display === '';
    if (hidden) {
      bmList.style.display = 'block';
      bmEmpty.style.display = Object.keys(loadStore()).length ? 'none' : 'block';
      bmToggle.textContent = 'Hide';
    } else {
      bmList.style.display = 'none';
      bmEmpty.style.display = 'none';
      bmToggle.textContent = 'Show';
    }
    saveUIState();
  });
  bmClear?.addEventListener('click', clearBookmarks);

  renderList();

  // ===== Settings modal =====
  const settingsModal = document.createElement('div');
  settingsModal.className = 'btf-modal hidden';
  settingsModal.innerHTML = `
    <div class="btf-modal-backdrop"></div>
    <div class="btf-modal-card">
      <div class="btf-modal-header">
        <strong>Settings</strong>
        <button class="btf-modal-x" type="button" title="Close">✕</button>
      </div>
      <div class="btf-modal-body">
        <label for="btf-setting-key">Backpack.tf API key</label>
        <input id="btf-setting-key" type="password" placeholder="Paste your API key" autocomplete="off" />
        <label style="display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="btf-key-show" /> Show key
        </label>
        <div class="muted" style="opacity:.7;font-size:12px;">Saved locally (localStorage). Used only for backpack.tf WebAPI calls.</div>
      </div>
      <div class="btf-modal-actions">
        <button id="btf-key-cancel" class="btf-btn-secondary" type="button">Cancel</button>
        <button id="btf-key-save" class="btf-btn-primary" type="button">Save</button>
      </div>
    </div>
  `;
  (document.body || document.documentElement).appendChild(settingsModal);

  const keyInput  = settingsModal.querySelector('#btf-setting-key');
  const showChk   = settingsModal.querySelector('#btf-key-show');
  const saveKey   = settingsModal.querySelector('#btf-key-save');
  const cancelKey = settingsModal.querySelector('#btf-key-cancel');
  const xClose    = settingsModal.querySelector('.btf-modal-x');

  function openSettings(){
    settingsModal.classList.remove('hidden');
    keyInput.value = getApiKey();
    keyInput.type = 'password';
    showChk.checked = false;
    setTimeout(()=>{ keyInput.focus(); keyInput.select(); }, 0);
  }
  function closeSettings(){ settingsModal.classList.add('hidden'); }

  gear?.addEventListener('click', (e)=>{ e.stopPropagation(); openSettings(); });

  // On Save: persist key, and re-fetch any open rows (so blanks become filled)
  saveKey.addEventListener('click', ()=>{
    setApiKey((keyInput.value||'').trim());
    closeSettings();

    // force reload of open rows
    bmList.querySelectorAll('.row-details.open').forEach(d => {
      d.dataset.loaded = ''; // allow reload
      const row = d.closest('.row');
      const id  = row?.dataset.id;
      if (!id) return;
      const store = loadStore();
      const entry = store[id];
      if (!entry) return;
      // wipe placeholders and refetch
      d.querySelectorAll('.v').forEach(v => v.textContent = '…');
      loadBookmarkDetails(entry, d).catch(err => logErr('reload after key save', err));
    });
  });
  cancelKey.addEventListener('click', closeSettings);
  xClose.addEventListener('click', closeSettings);
  showChk.addEventListener('change', ()=>{ keyInput.type = showChk.checked ? 'text' : 'password'; });
  settingsModal.addEventListener('click', (e)=>{ if (e.target.classList.contains('btf-modal-backdrop')) closeSettings(); });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape' && !settingsModal.classList.contains('hidden')) closeSettings(); });

  // ===== Dragging (header) =====
  let drag = false, sx = 0, sy = 0, sl = 0, st = 0;
  header?.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    drag = true;
    const r = root.getBoundingClientRect();
    sx = e.clientX; sy = e.clientY; sl = r.left; st = r.top;
    root.style.position = 'fixed';
    e.preventDefault();
  });
  document.addEventListener('mousemove', (e) => {
    if (!drag) return;
    root.style.left = `${sl + (e.clientX - sx)}px`;
    root.style.top  = `${st + (e.clientY - sy)}px`;
    root.style.right = 'auto';
  });
  document.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = false;
    saveUIState();
  });
})();
