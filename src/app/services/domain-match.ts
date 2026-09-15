/**
 * Shared free-text matching for the two places that guess a process from a
 * sentence: the KI+ import dialog and the KI assistant chat. Both go through
 * here on purpose, so the same sentence never yields two different answers in
 * a demo.
 */

export interface MatchableDomain {
  /** Weighted hints. A keyword scores its own length, doubled at a word start. */
  keywords: string[];
  /** Unmistakable markers. Any hit wins outright, before any scoring. */
  strong?: string[];
}

/**
 * Folds every spelling of an umlaut onto the bare vowel, so "Einbürgerung",
 * "Einbuergerung" and the typo "Einburgerung" all compare equal. Text and
 * keyword both run through this, so the collapse stays symmetric.
 */
export function foldUmlauts(s: string): string {
  return s
    .replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u')
    .replace(/ß/g, 'ss')
    .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
}

/**
 * Scores every domain instead of returning the first array hit.
 *
 * The original `domains.find(...)` let array order beat relevance: "Workflow
 * für Einbürgerung erstellen" landed on the recruitment template, because
 * "er-stellen" contained the keyword "stellen" and recruitment sat earlier in
 * the list than naturalisation.
 *
 * Scoring alone is still outvotable, because points add up: a sentence naming
 * both a building permit and a naturalisation would total more on the permit
 * side. That is what `strong` is for. A strong marker is unmistakable and wins
 * before any scoring happens, so a demo sentence mentioning a naturalisation
 * always proposes the naturalisation process, whatever verb surrounds it.
 */
export function matchDomain<T extends MatchableDomain>(text: string, domains: T[]): T | undefined {
  const haystack = foldUmlauts(text.toLowerCase());

  let strongest: T | undefined;
  let strongestLength = 0;
  for (const domain of domains) {
    for (const marker of domain.strong ?? []) {
      const needle = foldUmlauts(marker.toLowerCase());
      if (needle && needle.length > strongestLength && haystack.includes(needle)) {
        strongestLength = needle.length;
        strongest = domain;
      }
    }
  }
  if (strongest) return strongest;

  let best: T | undefined;
  let bestScore = 0;
  for (const domain of domains) {
    let score = 0;
    for (const keyword of domain.keywords) {
      const needle = foldUmlauts(keyword.toLowerCase());
      if (!needle) continue;
      // 0 = no hit, 1 = somewhere inside a word, 2 = at a word start
      let quality = 0;
      for (let at = haystack.indexOf(needle); at !== -1; at = haystack.indexOf(needle, at + 1)) {
        const atWordStart = at === 0 || !/[a-z0-9]/.test(haystack[at - 1]);
        quality = Math.max(quality, atWordStart ? 2 : 1);
        if (quality === 2) break;
      }
      score += needle.length * quality;
    }
    if (score > bestScore) {
      bestScore = score;
      best = domain;
    }
  }

  return best;
}
