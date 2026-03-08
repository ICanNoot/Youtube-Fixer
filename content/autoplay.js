// YouTube Feed Filter — Autoplay Interception
// Monitors the up-next container, checks against filters, replaces with
// sidebar alternatives, and shows a countdown overlay.

(function (YTF) {
  "use strict";

  const {
    log, settings, extractViewString, parseViewCount, extractVideoId,
    FILTERED_ATTR, getVideoTitle, getVideoChannel, getVideoMetaText,
  } = YTF;

  const HISTORY_MAX = 20;
  const recentVideoIds = new Set();

  let videoEndedBound = null;
  let videoElement = null;
  let videoPollingTimer = null;
  let autoplayContainerObserver = null;
  let countdownTimer = null;
  let countdownOverlay = null;
  let playerClickHandler = null;
  let isUpdatingEndCard = false;
  let autoplayHandled = false;
  let ytAutoplayWasOn = false;

  // ---- YouTube autoplay toggle ----

  function cancelYouTubeAutoplay() {
    const toggle = document.querySelector(".ytp-autonav-toggle-button");
    if (!toggle) {
      log("Autoplay: YouTube autoplay toggle not found");
      return false;
    }
    if (toggle.getAttribute("aria-checked") === "true") {
      toggle.click();
      ytAutoplayWasOn = true;
      log("Autoplay: disabled YouTube native autoplay");
      return true;
    }
    return false;
  }

  function restoreYouTubeAutoplay() {
    if (!ytAutoplayWasOn) return;
    const toggle = document.querySelector(".ytp-autonav-toggle-button");
    if (toggle && toggle.getAttribute("aria-checked") === "false") {
      toggle.click();
      log("Autoplay: restored YouTube native autoplay");
    }
    ytAutoplayWasOn = false;
  }

  // ---- Video history ----

  function recordCurrentVideo() {
    const id = extractVideoId(location.href);
    if (id) {
      recentVideoIds.add(id);
      if (recentVideoIds.size > HISTORY_MAX) {
        const oldest = recentVideoIds.values().next().value;
        recentVideoIds.delete(oldest);
      }
      log("Autoplay: recorded video", id, "in history (" + recentVideoIds.size + " total)");
    }
  }

  // ---- End card DOM updates ----

  function updateEndCard(info) {
    const container = document.querySelector(
      ".ytp-autonav-endscreen-upnext-container"
    );
    if (!container) return;

    isUpdatingEndCard = true;

    const titleEl = container.querySelector(".ytp-autonav-endscreen-upnext-title");
    if (titleEl) titleEl.textContent = info.title;

    const authorEl = container.querySelector(".ytp-autonav-endscreen-upnext-author");
    if (authorEl && info.channel) authorEl.textContent = info.channel;

    const viewDateEl = container.querySelector(".ytp-autonav-view-and-date");
    if (viewDateEl && info.metaText) viewDateEl.textContent = info.metaText;

    const authorViewEl = container.querySelector(".ytp-autonav-author-and-view");
    if (authorViewEl) {
      if (info.channel && info.metaText) {
        authorViewEl.textContent = info.channel + " \u00B7 " + info.metaText;
      } else if (info.metaText) {
        authorViewEl.textContent = info.metaText;
      }
    }

    if (info.videoId) {
      const thumbEl = container.querySelector(
        ".ytp-autonav-endscreen-upnext-thumbnail"
      );
      if (thumbEl) {
        thumbEl.style.backgroundImage =
          "url(https://i.ytimg.com/vi/" + info.videoId + "/hqdefault.jpg)";
      }
    }

    const linkEl = container.querySelector("a.ytp-autonav-endscreen-link-container");
    if (linkEl) linkEl.href = info.url;

    const liveStamp = container.querySelector(".ytp-autonav-live-stamp");
    if (liveStamp) liveStamp.style.display = "none";

    isUpdatingEndCard = false;

    log("Autoplay: updated end card to show:", info.title);
  }

  // ---- Countdown overlay ----

  function startCountdown(info) {
    cancelCountdown();

    let remaining = settings.countdownSeconds;

    countdownOverlay = document.createElement("div");
    countdownOverlay.className = "ytf-countdown-overlay";
    countdownOverlay.innerHTML =
      '<div class="ytf-countdown-content">' +
        '<div class="ytf-countdown-text">Up next in ' +
          '<span class="ytf-countdown-number">' + remaining + "</span>s</div>" +
        '<div class="ytf-countdown-title">' +
          info.title.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;") +
        "</div>" +
        '<button class="ytf-countdown-cancel">Cancel</button>' +
      "</div>";

    const player = document.querySelector("#movie_player");
    if (player) {
      player.appendChild(countdownOverlay);
    }

    countdownOverlay.querySelector(".ytf-countdown-cancel")
      .addEventListener("click", function (e) {
        e.stopPropagation();
        log("Autoplay: countdown cancelled by user");
        cancelCountdown();
      });

    playerClickHandler = function (e) {
      if (countdownOverlay && countdownOverlay.contains(e.target)) return;
      log("Autoplay: countdown cancelled by player click");
      cancelCountdown();
    };
    if (player) player.addEventListener("click", playerClickHandler);

    const numberEl = countdownOverlay.querySelector(".ytf-countdown-number");
    countdownTimer = setInterval(function () {
      remaining--;
      if (numberEl) numberEl.textContent = remaining;
      if (remaining <= 0) {
        const anchor = info.anchor;
        cancelCountdown();
        navigateToVideo(anchor);
      }
    }, 1000);

    log("Autoplay: countdown started (" + settings.countdownSeconds + "s)");
  }

  function cancelCountdown() {
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    if (countdownOverlay) {
      countdownOverlay.remove();
      countdownOverlay = null;
    }
    if (playerClickHandler) {
      const player = document.querySelector("#movie_player");
      if (player) player.removeEventListener("click", playerClickHandler);
      playerClickHandler = null;
    }
    restoreYouTubeAutoplay();
  }

  // ---- Autoplay check ----

  /**
   * Check the autoplay up-next container and decide whether to skip.
   *
   * BUG FIX: The live stamp check now verifies the element is actually
   * visible (offsetParent / computed display) because `.ytp-autonav-live-stamp`
   * exists in the DOM even for non-live videos but is hidden via CSS.
   */
  function checkAutoplayAndSkip() {
    if (autoplayHandled) return false;
    if (!settings.autoplayIntercept) return false;
    if (!location.pathname.startsWith("/watch")) return false;

    const container = document.querySelector(
      ".ytp-autonav-endscreen-upnext-container"
    );
    if (!container) {
      log("Autoplay: up-next container not found");
      return false;
    }

    const titleEl = container.querySelector(
      ".ytp-autonav-endscreen-upnext-title"
    );
    if (!titleEl || !titleEl.textContent.trim()) {
      log("Autoplay: up-next container has no title yet");
      return false;
    }

    const nextTitle = titleEl.textContent.trim();
    let shouldSkip = false;
    let skipReason = "";

    // Check: livestream
    if (settings.hideLivestreams && !shouldSkip) {
      if (container.getAttribute("data-is-live") === "true") {
        shouldSkip = true;
        skipReason = "livestream (data-is-live)";
      }

      // BUG FIX: check that live stamp is actually visible, not just present
      if (!shouldSkip) {
        const liveStamp = container.querySelector(".ytp-autonav-live-stamp");
        if (liveStamp && liveStamp.textContent.trim()) {
          const style = window.getComputedStyle(liveStamp);
          if (style.display !== "none" && style.visibility !== "hidden") {
            shouldSkip = true;
            skipReason = "livestream (live stamp)";
          }
        }
      }

      if (!shouldSkip) {
        const viewDateEl = container.querySelector(".ytp-autonav-view-and-date");
        if (viewDateEl && /\bwatching\b/i.test(viewDateEl.textContent)) {
          shouldSkip = true;
          skipReason = "livestream (watching)";
        }
      }
    }

    // Check: low views
    if (settings.hideLowViews && !shouldSkip) {
      const viewDateEl = container.querySelector(".ytp-autonav-view-and-date");
      if (viewDateEl) {
        const viewText = viewDateEl.textContent.trim();
        if (!/\bwatching\b/i.test(viewText)) {
          const vs = extractViewString(viewText);
          if (vs) {
            const views = parseViewCount(vs);
            if (!isNaN(views) && views < settings.viewThreshold) {
              shouldSkip = true;
              skipReason = "low views (" + views.toLocaleString() + " < " + settings.viewThreshold.toLocaleString() + ")";
            }
          }
        }
      }
    }

    // Check: Shorts
    if (settings.hideShorts && !shouldSkip) {
      const linkEl = container.querySelector("a.ytp-autonav-endscreen-link-container");
      if (linkEl && linkEl.href && linkEl.href.includes("/shorts/")) {
        shouldSkip = true;
        skipReason = "short";
      }
    }

    // Check: Mixes
    if (settings.hideMixes && !shouldSkip) {
      const linkEl = container.querySelector("a.ytp-autonav-endscreen-link-container");
      if (linkEl && linkEl.href) {
        if (linkEl.href.includes("start_radio=1") || /[?&]list=RD/.test(linkEl.href)) {
          shouldSkip = true;
          skipReason = "mix";
        }
      }
      if (!shouldSkip && /^Mix\s*[-–]/.test(nextTitle)) {
        shouldSkip = true;
        skipReason = "mix";
      }
    }

    // Check: Playables
    if (settings.hidePlayables && !shouldSkip) {
      const linkEl = container.querySelector("a.ytp-autonav-endscreen-link-container");
      if (linkEl && linkEl.href && linkEl.href.includes("/playables/")) {
        shouldSkip = true;
        skipReason = "playable";
      }
    }

    if (!shouldSkip) {
      log("Autoplay: up-next video is OK:", nextTitle);
      return false;
    }

    log("Autoplay: skipping up-next:", nextTitle, "—", skipReason);

    const alternative = findSidebarAlternative();
    if (alternative) {
      log("Autoplay: replacement:", alternative.title);
      cancelYouTubeAutoplay();
      autoplayHandled = true;
      updateEndCard(alternative);
      startCountdown(alternative);
      return true;
    }

    log("Autoplay: no valid sidebar alternative found");
    return false;
  }

  // ---- Sidebar alternative search ----

  function findSidebarAlternative() {
    const secondary =
      document.querySelector("ytd-watch-next-secondary-results-renderer") ||
      document.querySelector("#secondary-inner, #related");
    if (!secondary) return null;

    const passedItems = secondary.querySelectorAll(
      `ytd-compact-video-renderer[${FILTERED_ATTR}="pass"], yt-lockup-view-model[${FILTERED_ATTR}="pass"]`
    );

    for (const item of passedItems) {
      const anchor = item.querySelector("a[href]");
      if (!anchor || !anchor.href || !anchor.href.includes("/watch")) continue;

      const videoId = extractVideoId(anchor.href);
      if (videoId && recentVideoIds.has(videoId)) continue;

      return {
        anchor,
        title: getVideoTitle(item),
        channel: getVideoChannel(item),
        metaText: getVideoMetaText(item),
        videoId,
        url: anchor.href,
      };
    }

    // All alternatives were recently played — clear history and retry
    if (recentVideoIds.size > 0) {
      log("Autoplay: all alternatives recently played, clearing history");
      recentVideoIds.clear();

      for (const item of passedItems) {
        const anchor = item.querySelector("a[href]");
        if (!anchor || !anchor.href || !anchor.href.includes("/watch")) continue;

        return {
          anchor,
          title: getVideoTitle(item),
          channel: getVideoChannel(item),
          metaText: getVideoMetaText(item),
          videoId: extractVideoId(anchor.href),
          url: anchor.href,
        };
      }
    }

    return null;
  }

  // ---- Navigation ----

  function navigateToVideo(anchor) {
    restoreYouTubeAutoplay();
    const url = anchor.href;
    try {
      anchor.click();
      log("Autoplay: clicked sidebar link for SPA navigation");
      setTimeout(() => {
        if (location.href !== url && !location.href.includes(new URL(url).searchParams.get("v"))) {
          log("Autoplay: click didn't navigate, falling back to location.href");
          window.location.href = url;
        }
      }, 1000);
    } catch (e) {
      log("Autoplay: click failed, using location.href fallback");
      window.location.href = url;
    }
  }

  // ---- Video ended listener ----

  function onVideoEnded() {
    log("Autoplay: video ended event fired");
    checkAutoplayAndSkip();
  }

  function attachVideoEndedListener() {
    const video = document.querySelector("#movie_player video");
    if (!video) return false;

    if (video === videoElement && videoEndedBound) return true;

    detachVideoEndedListener();

    videoElement = video;
    videoEndedBound = onVideoEnded;
    video.addEventListener("ended", videoEndedBound);
    log("Autoplay: attached ended listener to <video>");
    return true;
  }

  function detachVideoEndedListener() {
    if (videoElement && videoEndedBound) {
      videoElement.removeEventListener("ended", videoEndedBound);
      log("Autoplay: detached ended listener from <video>");
    }
    videoElement = null;
    videoEndedBound = null;
  }

  // ---- Video polling ----

  function startVideoPolling() {
    stopVideoPolling();

    if (!settings.autoplayIntercept) return;
    if (!location.pathname.startsWith("/watch")) return;

    let elapsed = 0;
    const POLL_INTERVAL = 1000;
    const MAX_POLL_TIME = 30000;

    if (attachVideoEndedListener()) {
      setupAutoplayContainerObserver();
      return;
    }

    videoPollingTimer = setInterval(() => {
      elapsed += POLL_INTERVAL;

      if (attachVideoEndedListener()) {
        stopVideoPolling();
        setupAutoplayContainerObserver();
        return;
      }

      if (elapsed >= MAX_POLL_TIME) {
        log("Autoplay: gave up polling for <video> after 30s");
        stopVideoPolling();
      }
    }, POLL_INTERVAL);
  }

  function stopVideoPolling() {
    if (videoPollingTimer) {
      clearInterval(videoPollingTimer);
      videoPollingTimer = null;
    }
  }

  // ---- Autoplay container observer ----

  function setupAutoplayContainerObserver() {
    teardownAutoplayContainerObserver();

    if (!settings.autoplayIntercept) return;
    if (!location.pathname.startsWith("/watch")) return;

    const container = document.querySelector(
      ".ytp-autonav-endscreen-upnext-container"
    );
    if (!container) {
      setTimeout(setupAutoplayContainerObserver, 2000);
      return;
    }

    let autoplayDebounceTimer = null;

    autoplayContainerObserver = new MutationObserver((mutations) => {
      if (isUpdatingEndCard) return;

      let shouldCheck = false;
      for (const mutation of mutations) {
        if (
          mutation.type === "attributes" &&
          (mutation.attributeName === "data-is-live" ||
            mutation.attributeName === "style" ||
            mutation.attributeName === "class")
        ) {
          if (container.clientHeight > 0) {
            shouldCheck = true;
            break;
          }
        }
        if (mutation.type === "childList" && container.clientHeight > 0) {
          shouldCheck = true;
          break;
        }
      }

      if (shouldCheck) {
        if (autoplayDebounceTimer) clearTimeout(autoplayDebounceTimer);
        autoplayDebounceTimer = setTimeout(() => {
          autoplayDebounceTimer = null;
          log("Autoplay: container mutation (debounced)");
          checkAutoplayAndSkip();
        }, 200);
      }
    });

    autoplayContainerObserver.observe(container, {
      attributes: true,
      childList: true,
      subtree: true,
    });

    log("Autoplay: MutationObserver active on up-next container");
  }

  function teardownAutoplayContainerObserver() {
    if (autoplayContainerObserver) {
      autoplayContainerObserver.disconnect();
      autoplayContainerObserver = null;
    }
  }

  // ---- Cleanup ----

  function cleanupAutoplay() {
    detachVideoEndedListener();
    stopVideoPolling();
    teardownAutoplayContainerObserver();
    cancelCountdown();
    autoplayHandled = false;
    restoreYouTubeAutoplay();
  }

  // Expose
  YTF.recordCurrentVideo = recordCurrentVideo;
  YTF.startVideoPolling = startVideoPolling;
  YTF.cleanupAutoplay = cleanupAutoplay;
})(window.YTF);
