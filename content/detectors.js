// YouTube Feed Filter — Video Type Detectors
// Each detector checks a video element and returns true if it matches a category.

(function (YTF) {
  "use strict";

  const { log, parseViewCount, extractViewString, BADGE_TEXT_SELECTORS } = YTF;

  /**
   * Collect badge and overlay texts from a video element once, so multiple
   * detectors can reuse them without redundant DOM queries.
   */
  function collectBadgeInfo(el) {
    const badgeTexts = [];
    const overlayTexts = [];
    const overlayStyles = [];

    const badges = el.querySelectorAll(BADGE_TEXT_SELECTORS);
    for (const bt of badges) {
      badgeTexts.push((bt.textContent || "").trim().toUpperCase());
    }

    const overlays = el.querySelectorAll(
      "ytd-thumbnail-overlay-time-status-renderer"
    );
    for (const overlay of overlays) {
      const style = overlay.getAttribute("overlay-style");
      if (style) overlayStyles.push(style);
      overlayTexts.push((overlay.textContent || "").trim().toUpperCase());
    }

    const chromeBadges = el.querySelectorAll(
      "ytd-badge-supported-renderer, .badge-style-type-live-now, .badge-style-type-live-now-alternate"
    );
    const chromeBadgeTexts = [];
    for (const badge of chromeBadges) {
      chromeBadgeTexts.push((badge.textContent || "").trim().toUpperCase());
    }

    return { badgeTexts, overlayTexts, overlayStyles, chromeBadgeTexts };
  }

  /**
   * Check whether a video element is a livestream.
   *
   * BUG FIX: Removed CSS `[aria-label*="live" i]` selector — the `i` flag
   * for case-insensitive attribute matching has poor support in older Firefox.
   * Replaced with a JS-based aria-label check.
   *
   * BUG FIX: The `\bwatching\b` check was previously run against the entire
   * element's textContent, which could false-positive on unrelated text.
   * Now scoped to metadata-specific elements only.
   */
  function isLiveStream(el, info) {
    // 1. Chrome overlay with style="LIVE"
    for (const style of info.overlayStyles) {
      if (style === "LIVE") return true;
    }
    for (const txt of info.overlayTexts) {
      if (txt === "LIVE" || txt === "LIVE NOW") return true;
    }

    // 2. Chrome badge elements
    for (const txt of info.chromeBadgeTexts) {
      if (txt === "LIVE" || txt === "LIVE NOW") return true;
    }

    // 3. Firefox / new layout badge text
    for (const txt of info.badgeTexts) {
      if (txt === "LIVE" || txt === "LIVE NOW") return true;
    }

    // 4. Aria-label check on thumbnail overlays and title (scoped to avoid
    //    matching unrelated aria-labels on buttons/links throughout the card)
    const labeledEls = el.querySelectorAll(
      "ytd-thumbnail-overlay-time-status-renderer[aria-label], #video-title[aria-label]"
    );
    for (const labeled of labeledEls) {
      const ariaLabel = labeled.getAttribute("aria-label") || "";
      if (/\blive\b/i.test(ariaLabel)) return true;
    }

    // 5. "watching" in metadata-specific elements (not full element text)
    const metaSelectors = [
      "yt-content-metadata-view-model",
      "#metadata-line",
      "#metadata",
      "ytd-video-meta-block",
    ];
    for (const sel of metaSelectors) {
      const metaEl = el.querySelector(sel);
      if (metaEl && /\bwatching\b/i.test(metaEl.textContent)) return true;
    }

    // 6. Chrome #video-title aria-label with "watching"
    const titleEl = el.querySelector("#video-title");
    if (titleEl) {
      const ariaLabel = titleEl.getAttribute("aria-label") || "";
      if (/\bwatching\b/i.test(ariaLabel)) return true;
    }

    return false;
  }

  /**
   * Extract the view count from a video element.
   */
  function getViewCount(el) {
    const metaViewModel = el.querySelector("yt-content-metadata-view-model");
    if (metaViewModel) {
      const vs = extractViewString(metaViewModel.textContent);
      if (vs) return parseViewCount(vs);
    }

    const titleEl = el.querySelector("#video-title");
    if (titleEl) {
      const label = titleEl.getAttribute("aria-label") || "";
      const vs = extractViewString(label);
      if (vs) return parseViewCount(vs);
    }

    const titleLink = el.querySelector("a#video-title-link");
    if (titleLink) {
      const label = titleLink.getAttribute("aria-label") || "";
      const vs = extractViewString(label);
      if (vs) return parseViewCount(vs);
    }

    const metaBlock = el.querySelector("ytd-video-meta-block");
    if (metaBlock) {
      const vs = extractViewString(metaBlock.textContent);
      if (vs) return parseViewCount(vs);
    }

    const metaLine = el.querySelector("#metadata-line");
    if (metaLine) {
      const vs = extractViewString(metaLine.textContent);
      if (vs) return parseViewCount(vs);
    }

    const metadata = el.querySelector("#metadata");
    if (metadata) {
      const vs = extractViewString(metadata.textContent);
      if (vs) return parseViewCount(vs);
    }

    return NaN;
  }

  /**
   * Check whether a video element is a YouTube Short.
   */
  function isShort(el, info) {
    if (el.tagName === "YTD-REEL-ITEM-RENDERER") return true;

    const anchors = el.querySelectorAll("a[href]");
    for (const a of anchors) {
      if (a.href && a.href.includes("/shorts/")) return true;
    }

    for (const style of info.overlayStyles) {
      if (style === "SHORTS") return true;
    }
    for (const txt of info.overlayTexts) {
      if (txt === "SHORTS") return true;
    }

    for (const txt of info.badgeTexts) {
      if (txt === "SHORTS") return true;
    }

    return false;
  }

  /**
   * Check whether a video element is a YouTube Mix.
   */
  function isMix(el, info) {
    if (el.tagName === "YTD-RADIO-RENDERER") return true;

    const anchors = el.querySelectorAll("a[href]");
    for (const a of anchors) {
      if (!a.href) continue;
      if (a.href.includes("start_radio=1")) return true;
      if (/[?&]list=RD/.test(a.href)) return true;
    }

    const title = getVideoTitle(el);
    if (/^Mix\s*[-–]/.test(title)) return true;

    for (const txt of info.overlayTexts) {
      if (txt === "MIX") return true;
    }

    for (const txt of info.badgeTexts) {
      if (txt === "MIX") return true;
    }

    return false;
  }

  /**
   * Check whether a video element is a YouTube Playable.
   */
  function isPlayable(el, info) {
    const anchors = el.querySelectorAll("a[href]");
    for (const a of anchors) {
      if (a.href && a.href.includes("/playables/")) return true;
    }

    for (const txt of info.chromeBadgeTexts) {
      if (txt === "PLAYABLE" || txt === "PLAY GAME") return true;
    }
    for (const txt of info.badgeTexts) {
      if (txt === "PLAYABLE" || txt === "PLAY GAME") return true;
    }

    for (const txt of info.overlayTexts) {
      if (txt === "PLAYABLE" || txt === "PLAY GAME") return true;
    }

    return false;
  }

  /**
   * Check whether a video element is members-only content.
   */
  function isMembersOnly(el, info) {
    for (const txt of info.chromeBadgeTexts) {
      if (txt === "MEMBERS ONLY") return true;
    }
    for (const txt of info.badgeTexts) {
      if (txt === "MEMBERS ONLY") return true;
    }

    const titleEl = el.querySelector("#video-title");
    if (titleEl) {
      const ariaLabel = titleEl.getAttribute("aria-label") || "";
      if (/members only/i.test(ariaLabel)) return true;
    }

    for (const txt of info.overlayTexts) {
      if (txt === "MEMBERS ONLY") return true;
    }

    return false;
  }

  /**
   * Get a human-readable title for a video element (for logging).
   */
  function getVideoTitle(el) {
    const titleEl = el.querySelector(
      "#video-title, h3 a, yt-formatted-string#video-title, yt-lockup-metadata-view-model h3"
    );
    return titleEl
      ? (titleEl.textContent || "").trim().slice(0, 80)
      : "(unknown)";
  }

  /**
   * Get the channel name from a sidebar video element.
   */
  function getVideoChannel(el) {
    const chromeChannel = el.querySelector(
      "ytd-channel-name #text, #channel-name #text, ytd-channel-name yt-formatted-string"
    );
    if (chromeChannel && chromeChannel.textContent.trim()) {
      return chromeChannel.textContent.trim();
    }

    const metaModel = el.querySelector("yt-content-metadata-view-model");
    if (metaModel) {
      const spans = metaModel.querySelectorAll("span");
      for (const span of spans) {
        const text = span.textContent.trim();
        if (
          text &&
          !/views?\s*$/i.test(text) &&
          !/ago\s*$/i.test(text) &&
          !/watching/i.test(text) &&
          !/^\d/.test(text)
        ) {
          return text;
        }
      }
    }

    return "";
  }

  /**
   * Get the metadata text (views + date) from a sidebar video element.
   */
  function getVideoMetaText(el) {
    const metaModel = el.querySelector("yt-content-metadata-view-model");
    if (metaModel) return metaModel.textContent.trim();
    const metaLine = el.querySelector("#metadata-line");
    if (metaLine) return metaLine.textContent.trim();
    return "";
  }

  // Expose
  YTF.collectBadgeInfo = collectBadgeInfo;
  YTF.isLiveStream = isLiveStream;
  YTF.getViewCount = getViewCount;
  YTF.isShort = isShort;
  YTF.isMix = isMix;
  YTF.isPlayable = isPlayable;
  YTF.isMembersOnly = isMembersOnly;
  YTF.getVideoTitle = getVideoTitle;
  YTF.getVideoChannel = getVideoChannel;
  YTF.getVideoMetaText = getVideoMetaText;
})(window.YTF);
