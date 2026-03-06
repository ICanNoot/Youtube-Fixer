// YouTube Feed Filter — Filtering Logic
// Decides which elements to hide, scans the DOM, and hides shelves/nav/chips.

(function (YTF) {
  "use strict";

  const {
    log, settings, FILTERED_ATTR,
    VIDEO_SELECTORS, YTD_CONTAINER_SELECTORS, SHELF_SELECTORS, SHELF_FILTERS,
    isLiveStream, isShort, isMix, isPlayable, isMembersOnly,
    getViewCount, getVideoTitle,
  } = YTF;

  /**
   * Decide whether a video element should be hidden.
   * Returns { hide: boolean, reason: string, indeterminate: boolean }
   */
  function shouldHide(el) {
    if (settings.hideLivestreams && isLiveStream(el)) {
      return { hide: true, reason: "livestream", indeterminate: false };
    }

    if (settings.hideShorts && isShort(el)) {
      return { hide: true, reason: "short", indeterminate: false };
    }

    if (settings.hideMixes && isMix(el)) {
      return { hide: true, reason: "mix", indeterminate: false };
    }

    if (settings.hidePlayables && isPlayable(el)) {
      return { hide: true, reason: "playable", indeterminate: false };
    }

    if (settings.hideMembersOnly && isMembersOnly(el)) {
      return { hide: true, reason: "members-only", indeterminate: false };
    }

    if (settings.hideLowViews) {
      const views = getViewCount(el);

      if (isNaN(views)) {
        return { hide: false, reason: "", indeterminate: true };
      }

      if (views < settings.viewThreshold) {
        return {
          hide: true,
          reason: `low views (${views.toLocaleString()} < ${settings.viewThreshold.toLocaleString()})`,
          indeterminate: false,
        };
      }
    }

    return { hide: false, reason: "", indeterminate: false };
  }

  /**
   * Process a single video element: check and hide if necessary.
   */
  function processVideoElement(el) {
    if (el.hasAttribute(FILTERED_ATTR)) return true;

    if (
      el.tagName === "YT-LOCKUP-VIEW-MODEL" &&
      el.closest(YTD_CONTAINER_SELECTORS)
    ) {
      el.setAttribute(FILTERED_ATTR, "skip");
      return true;
    }

    const { hide, reason, indeterminate } = shouldHide(el);

    if (hide) {
      el.setAttribute(FILTERED_ATTR, "1");
      el.classList.add("ytf-hidden");
      log("Hiding:", getVideoTitle(el), "—", reason);
      return true;
    }

    if (indeterminate) {
      return false;
    }

    el.setAttribute(FILTERED_ATTR, "pass");
    return true;
  }

  /**
   * Scan the DOM for video elements and filter them.
   */
  function scanAndFilter() {
    const elements = document.querySelectorAll(VIDEO_SELECTORS);
    let newCount = 0;
    let resolvedCount = 0;

    for (const el of elements) {
      const status = el.getAttribute(FILTERED_ATTR);
      if (status === "1" || status === "pass" || status === "skip") continue;

      newCount++;
      if (processVideoElement(el)) {
        resolvedCount++;
      }
    }

    if (newCount > 0) {
      log(
        `Scanned ${newCount} unresolved elements, resolved ${resolvedCount}`
      );
    }

    scanAndFilterShelves();
    filterShortsNav();
    filterTopicChips();
  }

  /**
   * Scan for shelf/section containers and hide entire shelves whose
   * heading matches a filtered category (e.g. "YouTube Playables").
   */
  function scanAndFilterShelves() {
    const shelves = document.querySelectorAll(SHELF_SELECTORS);

    for (const shelf of shelves) {
      if (shelf.hasAttribute(FILTERED_ATTR)) continue;

      const heading = shelf.querySelector(
        "#title, #title-text, h2, " +
        "yt-dynamic-text-view-model, " +
        "span.style-scope.ytd-rich-shelf-renderer"
      );
      if (!heading) continue;

      const headingText = heading.textContent.trim();
      if (!headingText) continue;

      for (const filter of SHELF_FILTERS) {
        if (!settings[filter.settingKey]) continue;
        if (filter.pattern.test(headingText)) {
          shelf.setAttribute(FILTERED_ATTR, "1");
          shelf.classList.add("ytf-hidden");
          log("Hiding shelf:", headingText, "—", filter.reason);
          break;
        }
      }

      if (!shelf.hasAttribute(FILTERED_ATTR)) {
        shelf.setAttribute(FILTERED_ATTR, "pass");
      }
    }
  }

  /**
   * Hide the Shorts sidebar entry in the guide panel and mini-guide.
   *
   * BUG FIX: The original code only targeted `ytd-guide-entry-renderer` and
   * `ytd-mini-guide-entry-renderer`, which don't exist on Firefox. Now also
   * finds `a[href="/shorts"]` and walks up to hide the nearest list-item
   * parent, which works on both Firefox and Chrome.
   */
  function filterShortsNav() {
    if (!settings.hideShorts) return;

    // Chrome: full guide entries
    const guideEntries = document.querySelectorAll(
      "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer"
    );
    for (const entry of guideEntries) {
      if (entry.hasAttribute(FILTERED_ATTR)) continue;
      const link = entry.querySelector("a[href]");
      if (link && /\/shorts\b/.test(link.getAttribute("href"))) {
        entry.setAttribute(FILTERED_ATTR, "1");
        entry.classList.add("ytf-hidden");
        log("Hiding sidebar entry: Shorts (Chrome)");
      }
    }

    // Firefox / new layout: find the Shorts link and walk up to its container
    const shortsLinks = document.querySelectorAll('a[href="/shorts"]');
    for (const link of shortsLinks) {
      // Walk up to the nearest guide-like parent (renderer or list item)
      const container =
        link.closest("ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer") ||
        link.closest("[role='listitem']") ||
        link.parentElement;
      if (!container || container.hasAttribute(FILTERED_ATTR)) continue;
      container.setAttribute(FILTERED_ATTR, "1");
      container.classList.add("ytf-hidden");
      log("Hiding sidebar entry: Shorts (Firefox/new layout)");
    }
  }

  /**
   * Hide the topic chips bar at the top of the homepage feed.
   */
  function filterTopicChips() {
    if (!settings.hideTopicChips) return;

    const chipBars = document.querySelectorAll(
      "ytd-feed-filter-chip-bar-renderer, yt-chip-cloud-renderer, " +
      "yt-chip-cloud-view-model, iron-selector#chips"
    );
    for (const bar of chipBars) {
      if (bar.hasAttribute(FILTERED_ATTR)) continue;
      bar.setAttribute(FILTERED_ATTR, "1");
      bar.classList.add("ytf-hidden");
      log("Hiding topic chips bar");
    }
  }

  // Expose
  YTF.shouldHide = shouldHide;
  YTF.scanAndFilter = scanAndFilter;
})(window.YTF);
