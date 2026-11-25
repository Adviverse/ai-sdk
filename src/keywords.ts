/**
 * Client-side keyword extraction. This is the privacy boundary of the SDK: the
 * chat turns never leave the device, only the handful of topic words returned
 * here. URLs, emails, long numbers and token-like strings are dropped before
 * tokenizing, so they can't leak as "keywords".
 *
 * Tokens are split exactly like the ad engine's contextual matcher
 * (ASCII letters/digits, lowercased), so a returned keyword matches a
 * campaign's contextual_include term one-for-one.
 */

export interface ChatMessage {
  role?: string;
  content: string;
}

export interface KeywordOptions {
  /** Only the last N turns are read (default 6). */
  turns?: number;
  /** Max keywords returned (default 8). */
  max?: number;
}

// English stopwords + chat filler ("please", "thanks", "explain"...) that say
// nothing about the topic.
const STOP = new Set(
  (
    'a about above after again against all also am an and any are aren as at be because been before being below between both but by ' +
    'can cannot could did didn do does doesn doing don down during each few for from further get got had has have having he her here ' +
    'hers herself him himself his how however i if in into is isn it its itself just let lets like me more most much must my myself ' +
    'no nor not now of off on once only or other ought our ours ourselves out over own same she should so some such than that the ' +
    'their theirs them themselves then there these they this those through to too under until up upon us very was we were what when ' +
    'where which while who whom why will with would you your yours yourself yourselves yes yeah ok okay sure thanks thank please ' +
    'hello hi hey help want need know think make made use using used way thing things something anything really actually maybe ' +
    'good great best better well one two also even still many lot lots tell show give explain example examples question answer ' +
    'try trying look looking find going go come take see say said able sorry kind sort pretty quite though since via etc ' +
    'http https www com org net html'
  ).split(' '),
);

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi;
const EMAIL_RE = /\S+@\S+\.\S+/g;

function textOf(m: ChatMessage | string): string {
  return typeof m === 'string' ? m : typeof m?.content === 'string' ? m.content : '';
}

/**
 * Pull up to `max` topic keywords from the last few chat turns. Later turns
 * weigh more (the conversation's current topic). Returns [] for empty input.
 */
export function extractKeywords(messages: ReadonlyArray<ChatMessage | string>, opts: KeywordOptions = {}): string[] {
  const turns = Math.max(1, opts.turns ?? 6);
  const max = Math.max(0, opts.max ?? 8);
  const recent = messages.slice(-turns);
  const score = new Map<string, number>();
  const firstSeen = new Map<string, number>();
  let order = 0;

  recent.forEach((m, i) => {
    const weight = 1 + i / recent.length; // oldest 1.0 → newest ~2.0
    const clean = textOf(m).replace(URL_RE, ' ').replace(EMAIL_RE, ' ').toLowerCase();
    for (const tok of clean.split(/[^a-z0-9]+/)) {
      if (tok.length < 3 || tok.length > 24 || STOP.has(tok) || /^\d+$/.test(tok)) continue;
      if (/\d/.test(tok) && /[a-z]/.test(tok) && tok.length > 12) continue; // ids / hashes
      score.set(tok, (score.get(tok) ?? 0) + weight);
      if (!firstSeen.has(tok)) firstSeen.set(tok, order++);
    }
  });

  return [...score.keys()]
    .sort((a, b) => score.get(b)! - score.get(a)! || firstSeen.get(a)! - firstSeen.get(b)!)
    .slice(0, max);
}
