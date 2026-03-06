// YouTube Feed Filter — Shared Constants & Namespace
// All modules attach to window.YTF to share state without ES modules.

window.YTF = window.YTF || {};

(function (YTF) {
  "use strict";

  YTF.LOG_PREFIX = "[YT-Filter]";
  YTF.DEBOUNCE_MS = 250;
  YTF.RESCAN_INTERVAL_MS = 2000;
  YTF.FILTERED_ATTR = "data-ytf-filtered";

  YTF.SETTINGS_DEFAULTS = {
    hideLivestreams: true,
    hideLowViews: true,
    viewThreshold: 50000,
    hideShorts: true,
    hideMixes: true,
    hidePlayables: true,
    hideMembersOnly: true,
    hideExploreTopics: true,
    hideTopicChips: true,
    autoplayIntercept: true,
    countdownSeconds: 10,
  };

  // Selectors for all video element types we want to filter.
  // Stored as an array so modules can iterate without fragile string splitting.
  YTF.VIDEO_SELECTOR_LIST = [
    "ytd-rich-item-renderer",     // Homepage grid items (Chrome)
    "ytd-video-renderer",         // Search results (Chrome)
    "ytd-compact-video-renderer", // Sidebar recommendations (Chrome)
    "ytd-grid-video-renderer",    // Grid views / channel pages (Chrome)
    "ytd-reel-item-renderer",     // Shorts on homepage (Chrome)
    "ytd-radio-renderer",         // Mixes (Chrome)
    "yt-lockup-view-model",       // Video cards (Firefox / new layout)
  ];

  // Pre-joined selector string for querySelectorAll
  YTF.VIDEO_SELECTORS = YTF.VIDEO_SELECTOR_LIST.join(", ");

  // ytd- selectors used to detect whether a yt-lockup-view-model is nested
  // inside a Chrome-style container (so we skip it and let the parent handle it).
  YTF.YTD_CONTAINER_SELECTORS =
    "ytd-rich-item-renderer, ytd-video-renderer, ytd-compact-video-renderer, ytd-grid-video-renderer, ytd-reel-item-renderer, ytd-radio-renderer";

  // Selectors for shelf / section containers on the homepage.
  YTF.SHELF_SELECTORS = [
    "ytd-rich-shelf-renderer",
    "ytd-reel-shelf-renderer",
    "ytd-rich-section-renderer",
    "ytd-shelf-renderer",
  ].join(", ");

  // Maps a heading pattern to { settingKey, reason }
  YTF.SHELF_FILTERS = [
    { pattern: /\bplayable/i,         settingKey: "hidePlayables",     reason: "playables shelf" },
    { pattern: /\bshorts\b/i,         settingKey: "hideShorts",        reason: "shorts shelf" },
    { pattern: /\bexplore\b.*topic/i, settingKey: "hideExploreTopics", reason: "explore topics shelf" },
  ];

  // Badge selectors shared across multiple detectors.
  YTF.BADGE_TEXT_SELECTORS = [
    "yt-badge-view-model .yt-badge-shape__text",
    "yt-thumbnail-badge-view-model .yt-badge-shape__text",
    "badge-shape .yt-badge-shape__text",
  ].join(", ");
})(window.YTF);
