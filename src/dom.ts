/**
 * Framework-free DOM card for a SponsoredAd. Built with textContent only (no
 * innerHTML: ad text is advertiser-supplied), clearly labelled "Sponsored", and
 * the impression fires only once the card is genuinely viewable (≥50% on screen,
 * tab visible + focused, for `dwellMs`) — the same MRC rule as the web SDK.
 */
import type { SponsoredAd } from './index.js';

export interface MountOptions {
  /** Continuous viewable time before the impression fires (default 1000ms). */
  dwellMs?: number;
  /** Class on the root element (default "adviverse-sponsored"). Style it yourself. */
  className?: string;
}

/** Render `ad` into `el` (replacing its children). Returns a disposer. */
export function mountSponsored(el: HTMLElement, ad: SponsoredAd, opts: MountOptions = {}): () => void {
  const cls = opts.className || 'adviverse-sponsored';
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, c: string, text?: string) => {
    const n = document.createElement(tag);
    n.className = `${cls}__${c}`;
    if (text) n.textContent = text;
    return n;
  };
  const link = (c: string, text: string) => {
    const a = make('a', c, text);
    a.href = ad.url;
    a.target = '_blank';
    a.rel = 'sponsored noopener noreferrer';
    return a;
  };

  const root = document.createElement('aside');
  root.className = cls;
  root.setAttribute('aria-label', `${ad.label}: ${ad.sponsor}`);
  root.append(make('div', 'label', `${ad.label} · ${ad.sponsor}`), link('title', ad.title));
  if (ad.body) root.append(make('p', 'body', ad.body));
  root.append(link('cta', ad.cta));
  el.replaceChildren(root);

  const dwell = opts.dwellMs ?? 1000;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;
  const visible = () => document.visibilityState === 'visible' && (typeof document.hasFocus !== 'function' || document.hasFocus());
  const stop = () => { if (timer) { clearTimeout(timer); timer = null; } };
  const dispose = () => { done = true; stop(); io.disconnect(); window.removeEventListener('blur', stop); };
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && e.intersectionRatio >= 0.5 && visible()) {
        if (!done && !timer) timer = setTimeout(() => { timer = null; if (!done && visible()) { ad.trackImpression(); dispose(); } }, dwell);
      } else stop();
    }
  }, { threshold: [0, 0.5, 1] });
  io.observe(root);
  window.addEventListener('blur', stop);
  return () => { dispose(); root.remove(); };
}
