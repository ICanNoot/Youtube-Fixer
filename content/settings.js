// YouTube Feed Filter — Settings Management

(function (YTF) {
  "use strict";

  const { log, SETTINGS_DEFAULTS } = YTF;

  // Live copy of settings — mutated in place when updates arrive.
  YTF.settings = Object.assign({}, SETTINGS_DEFAULTS);

  function loadSettings() {
    return browser.storage.local.get(SETTINGS_DEFAULTS).then((stored) => {
      Object.assign(YTF.settings, stored);
      log("Settings loaded:", JSON.stringify(YTF.settings));
    });
  }

  /**
   * Clear all filter marks and rescan the page.
   * Called after settings change so filters re-evaluate with new values.
   */
  function resetAndRescan() {
    document.querySelectorAll(`[${YTF.FILTERED_ATTR}]`).forEach((el) => {
      // Restore .with-chipbar class on frosted-glass if we removed it
      if (el.dataset.ytfChipbarRemoved) {
        el.classList.add("with-chipbar");
        delete el.dataset.ytfChipbarRemoved;
      }
      el.removeAttribute(YTF.FILTERED_ATTR);
      el.classList.remove("ytf-hidden");
    });
    // scanAndFilter is defined in filters.js, available by the time this runs
    YTF.scanAndFilter();
  }

  // Listen for live updates from the popup
  browser.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "ytf-settings-update" && msg.settings) {
      Object.assign(YTF.settings, msg.settings);
      log("Settings updated:", JSON.stringify(msg.settings));

      // If autoplay interception was toggled
      if ("autoplayIntercept" in msg.settings) {
        if (YTF.settings.autoplayIntercept) {
          YTF.startVideoPolling();
        } else {
          YTF.cleanupAutoplay();
        }
      }

      resetAndRescan();
    }
  });

  // Expose
  YTF.loadSettings = loadSettings;
  YTF.resetAndRescan = resetAndRescan;
})(window.YTF);
