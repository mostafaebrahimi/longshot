/**
 * Longshot capture agent.
 *
 * Injected on demand into the active tab. It owns everything that has to happen
 * inside the page: picking the right scroll container, planning the tile grid,
 * scrolling, calming sticky furniture down, and drawing the progress card.
 * The service worker drives it one step at a time and takes the actual bitmaps.
 */
(() => {
  if (window.__longshotAgent) return;

  const MIN_STEP = 40;

  const state = {
    active: false,
    scroller: null, // null = document scrolling element
    plan: null,
    origin: { x: 0, y: 0 },
    touched: [], // [element, property, previousInlineValue]
    styleTag: null,
    overlay: null,
  };

  const docEl = document.scrollingElement || document.documentElement;
  const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---------------------------------------------------------------- geometry */

  function scrollbars() {
    return {
      w: Math.max(0, window.innerWidth - document.documentElement.clientWidth),
      h: Math.max(0, window.innerHeight - document.documentElement.clientHeight),
    };
  }

  function docSize() {
    const b = document.body;
    return {
      w: Math.max(
        document.documentElement.scrollWidth,
        b ? b.scrollWidth : 0,
        document.documentElement.clientWidth
      ),
      h: Math.max(
        document.documentElement.scrollHeight,
        b ? b.scrollHeight : 0,
        document.documentElement.clientHeight
      ),
    };
  }

  /**
   * Most pages scroll the document. Single-page apps often scroll an inner
   * panel instead, and that is exactly where naive capture tools return one
   * viewport. Pick the biggest scrollable element that covers most of the
   * viewport, and only if the document itself has nothing to scroll.
   */
  function pickScroller() {
    const d = docSize();
    if (d.h - document.documentElement.clientHeight > 8) return null;

    let best = null;
    let bestArea = 0;
    const els = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of els) {
      const overflowY = getComputedStyle(el).overflowY;
      if (overflowY !== "auto" && overflowY !== "scroll" && overflowY !== "overlay") continue;
      if (el.scrollHeight - el.clientHeight <= 8) continue;
      if (el.clientHeight < window.innerHeight * 0.5) continue;
      if (el.clientWidth < window.innerWidth * 0.5) continue;
      const area = el.scrollWidth * el.scrollHeight;
      if (area > bestArea) {
        bestArea = area;
        best = el;
      }
    }
    return best;
  }

  function getScroll() {
    const el = state.scroller;
    return el
      ? { x: el.scrollLeft, y: el.scrollTop }
      : { x: window.scrollX, y: window.scrollY };
  }

  function setScroll(x, y) {
    const el = state.scroller;
    if (el) {
      el.scrollLeft = x;
      el.scrollTop = y;
    } else {
      window.scrollTo(x, y);
    }
  }

  function contentSize() {
    const el = state.scroller;
    if (el) return { w: el.scrollWidth, h: el.scrollHeight };
    return docSize();
  }

  /**
   * The rectangle of the page (CSS px, viewport coordinates) that is worth
   * keeping from the next bitmap, plus how far that rectangle sits into the
   * scrolled content.
   */
  function viewBox() {
    const sb = scrollbars();
    const el = state.scroller;
    if (!el) {
      return {
        x: 0,
        y: 0,
        w: Math.max(0, window.innerWidth - sb.w),
        h: Math.max(0, window.innerHeight - sb.h),
        padX: 0,
        padY: 0,
      };
    }
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const x0 = r.left + (parseFloat(cs.borderLeftWidth) || 0);
    const y0 = r.top + (parseFloat(cs.borderTopWidth) || 0);
    const vx0 = Math.max(0, x0);
    const vy0 = Math.max(0, y0);
    const vx1 = Math.min(window.innerWidth - sb.w, x0 + el.clientWidth);
    const vy1 = Math.min(window.innerHeight - sb.h, y0 + el.clientHeight);
    return {
      x: vx0,
      y: vy0,
      w: Math.max(0, vx1 - vx0),
      h: Math.max(0, vy1 - vy0),
      padX: vx0 - x0,
      padY: vy0 - y0,
    };
  }

  /* ------------------------------------------------------------- page tweaks */

  function pin(el, prop, value) {
    state.touched.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, "important");
  }

  function restoreTouched() {
    for (const [el, prop, prev, prio] of state.touched) {
      if (prev) el.style.setProperty(prop, prev, prio);
      else el.style.removeProperty(prop);
    }
    state.touched.length = 0;
  }

  function injectStyle(css) {
    const tag = document.createElement("style");
    tag.textContent = css;
    (document.head || document.documentElement).appendChild(tag);
    return tag;
  }

  /** Sticky bars are put back in the flow; fixed furniture is hidden. Both are
   *  reverted in finish(), including if the capture is cancelled. */
  function calmFurniture() {
    const els = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of els) {
      if (el === state.overlay) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed") {
        if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        pin(el, "visibility", "hidden");
      } else if (pos === "sticky") {
        pin(el, "position", "static");
      }
    }
  }

  /* ---------------------------------------------------------------- overlay */

  function buildOverlay(total) {
    const host = document.createElement("div");
    host.setAttribute("data-longshot", "progress");
    const s = host.style;
    s.setProperty("position", "fixed", "important");
    s.setProperty("z-index", "2147483647", "important");
    s.setProperty("right", "16px", "important");
    s.setProperty("bottom", "16px", "important");
    s.setProperty("width", "auto", "important");
    s.setProperty("height", "auto", "important");
    s.setProperty("margin", "0", "important");
    s.setProperty("padding", "0", "important");
    s.setProperty("border", "0", "important");
    s.setProperty("pointer-events", "auto", "important");
    s.setProperty("color-scheme", "dark", "important");

    const root = host.attachShadow({ mode: "closed" });
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(`
      :host { all: initial; }
      .card {
        display: flex; align-items: center; gap: 12px;
        padding: 11px 13px;
        font: 500 12px/1.3 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #e8eaed;
        background: #16181d;
        border: 1px solid #2c313a;
        border-radius: 12px;
        box-shadow: 0 20px 50px -18px rgba(0,0,0,.8);
      }
      .ladder { display: grid; gap: 2px; width: 14px; }
      .rung {
        height: 3px; border-radius: 1px; background: #2c313a;
        transition: background 120ms linear;
      }
      .rung.on { background: #ff8a3d; }
      .meta { display: grid; gap: 3px; }
      .title { letter-spacing: -0.01em; }
      .count {
        font: 500 10px/1 ui-monospace, "SF Mono", Consolas, monospace;
        letter-spacing: .12em; text-transform: uppercase; color: #6f7681;
      }
      button {
        font: 500 11px/1 ui-sans-serif, -apple-system, "Segoe UI", Roboto, sans-serif;
        color: #a3a9b4; background: #23272f; border: 1px solid #2c313a;
        border-radius: 6px; padding: 6px 9px; cursor: pointer;
      }
      button:hover { color: #e8eaed; border-color: #6f7681; }
    `);
    root.adoptedStyleSheets = [sheet];

    const rungs = Math.min(total, 18);
    root.innerHTML = `
      <div class="card">
        <div class="ladder">${'<i class="rung"></i>'.repeat(rungs)}</div>
        <div class="meta">
          <div class="title">Capturing page</div>
          <div class="count">tile 0 / ${total}</div>
        </div>
        <button type="button">Cancel</button>
      </div>`;
    root.querySelector("button").addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ t: "longshot:cancel" });
      } catch {}
      root.querySelector(".title").textContent = "Stopping…";
    });

    document.documentElement.appendChild(host);
    host.__update = (done) => {
      const list = root.querySelectorAll(".rung");
      const lit = Math.round((done / total) * list.length);
      list.forEach((r, i) => r.classList.toggle("on", i < lit));
      root.querySelector(".count").textContent = `tile ${done} / ${total}`;
    };
    return host;
  }

  function overlayVisible(on) {
    if (state.overlay) state.overlay.style.setProperty("display", on ? "block" : "none", "important");
  }

  /* ------------------------------------------------------------------ steps */

  async function prepare(opts) {
    state.active = true;
    state.touched.length = 0;
    state.scroller = opts.mode === "visible" ? null : pickScroller();
    state.origin = getScroll();

    let css = "html, body { scroll-behavior: auto !important; }";
    if (opts.freezeMotion) {
      css +=
        "*, *::before, *::after { animation-play-state: paused !important;" +
        " transition: none !important; }";
    }
    state.styleTag = injectStyle(css);

    const dpr = window.devicePixelRatio || 1;
    let vb = viewBox();
    if (vb.w < MIN_STEP || vb.h < MIN_STEP) {
      return { ok: false, error: "This page has no visible area to capture." };
    }

    if (opts.mode === "visible") {
      return {
        ok: true,
        dpr,
        viewportW: window.innerWidth,
        full: { w: vb.w, h: vb.h },
        positions: [{ x: 0, y: 0 }],
        scroller: "viewport",
        truncated: false,
      };
    }

    if (opts.preScroll) await preScrollPass(vb);

    const size = contentSize();
    let fullW = Math.max(size.w, vb.w);
    let fullH = Math.max(size.h, vb.h);
    let truncated = false;

    // Canvas has hard limits; stop short rather than hand back a blank image.
    const limit = Math.max(1, opts.maxPixels || 260000000);
    if (fullW * fullH * dpr * dpr > limit) {
      fullH = Math.floor(limit / (dpr * dpr) / fullW);
      truncated = true;
    }
    const MAX_DIM = 32000;
    if (fullW * dpr > MAX_DIM) {
      fullW = Math.floor(MAX_DIM / dpr);
      truncated = true;
    }
    if (fullH * dpr > MAX_DIM) {
      fullH = Math.floor(MAX_DIM / dpr);
      truncated = true;
    }

    const positions = [];
    for (let y = 0; y < fullH; y += vb.h) {
      for (let x = 0; x < fullW; x += vb.w) {
        positions.push({ x: Math.min(x, Math.max(0, fullW - vb.w)), y: Math.min(y, Math.max(0, fullH - vb.h)) });
      }
      if (positions.length > 400) {
        truncated = true;
        break;
      }
    }

    setScroll(0, 0);
    await raf();
    await sleep(Math.max(60, opts.settleMs));

    if (opts.showOverlay) state.overlay = buildOverlay(positions.length);

    return {
      ok: true,
      dpr,
      viewportW: window.innerWidth,
      full: { w: fullW, h: fullH },
      positions,
      scroller: state.scroller ? "element" : "viewport",
      truncated,
    };
  }

  /** One fast pass down the page so lazy images and scroll-triggered content
   *  have already rendered by the time we start taking bitmaps. */
  async function preScrollPass(vb) {
    const size = contentSize();
    const stops = Math.min(60, Math.ceil(size.h / vb.h));
    for (let i = 0; i <= stops; i++) {
      setScroll(0, i * vb.h);
      await raf();
      await sleep(40);
    }
    setScroll(0, 0);
    await raf();
    await sleep(120);
  }

  async function step(index, opts) {
    const p = state.plan[index];
    overlayVisible(true);
    setScroll(p.x, p.y);
    await raf();
    await sleep(opts.settleMs);
    await raf();

    if (opts.hideFixed && index === 1) calmFurniture();

    // The progress card must not end up in the shot: light it up, then blank it
    // for the one frame the bitmap is taken on.
    if (state.overlay) {
      state.overlay.__update(index + 1);
      await raf();
      overlayVisible(false);
      await raf();
    }

    const at = getScroll();
    const vb = viewBox();
    return {
      ok: true,
      src: { x: vb.x, y: vb.y, w: vb.w, h: vb.h },
      dest: { x: at.x + vb.padX, y: at.y + vb.padY },
    };
  }

  function finish() {
    restoreTouched();
    if (state.styleTag) state.styleTag.remove();
    if (state.overlay) state.overlay.remove();
    setScroll(state.origin.x, state.origin.y);
    state.styleTag = null;
    state.overlay = null;
    state.plan = null;
    state.active = false;
    return { ok: true };
  }

  /* ---------------------------------------------------------------- wiring */

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || typeof msg.t !== "string" || !msg.t.startsWith("longshot:")) return;

    const run = async () => {
      switch (msg.t) {
        case "longshot:ping":
          return { ok: true, version: 1 };
        case "longshot:prepare": {
          const plan = await prepare(msg.opts);
          if (plan.ok) state.plan = plan.positions;
          return plan;
        }
        case "longshot:step":
          if (!state.plan) return { ok: false, error: "Capture was interrupted." };
          return await step(msg.index, msg.opts);
        case "longshot:shown":
          overlayVisible(true);
          return { ok: true };
        case "longshot:finish":
          return finish();
        default:
          return { ok: false, error: "Unknown message." };
      }
    };

    run().then(sendResponse, (err) => {
      try {
        finish();
      } catch {}
      sendResponse({ ok: false, error: String((err && err.message) || err) });
    });
    return true;
  });

  window.addEventListener("pagehide", () => {
    if (state.active) finish();
  });

  window.__longshotAgent = true;
})();
