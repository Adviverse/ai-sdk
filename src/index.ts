/**
 * @adviverse/ai — sponsored suggestions for AI chat apps (web or Node).
 *
 *   import { sponsored, renderMarkdown, mountSponsored } from '@adviverse/ai';
 *   const ad = await sponsored({ token: 'tk_…', messages: history.slice(-6) });
 *
 * Serving reuses the engine's native JSON path (GET /ad on an "AI chat" native
 * placement). The request carries only extracted keywords (`kw`) + the page
 * origin (`page`), which the engine matches against campaigns' contextual
 * keyword targeting. Billing is on view: nothing is charged until
 * `ad.trackImpression()` fires the single-use impression beacon.
 */
import { extractKeywords, type ChatMessage } from './keywords.js';

export { extractKeywords } from './keywords.js';
export type { ChatMessage, KeywordOptions } from './keywords.js';
export { mountSponsored } from './dom.js';
export type { MountOptions } from './dom.js';

export const VERSION = '0.1.0';
const DEFAULT_BASE = 'https://serve.adviverse.com';

export interface SponsoredOptions {
  /** Tag key of an "AI chat" placement (Publisher → Placements). Required. */
  token: string;
  /** Recent chat turns. Only keywords extracted on-device are sent, never the text. */
  messages?: ReadonlyArray<ChatMessage | string>;
  /** Use these keywords instead of extracting them from `messages`. */
  keywords?: string[];
  /** Your label for where the ad shows (e.g. "after-answer"); reported as sub1. */
  slot?: string;
  /** Page context. Default: the page origin in a browser (no path/query), none in Node. */
  page?: string;
  /**
   * Ads consent. `ac`: '1' personalized, '0' contextual only (default), 'n' none —
   * with 'n' no request is made. gdpr/usPrivacy are passed through to serving.
   */
  consent?: { ac?: '1' | '0' | 'n'; gdpr?: string; usPrivacy?: string };
  /** Stable user id; only sent when consent.ac === '1'. */
  uid?: string;
  /** Override the serve base (default https://serve.adviverse.com). */
  base?: string;
  /** Fetch timeout (default 1500ms). */
  timeoutMs?: number;
  /** Client label (default "web" in a browser, "node" elsewhere). */
  client?: string;
}

export interface SponsoredAd {
  id: string;
  title: string;
  body: string;
  cta: string;
  /** Advertiser / brand shown as "Sponsored · <sponsor>". */
  sponsor: string;
  /** Always "Sponsored" — show it with the ad. */
  label: 'Sponsored';
  /** Tracked click URL (redirects to the landing page). Use as the link href. */
  url: string;
  imageUrl?: string;
  iconUrl?: string;
  /** Report-this-ad URL for a disclosure menu. */
  reportUrl: string;
  /** Keywords the request was made with (for your own debugging). */
  keywords: string[];
  /** Fire the impression once the ad is actually on screen. Idempotent. Bills the advertiser. */
  trackImpression(): void;
}

interface EngineResponse {
  request_id?: string;
  format?: string;
  imp_url?: string;
  click_url?: string;
  report_url?: string;
  creative?: Record<string, unknown>;
}

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const isBrowser = () => typeof window !== 'undefined' && typeof document !== 'undefined';

/** Build the /ad request URL (exported for tests / custom transports). */
export function requestUrl(o: SponsoredOptions, kw: string[]): string {
  const base = (o.base || DEFAULT_BASE).replace(/\/$/, '');
  const q = new URLSearchParams({ tag: o.token, v: VERSION, client: o.client || (isBrowser() ? 'web' : 'node') });
  if (kw.length) q.set('kw', kw.join(','));
  const page = o.page ?? (isBrowser() ? location.origin : '');
  if (page) q.set('page', page);
  if (o.slot) q.set('sub1', o.slot);
  const ac = o.consent?.ac ?? '0';
  q.set('ac', ac);
  if (o.consent?.gdpr) { q.set('gdpr', '1'); q.set('gdpr_consent', o.consent.gdpr); }
  if (o.consent?.usPrivacy) q.set('us_privacy', o.consent.usPrivacy);
  if (ac === '1' && o.uid) q.set('uid', o.uid);
  return `${base}/ad?${q}`;
}

/**
 * Ask for one sponsored suggestion relevant to the conversation. Resolves to
 * null on no-fill, consent 'n', timeout or any error — render nothing then.
 */
export async function sponsored(o: SponsoredOptions): Promise<SponsoredAd | null> {
  if (!o?.token || o.consent?.ac === 'n' || typeof fetch !== 'function') return null;
  const kw = o.keywords ? o.keywords.slice(0, 8) : extractKeywords(o.messages ?? []);
  const base = (o.base || DEFAULT_BASE).replace(/\/$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), o.timeoutMs ?? 1500);
  try {
    const res = await fetch(requestUrl(o, kw), { credentials: 'omit', signal: ctrl.signal });
    if (res.status !== 200) return null; // 204 = no fill
    const body = (await res.json()) as EngineResponse;
    return toAd(body, base, kw);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Map the engine's native JSON to a SponsoredAd (null if it isn't a usable native ad). */
export function toAd(b: EngineResponse, base: string, kw: string[]): SponsoredAd | null {
  const c = b?.creative ?? {};
  const title = str(c.title);
  if (!b?.request_id || !b.click_url || !b.imp_url || !title) return null;
  const abs = (u: string) => (/^https?:\/\//i.test(u) ? u : base + u);
  const impUrl = abs(b.imp_url);
  let fired = false;
  return {
    id: b.request_id,
    title,
    body: str(c.description),
    cta: str(c.cta) || 'Learn more',
    sponsor: str(c.brand_name) || str(c.advertiser) || 'Sponsor',
    label: 'Sponsored',
    url: abs(b.click_url),
    imageUrl: str(c.main_image_url) || undefined,
    iconUrl: str(c.icon_url) || undefined,
    reportUrl: abs(b.report_url || `/report?rid=${encodeURIComponent(b.request_id)}`),
    keywords: kw,
    trackImpression() {
      if (fired) return;
      fired = true;
      try { fetch(impUrl, { credentials: 'omit', keepalive: true }).catch(() => {}); } catch { /* ignore */ }
    },
  };
}

// Ad text is advertiser-supplied: escape everything markdown/HTML could act on.
const esc = (s: string) => s.replace(/[\\`*_{}[\]()<>#+\-!|~]/g, '\\$&').replace(/\s+/g, ' ').trim();
const safeUrl = (u: string) => (/^https?:\/\//i.test(u) ? u.replace(/[()<> \t\r\n]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')) : '');

/**
 * Render as a Markdown blockquote for chat UIs. Call `ad.trackImpression()`
 * when the message is actually displayed (that is what bills).
 */
export function renderMarkdown(ad: SponsoredAd): string {
  const url = safeUrl(ad.url);
  const lines = [
    `> **${ad.label}** · ${esc(ad.sponsor)}`,
    `> **[${esc(ad.title)}](${url})**`,
  ];
  if (ad.body) lines.push(`> ${esc(ad.body)}`);
  lines.push(`> [${esc(ad.cta)} →](${url})`);
  return lines.join('\n');
}
