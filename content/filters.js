// YouTube Feed Filter — Filtering Logic
// Decides which elements to hide, scans the DOM, and hides shelves/nav/chips.

(function (YTF) {
  "use strict";

  const {
    log, settings, FILTERED_ATTR,
    VIDEO_SELECTORS, YTD_CONTAINER_SELECTORS, SHELF_SELECTORS, SHELF_FILTERS,
    collectBadgeInfo, isLiveStream, isShort, isMix, isPlayable, isMembersOnly,
    getViewCount, getVideoTitle,
  } = YTF;

  /**
   * Decide whether a video element should be hidden.
   * Returns { hide: boolean, reason: string, indeterminate: boolean }
   */
  function shouldHide(el) {
    // Collect badge/overlay texts once — reused by all detectors below
    const info = collectBadgeInfo(el);

    if (settings.hideLivestreams && isLiveStream(el, info)) {
      return { hide: true, reason: "livestream", indeterminate: false };
    }

    if (settings.hideShorts && isShort(el, info)) {
      return { hide: true, reason: "short", indeterminate: false };
    }

    if (settings.hideMixes && isMix(el, info)) {
      return { hide: true, reason: "mix", indeterminate: false };
    }

    if (settings.hidePlayables && isPlayable(el, info)) {
      return { hide: true, reason: "playable", indeterminate: false };
    }

    if (settings.hideMembersOnly && isMembersOnly(el, info)) {
      return { hide: true, reason: "members-only", indeterminate: false };
    }

    if (settings.hideLowViews) {
      const views = getViewCount(el);

      if (isNaN(views)) {
        // Distinguish "metadata not loaded yet" from "no view count shown".
        // If the element has metadata text (channel, date, etc.) but no
        // parseable view count, it won't resolve on future rescans — mark
        // as pass so it's available as an autoplay alternative.
        const metaEl = el.querySelector(
          "yt-content-metadata-view-model, #metadata-line, #metadata, ytd-video-meta-block"
        );
        if (metaEl && metaEl.textContent.trim()) {
          return { hide: false, reason: "", indeterminate: false };
        }
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
   *
   * Also unconditionally hides `ytd-reel-shelf-renderer` when Shorts
   * filtering is enabled — this element is exclusively a Shorts shelf
   * (on search pages and elsewhere) regardless of heading text.
   */
  function scanAndFilterShelves() {
    const shelves = document.querySelectorAll(SHELF_SELECTORS);

    for (const shelf of shelves) {
      if (shelf.hasAttribute(FILTERED_ATTR)) continue;

      // ytd-reel-shelf-renderer is always a Shorts shelf — hide directly
      if (settings.hideShorts && shelf.tagName === "YTD-REEL-SHELF-RENDERER") {
        shelf.setAttribute(FILTERED_ATTR, "1");
        shelf.classList.add("ytf-hidden");
        log("Hiding shelf: Shorts (reel-shelf-renderer)");
        continue;
      }

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
   * The Shorts link in the sidebar uses `a#endpoint.yt-simple-endpoint` with
   * NO href attribute, so we match by text content instead. Query all guide
   * entry renderers and hide any whose text reads "Shorts".
   */
  function filterShortsNav() {
    if (!settings.hideShorts) return;

    const guideEntries = document.querySelectorAll(
      "ytd-guide-entry-renderer, ytd-mini-guide-entry-renderer"
    );
    for (const entry of guideEntries) {
      if (entry.hasAttribute(FILTERED_ATTR)) continue;
      const text = entry.textContent.trim();
      if (text === "Shorts") {
        entry.setAttribute(FILTERED_ATTR, "1");
        entry.classList.add("ytf-hidden");
        log("Hiding sidebar entry: Shorts");
      }
    }
  }

  /**
   * Hide the topic chips bar on homepage and search pages.
   *
   * Homepage: `div#frosted-glass.with-chipbar` is the frosted overlay behind
   * the masthead. The `.with-chipbar` class sets height to 112px (56px masthead
   * + 56px chip bar) and provides the frosted background. We can't remove the
   * class (loses the background) or hide the element (loses the sticky header).
   * Instead we override its height to 56px so only the masthead portion shows,
   * keeping the frosted background intact while chopping the chip bar space.
   *
   * Search page: Chips live inside `ytd-search-sub-menu-renderer`. We hide
   * the sub-menu renderer to collapse the space.
   */
  function filterTopicChips() {
    if (!settings.hideTopicChips) return;

    // Homepage: override frosted-glass height to masthead-only (56px).
    // Keep .with-chipbar intact so the frosted background remains.
    const frostedGlass = document.querySelector("div#frosted-glass");
    if (frostedGlass && !frostedGlass.hasAttribute(FILTERED_ATTR)) {
      frostedGlass.style.setProperty("height", "56px", "important");
      frostedGlass.style.setProperty("overflow", "hidden");
      frostedGlass.setAttribute(FILTERED_ATTR, "1");
      frostedGlass.dataset.ytfHeightOverride = "1";
      log("Hiding topic chips: overrode frosted-glass height to 56px");
    }

    // Search page: hide chip clouds and their search sub-menu parent
    const searchSubMenus = document.querySelectorAll(
      "ytd-search-sub-menu-renderer"
    );
    for (const menu of searchSubMenus) {
      if (menu.hasAttribute(FILTERED_ATTR)) continue;
      menu.setAttribute(FILTERED_ATTR, "1");
      menu.classList.add("ytf-hidden");
      log("Hiding topic chips: search sub-menu");
    }

    // General fallback: hide chip bar elements directly
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
