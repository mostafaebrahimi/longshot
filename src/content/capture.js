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
    range: null, // scroll offsets that can actually be reached
    frame: null, // page furniture around the panel, or null when there is none
    contentH: 0, // height of the panel's content, without the frame
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

  /** Wait for a scroll to land. Pages that animate their own scrolling — a
   *  script doing the easing, so `scroll-behavior: auto` does not stop it — are
   *  still moving a frame later, and a bitmap taken then repeats a strip of the
   *  page or skips one. */
  async function settleScroll(budgetMs) {
    let last = getScroll();
    let stable = 0;
    for (let waited = 0; waited < budgetMs; waited += 16) {
      await raf();
      const now = getScroll();
      if (Math.abs(now.x - last.x) < 0.5 && Math.abs(now.y - last.y) < 0.5) {
        if (++stable >= 2) break;
      } else {
        stable = 0;
      }
      last = now;
    }
    return last;
  }

  function contentSize() {
    const el = state.scroller;
    if (el) return { w: el.scrollWidth, h: el.scrollHeight };
    return docSize();
  }

  /**
   * The range of scroll offsets to plan tiles across.
   *
   * The box model sets the size of it. A probe runs too, because a right-to-left
   * container counts from a negative scrollLeft up to zero and nothing else says
   * so, and because a container can occasionally scroll further than
   * scrollHeight implies — but the probe may only ever widen the range. Read
   * back too early it reports no room at all (a panel scrolling smoothly answers
   * with where it still is, not where it is heading), and a capture that trusted
   * that would come back as a single screen.
   */
  function measureRange() {
    const el = state.scroller;
    const size = contentSize();
    const spanX = Math.max(
      0,
      el ? el.scrollWidth - el.clientWidth : size.w - document.documentElement.clientWidth
    );
    const spanY = Math.max(
      0,
      el ? el.scrollHeight - el.clientHeight : size.h - document.documentElement.clientHeight
    );

    const at = getScroll();
    setScroll(-1e7, -1e7);
    const min = getScroll();
    setScroll(1e7, 1e7);
    const max = getScroll();
    setScroll(at.x, at.y);

    const target = el || document.documentElement;
    const rtl =
      min.x < -1 || max.x < -1 || getComputedStyle(target).direction === "rtl";
    const reachX = Math.max(spanX, Math.abs(max.x - min.x));
    return {
      minX: rtl ? -reachX : 0,
      maxX: rtl ? 0 : reachX,
      minY: 0, // vertical scrolling always counts up from zero
      maxY: Math.max(spanY, max.y, min.y),
    };
  }

  /** Viewport-space origin of an element's padding box. `clientLeft` covers the
   *  border and, in a right-to-left panel, the scrollbar gutter on the left. */
  function clientOrigin(el) {
    const r = el.getBoundingClientRect();
    return { x: r.left + el.clientLeft, y: r.top + el.clientTop };
  }

  /**
   * The rectangle of the page (CSS px, viewport coordinates) that is worth
   * keeping from the next bitmap, plus how far that rectangle sits into the
   * scrolled content.
   */
  function viewBox() {
    const sb = scrollbars();
    const vw = Math.max(0, window.innerWidth - sb.w);
    const vh = Math.max(0, window.innerHeight - sb.h);
    const el = state.scroller;
    if (!el) return { x: 0, y: 0, w: vw, h: vh, padX: 0, padY: 0 };

    const o = clientOrigin(el);
    const vx0 = Math.max(0, o.x);
    const vy0 = Math.max(0, o.y);
    const vx1 = Math.min(vw, o.x + el.clientWidth);
    const vy1 = Math.min(vh, o.y + el.clientHeight);
    return {
      x: vx0,
      y: vy0,
      w: Math.max(0, vx1 - vx0),
      h: Math.max(0, vy1 - vy0),
      padX: vx0 - o.x,
      padY: vy0 - o.y,
    };
  }

  /**
   * A panel whose box runs past the bottom of the window can never scroll its
   * last rows into view: the browser stops at scrollHeight - clientHeight, and
   * the slice below that line is not reachable at any scroll offset. Shrink the
   * panel to the part that is on screen so the whole of it becomes reachable.
   * Reverted with everything else in finish().
   */
  function fitScroller() {
    const el = state.scroller;
    if (!el) return;
    const onScreen = () => {
      const vh = Math.max(0, window.innerHeight - scrollbars().h);
      const o = clientOrigin(el);
      return Math.min(vh, o.y + el.clientHeight) - Math.max(0, o.y);
    };
    const visible = onScreen();
    if (visible < MIN_STEP || el.clientHeight - visible <= 1) return;

    // How much of the panel a capture can photograph as it stands: one screen,
    // plus however far it will scroll.
    const before = visible + Math.max(0, el.scrollHeight - el.clientHeight);
    const mark = state.touched.length;

    const cs = getComputedStyle(el);
    const borders =
      (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0);
    const box = Math.round(visible + borders);
    pin(el, "box-sizing", "border-box");
    pin(el, "min-height", "0");
    pin(el, "max-height", `${box}px`);
    pin(el, "height", `${box}px`);

    // Some layouts size their contents off the panel, so shrinking it shrinks
    // what there is to capture. Put it back if that happened.
    const after = onScreen() + Math.max(0, el.scrollHeight - el.clientHeight);
    if (after < before - 2) restoreTouched(mark);
  }

  /** Offsets into a scroll range whose tiles together cover the content up to
   *  `limit`, given a tile of `step` starting `pad` into the content. */
  function stops(span, step, pad, limit) {
    const out = [0];
    for (let d = step; d <= span && pad + out[out.length - 1] + step < limit; d += step) {
      out.push(d);
    }
    const last = Math.min(span, Math.max(0, limit - pad - step));
    if (last > out[out.length - 1]) out.push(last);
    return out;
  }

  /* ------------------------------------------------------------- page tweaks */

  function pin(el, prop, value) {
    state.touched.push([el, prop, el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)]);
    el.style.setProperty(prop, value, "important");
  }

  /** Undo pins back to `mark` (everything, by default). Backwards, because an
   *  element can be pinned more than once — a fixed bar hidden on the first tile
   *  is visited again on the second — and only the oldest entry holds the value
   *  the page actually started with. */
  function restoreTouched(mark = 0) {
    while (state.touched.length > mark) {
      const [el, prop, prev, prio] = state.touched.pop();
      if (prev) el.style.setProperty(prop, prev, prio);
      else el.style.removeProperty(prop);
    }
  }

  function injectStyle(css) {
    const tag = document.createElement("style");
    tag.textContent = css;
    (document.head || document.documentElement).appendChild(tag);
    return tag;
  }

  /** Sticky bars are put back in the flow; fixed furniture is hidden. Both are
   *  reverted in finish(), including if the capture is cancelled.
   *
   *  The first tile keeps whatever is anchored to the top of the window — that
   *  is the page header, and a screenshot missing it looks wrong — but bars
   *  anchored to the bottom go even there, or they end up printed across the
   *  middle of the finished image. The panel being scrolled is never touched:
   *  in a lot of app shells it is itself positioned fixed, and hiding it would
   *  blank every tile after the first. */
  function calmFurniture(first) {
    const keep = state.scroller;
    const els = document.body ? document.body.querySelectorAll("*") : [];
    for (const el of els) {
      if (el === state.overlay) continue;
      if (keep && (el === keep || el.contains(keep))) continue;
      const pos = getComputedStyle(el).position;
      if (pos === "fixed") {
        if (el.offsetWidth === 0 && el.offsetHeight === 0) continue;
        if (first && !dropsFromFirstScreen(el)) continue;
        pin(el, "visibility", "hidden");
      } else if (pos === "sticky" && !first) {
        pin(el, "position", "static");
      }
    }
  }

  /** What goes even from the first screen: furniture anchored to the bottom of
   *  the window — a cookie bar, a chat bubble — which would otherwise be stamped
   *  across the middle of the image. When the frame is being kept, only the ones
   *  lying over the panel qualify; the rest of what is down there is the page's
   *  own footer, and the first screen is where it is collected from. */
  function dropsFromFirstScreen(el) {
    const r = el.getBoundingClientRect();
    if (r.top <= (window.innerHeight || 1) * 0.5) return false;
    const p = state.frame && state.frame.panel;
    if (!p) return true;
    return r.left < p.x + p.w && r.right > p.x && r.top < p.y + p.h && r.bottom > p.y;
  }

  /* ------------------------------------------------------------------ words */

  /** This file is injected as a classic script and cannot read the message
   *  catalogues, so the service worker sends the few words it shows along with
   *  the options. English is the fallback if a capture predates them. */
  const FALLBACK = {
    title: "Capturing page",
    cancel: "Cancel",
    stopping: "Stopping…",
    tile: "tile {done} / {total}",
    noVisibleArea: "This page has no visible area to capture.",
    interrupted: "Capture was interrupted.",
    unknownMessage: "Unknown message.",
  };

  const words = (opts) => ({ ...FALLBACK, ...((opts && opts.strings) || {}) });

  const tileLabel = (strings, done, total) =>
    strings.tile.replace("{done}", done).replace("{total}", total);

  /* ---------------------------------------------------------------- overlay */

  function buildOverlay(total, strings) {
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
          <div class="title"></div>
          <div class="count"></div>
        </div>
        <button type="button"></button>
      </div>`;
    root.querySelector(".title").textContent = strings.title;
    root.querySelector("button").textContent = strings.cancel;
    root.querySelector(".count").textContent = tileLabel(strings, 0, total);
    root.querySelector("button").addEventListener("click", () => {
      try {
        chrome.runtime.sendMessage({ t: "longshot:cancel" });
      } catch {}
      root.querySelector(".title").textContent = strings.stopping;
    });

    document.documentElement.appendChild(host);
    host.__update = (done) => {
      const list = root.querySelectorAll(".rung");
      const lit = Math.round((done / total) * list.length);
      list.forEach((r, i) => r.classList.toggle("on", i < lit));
      root.querySelector(".count").textContent = tileLabel(strings, done, total);
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
    state.frame = null;
    state.contentH = 0;
    state.scroller = opts.mode === "visible" ? null : pickScroller();
    state.origin = getScroll();

    // Every element, not just the document: an app shell that scrolls its main
    // panel smoothly answers scrollTop reads with where it still is rather than
    // where it was sent, and the capture plans around a page that looks like it
    // cannot scroll at all.
    // Scrollbars are furniture too, and a panel's one would otherwise be printed
    // down the side of the first screen and nowhere else. Hiding them widens the
    // content slightly, so this goes in before anything is measured.
    let css =
      "*, html, body { scroll-behavior: auto !important; scrollbar-width: none !important; }" +
      "::-webkit-scrollbar { width: 0 !important; height: 0 !important; }";
    if (opts.freezeMotion) {
      css +=
        "*, *::before, *::after { animation-play-state: paused !important;" +
        " transition: none !important; }";
    }
    state.styleTag = injectStyle(css);

    const dpr = window.devicePixelRatio || 1;
    if (opts.mode !== "visible") fitScroller();
    const vb = viewBox();
    if (vb.w < MIN_STEP || vb.h < MIN_STEP) {
      return { ok: false, error: words(opts).noVisibleArea };
    }

    if (opts.mode === "visible") {
      // Whatever is on screen right now — do not scroll anywhere first.
      state.range = { minX: state.origin.x, maxX: state.origin.x, minY: state.origin.y, maxY: state.origin.y };
      return {
        ok: true,
        dpr,
        viewportW: window.innerWidth,
        full: { w: vb.w, h: vb.h },
        positions: [{ x: state.origin.x, y: state.origin.y }],
        scroller: "viewport",
        truncated: false,
      };
    }

    if (opts.preScroll) await preScrollPass(vb);

    const size = contentSize();
    const range = measureRange();
    state.range = range;
    const spanX = Math.max(0, range.maxX - range.minX);
    const spanY = Math.max(0, range.maxY - range.minY);

    // Only claim canvas for content the browser will let us bring on screen.
    // Reserving the rest is how a capture ends up with a white band down the
    // bottom of the image.
    let fullW = Math.min(Math.max(size.w, vb.w), spanX + vb.w + vb.padX);
    let fullH = Math.min(Math.max(size.h, vb.h), spanY + vb.h + vb.padY);
    // 2px of slack: max scroll offsets come back fractional under page zoom.
    let truncated = fullW < size.w - 2 || fullH < size.h - 2;

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

    // Step slightly less than a screen so consecutive tiles overlap. A browser
    // parks the scroll on whole device pixels, so at a display scale of 125% or
    // 150% a step of exactly one screen can land a fraction of a pixel short and
    // leave an unpainted thread across the image. The overlap costs nothing: the
    // later tile paints over it with the same content.
    const stepY = Math.max(MIN_STEP, Math.floor(vb.h) - 1);
    const stepX = Math.max(MIN_STEP, Math.floor(vb.w) - 1);

    const positions = [];
    outer: for (const dy of stops(spanY, stepY, vb.padY, fullH)) {
      for (const dx of stops(spanX, stepX, vb.padX, fullW)) {
        positions.push({ x: range.minX + dx, y: range.minY + dy });
        if (positions.length >= 400) {
          truncated = true;
          break outer;
        }
      }
    }

    // Around a panel sits the rest of the app — the header above it, the sidebar
    // beside it, the status bar below. Capture that once and give the stitched
    // image the shape of the page instead of the shape of the panel.
    // Is part of the panel off the side of the window? Scrolling moves content
    // inside the box, never the box itself, so anything hanging past the edge
    // cannot be photographed at all. It is what a page looks like when it has
    // been squeezed below the width it was built for, and the caller may prefer
    // not to capture it in that state.
    const panel = state.scroller;
    const clipped =
      !!panel && (panel.clientWidth - vb.w > 8 || panel.clientHeight - vb.h > 8);

    state.contentH = fullH;
    state.frame = opts.pageFrame ? pageFrame(vb, fullH) : null;
    const full = state.frame
      ? { w: state.frame.view.w, h: state.frame.top + fullH + state.frame.bottom }
      : { w: fullW, h: fullH };

    setScroll(range.minX, range.minY);
    await settleScroll(700);
    await sleep(Math.max(60, opts.settleMs));

    if (opts.showOverlay) state.overlay = buildOverlay(positions.length, words(opts));

    return {
      ok: true,
      dpr,
      viewportW: window.innerWidth,
      full,
      frame: state.frame,
      clipped,
      positions,
      scroller: state.scroller ? "element" : "viewport",
      truncated,
    };
  }

  /**
   * The page furniture surrounding the panel, in viewport coordinates. Null when
   * there is nothing around it worth keeping — a panel that fills the window, or
   * a page that scrolls normally, where the capture is already the whole page.
   */
  function pageFrame(vb, contentH) {
    if (!state.scroller) return null;
    const sb = scrollbars();
    const view = {
      w: Math.max(0, window.innerWidth - sb.w),
      h: Math.max(0, window.innerHeight - sb.h),
    };
    const panel = { x: vb.x, y: vb.y, w: vb.w, h: vb.h };
    const frame = {
      view,
      panel,
      top: panel.y,
      bottom: Math.max(0, view.h - (panel.y + panel.h)),
      left: panel.x,
      right: Math.max(0, view.w - (panel.x + panel.w)),
    };
    const bare = frame.top < 2 && frame.bottom < 2 && frame.left < 2 && frame.right < 2;
    if (bare || contentH <= 0) return null;
    return frame;
  }

  /** One fast pass down the page so lazy images and scroll-triggered content
   *  have already rendered by the time we start taking bitmaps. */
  async function preScrollPass(vb) {
    const range = measureRange();
    const span = Math.max(0, range.maxY - range.minY);
    const passes = Math.min(60, Math.ceil(span / vb.h) + 1);
    for (let i = 0; i <= passes; i++) {
      setScroll(range.minX, range.minY + Math.min(span, i * vb.h));
      await settleScroll(300);
      await sleep(40);
    }
    setScroll(range.minX, range.minY);
    await settleScroll(700);
    await sleep(120);
  }

  async function step(index, opts) {
    const p = state.plan[index];
    overlayVisible(true);
    setScroll(p.x, p.y);
    await settleScroll(700);
    await sleep(opts.settleMs);
    await raf();

    if (opts.hideFixed && index <= 1) calmFurniture(index === 0);

    // The progress card must not end up in the shot: light it up, then blank it
    // for the one frame the bitmap is taken on.
    if (state.overlay) {
      state.overlay.__update(index + 1);
      await raf();
      overlayVisible(false);
      await raf();
    }

    // Where this bitmap belongs in the stitched image: how far the panel has
    // travelled from the start of its scroll range, not its raw scroll offset,
    // which is negative in a right-to-left container.
    const at = getScroll();
    const vb = viewBox();
    const origin = state.range || { minX: 0, minY: 0 };
    const frame = state.frame;
    const offset = {
      x: at.x - origin.minX + vb.padX,
      y: at.y - origin.minY + vb.padY,
    };

    if (!frame) {
      return {
        ok: true,
        parts: [{ src: { x: vb.x, y: vb.y, w: vb.w, h: vb.h }, dest: offset }],
      };
    }

    const parts = [
      {
        src: { x: vb.x, y: vb.y, w: vb.w, h: vb.h },
        dest: { x: frame.panel.x + offset.x, y: frame.top + offset.y },
      },
    ];
    if (index === 0) {
      // The first screen down to the foot of the panel — header, sidebar and
      // all — at the top of the image.
      parts.unshift({
        src: { x: 0, y: 0, w: frame.view.w, h: frame.panel.y + frame.panel.h },
        dest: { x: 0, y: 0 },
      });
      // …and its strip below the panel — a status bar, a footer — at the foot of
      // the image, where the page would put it.
      if (frame.bottom >= 1) {
        parts.push({
          src: { x: 0, y: frame.panel.y + frame.panel.h, w: frame.view.w, h: frame.bottom },
          dest: { x: 0, y: frame.top + state.contentH },
        });
      }
    }
    return { ok: true, parts };
  }

  function finish() {
    restoreTouched();
    if (state.styleTag) state.styleTag.remove();
    if (state.overlay) state.overlay.remove();
    setScroll(state.origin.x, state.origin.y);
    state.styleTag = null;
    state.overlay = null;
    state.plan = null;
    state.range = null;
    state.frame = null;
    state.contentH = 0;
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
          if (!state.plan) return { ok: false, error: words(msg.opts).interrupted };
          return await step(msg.index, msg.opts);
        case "longshot:shown":
          overlayVisible(true);
          return { ok: true };
        case "longshot:finish":
          return finish();
        default:
          return { ok: false, error: words(msg && msg.opts).unknownMessage };
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
