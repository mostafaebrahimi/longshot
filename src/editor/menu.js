/**
 * The editor's own context menu.
 *
 * Chrome's menu over the canvas offers "Save image as…" and "Inspect": it is
 * talking about a picture inside a web page. In here the canvas is the document
 * being worked on, so the menu has to talk about that instead — copy and save
 * the screenshot over the image, and the handful of things that can be done to
 * a mark when the click lands on one.
 *
 * The items are ordinary buttons in a list, so screen readers announce them as
 * a menu and the disabled ones say so. While the menu is up it takes every key
 * event on the way down: nothing behind it should act on a keystroke aimed at
 * the menu, including the editor's single-letter tool shortcuts.
 */

const EDGE = 8;

let root = null;
let live = null; // { buttons, restore } while the menu is open

/**
 * Open at the viewport point (x, y).
 *
 * `sections` is an array of `{ header?, items }`, and an item is
 * `{ label, key?, icon?, danger?, disabled?, run }`. Falsy items and empty
 * sections are dropped, so a caller can write `condition && { ... }` inline and
 * never think about the dividers.
 */
export function openMenu(x, y, sections) {
  closeMenu();
  const box = mount();
  box.replaceChildren();

  const buttons = [];
  for (const section of sections) {
    const items = (section.items || []).filter(Boolean);
    if (!items.length) continue;
    if (box.childElementCount) box.appendChild(el("div", "menu-rule"));
    if (section.header) {
      const head = el("div", "menu-head eyebrow");
      head.textContent = section.header;
      box.appendChild(head);
    }
    for (const item of items) buttons.push(box.appendChild(entry(item)));
  }
  if (!buttons.length) return;

  box.hidden = false;
  place(x, y);
  box.classList.add("on");
  box.focus({ preventScroll: true });

  live = { buttons, restore: document.activeElement };
  document.addEventListener("pointerdown", onPointerDown, true);
  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("wheel", closeMenu, { capture: true, passive: true });
  window.addEventListener("blur", closeMenu);
  window.addEventListener("resize", closeMenu);
}

function closeMenu() {
  if (!live) return;
  const { restore } = live;
  live = null;
  root.classList.remove("on");
  root.hidden = true;
  document.removeEventListener("pointerdown", onPointerDown, true);
  document.removeEventListener("keydown", onKeyDown, true);
  document.removeEventListener("wheel", closeMenu, { capture: true });
  window.removeEventListener("blur", closeMenu);
  window.removeEventListener("resize", closeMenu);
  // Put the keyboard back where it was, unless the action that closed the menu
  // has already claimed it (the text tool opens its input, for one).
  if (restore?.isConnected && restore !== document.body && document.activeElement === document.body) {
    restore.focus();
  }
}

/* ------------------------------------------------------------------ pieces */

function mount() {
  if (root) return root;
  root = el("div", "menu");
  root.id = "menu";
  root.setAttribute("role", "menu");
  root.tabIndex = -1;
  root.hidden = true;
  root.addEventListener("contextmenu", (e) => e.preventDefault());
  document.body.appendChild(root);
  return root;
}

function el(tag, className) {
  const node = document.createElement(tag);
  node.className = className;
  return node;
}

function entry(item) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = item.danger ? "menu-item danger" : "menu-item";
  b.setAttribute("role", "menuitem");
  b.tabIndex = -1;
  if (item.disabled) b.disabled = true;

  // The icons are string constants from this extension, never page content.
  const icon = el("span", "menu-icon");
  icon.setAttribute("aria-hidden", "true");
  icon.innerHTML = item.icon || "";
  const label = el("span", "menu-label");
  label.textContent = item.label;
  b.append(icon, label);

  if (item.key) {
    const kbd = document.createElement("kbd");
    kbd.textContent = item.key;
    b.appendChild(kbd);
  }
  // Close first: an action may want the focus, or may open a dialog of its own.
  b.addEventListener("click", () => {
    closeMenu();
    item.run();
  });
  b.addEventListener("pointerenter", () => b.focus({ preventScroll: true }));
  return b;
}

/**
 * Below and after the cursor, the way every desktop menu opens — flipped back
 * over it when there is no room, and pinned inside the window either way. The
 * leading edge follows the interface direction, so in Arabic or Hebrew the menu
 * unfolds to the left of the pointer.
 */
function place(x, y) {
  root.style.left = "0px";
  root.style.top = "0px";
  // The layout box, not the painted one: the card is mid-way through its
  // opening scale here, and a rect measured through that transform puts the
  // bottom of a corner menu off the edge of the window.
  const w = root.offsetWidth;
  const h = root.offsetHeight;
  const rtl = getComputedStyle(document.documentElement).direction === "rtl";
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  let left = rtl ? x - w : x;
  if (left + w > vw - EDGE) left = x - w;
  if (left < EDGE) left = x;
  const top = y + h > vh - EDGE ? y - h : y;

  root.style.left = `${Math.round(clamp(left, EDGE, Math.max(EDGE, vw - w - EDGE)))}px`;
  root.style.top = `${Math.round(clamp(top, EDGE, Math.max(EDGE, vh - h - EDGE)))}px`;
}

function clamp(n, lo, hi) {
  return Math.min(hi, Math.max(lo, n));
}

/* ------------------------------------------------------------------ events */

function onPointerDown(e) {
  if (root.contains(e.target)) return;
  // Swallow the dismissing click: it is putting the menu away, not drawing.
  e.preventDefault();
  e.stopPropagation();
  closeMenu();
}

function onKeyDown(e) {
  if (!live) return;
  e.stopPropagation();
  const open = live.buttons.filter((b) => !b.disabled);

  switch (e.key) {
    case "Escape":
      e.preventDefault();
      closeMenu();
      return;
    case "Tab":
      closeMenu();
      return;
    case "ArrowDown":
    case "ArrowUp": {
      e.preventDefault();
      if (!open.length) return;
      const step = e.key === "ArrowDown" ? 1 : -1;
      const at = open.indexOf(document.activeElement);
      const next = at < 0 ? (step > 0 ? 0 : open.length - 1) : (at + step + open.length) % open.length;
      open[next].focus();
      return;
    }
    case "Home":
    case "End":
      e.preventDefault();
      open[e.key === "Home" ? 0 : open.length - 1]?.focus();
      return;
    case "Enter":
    case " ": {
      // Nothing reaches the button itself while the menu swallows keys, so the
      // press has to be turned into a click here.
      e.preventDefault();
      const target = document.activeElement;
      if (live.buttons.includes(target) && !target.disabled) target.click();
    }
  }
}
