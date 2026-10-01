// Fuzzy matching for the universal search, ported from Wooctrl's Blender
// search (wooctrl/search/fuzzy.py). It finds partial words ("hitb"),
// missing spaces ("exportvideo"), initials ("ev" → Export Video), typos
// ("scrennshot"), any word order ("video export") and subsequences, and
// ranks title matches over keyword matches over description matches. An
// inverted index keeps typing fast with thousands of entries.

const CAMEL = /(?<=[a-z0-9])(?=[A-Z])/g;
const SPLIT = /[^0-9a-z]+/;

// How much a word counts by where it is in an entry.
const TIER_WEIGHTS = [1.0, 0.78, 0.45]; // title, keywords, description
const DESCRIPTION = 2;
const MAX_DESCRIPTION_WORDS = 40;

export function tokenize(text) {
  if (!text) return [];
  return String(text)
    .replace(CAMEL, ' ')
    .toLowerCase()
    .split(SPLIT)
    .filter(Boolean);
}

/** Optimal-string-alignment distance, giving up above `limit`. */
export function osaDistance(a, b, limit) {
  if (Math.abs(a.length - b.length) > limit) return limit + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i, ...new Array(b.length).fill(0)];
    let rowMin = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (prev2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, prev2[j - 2] + 1);
      cur[j] = value;
      rowMin = Math.min(rowMin, value);
    }
    if (rowMin > limit) return limit + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

export function isSubsequence(needle, haystack) {
  let at = 0;
  for (const ch of needle) {
    at = haystack.indexOf(ch, at);
    if (at < 0) return false;
    at++;
  }
  return true;
}

/** How alike one typed word is to one indexed word (0: not at all). */
export function wordScore(q, word) {
  if (word === q) return 1.0;
  const n = q.length;
  if (word.startsWith(q)) return 0.9 - Math.min(0.1, 0.01 * (word.length - n));
  if (n >= 3 && word.includes(q)) return 0.66;
  if (n >= 4 && word[0] === q[0]) {
    const allowed = n < 7 ? 1 : 2;
    if (word.length >= n - allowed) {
      let distance = osaDistance(q, word, allowed);
      if (word.length > n) distance = Math.min(distance, osaDistance(q, word.slice(0, n), allowed));
      if (distance <= allowed) return 0.62 - 0.07 * distance;
    }
  }
  return 0;
}

/** An index over [title, keywords, description] records. */
export class FuzzyIndex {
  constructor(records) {
    this.postings = [new Map(), new Map(), new Map()];
    this.compact = [];
    this.initials = [];
    this.titles = [];
    this.titleLen = [];
    const vocabulary = new Set();
    records.forEach(([title, keywords, description], idx) => {
      const titleWords = tokenize(title);
      const tiers = [titleWords, tokenize(keywords), tokenize(description).slice(0, MAX_DESCRIPTION_WORDS)];
      tiers.forEach((words, tier) => {
        for (const word of new Set(words)) {
          const list = this.postings[tier].get(word);
          if (list) list.push(idx);
          else this.postings[tier].set(word, [idx]);
          vocabulary.add(word);
        }
      });
      this.compact.push(titleWords.join(''));
      this.initials.push(titleWords.map((w) => w[0]).join(''));
      this.titles.push(String(title ?? '').toLowerCase());
      this.titleLen.push(titleWords.length);
    });
    this.vocabulary = [...vocabulary].sort();
    this.cache = new Map();
  }

  get size() {
    return this.titles.length;
  }

  matchingWords(q) {
    const cached = this.cache.get(q);
    if (cached) return cached;
    const out = new Map();
    for (const word of this.vocabulary) {
      const score = wordScore(q, word);
      if (score > 0) out.set(word, score);
    }
    if (this.cache.size > 512) this.cache.clear();
    this.cache.set(q, out);
    return out;
  }

  /** [[score, index]] best first; `allowed(index)` filters. */
  search(query, allowed = null, limit = 200) {
    const words = tokenize(query);
    if (!words.length) return [];
    const compact = words.join('');
    const queryLower = words.join(' ');
    const perWord = [];
    const candidates = new Set();
    for (const qw of words) {
      const matches = this.matchingWords(qw);
      const best = new Map();
      TIER_WEIGHTS.forEach((weight, tier) => {
        if (tier === DESCRIPTION && qw.length < 3) return;
        const postings = this.postings[tier];
        for (const [word, score] of matches) {
          const list = postings.get(word);
          if (!list) continue;
          const value = score * weight;
          for (const idx of list) if ((best.get(idx) ?? 0) < value) best.set(idx, value);
        }
      });
      perWord.push(best);
      for (const idx of best.keys()) candidates.add(idx);
    }
    if (compact.length >= 2)
      this.compact.forEach((text, idx) => {
        if (text.includes(compact) || this.initials[idx].startsWith(compact)) candidates.add(idx);
      });

    const results = [];
    const n = words.length;
    for (const idx of candidates) {
      if (allowed && !allowed(idx)) continue;
      const text = this.compact[idx];
      const initials = this.initials[idx];
      let total = 0;
      let failed = false;
      for (let w = 0; w < n; w++) {
        const qw = words[w];
        let value = perWord[w].get(idx);
        if (value === undefined) {
          if (qw.length >= 2 && initials.startsWith(qw)) value = 0.7;
          else if (qw.length >= 3 && text.includes(qw)) value = 0.6;
          else if (qw.length >= 3 && isSubsequence(qw, text)) value = 0.35;
          else {
            failed = true;
            break;
          }
        }
        total += value;
      }
      let score = failed ? 0 : total / n;
      if (text.startsWith(compact)) score = Math.max(score, 0.93);
      else if (compact.length >= 3 && text.includes(compact)) score = Math.max(score, 0.8);
      else if (compact.length >= 2 && initials.startsWith(compact)) score = Math.max(score, 0.78);
      if (score <= 0) continue;
      const title = this.titles[idx];
      if (title === queryLower) score += 0.25;
      else if (title.startsWith(queryLower)) score += 0.1;
      score -= 0.015 * Math.max(0, this.titleLen[idx] - n);
      results.push([score, idx]);
    }
    results.sort((a, b) => b[0] - a[0] || this.titleLen[a[1]] - this.titleLen[b[1]] || a[1] - b[1]);
    return limit ? results.slice(0, limit) : results;
  }
}
