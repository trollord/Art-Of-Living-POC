(() => {
  'use strict';

  const STORAGE_KEY = 'aol-ip-supplies-v1';
  const STEPS = [
    { id: 'products', label: 'Products' },
    { id: 'cart', label: 'Cart' },
    { id: 'details', label: 'Details' },
    { id: 'payment', label: 'Payment' },
    { id: 'confirmation', label: 'Confirmation' },
  ];
  const STATES = [
    'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
    'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
    'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
    'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
    'Uttarakhand', 'West Bengal', 'Andaman and Nicobar Islands', 'Chandigarh',
    'Dadra and Nagar Haveli and Daman and Diu', 'Delhi', 'Jammu and Kashmir', 'Ladakh',
    'Lakshadweep', 'Puducherry',
  ];
  const NUDGE_WINDOW = 3;
  const PROCESSING_MS = 2000;

  const rupee = new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  });
  const fmt = (n) => rupee.format(n);
  const num = new Intl.NumberFormat('en-IN');

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const state = {
    products: [],
    cart: {},
    selection: {},
    step: 'products',
    details: {},
    orderId: null,
    order: null,
    token: null,
    quote: null,
    quoteError: null,
  };

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        state.cart = saved.cart && typeof saved.cart === 'object' ? saved.cart : {};
        state.step = STEPS.some((s) => s.id === saved.step) ? saved.step : 'products';
        state.details = saved.details && typeof saved.details === 'object' ? saved.details : {};
        state.orderId = typeof saved.orderId === 'string' ? saved.orderId : null;
        state.token = typeof saved.token === 'string' ? saved.token : null;
        state.order = saved.order && typeof saved.order === 'object' && saved.order.id === state.orderId ? saved.order : null;
      }
    } catch {
      state.cart = {};
    }
  }

  function save() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ cart: state.cart, step: state.step, details: state.details, orderId: state.orderId, order: state.order, token: state.token }),
      );
    } catch {
      return;
    }
  }

  async function api(path, options = {}) {
    let res;
    try {
      res = await fetch(`/api${path}`, {
        headers: { 'Content-Type': 'application/json' },
        ...options,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch {
      const err = new Error('Could not reach the server. Please check your connection.');
      err.network = true;
      throw err;
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = Array.isArray(data.message) ? data.message : [data.message || `Request failed (${res.status})`];
      const err = new Error(msg[0]);
      err.messages = msg;
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const snackHost = $('#snackbars');
  const SNACK_ICONS = {
    success: '<path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
    error: '<path d="M12 7v6M12 16.5v.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
    info: '<path d="M12 11v6M12 7.5v.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>',
  };

  function snack(message, type = 'info', timeout = 3800) {
    const el = document.createElement('div');
    el.className = `snackbar snackbar-${type}`;
    el.setAttribute('role', type === 'error' ? 'alert' : 'status');
    el.innerHTML = `
      <span class="snackbar-icon" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16">${SNACK_ICONS[type] || SNACK_ICONS.info}</svg></span>
      <span class="snackbar-msg">${esc(message)}</span>
      <button type="button" class="snackbar-close" aria-label="Dismiss notification">
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
      </button>`;
    const remove = () => {
      if (!el.isConnected || el.classList.contains('leaving')) return;
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 220);
    };
    $('.snackbar-close', el).addEventListener('click', remove);
    snackHost.appendChild(el);
    while (snackHost.children.length > 4) snackHost.firstElementChild.remove();
    requestAnimationFrame(() => el.classList.add('show'));
    let timer = setTimeout(remove, timeout);
    el.addEventListener('mouseenter', () => clearTimeout(timer));
    el.addEventListener('mouseleave', () => { timer = setTimeout(remove, 1800); });
  }

  const productById = (id) => state.products.find((p) => p.id === id);
  const basePrice = (p) => p.tiers[0].unitPrice;
  const tierFor = (p, q) => [...p.tiers].sort((a, b) => b.fromQty - a.fromQty).find((t) => q >= t.fromQty) || p.tiers[0];
  const defaultSelection = (p) => Math.max(p.minQty, 1);
  const cartCount = () => Object.values(state.cart).reduce((a, b) => a + b, 0);
  const cartItems = () =>
    Object.entries(state.cart)
      .filter(([id, q]) => q > 0 && productById(id))
      .map(([productId, quantity]) => ({ productId, quantity }));

  function nudgeFor(p, q) {
    const next = p.tiers.find((t) => t.fromQty > q && t.fromQty - q <= NUDGE_WINDOW);
    if (!next || q < 1) return null;
    const more = next.fromQty - q;
    return `Add ${more} more to get ${fmt(next.unitPrice)} each`;
  }

  let artSeq = 0;
  const ILLUSTRATION_SOURCES = {
    batman: (u) => `
      <svg viewBox="0 0 240 170" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a dark blindfold with bat ears and a yellow bat emblem">
        <defs>
          <radialGradient id="bg-bat-${u}" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stop-color="#FFF0CD"/>
            <stop offset="100%" stop-color="#FEF9E8"/>
          </radialGradient>
          <linearGradient id="mask-bat-${u}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3A3D4F"/>
            <stop offset="100%" stop-color="#23252F"/>
          </linearGradient>
        </defs>
        <rect width="240" height="170" fill="url(#bg-bat-${u})"/>
        <circle cx="120" cy="88" r="62" fill="#F6CB62" opacity=".18"/>
        <path d="M12 96 C34 84 50 84 64 88" fill="none" stroke="#23252F" stroke-width="7" stroke-linecap="round"/>
        <path d="M228 96 C206 84 190 84 176 88" fill="none" stroke="#23252F" stroke-width="7" stroke-linecap="round"/>
        <path d="M58 82 L70 46 L86 70 Q120 63 154 70 L170 46 L182 82 Q192 112 168 122 Q144 132 128 116 Q120 109 112 116 Q96 132 72 122 Q48 112 58 82 Z" fill="url(#mask-bat-${u})"/>
        <path d="M66 86 L72 62 L84 78 Q120 71 156 78 L168 62 L174 86 Q181 108 164 114 Q146 121 132 108 Q120 100 108 108 Q94 121 76 114 Q59 108 66 86 Z" fill="none" stroke="#FFFFFF" stroke-opacity=".22" stroke-width="1.4" stroke-dasharray="3 4"/>
        <ellipse cx="120" cy="91" rx="24" ry="13" fill="#F6CB62"/>
        <path d="M100 92 Q104 82 111 86 L114 80 L117 85 L123 85 L126 80 L129 86 Q136 82 140 92 Q134 89 130 94 Q127 90 123 95 L120 99 L117 95 Q113 90 110 94 Q106 89 100 92 Z" fill="#23252F"/>
        <g fill="#ECA55A">
          <path d="M40 40 l2.5 6 6 2.5 -6 2.5 -2.5 6 -2.5 -6 -6 -2.5 6 -2.5z"/>
          <path d="M200 30 l1.8 4.2 4.2 1.8 -4.2 1.8 -1.8 4.2 -1.8 -4.2 -4.2 -1.8 4.2 -1.8z"/>
          <path d="M206 136 l1.5 3.5 3.5 1.5 -3.5 1.5 -1.5 3.5 -1.5 -3.5 -3.5 -1.5 3.5 -1.5z"/>
        </g>
        <circle cx="30" cy="132" r="3" fill="#F6CB62"/>
        <circle cx="214" cy="68" r="2.5" fill="#F6CB62"/>
      </svg>`,
    demo: (u) => `
      <svg viewBox="0 0 240 170" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Illustration of a padded, contoured teal blindfold with a soft strap">
        <defs>
          <radialGradient id="bg-demo-${u}" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stop-color="#E4F3F3"/>
            <stop offset="100%" stop-color="#F1F9F9"/>
          </radialGradient>
          <linearGradient id="mask-demo-${u}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#1D8590"/>
            <stop offset="100%" stop-color="#136A73"/>
          </linearGradient>
        </defs>
        <rect width="240" height="170" fill="url(#bg-demo-${u})"/>
        <circle cx="120" cy="88" r="62" fill="#ECA55A" opacity=".12"/>
        <path d="M12 90 C34 76 48 76 60 80" fill="none" stroke="#0F5960" stroke-width="9" stroke-linecap="round"/>
        <path d="M228 90 C206 76 192 76 180 80" fill="none" stroke="#0F5960" stroke-width="9" stroke-linecap="round"/>
        <path d="M54 86 Q56 54 92 56 Q110 57 120 68 Q130 57 148 56 Q184 54 186 86 Q188 116 152 120 Q132 122 124 108 Q120 102 116 108 Q108 122 88 120 Q52 116 54 86 Z" fill="url(#mask-demo-${u})"/>
        <path d="M64 86 Q66 64 92 66 Q108 67 120 79 Q132 67 148 66 Q174 64 176 86 Q178 108 152 110 Q136 111 128 100 Q120 92 112 100 Q104 111 88 110 Q62 108 64 86 Z" fill="none" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="1.4" stroke-dasharray="3 4"/>
        <ellipse cx="92" cy="76" rx="18" ry="7" fill="#FFFFFF" opacity=".16"/>
        <ellipse cx="148" cy="76" rx="18" ry="7" fill="#FFFFFF" opacity=".16"/>
        <g fill="#F6CB62">
          <path d="M42 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
          <path d="M202 132 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z"/>
        </g>
        <circle cx="200" cy="40" r="3" fill="#ECA55A"/>
        <circle cx="34" cy="128" r="2.5" fill="#ECA55A"/>
      </svg>`,
  };
  const illustration = (key) => (ILLUSTRATION_SOURCES[key] ? ILLUSTRATION_SOURCES[key](++artSeq) : '');

  function qtyStepper({ id, value, min, max, label, context }) {
    return `
      <div class="qty" data-qty-context="${context}" data-product="${esc(id)}">
        <button type="button" class="qty-btn" data-qty-action="dec" aria-label="Decrease ${esc(label)} quantity" ${value <= min ? 'aria-disabled="true"' : ''}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </button>
        <input class="qty-input" type="text" inputmode="numeric" pattern="[0-9]*" value="${value}" aria-label="${esc(label)} quantity" data-min="${min}" data-max="${max}">
        <button type="button" class="qty-btn" data-qty-action="inc" aria-label="Increase ${esc(label)} quantity" ${value >= max ? 'aria-disabled="true"' : ''}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 12h12M12 6v12" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>
        </button>
      </div>`;
  }

  function renderProducts() {
    const grid = $('#product-grid');
    if (!state.products.length) {
      grid.innerHTML = `<div class="panel empty"><p>Loading products&hellip;</p></div>`;
      return;
    }
    grid.setAttribute('aria-busy', 'false');
    grid.innerHTML = state.products.map((p) => {
      const sel = state.selection[p.id] ?? defaultSelection(p);
      const inCart = state.cart[p.id] || 0;
      const tier = tierFor(p, sel);
      const nudge = nudgeFor(p, sel);
      const tiers = p.tiers.length > 1
        ? `<ul class="tier-list" aria-label="Price tiers">${p.tiers.map((t, i) => {
            const next = p.tiers[i + 1];
            const range = next ? `${t.fromQty}&ndash;${next.fromQty - 1} pcs` : `${t.fromQty}+ pcs`;
            return `<li class="${t === tier ? 'active' : ''}"><span>${range}</span><strong>${fmt(t.unitPrice)}</strong></li>`;
          }).join('')}</ul>`
        : `<ul class="tier-list" aria-label="Price"><li class="active"><span>Any quantity from ${p.minQty}</span><strong>${fmt(p.tiers[0].unitPrice)}</strong></li></ul>`;
      return `
        <article class="product-card" data-product-card="${esc(p.id)}">
          <div class="product-art">${illustration(p.illustration)}
            ${inCart ? `<span class="in-cart-badge">${num.format(inCart)} in cart</span>` : ''}
          </div>
          <div class="product-body">
            <div class="product-head">
              <h2 class="product-name">${esc(p.name)}</h2>
              <p class="product-price"><strong>${fmt(basePrice(p))}</strong><span>/ piece</span></p>
            </div>
            <p class="product-tagline">${esc(p.tagline)}</p>
            <p class="product-desc">${esc(p.description)}</p>
            <p class="rule-chip"><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.4 6.7 19.4l1.2-6L3.4 9.3l6-.7z" fill="currentColor"/></svg>${esc(p.pricingRule)}</p>
            ${tiers}
            <div class="product-buy">
              <div class="buy-row">
                ${qtyStepper({ id: p.id, value: sel, min: defaultSelection(p), max: p.maxQty, label: p.name, context: 'select' })}
                <div class="buy-estimate" aria-live="polite">
                  <span class="buy-estimate-label">${num.format(sel)} &times; ${fmt(tier.unitPrice)}</span>
                  <strong class="buy-estimate-total">${fmt(sel * tier.unitPrice)}</strong>
                </div>
              </div>
              <p class="nudge" ${nudge ? '' : 'hidden'}>${nudge ? esc(nudge) : ''}</p>
              <button type="button" class="btn btn-primary btn-block" data-add="${esc(p.id)}">
                ${inCart ? 'Update cart' : 'Add to cart'}
              </button>
            </div>
          </div>
        </article>`;
    }).join('');
  }

  function renderCartBadge() {
    const count = cartCount();
    const btn = $('.cart-button');
    const badge = $('.cart-count', btn);
    badge.textContent = num.format(count);
    badge.dataset.count = String(count);
    btn.setAttribute('aria-label', `View cart, ${count} item${count === 1 ? '' : 's'}`);
    btn.classList.remove('bump');
    void btn.offsetWidth;
    if (count) btn.classList.add('bump');
  }

  function summaryHtml({ quote, cta, ctaId, ctaDisabled, note, compact }) {
    if (!quote || !quote.lines.length) {
      return `<h2 class="summary-title">Order summary</h2><p class="muted">Your cart is empty.</p>`;
    }
    const lines = quote.lines.map((l) => `
      <li>
        <span class="sum-name">${esc(l.name)} <span class="muted">&times; ${num.format(l.quantity)}</span></span>
        <span>${fmt(l.lineTotal)}</span>
      </li>`).join('');
    return `
      <h2 class="summary-title">Order summary</h2>
      ${compact ? '' : `<ul class="sum-lines">${lines}</ul>`}
      <dl class="sum-totals">
        <div><dt>Items</dt><dd>${num.format(quote.itemCount)} pcs</dd></div>
        ${quote.totalSavings > 0 ? `
          <div><dt>Price at standard rate</dt><dd>${fmt(quote.subtotalAtBase)}</dd></div>
          <div class="sum-savings"><dt>Bulk savings</dt><dd>&minus; ${fmt(quote.totalSavings)}</dd></div>` : ''}
        <div><dt>Shipping</dt><dd>Included</dd></div>
        <div class="sum-grand"><dt>Total payable</dt><dd>${fmt(quote.grandTotal)}</dd></div>
      </dl>
      ${cta ? `<button type="button" class="btn btn-primary btn-block" id="${ctaId}" ${ctaDisabled ? 'disabled' : ''}>${cta}</button>` : ''}
      ${note ? `<p class="sum-note">${note}</p>` : ''}`;
  }

  function renderStickyBar() {
    let bar = $('#sticky-bar');
    const show = state.step === 'products' && cartCount() > 0 && state.quote && state.quote.lines.length;
    if (!show) {
      if (bar) bar.remove();
      document.body.classList.remove('has-sticky');
      return;
    }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'sticky-bar';
      bar.className = 'sticky-bar';
      document.body.appendChild(bar);
    }
    document.body.classList.add('has-sticky');
    const q = state.quote;
    bar.innerHTML = `
      <div class="container sticky-inner">
        <div class="sticky-info">
          <span class="sticky-count">${num.format(q.itemCount)} pcs in cart</span>
          <strong class="sticky-total">${fmt(q.grandTotal)}</strong>
          ${q.totalSavings > 0 ? `<span class="sticky-save">You save ${fmt(q.totalSavings)}</span>` : ''}
        </div>
        <button type="button" class="btn btn-primary" data-goto="cart">View cart
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
      </div>`;
  }

  function renderCart() {
    const linesEl = $('#cart-lines');
    const sumEl = $('#cart-summary');
    const items = cartItems();
    if (!items.length) {
      linesEl.innerHTML = `
        <div class="empty">
          <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden="true"><circle cx="32" cy="32" r="30" fill="#FEF9E8"/><path d="M18 22h4l4 18h16l4-13H24" fill="none" stroke="#ECA55A" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="28" cy="46" r="2.4" fill="#ECA55A"/><circle cx="40" cy="46" r="2.4" fill="#ECA55A"/></svg>
          <h2>Your cart is empty</h2>
          <p class="muted">Browse the blindfolds and add the quantities you need for your programme.</p>
          <button type="button" class="btn btn-primary" data-goto="products">Browse products</button>
        </div>`;
      sumEl.innerHTML = summaryHtml({ quote: null });
      return;
    }
    const quote = state.quote;
    const byId = new Map((quote?.lines || []).map((l) => [l.productId, l]));
    linesEl.innerHTML = `
      <ul class="cart-list">
        ${items.map(({ productId, quantity }) => {
          const p = productById(productId);
          const l = byId.get(productId);
          const nudge = nudgeFor(p, quantity);
          return `
            <li class="cart-line" data-line="${esc(productId)}">
              <div class="cart-thumb">${illustration(p.illustration)}</div>
              <div class="cart-info">
                <h2 class="cart-name">${esc(p.name)}</h2>
                <p class="cart-meta">
                  ${l ? `<span class="tier-badge ${l.savings > 0 ? 'tier-badge-save' : ''}">${esc(l.tier)}</span>
                  <span>${fmt(l.unitPrice)} each</span>
                  ${l.savings > 0 ? `<span class="save-text">Saving ${fmt(l.savings)}</span>` : ''}` : '<span class="muted">Calculating&hellip;</span>'}
                </p>
                <p class="cart-rule muted">${esc(p.pricingRule)}</p>
                ${nudge ? `<p class="nudge">${esc(nudge)}</p>` : ''}
              </div>
              <div class="cart-controls">
                ${qtyStepper({ id: productId, value: quantity, min: p.minQty, max: p.maxQty, label: p.name, context: 'cart' })}
                <button type="button" class="link-btn" data-remove="${esc(productId)}">Remove</button>
              </div>
              <div class="cart-total">
                ${l && l.savings > 0 ? `<s class="muted">${fmt(l.basePrice * l.quantity)}</s>` : ''}
                <strong>${l ? fmt(l.lineTotal) : '&mdash;'}</strong>
              </div>
            </li>`;
        }).join('')}
      </ul>
      <div class="cart-foot">
        <button type="button" class="btn btn-ghost" data-goto="products">
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          Continue shopping
        </button>
      </div>`;
    sumEl.innerHTML = summaryHtml({
      quote,
      cta: 'Proceed to details',
      ctaId: 'to-details',
      ctaDisabled: !quote || !!state.quoteError,
      note: 'Amounts are calculated by the server. No shipping charges.',
    });
  }

  function renderDetailsSummary() {
    $('#details-summary').innerHTML = summaryHtml({ quote: state.quote, note: 'You can still go back and change quantities.' });
  }

  function renderPayment() {
    const panel = $('#pay-panel');
    const order = state.order;
    if (!order) {
      panel.innerHTML = `<p class="muted">Preparing your order&hellip;</p>`;
      return;
    }
    $('#payment-sub').innerHTML = `Order <strong>${esc(order.id)}</strong> is reserved. Complete the payment of <strong>${fmt(order.amount)}</strong> to confirm it.`;
    panel.innerHTML = `
      <div class="demo-note" role="note">
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M12 11v6M12 7.5v.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
        <span><strong>Demo mode:</strong> no real payment is made. Clicking pay simulates a successful UPI transaction.</span>
      </div>
      <div class="pay-amount">
        <span>Amount to pay</span>
        <strong>${fmt(order.amount)}</strong>
      </div>
      <div class="pay-option">
        <h2 class="pay-heading">Pay with Google Pay</h2>
        <p class="muted">Opens Google Pay with the amount and order reference pre-filled.</p>
        <button type="button" class="gpay-btn" data-pay="gpay" aria-label="Pay ${fmt(order.amount)} with Google Pay">
          <span class="gpay-label">Pay with</span>
          <span class="gpay-mark" aria-hidden="true">
            <svg class="gpay-g" viewBox="0 0 16 16">
              <path d="M15.3 8.2c0-.6-.1-1.1-.2-1.6H8v3h4.1c-.2.9-.7 1.7-1.5 2.2v1.8H13c1.4-1.3 2.3-3.2 2.3-5.4z" fill="#4285F4"/>
              <path d="M8 16c2 0 3.7-.7 5-1.8l-2.4-1.8c-.7.4-1.5.7-2.6.7-2 0-3.6-1.3-4.2-3.1H1.3v1.9C2.6 14.4 5.1 16 8 16z" fill="#34A853"/>
              <path d="M3.8 9.9c-.2-.5-.3-1.1-.3-1.7s.1-1.2.3-1.7V4.6H1.3C.8 5.7.5 6.9.5 8.2s.3 2.5.8 3.6l2.5-1.9z" fill="#FBBC04"/>
              <path d="M8 3.3c1.1 0 2.1.4 2.9 1.1l2.2-2.2C11.7.9 10 .2 8 .2 5.1.2 2.6 1.9 1.3 4.6l2.5 1.9C4.4 4.6 6 3.3 8 3.3z" fill="#EA4335"/>
            </svg>
            <span class="gpay-word">Pay</span>
          </span>
        </button>
      </div>
      <div class="pay-divider"><span>or scan with any UPI app</span></div>
      <div class="pay-option pay-qr">
        <img class="qr" src="${order.upi.qrDataUrl}" width="200" height="200" alt="UPI QR code for paying ${fmt(order.amount)} to ${esc(order.upi.vpa)}">
        <div class="qr-info">
          <dl class="kv">
            <div><dt>UPI ID</dt><dd><code>${esc(order.upi.vpa)}</code></dd></div>
            <div><dt>Payee</dt><dd>${esc(order.upi.payeeName)}</dd></div>
            <div><dt>Amount</dt><dd>${fmt(order.amount)}</dd></div>
            <div><dt>Reference</dt><dd>${esc(order.id)}</dd></div>
          </dl>
          <div class="qr-actions">
            <button type="button" class="btn btn-secondary" data-pay="upi_qr">I have paid via UPI QR</button>
            <a class="link-btn" href="${esc(order.upi.link)}">Open in UPI app</a>
          </div>
        </div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" data-goto="details">Back to details</button>
      </div>`;
    $('#payment-summary').innerHTML = `
      ${summaryHtml({ quote: order.quote })}
      <div class="sum-address">
        <h3>Deliver to</h3>
        <p>${esc(order.teacher.name)}<br>${addressHtml(order.address)}</p>
        <p class="muted">${esc(order.teacher.phone)} &middot; ${esc(order.teacher.email)}</p>
      </div>`;
  }

  function addressHtml(a) {
    return [a.line1, a.line2, `${a.city}, ${a.state} ${a.pincode}`].filter(Boolean).map(esc).join('<br>');
  }

  function formatDateTime(iso) {
    try {
      return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function renderConfirmation() {
    const el = $('#confirmation');
    const o = state.order;
    if (!o || o.status !== 'PAID') {
      el.innerHTML = `<p class="muted">Loading order&hellip;</p>`;
      return;
    }
    el.innerHTML = `
      <div class="confirm">
        <div class="confirm-hero">
          <div class="check" aria-hidden="true">
            <svg viewBox="0 0 64 64" width="64" height="64"><circle cx="32" cy="32" r="30" fill="#FFF0CD"/><circle cx="32" cy="32" r="22" fill="#ECA55A"/><path d="M22 33l7 7 13-15" fill="none" stroke="#fff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </div>
          <p class="eyebrow">Payment received</p>
          <h1 id="confirm-title">Thank you, ${esc(o.teacher.name.split(' ')[0])}! Your order is confirmed.</h1>
          <p class="page-sub">A confirmation will be sent to <strong>${esc(o.teacher.email)}</strong>. Keep the order ID handy for any queries.</p>
        </div>
        <div class="receipt panel">
          <div class="receipt-head">
            <div>
              <p class="receipt-brand">The Art of Living &middot; IP Teacher Supplies</p>
              <p class="muted">Payment receipt</p>
            </div>
            <span class="status-pill">Paid</span>
          </div>
          <dl class="receipt-grid">
            <div><dt>Order ID</dt><dd><strong>${esc(o.id)}</strong></dd></div>
            <div><dt>UPI reference</dt><dd><strong>${esc(o.payment.upiReference)}</strong></dd></div>
            <div><dt>Paid on</dt><dd>${esc(formatDateTime(o.payment.paidAt))}</dd></div>
            <div><dt>Method</dt><dd>${o.payment.method === 'gpay' ? 'Google Pay (UPI)' : 'UPI QR'}</dd></div>
          </dl>
          <table class="receipt-table">
            <caption class="sr-only">Items ordered</caption>
            <thead><tr><th scope="col">Item</th><th scope="col" class="num">Qty</th><th scope="col" class="num">Rate</th><th scope="col" class="num">Amount</th></tr></thead>
            <tbody>
              ${o.quote.lines.map((l) => `
                <tr>
                  <td>${esc(l.name)}<span class="muted receipt-tier">${esc(l.tier)}</span></td>
                  <td class="num">${num.format(l.quantity)}</td>
                  <td class="num">${fmt(l.unitPrice)}</td>
                  <td class="num">${fmt(l.lineTotal)}</td>
                </tr>`).join('')}
            </tbody>
            <tfoot>
              ${o.quote.totalSavings > 0 ? `<tr class="receipt-save"><td colspan="3">Bulk savings included</td><td class="num">${fmt(o.quote.totalSavings)}</td></tr>` : ''}
              <tr class="receipt-total"><th scope="row" colspan="3">Total paid</th><td class="num">${fmt(o.amount)}</td></tr>
            </tfoot>
          </table>
          <div class="receipt-cols">
            <div>
              <h2>Delivery address</h2>
              <p>${esc(o.teacher.name)}<br>${addressHtml(o.address)}</p>
            </div>
            <div>
              <h2>Teacher</h2>
              <p>${esc(o.teacher.phone)}<br>${esc(o.teacher.email)}${o.teacher.teacherCode ? `<br>Code: ${esc(o.teacher.teacherCode)}` : ''}</p>
            </div>
          </div>
        </div>
        <div class="confirm-actions no-print">
          <button type="button" class="btn btn-secondary" id="print-receipt">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M7 9V4h10v5M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2M7 14h10v6H7z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/></svg>
            Print / save receipt
          </button>
          <button type="button" class="btn btn-primary" id="new-order">Place another order</button>
        </div>
      </div>`;
  }

  function renderStepper() {
    const idx = STEPS.findIndex((s) => s.id === state.step);
    const locked = state.step === 'confirmation';
    $('#stepper').innerHTML = STEPS.map((s, i) => {
      const status = i < idx ? 'done' : i === idx ? 'current' : 'todo';
      const clickable = !locked && i < idx && i <= 2;
      const inner = `
        <span class="step-dot" aria-hidden="true">${status === 'done'
          ? '<svg viewBox="0 0 24 24" width="14" height="14"><path d="M5 12.5l4.2 4.2L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>'
          : i + 1}</span>
        <span class="step-label">${s.label}</span>`;
      return `<li class="step-item ${status}" ${status === 'current' ? 'aria-current="step"' : ''}>
        ${clickable ? `<button type="button" class="step-link" data-goto="${s.id}"><span class="sr-only">Go back to </span>${inner}</button>` : `<span class="step-link">${inner}${status === 'done' ? '<span class="sr-only"> (completed)</span>' : ''}</span>`}
      </li>`;
    }).join('');
  }

  function render() {
    $$('.step').forEach((sec) => { sec.hidden = sec.dataset.step !== state.step; });
    renderStepper();
    renderCartBadge();
    if (state.step === 'products') renderProducts();
    if (state.step === 'cart') renderCart();
    if (state.step === 'details') { fillForm(); renderDetailsSummary(); }
    if (state.step === 'payment') renderPayment();
    if (state.step === 'confirmation') renderConfirmation();
    renderStickyBar();
    document.body.dataset.step = state.step;
  }

  async function goTo(step, { focus = true } = {}) {
    if (step === state.step) return;
    if (state.step === 'confirmation' && step !== 'products') return;
    if ((step === 'details' || step === 'payment') && !cartItems().length) {
      snack('Your cart is empty. Add a product first.', 'info');
      step = 'products';
    }
    if (step === 'details' && state.quoteError) {
      snack(state.quoteError, 'error');
      step = 'cart';
    }
    state.step = step;
    save();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (focus) {
      const h = $(`.step[data-step="${step}"] h1`);
      if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
    }
  }

  let quoteSeq = 0;
  async function refreshQuote({ silent = false } = {}) {
    const seq = ++quoteSeq;
    const items = cartItems();
    if (!items.length) {
      state.quote = { currency: 'INR', lines: [], itemCount: 0, subtotalAtBase: 0, totalSavings: 0, grandTotal: 0 };
      state.quoteError = null;
      return state.quote;
    }
    try {
      const q = await api('/orders/quote', { method: 'POST', body: { items } });
      if (seq !== quoteSeq) return state.quote;
      state.quote = q;
      state.quoteError = null;
    } catch (e) {
      if (seq !== quoteSeq) return state.quote;
      state.quoteError = e.message;
      if (!silent) snack(e.message, 'error');
    }
    return state.quote;
  }

  async function updateAndRender(opts) {
    await refreshQuote(opts);
    render();
  }

  function clampQty(p, raw, min) {
    const n = Math.floor(Number(String(raw).replace(/[^\d]/g, '')));
    if (!Number.isFinite(n) || n < min) return { value: min, clamped: 'min' };
    if (n > p.maxQty) return { value: p.maxQty, clamped: 'max' };
    return { value: n, clamped: null };
  }

  function updateSelectionCard(productId) {
    const p = productById(productId);
    const card = $(`[data-product-card="${CSS.escape(productId)}"]`);
    if (!p || !card) return;
    const sel = state.selection[productId] ?? defaultSelection(p);
    const tier = tierFor(p, sel);
    $('.qty-input', card).value = sel;
    $('[data-qty-action="dec"]', card).setAttribute('aria-disabled', String(sel <= defaultSelection(p)));
    $('[data-qty-action="inc"]', card).setAttribute('aria-disabled', String(sel >= p.maxQty));
    $('.buy-estimate-label', card).innerHTML = `${num.format(sel)} &times; ${fmt(tier.unitPrice)}`;
    $('.buy-estimate-total', card).textContent = fmt(sel * tier.unitPrice);
    $$('.tier-list li', card).forEach((li, i) => li.classList.toggle('active', p.tiers.length === 1 || p.tiers[i] === tier));
    const nudge = nudgeFor(p, sel);
    const nudgeEl = $('.nudge', card);
    nudgeEl.hidden = !nudge;
    nudgeEl.textContent = nudge || '';
  }

  function belowMinMessage(p) {
    return `${p.name} has a minimum order of ${p.minQty} pieces. Use Remove to take it out of the cart.`;
  }

  function onQtyStep(ctx, productId, dir) {
    const p = productById(productId);
    if (!p) return;
    if (ctx === 'select') {
      const cur = state.selection[productId] ?? defaultSelection(p);
      const next = cur + dir;
      if (next < defaultSelection(p)) {
        if (p.minQty > 1) snack(`Minimum order for ${p.name} is ${p.minQty} pieces.`, 'error');
        return;
      }
      if (next > p.maxQty) { snack(`Maximum ${num.format(p.maxQty)} pieces per order.`, 'info'); return; }
      state.selection[productId] = next;
      updateSelectionCard(productId);
      return;
    }
    const cur = state.cart[productId] || 0;
    const next = cur + dir;
    if (next < p.minQty) {
      snack(p.minQty > 1 ? belowMinMessage(p) : 'Use Remove to take this item out of the cart.', 'error');
      return;
    }
    if (next > p.maxQty) { snack(`Maximum ${num.format(p.maxQty)} pieces per order.`, 'info'); return; }
    setCartQty(productId, next);
  }

  let cartToastTimer;
  function setCartQty(productId, qty, { toast = true } = {}) {
    state.cart[productId] = qty;
    save();
    renderCartBadge();
    const input = $(`.cart-line[data-line="${CSS.escape(productId)}"] .qty-input`);
    if (input) input.value = qty;
    clearTimeout(cartToastTimer);
    cartToastTimer = setTimeout(async () => {
      await updateAndRender();
      if (toast && !state.quoteError) {
        const p = productById(productId);
        snack(`${p.name} quantity updated to ${num.format(qty)}.`, 'success', 2400);
      }
    }, 280);
  }

  function addToCart(productId) {
    const p = productById(productId);
    const sel = state.selection[productId] ?? defaultSelection(p);
    if (sel < p.minQty) { snack(`Minimum order for ${p.name} is ${p.minQty} pieces.`, 'error'); return; }
    const existed = !!state.cart[productId];
    state.cart[productId] = sel;
    save();
    snack(existed ? `${p.name} updated to ${num.format(sel)} pcs in your cart.` : `${num.format(sel)} × ${p.name} added to cart.`, 'success');
    updateAndRender({ silent: false });
  }

  function removeFromCart(productId) {
    const p = productById(productId);
    delete state.cart[productId];
    delete state.selection[productId];
    save();
    snack(`${p ? p.name : 'Item'} removed from cart.`, 'info');
    updateAndRender();
  }

  const FIELDS = {
    name: (v) => (!v.trim() ? 'Please enter your full name.' : v.trim().length < 2 ? 'Name looks too short.' : ''),
    phone: (v) => {
      const d = normalisePhone(v);
      if (!d) return 'Please enter your mobile number.';
      return /^[6-9]\d{9}$/.test(d) ? '' : 'Enter a valid 10-digit Indian mobile number.';
    },
    email: (v) => (!v.trim() ? 'Please enter your email.' : /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) ? '' : 'Enter a valid email address.'),
    teacherCode: () => '',
    line1: (v) => (!v.trim() ? 'Please enter the address.' : ''),
    line2: () => '',
    city: (v) => (!v.trim() ? 'Please enter the city.' : ''),
    state: (v) => (!v ? 'Please select a state or union territory.' : STATES.includes(v) ? '' : 'Select a valid state.'),
    pincode: (v) => (!v.trim() ? 'Please enter the pincode.' : /^[1-9]\d{5}$/.test(v.trim()) ? '' : 'Enter a valid 6-digit pincode.'),
  };

  function normalisePhone(v) {
    return String(v || '').replace(/[\s-]/g, '').replace(/^(\+91|91|0)(?=\d{10}$)/, '');
  }

  function validateField(name, show = true) {
    const input = $(`#f-${name}`);
    const msg = FIELDS[name](input.value);
    if (show) {
      const errEl = $(`#f-${name}-error`);
      errEl.textContent = msg;
      input.setAttribute('aria-invalid', msg ? 'true' : 'false');
      if (msg) input.setAttribute('aria-describedby', `f-${name}-error`);
      else input.removeAttribute('aria-describedby');
      input.closest('.field').classList.toggle('invalid', !!msg);
      input.closest('.field').classList.toggle('valid', !msg && !!input.value.trim());
    }
    return msg;
  }

  function readForm() {
    const d = {};
    Object.keys(FIELDS).forEach((k) => { d[k] = $(`#f-${k}`).value; });
    return d;
  }

  let formFilled = false;
  function fillForm() {
    if (formFilled) return;
    formFilled = true;
    Object.keys(FIELDS).forEach((k) => {
      if (state.details[k] != null) $(`#f-${k}`).value = state.details[k];
    });
  }

  async function submitDetails(e) {
    e.preventDefault();
    const errors = Object.keys(FIELDS).map((k) => [k, validateField(k)]).filter(([, m]) => m);
    if (errors.length) {
      snack(errors.length === 1 ? errors[0][1] : `Please fix ${errors.length} highlighted fields.`, 'error');
      $(`#f-${errors[0][0]}`).focus();
      return;
    }
    const d = readForm();
    state.details = d;
    save();
    const btn = $('#details-submit');
    btn.disabled = true;
    btn.classList.add('loading');
    btn.textContent = 'Creating order…';
    try {
      const order = await api('/orders', {
        method: 'POST',
        body: {
          items: cartItems(),
          teacher: {
            name: d.name.trim(),
            phone: normalisePhone(d.phone),
            email: d.email.trim(),
            ...(d.teacherCode.trim() ? { teacherCode: d.teacherCode.trim() } : {}),
          },
          address: {
            line1: d.line1.trim(),
            ...(d.line2.trim() ? { line2: d.line2.trim() } : {}),
            city: d.city.trim(),
            state: d.state,
            pincode: d.pincode.trim(),
          },
        },
      });
      const { token, ...created } = order;
      state.order = created;
      state.orderId = order.id;
      state.token = token;
      snack(`Order ${order.id} created. Complete the payment to confirm.`, 'success');
      await goTo('payment');
    } catch (err) {
      (err.messages || [err.message]).slice(0, 3).forEach((m) => snack(m, 'error', 5000));
    } finally {
      btn.disabled = false;
      btn.classList.remove('loading');
      btn.textContent = 'Continue to payment';
    }
  }

  let paying = false;
  async function pay(method) {
    if (paying || !state.order) return;
    paying = true;
    const overlay = $('#processing');
    const returnFocus = document.activeElement;
    $('#processing-text').textContent = method === 'gpay'
      ? 'Waiting for confirmation from Google Pay…'
      : 'Checking UPI payment status…';
    overlay.hidden = false;
    requestAnimationFrame(() => overlay.classList.add('show'));
    $('.processing-card', overlay).setAttribute('tabindex', '-1');
    $('.processing-card', overlay).focus();
    try {
      const [order] = await Promise.all([
        api(`/orders/${encodeURIComponent(state.order.id)}/pay`, { method: 'POST', body: { method, ...(state.token ? { token: state.token } : {}) } }),
        new Promise((r) => setTimeout(r, PROCESSING_MS)),
      ]);
      state.order = order;
      state.token = null;
      state.cart = {};
      state.selection = {};
      state.quote = null;
      snack(`Payment successful. UPI ref ${order.payment.upiReference}.`, 'success', 5000);
      overlay.classList.remove('show');
      overlay.hidden = true;
      await goTo('confirmation');
    } catch (err) {
      overlay.classList.remove('show');
      overlay.hidden = true;
      snack(err.message, 'error', 5000);
      if (returnFocus) returnFocus.focus();
    } finally {
      paying = false;
    }
  }

  function startOver() {
    state.cart = {};
    state.selection = {};
    state.order = null;
    state.orderId = null;
    state.token = null;
    state.quote = null;
    state.quoteError = null;
    state.step = 'products';
    save();
    updateAndRender();
    window.scrollTo({ top: 0, behavior: 'smooth' });
    snack('Ready for a new order. Your details are saved for next time.', 'info');
  }

  function bind() {
    document.addEventListener('click', (e) => {
      const t = e.target.closest('button, a');
      if (!t) return;
      if (t.dataset.goto) { e.preventDefault(); goTo(t.dataset.goto); return; }
      if (t.dataset.qtyAction) {
        if (t.getAttribute('aria-disabled') === 'true') {
          const wrap = t.closest('.qty');
          const p = productById(wrap.dataset.product);
          if (t.dataset.qtyAction === 'dec' && p) {
            if (wrap.dataset.qtyContext === 'cart') snack(p.minQty > 1 ? belowMinMessage(p) : 'Use Remove to take this item out of the cart.', 'error');
            else if (p.minQty > 1) snack(`Minimum order for ${p.name} is ${p.minQty} pieces.`, 'error');
          }
          return;
        }
        const wrap = t.closest('.qty');
        onQtyStep(wrap.dataset.qtyContext, wrap.dataset.product, t.dataset.qtyAction === 'inc' ? 1 : -1);
        return;
      }
      if (t.dataset.add) { addToCart(t.dataset.add); return; }
      if (t.dataset.remove) { removeFromCart(t.dataset.remove); return; }
      if (t.dataset.pay) { pay(t.dataset.pay); return; }
      if (t.id === 'to-details') { goTo('details'); return; }
      if (t.id === 'print-receipt') { window.print(); return; }
      if (t.id === 'new-order') { startOver(); }
    });

    document.addEventListener('change', (e) => {
      const input = e.target.closest('.qty-input');
      if (!input) return;
      const wrap = input.closest('.qty');
      const p = productById(wrap.dataset.product);
      if (!p) return;
      const ctx = wrap.dataset.qtyContext;
      const min = ctx === 'select' ? defaultSelection(p) : p.minQty;
      const { value, clamped } = clampQty(p, input.value, min);
      if (clamped === 'min') snack(p.minQty > 1 ? `Minimum order for ${p.name} is ${p.minQty} pieces.` : 'Quantity must be at least 1.', 'error');
      if (clamped === 'max') snack(`Maximum ${num.format(p.maxQty)} pieces per order.`, 'info');
      input.value = value;
      if (ctx === 'select') {
        state.selection[p.id] = value;
        updateSelectionCard(p.id);
      } else if (value !== state.cart[p.id]) {
        setCartQty(p.id, value);
      }
    });

    document.addEventListener('keydown', (e) => {
      const input = e.target.closest && e.target.closest('.qty-input');
      if (!input) return;
      if (e.key === 'Enter') { input.blur(); input.dispatchEvent(new Event('change', { bubbles: true })); }
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const wrap = input.closest('.qty');
        onQtyStep(wrap.dataset.qtyContext, wrap.dataset.product, e.key === 'ArrowUp' ? 1 : -1);
      }
    });

    const form = $('#details-form');
    form.addEventListener('submit', submitDetails);
    Object.keys(FIELDS).forEach((k) => {
      const input = $(`#f-${k}`);
      input.addEventListener('blur', () => { if (input.value || input.closest('.field').classList.contains('invalid')) validateField(k); });
      input.addEventListener('input', () => {
        if (k === 'pincode') input.value = input.value.replace(/\D/g, '').slice(0, 6);
        if (input.closest('.field').classList.contains('invalid')) validateField(k);
        state.details[k] = input.value;
        save();
      });
      if (input.tagName === 'SELECT') input.addEventListener('change', () => validateField(k));
    });

    const logo = $('.brand-logo');
    const fallback = () => { logo.hidden = true; $('.brand-fallback').hidden = false; };
    logo.addEventListener('error', fallback);
    if (logo.complete && logo.naturalWidth === 0) fallback();

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY) { load(); updateAndRender({ silent: true }); }
    });
  }

  async function init() {
    $('#year').textContent = String(new Date().getFullYear());
    $('#f-state').insertAdjacentHTML('beforeend', STATES.map((s) => `<option value="${esc(s)}">${esc(s)}</option>`).join(''));
    load();
    bind();
    render();
    try {
      state.products = await api('/products');
    } catch (e) {
      $('#product-grid').innerHTML = `<div class="panel empty"><h2>Could not load products</h2><p class="muted">${esc(e.message)}</p><button class="btn btn-primary" type="button" onclick="location.reload()">Try again</button></div>`;
      snack(e.message, 'error', 6000);
      return;
    }
    Object.keys(state.cart).forEach((id) => {
      const p = productById(id);
      if (!p || !Number.isInteger(state.cart[id]) || state.cart[id] < p.minQty) delete state.cart[id];
    });
    state.products.forEach((p) => {
      if (state.cart[p.id]) state.selection[p.id] = state.cart[p.id];
    });

    if ((state.step === 'payment' || state.step === 'confirmation') && state.orderId) {
      try {
        const saved = state.order;
        state.order = await api(`/orders/${encodeURIComponent(state.orderId)}`).catch((err) => {
          if (saved && (saved.status === 'PAID' || state.token)) return saved;
          throw err;
        });
        if (state.step === 'payment' && state.order.status === 'PAID') state.step = 'confirmation';
        if (state.step === 'confirmation' && state.order.status !== 'PAID') state.step = 'payment';
      } catch {
        state.order = null;
        state.orderId = null;
        state.token = null;
        state.step = cartItems().length ? 'details' : 'products';
        snack('Your previous order session expired. Please review and continue.', 'info', 5000);
      }
    } else if (state.step === 'payment' || state.step === 'confirmation') {
      state.step = cartItems().length ? 'details' : 'products';
    }
    if (state.step !== 'products' && state.step !== 'confirmation' && !cartItems().length) state.step = 'products';
    save();
    await updateAndRender({ silent: true });
    if (state.quoteError && state.step !== 'products') {
      state.step = 'cart';
      render();
      snack(state.quoteError, 'error');
    }
  }

  init();
})();
