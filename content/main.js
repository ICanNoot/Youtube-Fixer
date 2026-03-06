// YouTube Feed Filter — Main Entry Point
// Initialization, MutationObserver, periodic rescan, SPA navigation handling.

(function (YTF) {
  "use strict";

  const {
    log, settings, DEBOUNCE_MS, RESCAN_INTERVAL_MS, FILTERED_ATTR,
    VIDEO_SELECTOR_LIST, loadSettings, scanAndFilter,
    recordCurrentVideo, startVideoPolling, cleanupAutoplay,
  } = YTF;

  // ---- SPA navigation handling ----

  function onNavigate() {
    log("Navigation detected — rescanning");

    recordCurrentVideo();

    document.querySelectorAll(`[${FILTERED_ATTR}]`).forEach((el) => {
      el.removeAttribute(FILTERED_ATTR);
      el.classList.remove("ytf-hidden");
    });

    cleanupAutoplay();

    setTimeout(() => {
      scanAndFilter();
      if (settings.autoplayIntercept) {
        startVideoPolling();
      }
    }, 500);
  }

  window.addEventListener("yt-navigate-finish", onNavigate);
  window.addEventListener("popstate", () => setTimeout(onNavigate, 300));

  // ---- MutationObserver with debouncing ----

  let debounceTimer = null;

  function debouncedScan() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      scanAndFilter();
    }, DEBOUNCE_MS);
  }

  const observer = new MutationObserver(() => {
    debouncedScan();
  });

  // ---- Periodic re-scan for lazily loaded metadata ----
  // BUG FIX: Uses VIDEO_SELECTOR_LIST array instead of fragile string split.

  function startPeriodicRescan() {
    setInterval(() => {
      const unresolvedSelector = VIDEO_SELECTOR_LIST
        .map((s) => `${s}:not([${FILTERED_ATTR}])`)
        .join(", ");
      const unresolved = document.querySelectorAll(unresolvedSelector);
      if (unresolved.length > 0) {
        scanAndFilter();
      }
    }, RESCAN_INTERVAL_MS);
  }

  // ---- Initialization ----

  function init() {
    loadSettings().then(() => {
      log(
        "Initializing YouTube Feed Filter (threshold:",
        settings.viewThreshold,
        "views)"
      );

      scanAndFilter();

      if (settings.autoplayIntercept) {
        startVideoPolling();
      }

      // BUG FIX: Removed `characterData: true` — unnecessary overhead when
      // observing at the body level. We only need childList and subtree to
      // detect new elements being added.
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });

      startPeriodicRescan();

      log("MutationObserver active, periodic rescan every", RESCAN_INTERVAL_MS, "ms");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})(window.YTF);
