// ==UserScript==
// @include   main
// @ignorecache
// ==/UserScript==
(function () {
  "use strict";

  // Use Components for Firefox compatibility
  const { classes: Cc, interfaces: Ci } = Components;

  // Wait for browser window to be ready
  if (location.href !== "chrome://browser/content/browser.xhtml") return;

  // --- Configuration ---
  const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";
  const MISTRAL_MODEL = "pixtral-large-latest";
  let ENABLE_AI_RENAMING = true;
  const MISTRAL_API_KEY_PREF = "extensions.downloads.mistral_api_key";
  const DISABLE_AUTOHIDE_PREF = "extensions.downloads.disable_autohide";
  const DEBUG_LOGGING_PREF = "extensions.downloads.enable_debug";
  const AI_RENAMING_MAX_FILENAME_LENGTH = 70;
  const CARD_AUTOHIDE_DELAY_MS = 15000;
  const MAX_CARDS_DOM_LIMIT = 10;
  const CARD_INTERACTION_GRACE_PERIOD_MS = 5000;
  const MAX_FILE_SIZE_FOR_AI = 50 * 1024 * 1024; // 50MB limit
  const IMAGE_EXTENSIONS = new Set([
    ".jpg",
    ".jpeg",
    ".png", 
    ".gif",
    ".webp",
    ".bmp",
    ".svg",
    ".avif",
    ".ico",
    ".tif",
    ".tiff",
    ".jfif",
  ]);

  // Platform-agnostic path separator detection
  const PATH_SEPARATOR = navigator.platform.includes("Win") ? "\\" : "/";

  // Global state variables
  let downloadCardsContainer;
  const activeDownloadCards = new Map();
  let renamedFiles = new Set();
  let aiRenamingPossible = false;
  let cardUpdateThrottle = new Map(); // Prevent rapid updates
  let currentZenSidebarWidth = ""; // <-- ADDED: Global variable for sidebar width
  let DEBUG_LOGGING = false;

  // Add debug logging function
  function debugLog(message, data = null) {
    if (!DEBUG_LOGGING) return;
    const timestamp = new Date().toISOString();
    if (data) {
      console.log(`[${timestamp}] Download Preview: ${message}`, data);
    } else {
      console.log(`[${timestamp}] Download Preview: ${message}`);
    }
  }

  // Improved key generation for downloads
  function getDownloadKey(download) {
    // Use target path as primary key since id is often undefined
    if (download?.target?.path) {
      return download.target.path;
    }
    if (download?.id) {
      return download.id;
    }
    // Generate a temporary key based on URL and timestamp
    const url = download?.source?.url || download?.url || "unknown";
    return `temp_${url}_${Date.now()}`;
  }

  // Get safe filename from download object
  function getSafeFilename(download) {
    // Try multiple sources for filename
    if (download.filename) return download.filename;
    if (download.target?.path) {
      return download.target.path.split(/[\\/]/).pop();
    }
    if (download.source?.url) {
      const url = download.source.url;
      const match = url.match(/\/([^\/\?]+)$/);
      if (match) return match[1];
    }
    return "Untitled";
  }

  // Robust initialization
  function init() {
    debugLog("Starting initialization");
    if (!window.Downloads?.getList) {
      if (DEBUG_LOGGING) console.error("Download Preview Mistral AI: Downloads API not available");
      aiRenamingPossible = false;
      ENABLE_AI_RENAMING = false;
      return;
    }
    try {
      window.Downloads.getList(window.Downloads.ALL)
        .then(async (list) => {
          if (list) {
            debugLog("Downloads API verified");
            await verifyMistralConnection();
            DEBUG_LOGGING = getPref(DEBUG_LOGGING_PREF, false);
            if (aiRenamingPossible) {
              debugLog("AI renaming enabled - all systems verified");
            } else {
              debugLog("AI renaming disabled - Mistral connection failed");
            }
            initDownloadManager();
            initSidebarWidthSync(); // <-- ADDED: Call to initialize sidebar width syncing
            debugLog("Initialization complete");
          }
        })
        .catch((e) => {
          if (DEBUG_LOGGING) console.error("Downloads API verification failed:", e);
          aiRenamingPossible = false;
          ENABLE_AI_RENAMING = false;
        });
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Download Preview Mistral AI: Init failed", e);
      aiRenamingPossible = false;
      ENABLE_AI_RENAMING = false;
    }
  }

  // Wait for window load
  if (document.readyState === "complete") {
    init();
  } else {
    window.addEventListener("load", init, { once: true });
  }

  // Download manager UI and listeners
  function initDownloadManager() {
    try {
      // Create container if it doesn't exist
      downloadCardsContainer = document.getElementById(
        "userchrome-download-cards-container"
      );
      if (!downloadCardsContainer) {
        downloadCardsContainer = document.createElement("div");
        downloadCardsContainer.id = "userchrome-download-cards-container";
        document.body.appendChild(downloadCardsContainer);
      }

      // Inject CSS styles for download cards if not already present
      if (!document.getElementById("userchrome-download-card-styles")) {
        const style = document.createElement("style");
        style.id = "userchrome-download-card-styles";
        document.head.appendChild(style);
      }

      // Attach listeners
      let downloadListener = {
        onDownloadAdded: (dl) => throttledCreateOrUpdateCard(dl),
        onDownloadChanged: (dl) => throttledCreateOrUpdateCard(dl),
        onDownloadRemoved: (dl) => removeCard(getDownloadKey(dl), false),
      };

      window.Downloads.getList(window.Downloads.ALL)
        .then((list) => {
          list.addView(downloadListener);
          list.getAll().then((all) =>
            all.forEach((dl) => {
              throttledCreateOrUpdateCard(dl, true);
            })
          );
        })
        .catch((e) => { if (DEBUG_LOGGING) console.error("DL Preview Mistral AI: List error:", e); });
    } catch (e) {
      if (DEBUG_LOGGING) console.error("DL Preview Mistral AI: Init error", e);
    }
  }

  // Throttled update to prevent rapid calls
  function throttledCreateOrUpdateCard(download, isNewCardOnInit = false) {
    const key = getDownloadKey(download);
    const now = Date.now();
    const lastUpdate = cardUpdateThrottle.get(key) || 0;

    // Only allow updates every 100ms unless it's the final state
    if (
      now - lastUpdate < 100 &&
      !download.succeeded &&
      !download.error &&
      !download.canceled
    ) {
      return;
    }

    cardUpdateThrottle.set(key, now);
    createOrUpdateCard(download, isNewCardOnInit);
  }

  // Function to create or update a download card - FIXED VERSION
  function createOrUpdateCard(download, isNewCardOnInit = false) {
    const key = getDownloadKey(download);
    if (!key) {
      debugLog("Skipping download object without usable key", download);
      return null;
    }

    // Enhanced diagnostic logging
    debugLog("[FUNC] createOrUpdateCard called", {
      key,
      succeeded: download.succeeded,
      error: download.error,
      bytesReceived: download.bytesReceived,
      currentBytes: download.currentBytes,
      totalBytes: download.totalBytes,
      hasProgress: download.hasProgress,
      state: download.state,
      availableKeys: Object.keys(download),
    });

    // Get or create card data
    let cardData = activeDownloadCards.get(key);
    const safeFilename = getSafeFilename(download);
    const displayName = download.aiName || safeFilename;

    if (!cardData) {
      // Create new card
      const cardElement = document.createElement("div");
      cardElement.className = "modern-download-card";
      cardElement.id = `userchrome-download-card-${Date.now()}`;
      cardElement.dataset.downloadKey = key;

      try {
        cardElement.innerHTML = `
          <div class="card-preview-container"></div>
          <div class="details-tooltip">
            <div class="card-status-line">
              <div class="card-progress">Calculating size...</div>
              <div class="card-status">Starting download...</div>
            </div>
            <div class="card-filenames">
              <div class="card-title">${displayName}</div>
              <div class="card-renamed-filename"></div>
              <div class="card-old-filename"></div>
            </div>
            <span class="card-close-button" title="Close" tabindex="0" role="button">✕</span>
            <span class="card-undo-button" title="Undo Rename" tabindex="0" role="button" style="display: none;">↩</span>
            <div class="tooltip-tail"></div>
          </div>
        `;

        // Add close handler - targets button inside tooltip
        const closeBtn = cardElement.querySelector(
          ".details-tooltip .card-close-button"
        );
        if (closeBtn) {
          const closeHandler = (e) => {
            debugLog(`Close button handler triggered by: ${e.type}`, { event: e });
            e.preventDefault();
            e.stopPropagation();
            // Find the current key for this card element dynamically
            let currentKey = null;
            for (const [mapKey, mapData] of activeDownloadCards.entries()) {
              if (mapData.cardElement === cardElement) {
                currentKey = mapKey;
                break;
              }
            }
            if (currentKey) {
              removeCard(currentKey, true);
            } else {
              // Fallback: remove the DOM element directly if not found in map
              debugLog(
                "Card not found in activeDownloadCards, removing DOM element directly"
              );
              if (cardElement.parentNode) {
                cardElement.style.transition = "opacity 0.3s";
                cardElement.style.opacity = "0";
                setTimeout(() => {
                  if (cardElement.parentNode) {
                    cardElement.parentNode.removeChild(cardElement);
                  }
                }, 300);
              }
            }
          };
          closeBtn.addEventListener("click", closeHandler);
          closeBtn.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              closeHandler(e);
            }
          });
        }

        // Add undo handler
        const undoBtn = cardElement.querySelector(
          ".details-tooltip .card-undo-button"
        );
        if (undoBtn) {
          const undoHandler = async (e) => {
            debugLog(`Undo button handler triggered by: ${e.type}`, { event: e });
            e.preventDefault();
            e.stopPropagation();

            debugLog("Undo Rename: Button clicked.", { event: e });

            let currentCardData = activeDownloadCards.get(
              cardElement.dataset.downloadKey
            );
            debugLog("Undo Rename: Retrieved card data.", {
              key: cardElement.dataset.downloadKey,
              cardData: currentCardData,
            });

            if (
              !currentCardData ||
              !currentCardData.download ||
              !currentCardData.originalFilename
            ) {
              debugLog(
                "Undo Rename: Card data or original filename missing. Aborting.",
                {
                  key: cardElement.dataset.downloadKey,
                  cardData: currentCardData,
                }
              );
              return;
            }

            debugLog("Undo Rename: Attempting to undo rename.", {
              key: currentCardData.key,
              original: currentCardData.originalFilename,
              current:
                currentCardData.download.aiName ||
                getSafeFilename(currentCardData.download),
              downloadObject: currentCardData.download,
            });

            // Hide the button immediately
            const undoBtn = cardElement.querySelector(".card-undo-button"); // Re-get button reference
            if (undoBtn) {
              undoBtn.style.display = "none";
              debugLog("Undo Rename: Hidden undo button.");
            }

            // Attempt to rename back to original
            const success = await renameDownloadFileAndUpdateRecord(
              currentCardData.download,
              currentCardData.originalFilename,
              currentCardData.key // Use the current key (which is the renamed path)
            );

            const statusEl = cardElement.querySelector(".card-status");
            const titleEl = cardElement.querySelector(".card-title");
            const renamedFilenameEl = cardElement.querySelector(
              ".card-renamed-filename"
            );
            const oldFilenameEl =
              cardElement.querySelector(".card-old-filename");

            if (success) {
              debugLog("Undo Rename: Success");
              // Revert UI state
              currentCardData.download.aiName = null; // Clear AI name
              if (statusEl) {
                statusEl.textContent = "Rename undone";
                statusEl.classList.remove("status-completed"); // Assuming it was completed
                statusEl.classList.add("status-downloading"); // Or a specific 'status-undone' class if desired
                debugLog("Undo Rename: Status updated to 'Rename undone'.");
              }
              if (titleEl) titleEl.style.display = "block";
              if (renamedFilenameEl) renamedFilenameEl.style.display = "none";
              if (oldFilenameEl) oldFilenameEl.style.display = "none";
              // Update the visible title text
              if (titleEl) {
                const revertedName = getSafeFilename(currentCardData.download); // Get filename from potentially updated download object
                titleEl.textContent = revertedName;
                titleEl.title = revertedName;
              }

              // Optional: Schedule removal after a short delay
              scheduleCardRemoval(currentCardData.key); // Re-schedule auto-hide if desired after undo
            } else {
              debugLog("Undo Rename: Failed");
              if (statusEl) {
                statusEl.textContent = "Undo failed";
                statusEl.classList.remove("status-downloading");
                statusEl.classList.add("status-error");
              }
              // If undo failed, maybe show the undo button again? Or leave it hidden? Leaving hidden for now.
            }
          };

          undoBtn.addEventListener("click", undoHandler);
          undoBtn.addEventListener("keydown", async (e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              await undoHandler(e);
            }
          });
        }

        // Set initial preview and add click listener to open file
        const previewElement = cardElement.querySelector(
          ".card-preview-container"
        );
        if (previewElement) {
          setGenericIcon(
            previewElement,
            download.contentType || "application/octet-stream"
          );
          previewElement.title = "Click to open file"; // Tooltip

          previewElement.addEventListener("click", (e) => {
            e.stopPropagation(); // Prevent card close if preview is inside other clickable areas
            const currentCardData = activeDownloadCards.get(
              cardElement.dataset.downloadKey
            );
            if (currentCardData && currentCardData.download) {
              openDownloadedFile(currentCardData.download);
            } else {
              // Fallback if key changed or data is missing, try with the initial download object
              // This might be less reliable if path changed due to rename and was not updated on original 'download' ref
              debugLog(
                "openDownloadedFile: Card data not found by key, attempting with initial download object",
                { key: cardElement.dataset.downloadKey }
              );
              openDownloadedFile(download);
            }
          });
        }

        // Store card data
        cardData = {
          cardElement,
          download,
          complete: false,
          key: key,
          originalFilename: safeFilename,
          lastInteractionTime: Date.now(),
        };

        activeDownloadCards.set(key, cardData);

        // Instead of appending and animating here, call the observer function
        // if it's a truly new card (not just an update that missed the map earlier)
        // The isNewCardOnInit flag might be true for existing downloads if script reloads,
        // so we also check if it's already in the DOM just in case.
        if (!document.getElementById(cardElement.id)) {
          cardData.isWaitingForZenAnimation = true;
          initZenAnimationObserver(key, cardElement);
        } else {
          // If card element somehow already exists in DOM but not in map (e.g. script reload with orphaned cards),
          // just ensure it's visible. This is a fallback.
          cardElement.style.opacity = "1";
          cardElement.style.transform = "scale(1) translateY(0)";
          const tooltip = cardElement.querySelector(".details-tooltip");
          if (tooltip) {
            tooltip.style.opacity = "1";
            tooltip.style.transform = "scaleY(1) translateY(0)";
          }
          if (downloadCardsContainer && !cardElement.parentNode) {
            downloadCardsContainer.appendChild(cardElement);
          }
        }
      } catch (domErr) {
        debugLog("Error creating download card DOM:", domErr);
        return null;
      }
    } else {
      // Update existing card
      cardData.download = download; // Update download reference
    }

          // Update card content (elements are now inside the tooltip)
          const cardElement = cardData.cardElement;
          const tooltipElement = cardElement.querySelector(".details-tooltip");
          debugLog(`Card data stored for downloadKey: ${key}`);
          debugLog(`Active download cards:`, activeDownloadCards);
          debugLog(`Active download cards:`, activeDownloadCards);

    // If for some reason tooltip is not there (e.g. error during creation), bail out
    if (!tooltipElement) {
      debugLog("Error: Tooltip element not found on existing card.", { key });
      return cardElement;
    }

    // Dynamically set tooltip width based on currentZenSidebarWidth (synced globally)
    debugLog(
      `[TooltipWidth] Using global currentZenSidebarWidth: '${currentZenSidebarWidth}'`
    );
    if (
      currentZenSidebarWidth &&
      currentZenSidebarWidth !== "0px" &&
      !isNaN(parseFloat(currentZenSidebarWidth))
    ) {
      tooltipElement.style.width = `calc(${currentZenSidebarWidth} - 10px)`;
      debugLog(
        `[TooltipWidth] Attempting to set tooltip total width to: calc(${currentZenSidebarWidth} - 10px)`
      );
    } else {
      debugLog(
        `[TooltipWidth] Global currentZenSidebarWidth is invalid ('${currentZenSidebarWidth}') or not a usable number. Using default tooltip width (250px total).`
      );
      tooltipElement.style.width = "250px"; // Explicitly set fallback width
    }

    const statusElement = tooltipElement.querySelector(".card-status");
    const titleElement = tooltipElement.querySelector(".card-title");
    const renamedFilenameElement = tooltipElement.querySelector(
      ".card-renamed-filename"
    );
    const oldFilenameElement =
      tooltipElement.querySelector(".card-old-filename");
    const progressElement = tooltipElement.querySelector(".card-progress");

    // Update status based on download state
    if (statusElement) {
      // Remove all previous status classes
      statusElement.classList.remove(
        "status-starting",
        "status-downloading",
        "status-completed",
        "status-error",
        "status-canceled"
      );

      if (download.error) {
        statusElement.textContent = `Error: ${
          download.error.message || "Download failed"
        }`;
        statusElement.classList.add("status-error");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
      } else if (download.canceled) {
        statusElement.textContent = "Download canceled";
        statusElement.classList.add("status-canceled");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
      } else if (download.succeeded) {
        statusElement.textContent = "Download completed";
        statusElement.classList.add("status-completed");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
        // Mark as complete and set preview
        if (!cardData.complete) {
          cardData.complete = true;
          cardElement.classList.add("completed");
          const previewElement = cardElement.querySelector(
            ".card-preview-container"
          );
          if (previewElement) {
            // Await the preview setting since it can now be async (for text snippets)
            setCompletedFilePreview(previewElement, download).catch((e) =>
              debugLog("Error setting completed file preview (async)", {
                error: e,
                download,
              })
            );
          }
          // Process AI renaming if enabled
          if (
            ENABLE_AI_RENAMING &&
            aiRenamingPossible &&
            download.target?.path &&
            !renamedFiles.has(download.target.path)
          ) {
            setTimeout(() => {
              processDownloadForAIRenaming(download, safeFilename, key).catch(
                (e) => { if (DEBUG_LOGGING) console.error("Error in AI renaming:", e); }
              );
            }, 1500); // Delay to ensure file is fully written before AI processing starts
          } else {
            // If AI renaming is disabled or not possible, schedule removal now.
            debugLog("AI renaming skipped or not possible, scheduling card removal now.");
            scheduleCardRemoval(key);
          }
          // Schedule auto-hide is handled after AI processing completes or is skipped
        }
      } else if (
        typeof download.currentBytes === "number" &&
        download.totalBytes > 0 &&
        download.hasProgress
      ) {
        // Use currentBytes
        const percent = Math.round(
          (download.currentBytes / download.totalBytes) * 100
        );
        statusElement.textContent = `Downloading... ${percent}%`;
        statusElement.classList.add("status-downloading");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
      } else if (!download.succeeded && !download.error && !download.canceled) {
        // Generic in-progress state
        statusElement.textContent = "Downloading...";
        statusElement.classList.add("status-downloading");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
      } else {
        statusElement.textContent = "Starting download...";
        statusElement.classList.add("status-starting");
        if (renamedFilenameElement)
          renamedFilenameElement.style.display = "none";
        if (oldFilenameElement) oldFilenameElement.style.display = "none";
      }
    }

    // Update filename if AI renamed
    if (
      titleElement &&
      renamedFilenameElement &&
      renamedFilenameElement.style.display === "block"
    ) {
      // If renamed, show only the renamed filename and hide the original title
      titleElement.style.display = "none";
      renamedFilenameElement.style.display = "block";
      // Show old filename if available
      if (oldFilenameElement) {
        oldFilenameElement.textContent =
          cardData?.originalFilename || safeFilename;
        oldFilenameElement.style.display = "block";
      }
    } else if (titleElement) {
      // If not renamed, show the original title and hide the renamed filename and old filename
      titleElement.style.display = "block";
      if (renamedFilenameElement) renamedFilenameElement.style.display = "none";
      if (oldFilenameElement) oldFilenameElement.style.display = "none";
    }

    // Update progress info
    if (progressElement) {
      if (download.succeeded) {
        let finalSize = download.currentBytes; // Use currentBytes first
        // If currentBytes is not a valid number or is 0, try totalBytes.
        if (!(typeof finalSize === "number" && finalSize > 0)) {
          finalSize = download.totalBytes;
        }
        progressElement.textContent = `${formatBytes(finalSize || 0)}`;
      } else if (
        typeof download.currentBytes === "number" &&
        download.totalBytes > 0
      ) {
        // Use currentBytes
        const downloaded = formatBytes(download.currentBytes);
        const total = formatBytes(download.totalBytes);
        progressElement.textContent = `${downloaded} / ${total}`;
      } else if (!download.succeeded && !download.error && !download.canceled) {
        // If actively downloading but no numbers yet
        progressElement.textContent = "Processing...";
      } else {
        // Initial state or unknown
        progressElement.textContent = "Calculating size...";
      }
    }

    return cardElement;
  }

  // Improved card removal function
  function removeCard(downloadKey, force = false) {
    try {
      debugLog(`Attempting to remove card for downloadKey: ${downloadKey}`);
      const cardData = activeDownloadCards.get(downloadKey);
      debugLog(`Active download cards before removal:`, activeDownloadCards);
      if (!cardData) {
        debugLog(`removeCard: No card data found for key: ${downloadKey}`);
        return false;
      }

      const cardElement = cardData.cardElement;
      if (!cardElement) {
        debugLog(`removeCard: No card element found for key: ${downloadKey}`);
        return false;
      }

      // Don't remove if user has interacted recently unless forced
      if (
        !force &&
        cardData.lastInteractionTime &&
        Date.now() - cardData.lastInteractionTime <
          CARD_INTERACTION_GRACE_PERIOD_MS
      ) {
        debugLog(
          `removeCard: Skipping removal due to recent interaction: ${downloadKey}`
        );
        return false;
      }

      const tooltipElement = cardElement.querySelector(".details-tooltip");

      // Stage 1: Animate tooltip out
      if (tooltipElement) {
        tooltipElement.style.transition =
          "opacity 0.2s ease-in, transform 0.2s ease-in";
        tooltipElement.style.opacity = "0";
        tooltipElement.style.transform = "scaleY(0.8) translateY(10px)";
      }

      // Stage 2: Animate card pod out (after a delay for tooltip animation)
      setTimeout(
        () => {
          cardElement.style.transition =
            "opacity 0.3s ease-in, transform 0.3s cubic-bezier(0.55, 0.085, 0.68, 0.53)";
          cardElement.style.opacity = "0";
          cardElement.style.transform = "translateX(-70px) scale(0.9)";

          // Stage 3: Remove from DOM after pod animation finishes
          setTimeout(() => {
            if (cardElement.parentNode) {
              cardElement.parentNode.removeChild(cardElement);
            }
              debugLog(`Card data removed for downloadKey: ${downloadKey}`);
              activeDownloadCards.delete(downloadKey);
              cardUpdateThrottle.delete(downloadKey);
              debugLog(`Card removed for download: ${downloadKey}`);
          }, 300); // Corresponds to pod animation duration (0.3s)
        },
        tooltipElement ? 150 : 0
      ); // Delay for pod animation: 150ms if tooltip existed, 0 otherwise

      return true;
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Error removing card:", e);
      return false;
    }
  }

  function scheduleCardRemoval(downloadKey) {
    try {
      const disableAutohide = getPref(DISABLE_AUTOHIDE_PREF, false);
      if (disableAutohide) return;

      debugLog(`Scheduling removal for downloadKey: ${downloadKey}`);
      setTimeout(() => {
        debugLog(`Removing card for downloadKey: ${downloadKey}`);
        debugLog(`Active download cards before scheduling removal:`, activeDownloadCards);
        removeCard(downloadKey, false);
      }, CARD_AUTOHIDE_DELAY_MS);
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Error scheduling card removal:", e);
    }
  }

  // Helper function to get preferences
  function getPref(prefName, defaultValue) {
    try {
      const prefService = Cc["@mozilla.org/preferences-service;1"].getService(
        Ci.nsIPrefService
      );
      const branch = prefService.getBranch("");

      if (typeof defaultValue === "boolean") {
        return branch.getBoolPref(prefName, defaultValue);
      } else if (typeof defaultValue === "string") {
        return branch.getStringPref(prefName, defaultValue);
      } else if (typeof defaultValue === "number") {
        return branch.getIntPref(prefName, defaultValue);
      }
      return defaultValue;
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Error getting preference:", e);
      return defaultValue;
    }
  }

  // Set generic icon for file type
  function setGenericIcon(previewElement, contentType) {
    if (!previewElement) return;
    try {
      let icon = "📄";
      if (typeof contentType === "string") {
        if (contentType.includes("image/")) icon = "🖼️";
        else if (contentType.includes("video/")) icon = "🎬";
        else if (contentType.includes("audio/")) icon = "🎵";
        else if (contentType.includes("text/")) icon = "📝";
        else if (contentType.includes("application/pdf")) icon = "📕";
        else if (
          contentType.includes("application/zip") ||
          contentType.includes("application/x-rar")
        )
          icon = "🗜️";
        else if (contentType.includes("application/")) icon = "📦";
      }
      previewElement.innerHTML = `<span class="generic-icon">${icon}</span>`;
    } catch (e) {
      debugLog("Error setting generic icon:", e);
      previewElement.innerHTML = `<span class="generic-icon">📄</span>`;
    }
  }

  // Set preview for completed image file
  async function setCompletedFilePreview(previewElement, download) {
    if (!previewElement) return;

    debugLog("[setCompletedFilePreview] Called", {
      contentType: download?.contentType,
      targetPath: download?.target?.path,
      filename: download?.filename,
    });

    const textMimeTypes = new Set([
      "text/plain",
      "text/markdown",
      "application/javascript",
      "text/javascript",
      "text/css",
      "text/html",
      "application/json",
      "application/xml",
      "text/xml",
      // Add more as needed
    ]);

    try {
      if (
        download.target?.path &&
        textMimeTypes.has(download.contentType?.toLowerCase())
      ) {
        const snippet = await readTextFileSnippet(download.target.path);
        if (snippet) {
          previewElement.innerHTML = ""; // Clear previous content
          const pre = document.createElement("pre");
          pre.textContent = snippet;
          pre.classList.add("text-preview");
          previewElement.appendChild(pre);
          debugLog("[setCompletedFilePreview] Text snippet preview set", {
            path: download.target.path,
          });
          return; // Snippet set, exit
        }
      } else if (
        download?.contentType?.startsWith("image/") &&
        download.target?.path
      ) {
        // Existing image preview logic (good first check)
        debugLog(
          "[setCompletedFilePreview] Attempting image preview via contentType",
          { path: download.target.path, contentType: download.contentType }
        );
        const img = document.createElement("img");
        const imgSrc = `file:///${download.target.path.replace(/\\/g, "/")}`;
        img.src = imgSrc;
        img.classList.add("image-preview");

        img.onload = () => {
          img.style.opacity = "1"; // Opacity is part of the animation, keep in JS
          debugLog(
            "[setCompletedFilePreview] Image loaded successfully (by contentType)",
            { src: imgSrc }
          );
        };
        img.onerror = () => {
          if (DEBUG_LOGGING) {
            debugLog(
              "[setCompletedFilePreview] Image failed to load (by contentType)",
              { src: imgSrc }
            );
          }
          // Fallback to generic icon if even contentType-based image load fails
          setGenericIcon(previewElement, "image/generic"); // Indicate it was thought to be an image
        };

        previewElement.innerHTML = "";
        previewElement.appendChild(img);
      } else if (download.target?.path) {
        // Fallback: Check extension if contentType is missing or not an image type
        const filePath = download.target.path.toLowerCase();
        let isImageTypeByExtension = false;
        for (const ext of IMAGE_EXTENSIONS) {
          if (filePath.endsWith(ext)) {
            isImageTypeByExtension = true;
            break;
          }
        }
        if (isImageTypeByExtension) {
          debugLog(
            "[setCompletedFilePreview] Attempting image preview via file extension",
            { path: download.target.path }
          );
          const img = document.createElement("img");
          const imgSrc = `file:///${download.target.path.replace(/\\/g, "/")}`;
          img.src = imgSrc;
          img.classList.add("image-preview");

          img.onload = () => {
            img.style.opacity = "1"; // Opacity is part of the animation, keep in JS
            debugLog(
              "[setCompletedFilePreview] Image loaded successfully (by extension)",
              { src: imgSrc }
            );
          };
          img.onerror = () => {
            if (DEBUG_LOGGING) {
              debugLog(
                "[setCompletedFilePreview] Image failed to load (by extension)",
                { src: imgSrc }
              );
            }
            // Fallback to generic icon if even extension-based image load fails
            setGenericIcon(previewElement, "image/generic"); // Indicate it was thought to be an image
          };

          previewElement.innerHTML = "";
          previewElement.appendChild(img);
        } else {
          debugLog(
            "[setCompletedFilePreview] No specific preview (contentType or extension), setting generic icon",
            { contentType: download?.contentType, path: download.target.path }
          );
          setGenericIcon(previewElement, download?.contentType);
        }
      } else {
        debugLog(
          "[setCompletedFilePreview] No target path for preview, setting generic icon",
          { download }
        );
        setGenericIcon(previewElement, null); // No path, no content type known
      }
    } catch (e) {
      if (DEBUG_LOGGING) debugLog("Error setting file preview:", e);
      previewElement.innerHTML = `<span class="generic-icon">🚫</span>`;
    }
  }

  // Process download for AI renaming - with file size check
  async function processDownloadForAIRenaming(
    download,
    originalNameForUICard,
    keyOverride
  ) {
    const key = keyOverride || getDownloadKey(download);
    const cardData = activeDownloadCards.get(key);
    if (!cardData) {
      debugLog("Card data not found for download");
      return false;
    }

    const cardElement = cardData.cardElement;
    const statusEl = cardElement.querySelector(".card-status");
    if (!statusEl) return false;

    const previewElement = cardElement.querySelector(".card-preview-container");
    let originalPreviewTitle = "";
    if (previewElement) {
      originalPreviewTitle = previewElement.title;
    }

    const downloadPath = download.target.path;
    if (!downloadPath) return false;

    // Skip if already processed
    if (renamedFiles.has(downloadPath)) {
      debugLog(`Skipping rename - already processed: ${downloadPath}`);
      return false;
    }

    // Check file size before processing
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(downloadPath);
      if (file.fileSize > MAX_FILE_SIZE_FOR_AI) {
        debugLog(
          `Skipping AI rename - file too large: ${formatBytes(file.fileSize)}`
        );
        statusEl.textContent = "File too large for AI analysis";
        // Schedule auto-hide if file is too large for AI
        scheduleCardRemoval(key);
        return false;
      }
    } catch (e) {
      debugLog("Error checking file size:", e);
      return false;
    }

    renamedFiles.add(downloadPath);

    try {
      cardElement.classList.add("renaming");
      statusEl.textContent = "Analyzing file...";
      if (previewElement) {
        previewElement.style.pointerEvents = "none";
        previewElement.title = "Renaming in progress...";
      }

      const currentFilename = downloadPath.split(PATH_SEPARATOR).pop();
      const fileExtension = currentFilename.includes(".")
        ? currentFilename
            .substring(currentFilename.lastIndexOf("."))
            .toLowerCase()
        : "";

      const isImage = IMAGE_EXTENSIONS.has(fileExtension);
      debugLog(
        `Processing file: ${currentFilename} (${
          isImage ? "Image" : "Non-image"
        })`
      );

      let suggestedName = null;

      // Try image analysis for images
      if (isImage) {
        statusEl.textContent = "Analyzing image...";
        const imagePrompt = `Create a specific, descriptive filename for this image.
Rules:
- Use 2-4 specific words describing the main subject or content
- Be specific about what's in the image (e.g. "mountain-lake-sunset" not just "landscape")
- Use hyphens between words
- No generic words like "image" or "photo"
- Keep extension "${fileExtension}"
- Maximum length: ${AI_RENAMING_MAX_FILENAME_LENGTH} characters
Respond with ONLY the filename.`;

        suggestedName = await callMistralAPI({
          prompt: imagePrompt,
          localPath: downloadPath,
          fileExtension: fileExtension,
        });
      }

      // Fallback to metadata-based naming
      if (!suggestedName) {
        statusEl.textContent = "Generating better name...";
        const sourceURL = download.source?.url || "unknown";
        const metadataPrompt = `Create a specific, descriptive filename for this ${
          isImage ? "image" : "file"
        }.
Original filename: "${currentFilename}"
Download URL: "${sourceURL}"
Rules:
- Use 2-5 specific words about the content or purpose
- Be more specific than the original name
- Use hyphens between words
- Keep extension "${fileExtension}"
- Maximum length: ${AI_RENAMING_MAX_FILENAME_LENGTH} characters
Respond with ONLY the filename.`;

        suggestedName = await callMistralAPI({
          prompt: metadataPrompt,
          localPath: null,
          fileExtension: fileExtension,
        });
      }

      if (!suggestedName || suggestedName === "rate-limited") {
        debugLog("No valid name suggestion received");
        statusEl.textContent =
          suggestedName === "rate-limited"
            ? "⚠️ API rate limit reached"
            : "Could not generate a better name";
        renamedFiles.delete(downloadPath);
        // Schedule auto-hide if no valid name suggestion
        scheduleCardRemoval(key);
        return false;
      }

      // Clean and validate the suggested name
      let cleanName = suggestedName
        .replace(/[^a-zA-Z0-9\-_\.]/g, "")
        .replace(/\s+/g, "-")
        .toLowerCase();

      if (
        cleanName.length >
        AI_RENAMING_MAX_FILENAME_LENGTH - fileExtension.length
      ) {
        cleanName = cleanName.substring(
          0,
          AI_RENAMING_MAX_FILENAME_LENGTH - fileExtension.length
        );
      }

      if (
        fileExtension &&
        !cleanName.toLowerCase().endsWith(fileExtension.toLowerCase())
      ) {
        cleanName = cleanName + fileExtension;
      }

      if (
        cleanName.length <= 2 ||
        cleanName.toLowerCase() === currentFilename.toLowerCase()
      ) {
        debugLog("Skipping rename - name too short or same as original");
        renamedFiles.delete(downloadPath);
        // Schedule auto-hide if rename is skipped
        scheduleCardRemoval(key);
        return false;
      }

      debugLog(`Renaming to: ${cleanName}`);
      statusEl.textContent = `Renaming to: ${cleanName}`;

      const success = await renameDownloadFileAndUpdateRecord(
        download,
        cleanName,
        key
      );

      if (success) {
        // Update the download object and card
        download.aiName = cleanName;
        const titleEl = cardElement.querySelector(".card-title");
        const renamedFilenameEl = cardElement.querySelector(
          ".card-renamed-filename"
        );
        const oldFilenameElement =
          cardElement.querySelector(".card-old-filename");
        if (renamedFilenameEl) {
          renamedFilenameEl.textContent = cleanName;
          renamedFilenameEl.style.display = "block";
        }
        if (titleEl) {
          titleEl.style.display = "none";
        }
        if (oldFilenameElement) {
          oldFilenameElement.textContent =
            cardData.originalFilename || currentFilename;
          oldFilenameElement.style.display = "block";
        }
        statusEl.textContent = "Download renamed to:";
        statusEl.classList.add("status-completed");
        cardElement.classList.remove("renaming");
        cardElement.classList.add("renamed");

        // Show undo button after successful rename
        const undoBtn = cardElement.querySelector(".card-undo-button");
        if (undoBtn) {
          undoBtn.style.display = "block";
          debugLog("Undo Rename: Showing undo button.", { key: key });
        }

        debugLog(`Successfully renamed to: ${cleanName}`);
        // Schedule auto-hide after successful rename with the new key
        scheduleCardRemoval(cardData.key);
        return true;
      } else {
        renamedFiles.delete(downloadPath);
        statusEl.textContent = "Rename failed";
        cardElement.classList.remove("renaming");
        // Schedule auto-hide even if renaming failed
        scheduleCardRemoval(key);
        return false;
      }
    } catch (e) {
      console.error("AI Rename error:", e);
      renamedFiles.delete(downloadPath);
      statusEl.textContent = "Rename error";
      cardElement.classList.remove("renaming");
      // Schedule auto-hide even if renaming failed
      scheduleCardRemoval(key);
      return false;
    } finally {
      // Ensure preview element clickability is restored
      if (previewElement) {
        previewElement.style.pointerEvents = "auto";
        previewElement.title = originalPreviewTitle;
      }
    }
  }

  // Improved file renaming function
  async function renameDownloadFileAndUpdateRecord(download, newName, key) {
    try {
      const oldPath = download.target.path;
      if (!oldPath) throw new Error("No file path available");

      const directory = oldPath.substring(
        0,
        oldPath.lastIndexOf(PATH_SEPARATOR)
      );
      const oldFileName = oldPath.split(PATH_SEPARATOR).pop();
      const fileExt = oldFileName.includes(".")
        ? oldFileName.substring(oldFileName.lastIndexOf("."))
        : "";

      let cleanNewName = newName.trim().replace(/[\\/:*?"<>|]/g, "");
      if (fileExt && !cleanNewName.endsWith(fileExt)) {
        cleanNewName += fileExt;
      }

      // Handle duplicate names
      let finalName = cleanNewName;
      let counter = 1;
      while (counter < 100) {
        const testPath = directory + PATH_SEPARATOR + finalName;
        let exists = false;
        try {
          const testFile = Cc["@mozilla.org/file/local;1"].createInstance(
            Ci.nsIFile
          );
          testFile.initWithPath(testPath);
          exists = testFile.exists();
        } catch (e) {
          // File doesn't exist or can't access - proceed
        }
        if (!exists) break;

        const baseName = cleanNewName.includes(".")
          ? cleanNewName.substring(0, cleanNewName.lastIndexOf("."))
          : cleanNewName;
        finalName = `${baseName}-${counter}${fileExt}`;
        counter++;
      }

      const newPath = directory + PATH_SEPARATOR + finalName;
      debugLog("Rename paths", { oldPath, newPath });

      const oldFile = Cc["@mozilla.org/file/local;1"].createInstance(
        Ci.nsIFile
      );
      oldFile.initWithPath(oldPath);

      if (!oldFile.exists()) throw new Error("Source file does not exist");

      // Perform the rename
      oldFile.moveTo(null, finalName);

      // Update download record
      download.target.path = newPath;

      // Update card data key mapping
      const cardData = activeDownloadCards.get(key);
      if (cardData) {
              activeDownloadCards.delete(key);
              activeDownloadCards.set(newPath, cardData);
              cardData.key = newPath;
              // Also update the dataset key on the card element
              if (cardData.cardElement) {
                cardData.cardElement.dataset.downloadKey = newPath;
                debugLog(
                  `Updated card element dataset key from ${key} to ${newPath}`
                );
              }
              debugLog(`Updated card key mapping from ${key} to ${newPath}`);
      }

      debugLog("File renamed successfully");
      return true;
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Rename failed:", e);
      return false;
    }
  }

  function formatBytes(b, d = 2) {
    if (b === 0) return "0 B";
    const sizes = ["B", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(b) / Math.log(1024));
    return `${parseFloat((b / Math.pow(1024, i)).toFixed(d))} ${sizes[i]}`;
  }

  // Mistral API function - with better error handling
  async function callMistralAPI({ prompt, localPath, fileExtension }) {
    try {
      // Get API key
      let apiKey = "";
      try {
        const prefService = Cc["@mozilla.org/preferences-service;1"].getService(
          Ci.nsIPrefService
        );
        const branch = prefService.getBranch("");
        apiKey = branch.getStringPref(MISTRAL_API_KEY_PREF, "");
      } catch (e) {
        debugLog("Failed to get API key from preferences", e);
        return null;
      }

      if (!apiKey) {
        debugLog("No API key found");
        return null;
      }

      // Build message content
      let content = [{ type: "text", text: prompt }];

      // Add image data if provided
      if (localPath) {
        try {
          const imageBase64 = fileToBase64(localPath);
          if (imageBase64) {
            const mimeType = getMimeTypeFromExtension(fileExtension);
            content.push({
              type: "image_url",
              image_url: { url: `data:${mimeType};base64,${imageBase64}` },
            });
          }
        } catch (e) {
          debugLog("Failed to encode image, proceeding without it", e);
        }
      }

      const payload = {
        model: MISTRAL_MODEL,
        messages: [{ role: "user", content: content }],
        max_tokens: 100,
        temperature: 0.2,
      };

      debugLog("Sending API request to Mistral");

      const response = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        if (response.status === 429) return "rate-limited";
        debugLog(`API error ${response.status}: ${response.statusText}`);
        return null;
      }

      const data = await response.json();
      debugLog("Raw API response:", data);

      return data.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      if (DEBUG_LOGGING) console.error("Mistral API error:", error);
      return null;
    }
  }

  function getMimeTypeFromExtension(ext) {
    switch (ext?.toLowerCase()) {
      case ".png":
        return "image/png";
      case ".gif":
        return "image/gif";
      case ".svg":
        return "image/svg+xml";
      case ".webp":
        return "image/webp";
      case ".bmp":
        return "image/bmp";
      case ".avif":
        return "image/avif";
      case ".ico":
        return "image/x-icon";
      case ".tif":
        return "image/tiff";
      case ".tiff":
        return "image/tiff";
      case ".jfif":
        return "image/jpeg";
      default:
        return "image/jpeg";
    }
  }

  function fileToBase64(path) {
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(path);

      // Check file size
      if (file.fileSize > MAX_FILE_SIZE_FOR_AI) {
        debugLog("File too large for base64 conversion");
        return null;
      }

      const fstream = Cc[
        "@mozilla.org/network/file-input-stream;1"
      ].createInstance(Ci.nsIFileInputStream);
      fstream.init(file, -1, 0, 0);

      const bstream = Cc["@mozilla.org/binaryinputstream;1"].createInstance(
        Ci.nsIBinaryInputStream
      );
      bstream.setInputStream(fstream);

      const bytes = bstream.readBytes(file.fileSize);
      fstream.close();
      bstream.close();

      // Convert to base64 in chunks to avoid memory issues
      const chunks = [];
      const CHUNK_SIZE = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
        chunks.push(
          String.fromCharCode.apply(
            null,
            bytes
              .slice(i, i + CHUNK_SIZE)
              .split("")
              .map((c) => c.charCodeAt(0))
          )
        );
      }

      return btoa(chunks.join(""));
    } catch (e) {
      debugLog("fileToBase64 error:", e);
      return null;
    }
  }

  // --- Helper Function to Read Text File Snippet ---
  async function readTextFileSnippet(
    filePath,
    maxLines = 5,
    maxLengthPerLine = 80
  ) {
    let fstream = null;
    let scriptableStream = null;
    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(filePath);

      if (!file.exists() || !file.isReadable()) {
        debugLog(
          "readTextFileSnippet: File does not exist or is not readable",
          { filePath }
        );
        return null;
      }

      if (file.fileSize === 0) {
        return "[Empty file]";
      }

      if (file.fileSize > 1 * 1024 * 1024) {
        // 1MB limit for snippet reading
        debugLog("readTextFileSnippet: File too large for snippet", {
          filePath,
          fileSize: file.fileSize,
        });
        return "[File too large for preview]";
      }

      fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
        Ci.nsIFileInputStream
      );
      fstream.init(file, -1, 0, 0);

      scriptableStream = Cc[
        "@mozilla.org/scriptableinputstream;1"
      ].createInstance(Ci.nsIScriptableInputStream);
      scriptableStream.init(fstream);

      const textDecoder = new TextDecoder("utf-8");
      let lineBuffer = "";
      let linesRead = 0;
      let outputLines = [];
      const bufferSize = 4096; // How much to read at a time
      let chunk = "";

      while (linesRead < maxLines) {
        // Read a chunk of data. scriptableStream.read returns a string of bytes here.
        let byteString = scriptableStream.read(bufferSize);
        if (byteString.length === 0) {
          // EOF
          if (lineBuffer.length > 0) {
            let trimmedLine = lineBuffer.trimEnd();
            if (trimmedLine.length > maxLengthPerLine) {
              trimmedLine = trimmedLine.substring(0, maxLengthPerLine) + "...";
            }
            outputLines.push(trimmedLine);
            linesRead++;
          }
          break; // Exit while loop
        }

        // Decode the byte string to a proper UTF-8 string.
        // Need to be careful with characters split across chunks. Pass {stream: true} to decoder.
        lineBuffer += textDecoder.decode(
          Uint8Array.from(byteString, (c) => c.charCodeAt(0)),
          { stream: true }
        );

        let eolIndex;
        // Process all complete lines found in the buffer
        while (
          (eolIndex = lineBuffer.indexOf("\n")) !== -1 &&
          linesRead < maxLines
        ) {
          let currentLine = lineBuffer.substring(0, eolIndex);
          let trimmedLine = currentLine.trimEnd();
          if (trimmedLine.length > maxLengthPerLine) {
            trimmedLine = trimmedLine.substring(0, maxLengthPerLine) + "...";
          }
          outputLines.push(trimmedLine);
          linesRead++;
          lineBuffer = lineBuffer.substring(eolIndex + 1);
        }

        // If we've read maxLines, but there's still unprocessed data in lineBuffer (without a newline)
        // and we still have capacity in outputLines (this check is mostly for safety, might be redundant)
        if (
          linesRead >= maxLines &&
          lineBuffer.length > 0 &&
          outputLines.length === maxLines
        ) {
          // If the last processed line made us hit maxLines, and there's a remainder,
          // we might want to indicate truncation on the *last added line* if it wasn't already done.
          // For now, this will just mean the lineBuffer remainder is ignored if maxLines is hit.
        }
      }

      // After the loop, if maxLines was not reached and there's still data in lineBuffer (last line without newline)
      if (linesRead < maxLines && lineBuffer.length > 0) {
        let trimmedLine = lineBuffer.trimEnd();
        if (trimmedLine.length > maxLengthPerLine) {
          trimmedLine = trimmedLine.substring(0, maxLengthPerLine) + "...";
        }
        outputLines.push(trimmedLine);
      }

      if (outputLines.length === 0) {
        // This might happen if the file is very small and only newlines, or other edge cases.
        return "[Could not read snippet contents]";
      }

      return outputLines.join("\n");
    } catch (ex) {
      debugLog("readTextFileSnippet error:", {
        filePath,
        error: ex.message,
        stack: ex.stack,
      });
      return "[Error reading file preview]";
    } finally {
      if (scriptableStream && typeof scriptableStream.close === "function") {
        try {
          scriptableStream.close();
        } catch (e) {
          debugLog("Error closing scriptableStream", { e });
        }
      }
      if (fstream && typeof fstream.close === "function") {
        try {
          fstream.close();
        } catch (e) {
          debugLog("Error closing fstream in finally", { e });
        }
      }
    }
  }

  // --- Function to Open Downloaded File ---
  function openDownloadedFile(download) {
    if (!download || !download.target || !download.target.path) {
      debugLog("openDownloadedFile: Invalid download object or path", {
        download,
      });
      return;
    }

    const filePath = download.target.path;
    debugLog("openDownloadedFile: Attempting to open file", { filePath });

    try {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(filePath);

      if (file.exists() && file.isReadable()) {
        file.launch(); // Opens with default system application
      } else {
        debugLog("openDownloadedFile: File does not exist or is not readable", {
          filePath,
        });
        // Optionally, notify the user via the card status or an alert
        // For now, just logging.
      }
    } catch (ex) {
      debugLog("openDownloadedFile: Error launching file", {
        filePath,
        error: ex.message,
        stack: ex.stack,
      });
      // Optionally, notify the user
    }
  }

  // Verify Mistral API connection
  async function verifyMistralConnection() {
    try {
      let apiKey = "";
      try {
        const prefService = Cc["@mozilla.org/preferences-service;1"].getService(
          Ci.nsIPrefService
        );
        const branch = prefService.getBranch("");
        apiKey = branch.getStringPref(MISTRAL_API_KEY_PREF, "");
      } catch (e) {
        console.error("Failed to get API key from preferences", e);
        aiRenamingPossible = false;
        ENABLE_AI_RENAMING = false;
        return;
      }

      if (!apiKey) {
        debugLog(
          "No Mistral API key found in preferences. AI renaming disabled."
        );
        aiRenamingPossible = false;
        ENABLE_AI_RENAMING = false;
        return;
      }

      const testResponse = await fetch(MISTRAL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: MISTRAL_MODEL,
          messages: [
            { role: "system", content: "You are a helpful assistant." },
            {
              role: "user",
              content: "Hello, this is a test connection. Respond with 'ok'.",
            },
          ],
          max_tokens: 5,
        }),
      });

      if (testResponse.ok) {
        debugLog("Mistral API connection successful!");
        aiRenamingPossible = true;
        ENABLE_AI_RENAMING = true;
      } else {
        if (DEBUG_LOGGING) console.error(
          "Mistral API connection failed:",
          await testResponse.text()
        );
        aiRenamingPossible = false;
        ENABLE_AI_RENAMING = false;
      }
    } catch (e) {
      if (DEBUG_LOGGING) console.error("Error verifying Mistral API connection:", e);
      aiRenamingPossible = false;
      ENABLE_AI_RENAMING = false;
    }
  }

  if (DEBUG_LOGGING) {
    console.log(
      "Download Preview Mistral AI Script (FINAL FIXED): Execution finished, initialization scheduled/complete."
    );
  }

  // --- Sidebar Width Synchronization Logic ---
  function updateCurrentZenSidebarWidth() {
    const mainWindow = document.getElementById("main-window");
    const toolbox = document.getElementById("navigator-toolbox");

    if (!toolbox) {
      debugLog(
        "[SidebarWidthSync] #navigator-toolbox not found. Cannot read --zen-sidebar-width."
      );
      // currentZenSidebarWidth = ''; // Let it retain its value if toolbox temporarily disappears? Or clear?
      // For now, if toolbox isn't there, we can't update, so we do nothing to the existing value.
      return;
    }

    // Log compact mode for context, but don't block the read based on it.
    if (mainWindow) {
      const isCompact = mainWindow.getAttribute("zen-compact-mode") === "true";
      debugLog(
        `[SidebarWidthSync] #main-window zen-compact-mode is currently: ${isCompact}. Attempting to read from #navigator-toolbox.`
      );
    } else {
      debugLog(
        "[SidebarWidthSync] #main-window not found. Attempting to read from #navigator-toolbox."
      );
    }

    const value = getComputedStyle(toolbox)
      .getPropertyValue("--zen-sidebar-width")
      .trim();

    if (value && value !== "0px" && value !== "") {
      if (currentZenSidebarWidth !== value) {
        currentZenSidebarWidth = value;
        debugLog(
          "[SidebarWidthSync] Updated currentZenSidebarWidth from #navigator-toolbox to:",
          value
        );
        applyGlobalWidthToAllTooltips(); // Apply to existing tooltips
      } else {
        debugLog(
          "[SidebarWidthSync] --zen-sidebar-width from #navigator-toolbox is unchanged (" +
            value +
            "). No update to tooltips needed."
        );
      }
    } else {
      // If the value is empty, "0px", or not set, it implies the sidebar isn't in a state where this var is active.
      // Clear our global var so the tooltip uses its own default width.
      if (currentZenSidebarWidth !== "") {
        // Only update if it actually changes to empty
        currentZenSidebarWidth = "";
        debugLog(
          `[SidebarWidthSync] --zen-sidebar-width on #navigator-toolbox is '${value}'. Cleared currentZenSidebarWidth. Tooltip will use default width.`
        );
        applyGlobalWidthToAllTooltips(); // Apply default width logic to existing tooltips
      } else {
        debugLog(
          `[SidebarWidthSync] --zen-sidebar-width on #navigator-toolbox is '${value}' and currentZenSidebarWidth is already empty. No update needed.`
        );
      }
    }
  }

  function initSidebarWidthSync() {
    const mainWindow = document.getElementById("main-window");
    const navigatorToolbox = document.getElementById("navigator-toolbox");
    let resizeTimeoutId = null;

    if (mainWindow) {
      // Set up a MutationObserver to watch attribute changes on #main-window for zen-compact-mode
      const mutationObserver = new MutationObserver((mutationsList) => {
        for (const mutation of mutationsList) {
          if (
            mutation.type === "attributes" &&
            mutation.attributeName === "zen-compact-mode"
          ) {
            debugLog(
              "[SidebarWidthSync] zen-compact-mode attribute changed. Updating sidebar width."
            );
            updateCurrentZenSidebarWidth();
          }
        }
      });
      mutationObserver.observe(mainWindow, {
        attributes: true,
        attributeFilter: ["zen-compact-mode"],
      });
    } else {
      debugLog(
        "[SidebarWidthSync] initSidebarWidthSync: #main-window not found. Cannot set up MutationObserver for compact mode."
      );
    }

    if (navigatorToolbox) {
      // Set up a ResizeObserver to watch for size changes on #navigator-toolbox
      const resizeObserver = new ResizeObserver((entries) => {
        // Debounce the resize event
        clearTimeout(resizeTimeoutId);
        resizeTimeoutId = setTimeout(() => {
          for (let entry of entries) {
            // We don't strictly need to check entry.contentRect here as getComputedStyle will get the current var value
            debugLog(
              "[SidebarWidthSync] #navigator-toolbox resized. Updating sidebar width."
            );
            updateCurrentZenSidebarWidth();
          }
        }, 250); // 250ms debounce period
      });
      resizeObserver.observe(navigatorToolbox);
      debugLog(
        "[SidebarWidthSync] ResizeObserver started on #navigator-toolbox."
      );
    } else {
      debugLog(
        "[SidebarWidthSync] initSidebarWidthSync: #navigator-toolbox not found. Cannot set up ResizeObserver."
      );
    }

    // Run it once at init in case the attribute/size is already set at load
    debugLog("[SidebarWidthSync] Initial call to update sidebar width.");
    updateCurrentZenSidebarWidth();
  }

  function applyGlobalWidthToAllTooltips() {
    debugLog(
      "[TooltipWidth] Attempting to apply global width to all active tooltips."
    );
    if (
      !currentZenSidebarWidth ||
      currentZenSidebarWidth === "0px" ||
      isNaN(parseFloat(currentZenSidebarWidth))
    ) {
      debugLog(
        "[TooltipWidth] No valid global currentZenSidebarWidth to apply. Existing tooltips will retain their current width or fall back to default if they re-render."
      );
      // If currentZenSidebarWidth is invalid, we might want to set all tooltips to default 350px.
      // However, createOrUpdateCard already handles this for new/updated cards.
      // For existing ones, letting them keep their last valid calculated width might be less jarring than all snapping to default.
      return;
    }

    for (const cardData of activeDownloadCards.values()) {
      if (cardData && cardData.cardElement) {
        const tooltipElement =
          cardData.cardElement.querySelector(".details-tooltip");
        if (tooltipElement) {
          const newWidth = `calc(${currentZenSidebarWidth} - 20px)`; // Respecting your -20px adjustment
          tooltipElement.style.width = newWidth;
          // Minimal log here to avoid flooding if many cards exist
          // debugLog(`[TooltipWidth] Refreshed tooltip for key ${cardData.key || 'unknown'} to width: ${newWidth}`);
        }
      }
    }
    debugLog("[TooltipWidth] Finished applying global width to tooltips.");
  }

  // --- Zen Animation Synchronization Logic ---
  function triggerCardEntrance(downloadKeyToTrigger, cardElementToAnimateIn) {
    if (!cardElementToAnimateIn) return;

    const cardData = activeDownloadCards.get(downloadKeyToTrigger);
    if (cardData) {
      // Ensure this runs only once or if explicitly told by fallback
      if (!cardData.isWaitingForZenAnimation && !cardData.fallbackTriggered)
        return;
      cardData.isWaitingForZenAnimation = false;
      cardData.fallbackTriggered = true; // Mark that it has been triggered, even if by fallback
    }

    if (downloadCardsContainer && !cardElementToAnimateIn.parentNode) {
      downloadCardsContainer.appendChild(cardElementToAnimateIn);
      debugLog("[UI] Card appended via triggerCardEntrance", {
        key: downloadKeyToTrigger,
      });
    } else if (!downloadCardsContainer) {
      debugLog(
        "[UI] Error: downloadCardsContainer not found in triggerCardEntrance",
        { key: downloadKeyToTrigger }
      );
      return;
    } else {
      debugLog(
        "[UI] Card already parented or no container, proceeding with animation",
        { key: downloadKeyToTrigger }
      );
    }

    // Trigger entrance animations for the card
    setTimeout(() => {
      cardElementToAnimateIn.classList.add("show");
      const tooltip = cardElementToAnimateIn.querySelector(".details-tooltip");
      if (tooltip) {
        tooltip.classList.add("show");
      }
      debugLog("[UI] Card entrance animation triggered", {
        key: downloadKeyToTrigger,
      });
    }, 10); // Small delay to allow initial styles to apply if just appended
  }

  function initZenAnimationObserver(downloadKey, cardElement) {
    debugLog("[ZenSync] Initializing observer for key:", downloadKey);
    let observer = null;
    let fallbackTimeoutId = null;

    const zenAnimationHost = document.querySelector("zen-download-animation");

    if (zenAnimationHost && zenAnimationHost.shadowRoot) {
      debugLog("[ZenSync] Found zen-download-animation host and shadowRoot.");

      observer = new MutationObserver((mutationsList, obs) => {
        for (const mutation of mutationsList) {
          if (
            mutation.type === "childList" &&
            mutation.removedNodes.length > 0
          ) {
            for (const removedNode of mutation.removedNodes) {
              if (
                removedNode.nodeType === Node.ELEMENT_NODE &&
                removedNode.classList.contains("zen-download-arc-animation")
              ) {
                debugLog(
                  "[ZenSync] Detected .zen-download-arc-animation removal. Triggering card entrance.",
                  { key: downloadKey }
                );
                clearTimeout(fallbackTimeoutId); // Clear the safety fallback
                triggerCardEntrance(downloadKey, cardElement);
                obs.disconnect(); // Stop observing
                observer = null; // Clean up observer reference
                return; // Exit once detected
              }
            }
          }
        }
      });

      observer.observe(zenAnimationHost.shadowRoot, { childList: true });
      debugLog("[ZenSync] Observer started on shadowRoot.");

      // Safety fallback timeout
      fallbackTimeoutId = setTimeout(() => {
        debugLog(
          "[ZenSync] Fallback timeout reached. Triggering card entrance.",
          { key: downloadKey }
        );
        if (observer) {
          observer.disconnect();
          observer = null;
        }
        triggerCardEntrance(downloadKey, cardElement);
        // Mark cardData to prevent double trigger if observer fires late
        const cardData = activeDownloadCards.get(downloadKey);
        if (cardData) cardData.fallbackTriggered = true;
      }, 3000); // 3-second fallback
    } else {
      debugLog(
        "[ZenSync] zen-download-animation host or shadowRoot not found. Triggering card entrance immediately.",
        { key: downloadKey }
      );
      triggerCardEntrance(downloadKey, cardElement);
      // Mark cardData to prevent double trigger if observer somehow gets setup later
      const cardData = activeDownloadCards.get(downloadKey);
      if (cardData) cardData.fallbackTriggered = true;
    }
  }
})();
