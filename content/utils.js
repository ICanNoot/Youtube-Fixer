// YouTube Feed Filter — Utility Helpers

(function (YTF) {
  "use strict";

  function log(...args) {
    console.log(YTF.LOG_PREFIX, ...args);
  }

  /**
   * Parse YouTube's abbreviated view counts into a number.
   * Handles both uppercase ("14M views") and lowercase ("14m views") suffixes.
   */
  function parseViewCount(text) {
    if (!text) return NaN;

    const cleaned = text.replace(/,/g, "").trim();

    if (/no views/i.test(cleaned)) return 0;

    const match = cleaned.match(/([\d]+(?:\.[\d]+)?)\s*([KkMmBbTt]?)/);
    if (!match) return NaN;

    const num = parseFloat(match[1]);
    const suffix = match[2].toUpperCase();

    const multipliers = { "": 1, K: 1e3, M: 1e6, B: 1e9, T: 1e12 };
    const multiplier = multipliers[suffix];
    if (multiplier === undefined) return NaN;

    return num * multiplier;
  }

  /**
   * Extract a view-count string from a larger text blob.
   */
  function extractViewString(text) {
    if (!text) return null;
    const m = text.match(/(?:no views|[\d,]+(?:\.[\d]+)?\s*[KkMmBbTt]?\s*views?)/i);
    return m ? m[0] : null;
  }

  /**
   * Extract video ID from a YouTube URL.
   */
  function extractVideoId(url) {
    try {
      const u = new URL(url, location.origin);
      return u.searchParams.get("v") || null;
    } catch {
      return null;
    }
  }

  // Expose
  YTF.log = log;
  YTF.parseViewCount = parseViewCount;
  YTF.extractViewString = extractViewString;
  YTF.extractVideoId = extractVideoId;
})(window.YTF);
