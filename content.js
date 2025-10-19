(() => {
  const ID = 'btf-page-jumper';
  if (document.getElementById(ID)) return; // prevent duplicates

  // === HELPERS ===
  const clamp = (n, min = 1, max = 999999) => Math.max(min, Math.min(max, n));
  const getPage = () => {
    const u = new URL(window.location.href);
    const p = parseInt(u.searchParams.get('page') || '1', 10);
    return isNaN(p) ? 1 : clamp(p);
  };
  const gotoPage = (page) => {
    const u = new URL(window.location.href);
    u.searchParams.set('page', String(clamp(page)));
    window.location.assign(u.toString());
  };

  // === UI CREATION ===
  const root = document.createElement('div');
  root.id = ID;
  root.innerHTML = `
    <div class="btf-header">
      <span>BackpackTF Page</span>
      <span class="btf-close" title="Hide">✕</span>
    </div>
    <div class="btf-body">
      <button data-delta="-100">-100</button>
      <button data-delta="-10">-10</button>
      <button data-delta="-1">-1</button>
      <input id="btf-input" type="number" min="1" step="1" />
      <button id="btf-go">Go</button>
      <button data-delta="1">+1</button>
      <button data-delta="10">+10</button>
      <button data-delta="100">+100</button>
      <button id="btf-prev">Prev</button>
      <button id="btf-next">Next</button>
      <div class="btf-subtle">Drag top bar • Press Enter to jump</div>
    </div>
  `;
  document.body.appendChild(root); // <-- this guarantees it’s in DOM

  // === ELEMENT REFERENCES ===
  const input = root.querySelector('#btf-input');
  const goBtn = root.querySelector('#btf-go');
  const prevBtn = root.querySelector('#btf-prev');
  const nextBtn = root.querySelector('#btf-next');
  const header = root.querySelector('.btf-header');
  const close = root.querySelector('.btf-close');

  // === INITIALIZE ===
  input.value = getPage();

  // === HANDLERS ===
  root.querySelectorAll('button[data-delta]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const delta = parseInt(btn.getAttribute('data-delta'), 10);
      const next = clamp(parseInt(input.value, 10) + delta);
      input.value = next;
      gotoPage(next);
    });
  });

  goBtn.addEventListener('click', () => gotoPage(parseInt(input.value, 10)));
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gotoPage(parseInt(input.value, 10));
  });

  prevBtn.addEventListener('click', () => gotoPage(getPage() - 1));
  nextBtn.addEventListener('click', () => gotoPage(getPage() + 1));

  // === Minimize toggle ===
  close.addEventListener('click', () => {
    const body = root.querySelector('.btf-body');
    const header = root.querySelector('.btf-header');
    if (body.style.display === 'none') {
      body.style.display = 'grid';
      header.querySelector('span').textContent = 'BackpackTF Page';
    } else {
      body.style.display = 'none';
      header.querySelector('span').textContent = '⮞ Page Jumper';
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === '`' && (e.ctrlKey || e.metaKey)) {
      root.style.display = root.style.display === 'none' ? 'block' : 'none';
    }
  });

  // === DRAG ===
  let drag = false, sx = 0, sy = 0, sl = 0, st = 0;
  header.addEventListener('mousedown', (e) => {
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
  document.addEventListener('mouseup', () => (drag = false));
})();