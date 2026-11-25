# @adviverse/ai

Sponsored suggestions for **AI chat apps** — ChatGPT-style web apps, assistants,
copilots, Discord/Slack bots. Pass the last few chat turns, get back one clearly
labelled native ad relevant to the conversation, render it as Markdown or DOM.
On no-fill it resolves to `null` and you render nothing. Zero runtime deps.

## Install

```sh
npm install @adviverse/ai
```

Create an **AI chat** placement in your dashboard (Publisher → Placements → New →
ad type *AI chat*) and copy its tag key.

## Use

```ts
import { sponsored, renderMarkdown } from '@adviverse/ai';

const ad = await sponsored({
  token: 'YOUR_TAG_KEY',
  messages: history.slice(-6),   // [{ role, content }] or plain strings
  slot: 'after-answer',          // optional, reported as sub1
});

if (ad) {
  chat.append({ role: 'assistant', markdown: renderMarkdown(ad) });
  // Call once the message is actually on screen. This is what bills.
  ad.trackImpression();
}
```

`renderMarkdown` gives you:

```md
> **Sponsored** · Acme
> **[Acme Running Shoes](https://serve.adviverse.com/click?rid=…)**
> Cushioned trainers for your first marathon.
> [Shop now →](https://serve.adviverse.com/click?rid=…)
```

Ad text is escaped, so advertiser copy can't inject Markdown or HTML into your chat.

### DOM card

```ts
import { sponsored, mountSponsored } from '@adviverse/ai';

const ad = await sponsored({ token, messages });
if (ad) mountSponsored(document.getElementById('sponsored')!, ad);
```

`mountSponsored` builds an `<aside class="adviverse-sponsored">` (label, title, body,
CTA; style the `__label/__title/__body/__cta` children yourself) and fires the
impression only when the card is **viewable**: at least 50% on screen, the tab
visible and focused, for 1 second. Returns a disposer.

### The ad object

| Field | |
|---|---|
| `title`, `body`, `cta` | Native ad copy |
| `sponsor` | Advertiser name. Always show it with `label` |
| `label` | Always `"Sponsored"` |
| `url` | Tracked click URL. Use it as the link href; it redirects to the landing page |
| `imageUrl`, `iconUrl` | Optional images |
| `reportUrl` | "Report this ad" link |
| `trackImpression()` | Fire once on display. Idempotent |

## Privacy: what is sent

The SDK **never sends chat text**. `extractKeywords()` runs on the device and
keeps up to 8 topic words from the last 6 turns:

- lowercased, split on anything that isn't `a-z0-9` (the ad engine's own tokenizer);
- stopwords and chat filler dropped ("please", "help", "explain"…);
- URLs, email addresses, pure numbers and id/hash-like strings removed **before**
  tokenizing, so they can't leak as keywords.

The request carries only: the keywords, the page **origin** (no path, no query;
override with `page`, or `page: ''` to send none), your placement tag, `slot`, and
consent signals. No identifier is sent unless you pass `consent: { ac: '1' }` and a
`uid`. With `consent: { ac: 'n' }` no request is made at all. Requests are made
without cookies (`credentials: 'omit'`).

You can inspect or supply the keywords yourself:

```ts
import { extractKeywords, sponsored } from '@adviverse/ai';
const keywords = extractKeywords(messages);   // e.g. ['marathon', 'training', 'shoe']
const ad = await sponsored({ token, keywords });
```

Advertisers match these keywords with campaign **contextual keyword targeting**.

## Billing

Bill on view, like every Adviverse placement: fetching an ad costs nothing; the
impression bills once when `trackImpression()` (or the DOM helper's viewability
check) fires. Only call it when the ad is really displayed to a person. Clicks are
counted by the `url` redirect.

## Node / server-side

`sponsored()` works anywhere `fetch` exists (Node 18+). Fill depends on the
request looking like real user traffic: requests from cloud/datacenter IPs are
filtered as invalid traffic. For server-rendered chats, fetch the ad from the
user's browser, or use `extractKeywords` + `renderMarkdown` on the server and
`sponsored()` on the client.

## Options

`token` (required) · `messages` · `keywords` · `slot` · `page` · `consent { ac, gdpr, usPrivacy }` ·
`uid` · `base` (default `https://serve.adviverse.com`) · `timeoutMs` (default 1500) · `client`.
