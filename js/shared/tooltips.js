// tooltips.js
// Lightweight, delay-based tooltip engine.
// Uses event delegation — no per-element setup required.
// Reads text from [data-tooltip] (override) or the native [title] attribute.
// Suppresses the browser's built-in tooltip while the custom one is in use.

const DELAY_MS = 1000;
const SELECTOR = 'button[title], a[title], input[type="checkbox"][title], [data-tooltip]';
const GAP = 12;

let tooltipEl = null;
let showTimer = null;
let mouseX = 0;
let mouseY = 0;

function getTooltipText(el) {
  return el.dataset.tooltip || el.dataset.ttSaved || el.title || '';
}

function ensureElement() {
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'app-tooltip';
    document.body.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function position(tip) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // Reset so layout is clean before measuring
  tip.style.left = '0px';
  tip.style.top = '0px';
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;
  let x = mouseX + GAP;
  let y = mouseY + GAP;
  if (x + tw > vw - 8) x = mouseX - tw - GAP;
  if (y + th > vh - 8) y = mouseY - th - GAP;
  tip.style.left = x + 'px';
  tip.style.top = y + 'px';
}

function show(text) {
  const tip = ensureElement();
  tip.textContent = text;
  position(tip);
  tip.classList.add('app-tooltip--visible');
}

function hide() {
  tooltipEl?.classList.remove('app-tooltip--visible');
}

function cancelTimer() {
  clearTimeout(showTimer);
  showTimer = null;
}

export function initTooltips() {
  // Guard against double init
  if (tooltipEl) return;
  ensureElement();

  document.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;
    // Keep tip tracking the cursor while visible
    if (tooltipEl?.classList.contains('app-tooltip--visible')) {
      position(tooltipEl);
    }
  });

  document.addEventListener('mouseover', (e) => {
    const target = e.target.closest(SELECTOR);
    if (!target) return;

    const text = getTooltipText(target);
    if (!text) return;

    // Suppress the native browser tooltip while ours is pending/visible
    if (target.title) {
      target.dataset.ttSaved = target.title;
      target.title = '';
    }

    cancelTimer();
    showTimer = setTimeout(() => show(text), DELAY_MS);

    const cleanup = () => {
      cancelTimer();
      hide();
      // Restore the native title so it survives future hovers
      if (target.dataset.ttSaved) {
        target.title = target.dataset.ttSaved;
        delete target.dataset.ttSaved;
      }
      target.removeEventListener('mouseleave', cleanup);
      target.removeEventListener('mousedown', cleanup);
    };

    target.addEventListener('mouseleave', cleanup);
    target.addEventListener('mousedown', cleanup);
  });

  // Hide on scroll (e.g. inside grid containers)
  document.addEventListener('scroll', () => {
    cancelTimer();
    hide();
  }, { capture: true, passive: true });
}
