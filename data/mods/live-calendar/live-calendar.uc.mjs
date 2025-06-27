// ==UserScript==
// @name           Live Calendar (fx-autoconfig)
// @version        2.0
// @description    Arc-style calendar preview for Google Calendar tabs (Firefox/Zen)
// @author         Your Name
// @include        main
// ==/UserScript==

// Ensure Services is available
var { Services } = globalThis;

// Debug logging function
function debugLog(message, data = null) {
  try {
    console.log(`[Live Calendar] ${message}`, data || '');
  } catch (e) {
    console.log(`[Live Calendar] ${message}`);
  }
}

let cachedEvents = [];

let icsUrls = [];
const ICS_DB_PATH = "ics-urls.json"; // saved in chrome/ by default

// Add a cache for ICS calendar titles
let icsTitles = {};

// Helper to convert a string to title case
function toTitleCase(str) {
  return str.replace(/\w\S*/g, (txt) => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
}

// Load ICS URLs from file
async function loadIcsUrls() {
  try {
    const fsResult = await UC_API.FileSystem.readJSON(ICS_DB_PATH);
    if (Array.isArray(fsResult)) {
      icsUrls = fsResult;
    } else {
      icsUrls = [];
    }
  } catch (e) {
    icsUrls = [];
  }
}

// Save ICS URLs to file
async function saveIcsUrls() {
  try {
    await UC_API.FileSystem.writeFile(ICS_DB_PATH, JSON.stringify(icsUrls, null, 2));
  } catch (e) {
    console.error("[Live Calendar] Failed to save ICS URLs:", e);
  }
}

// Fetch and merge events from all ICS URLs
async function fetchAndParseAllICS() {
  let allEvents = [];
  for (const url of icsUrls) {
    try {
      const events = await fetchAndParseICS(url);
      allEvents = allEvents.concat(events);
    } catch (e) {
      console.error("[Live Calendar] Failed to fetch ICS:", url, e);
    }
  }
  // Sort and keep only the next 3 events
  allEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return allEvents.slice(0, 3);
}

// Move fetchAndParseICS here, outside the IIFE
async function fetchAndParseICS(icsUrl) {
  const res = await fetch(icsUrl);
  const icsText = await res.text();

  // Extract calendar title (X-WR-CALNAME)
  let calName = null;
  const calNameMatch = icsText.match(/^X-WR-CALNAME:(.+)$/m);
  if (calNameMatch) {
    calName = calNameMatch[1].trim();
  } else {
    // Fallback: use first SUMMARY as title
    const summaryMatch = icsText.match(/^SUMMARY:(.+)$/m);
    if (summaryMatch) calName = summaryMatch[1].trim();
  }
  if (calName) {
    icsTitles[icsUrl] = toTitleCase(calName);
  } else {
    icsTitles[icsUrl] = 'Calendar';
  }


  // Simple parser for VEVENT blocks
  const events = [];
  const veventBlocks = icsText.split('BEGIN:VEVENT').slice(1);
  for (const block of veventBlocks) {
    const get = (field) => {
      const match = block.match(new RegExp(field + ':(.+)'));
      return match ? match[1].trim() : null;
    };
    const summary = get('SUMMARY');
    let dtstart = get('DTSTART');
    let startTime = null;


    // Handle TZID (e.g. DTSTART;TZID=America/New_York:20240618T170000)
    if (!dtstart) {
      // Try to match TZID
      const tzidMatch = block.match(/DTSTART;TZID=([^:]+):([^\n\r]+)/);
      if (tzidMatch) {
        dtstart = tzidMatch[2].trim();
      }
    }

    if (dtstart) {
      dtstart = dtstart.trim();

      if (dtstart.endsWith('Z')) {
        // Convert 20210726T194500Z → 2021-07-26T19:45:00Z
        const match = dtstart.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
        if (match) {
          const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
          const parsed = new Date(iso);
          if (!isNaN(parsed)) {
            startTime = parsed.toISOString();
          } else {
            console.warn('[Live Calendar][ICS] Invalid ISO UTC date:', iso);
          }
        } else {
          console.warn('[Live Calendar][ICS] Unrecognized UTC format:', dtstart);
        }
      } else if (/^\d{8}T\d{6}$/.test(dtstart)) {
        // Local time, format: YYYYMMDDTHHMMSS
        const y = dtstart.slice(0,4), m = dtstart.slice(4,6), d = dtstart.slice(6,8);
        const H = dtstart.slice(9,11), M = dtstart.slice(11,13), S = dtstart.slice(13,15);
        const iso = `${y}-${m}-${d}T${H}:${M}:${S}`;
        const parsed = new Date(iso);
        if (!isNaN(parsed)) {
          startTime = parsed.toISOString();
        } else {
          console.warn('[Live Calendar][ICS] Invalid local date (6 digits):', iso);
        }
      } else if (/^\d{8}T\d{4}$/.test(dtstart)) {
        // Local time, format: YYYYMMDDTHHMM
        const y = dtstart.slice(0,4), m = dtstart.slice(4,6), d = dtstart.slice(6,8);
        const H = dtstart.slice(9,11), M = dtstart.slice(11,13);
        const iso = `${y}-${m}-${d}T${H}:${M}:00`;
        const parsed = new Date(iso);
        if (!isNaN(parsed)) {
          startTime = parsed.toISOString();
        } else {
          console.warn('[Live Calendar][ICS] Invalid local date (4 digits):', iso);
        }
      } else {
        // Fallback: try Date constructor
        const parsed = new Date(dtstart);
        if (!isNaN(parsed)) {
          startTime = parsed.toISOString();
        } else {
          console.warn('[Live Calendar][ICS] Could not parse DTSTART:', dtstart);
        }
      }
    }

    // Extract join link
    let url = get('URL');
    if (!url) {
      const desc = get('DESCRIPTION');
      if (desc) {
        const match = desc.match(/https?:\/\/meet\.google\.com\/[\w-]+/);
        if (match) url = match[0];
      }
    }

    // Collect all future events (filter later)
    if (startTime && new Date(startTime) > new Date()) {
      events.push({
        title: summary,
        startTime,
        joinLink: url || null
      });
    }

    // In your ICS parser, after getting dtstart and dtend:
    const alldayMatch = block.match(/DTSTART(;VALUE=DATE)?:([0-9]{8})/);
    if (alldayMatch) {
      // All-day event
      const y = alldayMatch[2].slice(0,4), m = alldayMatch[2].slice(4,6), d = alldayMatch[2].slice(6,8);
      startTime = `${y}-${m}-${d}T00:00:00`;
      // Mark as all-day in your event object if you want
    }
  }
  // Sort by startTime ascending and return the next 3
  events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
  return events.slice(0, 3);
}

(function () {
  "use strict";

  // Only initialize for Google Calendar tabs
  const CALENDAR_URL_PATTERN = /^https:\/\/calendar\.google\.com\/.*/;

  /**
   * Extract upcoming events from the Google Calendar DOM
   * Returns array of { title, startTime, joinLink }
   */
  function extractUpcomingEvents() {
    const events = [];
    const now = new Date();
    const next24h = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    // Try to find event elements (robust selectors for Google Calendar)
    const eventNodes = document.querySelectorAll('div[role="button"][data-eventid]');
    console.log(`[Live Calendar] Found ${eventNodes.length} event nodes`);
    eventNodes.forEach((node, idx) => {
      try {
        const ariaLabel = node.getAttribute('aria-label');
        const textContent = node.textContent;
        console.log(`[Live Calendar] Node #${idx}: aria-label=`, ariaLabel, 'textContent=', textContent);
        // Extract title
        let title = ariaLabel || textContent || 'Untitled Event';
        // Try to extract time from aria-label (usually contains time)
        let timeText = '';
        const timeMatch = title.match(/,\s*(\d{1,2}(?::\d{2})?\s*[AP]M)/i);
        if (timeMatch) timeText = timeMatch[1].trim();
        if (timeMatch) {
          console.log(`[Live Calendar] Node #${idx}: timeText from aria-label:`, timeText);
        }
        // Fallback: look for time in child nodes
        if (!timeText) {
          const timeEl = node.querySelector('[aria-label*="AM"],[aria-label*="PM"]');
          if (timeEl) {
            timeText = timeEl.getAttribute('aria-label');
            console.log(`[Live Calendar] Node #${idx}: timeText from child:`, timeText);
          }
        }
        if (!timeText) {
          console.log(`[Live Calendar] Node #${idx}: Skipped, no timeText found`);
          return; // Skip if no time
        }
        // Parse time
        const timeParts = timeText.match(/([\d:]+)\s*([AP]M)/i);
        if (!timeParts) {
          console.log(`[Live Calendar] Node #${idx}: Skipped, could not parse time from timeText:`, timeText);
          return;
        }
        const [_, time, meridiem] = timeParts;
        let [hours, minutes = '00'] = time.split(':').map(Number);
        if (meridiem.toUpperCase() === 'PM' && hours !== 12) hours += 12;
        if (meridiem.toUpperCase() === 'AM' && hours === 12) hours = 0;
        const startTime = new Date(now);
        startTime.setHours(hours, minutes, 0, 0);
        if (startTime < now || startTime > next24h) {
          console.log(`[Live Calendar] Node #${idx}: Skipped, startTime not in next 24h:`, startTime.toISOString());
          return; // Only next 24h
        }
        // Extract join link
        let url = get('URL');
        if (!url) {
          const desc = get('DESCRIPTION');
          if (desc) {
            const match = desc.match(/https?:\/\/meet\.google\.com\/[\w-]+/);
            if (match) url = match[0];
          }
        }
        console.log(`[Live Calendar] Node #${idx}: Extracted event:`, { title: title.split(',')[0].trim(), startTime: startTime.toISOString(), joinLink: url });
        events.push({
          title: title.split(',')[0].trim(),
          startTime: startTime.toISOString(),
          joinLink: url || null
        });
      } catch (e) {
        console.log(`[Live Calendar] Node #${idx}: Error extracting event:`, e);
      }
    });
    // Sort by startTime
    events.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
    return events;
  }

  /**
   * Popup UI Management (native context menu placeholder)
   */
  class CalendarPopupManager {
    constructor() {
      this.popup = null;
      this._isMouseOverPopup = false;
    }
    createPopupMenu() {
      // TODO: Replace with native Firefox context menu (XUL/WebExtension API)
      // For now, use a XUL menupopup as placeholder
      const existingPopup = document.getElementById("calendar-preview-popup");
      if (existingPopup) existingPopup.remove();
      const popup = window.MozXULElement.parseXULToFragment(`
        <menupopup id="calendar-preview-popup" width="400">
          <menuitem id="calendar-no-events" label="No events in next 24 hours"/>
        </menupopup>
      `).firstElementChild;
      document.getElementById("mainPopupSet").appendChild(popup);
      this.popup = popup;
      this._isMouseOverPopup = false;
      this.popup.addEventListener("mouseenter", () => { this._isMouseOverPopup = true; });
      this.popup.addEventListener("mouseleave", () => {
        this._isMouseOverPopup = false;
        setTimeout(() => {
          if (!this._isMouseOverTab && !this._isMouseOverPopup) {
            this.popup.hidePopup();
          }
        }, 100);
      });
    }
    updatePopupContent() {
      if (!this.popup) return;
      while (this.popup.firstChild) this.popup.removeChild(this.popup.firstChild);
      let xul = "";
      // Merge and sort all events chronologically
      const allEvents = [...cachedEvents];
      allEvents.sort((a, b) => new Date(a.startTime) - new Date(b.startTime));
      if (!allEvents.length) {
        xul = '<menuitem id="calendar-no-events" label="No events in next 24 hours"/>';
      } else {
        allEvents.forEach((event, idx) => {
          const dateObj = new Date(event.startTime);
          const dateStr = dateObj.toLocaleDateString(undefined, { weekday: "short", year: "numeric", month: "short", day: "numeric" });
          const timeStr = dateObj.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
          const label = `${dateStr} ${timeStr} — ${event.title}`;
          if (event.joinLink) {
            xul += `<menu class="calendar-event-item" data-idx="${idx}" label="${label}"><menupopup>`;
            xul += `<menuitem label="Open Event in Google Calendar" class="calendar-event-open" data-idx="${idx}"/>`;
            xul += `<menuitem label="Join Google Meet" class="calendar-event-join" data-idx="${idx}"/>`;
            xul += `</menupopup></menu>`;
          } else {
            xul += `<menuitem class="calendar-event-item" data-idx="${idx}" label="${label}"/>`;
          }
        });
      }
      xul += '<menuseparator/>';
      // Settings menu as a menu
      xul += `
        <menu id="calendar-settings-menu" label="Calendar Settings">
          <menupopup id="calendar-settings-menupopup">
            <menuitem id="calendar-settings-paste" label="Paste ICS URL from Clipboard"/>
            <menuseparator/>
            <!-- ICS URLs will be injected here directly -->
          </menupopup>
        </menu>
      `;
      const frag = window.MozXULElement.parseXULToFragment(xul);
      this.popup.appendChild(frag);

      // Attach event listeners for menuitems
      const allEventNodes = Array.from(this.popup.querySelectorAll('.calendar-event-item'));
      allEventNodes.forEach(menuitem => {
        const idx = parseInt(menuitem.getAttribute('data-idx'), 10);
        const event = allEvents[idx];
        if (event.joinLink) {
          // Open in Google Calendar
          const openItem = menuitem.querySelector('.calendar-event-open');
          if (openItem) {
            openItem.addEventListener("command", () => {
              const dateObj = new Date(event.startTime);
              const year = dateObj.getFullYear();
              const month = dateObj.getMonth() + 1;
              const day = dateObj.getDate();
              const dayUrl = `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;
              if (typeof UC_API !== "undefined" && UC_API.Utils && UC_API.Utils.loadURI) {
                UC_API.Utils.loadURI(window, {
                  url: dayUrl,
                  where: "current"
                });
              } else {
                try {
                  gBrowser.selectedBrowser.loadURI({
                    uri: dayUrl,
                    triggeringPrincipal: gBrowser.selectedBrowser.contentPrincipal
                  });
                } catch (e) {
                  alert("Unable to open event day: " + e);
                }
              }
            });
          }
          // Join Google Meet
          const joinItem = menuitem.querySelector('.calendar-event-join');
          if (joinItem) {
            joinItem.addEventListener("command", () => {
              if (typeof UC_API !== "undefined" && UC_API.Utils && UC_API.Utils.loadURI) {
                UC_API.Utils.loadURI(window, {
                  url: event.joinLink,
                  where: "current"
                });
              } else {
                try {
                  gBrowser.selectedBrowser.loadURI({
                    uri: event.joinLink,
                    triggeringPrincipal: gBrowser.selectedBrowser.contentPrincipal
                  });
                } catch (e) {
                  alert("Unable to open Google Meet link: " + e);
                }
              }
            });
          }
        } else {
          // Simple event: open in Google Calendar
          menuitem.addEventListener("command", () => {
            const dateObj = new Date(event.startTime);
            const year = dateObj.getFullYear();
            const month = dateObj.getMonth() + 1;
            const day = dateObj.getDate();
            const dayUrl = `https://calendar.google.com/calendar/u/0/r/day/${year}/${month}/${day}`;
            if (typeof UC_API !== "undefined" && UC_API.Utils && UC_API.Utils.loadURI) {
              UC_API.Utils.loadURI(window, {
                url: dayUrl,
                where: "current"
              });
            } else {
              try {
                gBrowser.selectedBrowser.loadURI({
                  uri: dayUrl,
                  triggeringPrincipal: gBrowser.selectedBrowser.contentPrincipal
                });
              } catch (e) {
                alert("Unable to open event day: " + e);
              }
            }
          });
        }
      });
      // Paste from clipboard handler
      const pasteMenu = this.popup.querySelector("#calendar-settings-paste");
      if (pasteMenu) {
        pasteMenu.addEventListener("command", async () => {
          let url = "";
          try {
            if (navigator.clipboard && navigator.clipboard.readText) {
              url = await navigator.clipboard.readText();
            } else if (window.clipboardData && window.clipboardData.getData) {
              url = window.clipboardData.getData('Text');
            }
          } catch (e) {
            alert("Unable to read clipboard: " + e);
            return;
          }
          url = url.trim();
          if (!url) {
            alert("Clipboard is empty or does not contain text.");
            return;
          }
          if (!/^https?:\/\//.test(url)) {
            alert("Clipboard does not contain a valid URL.");
            return;
          }
          if (icsUrls.includes(url)) {
            alert("This ICS URL is already added.");
            return;
          }
          icsUrls.push(url);
          await saveIcsUrls();
          cachedEvents = await fetchAndParseAllICS();
          this.updatePopupContent();
        });
      }
      // Populate ICS URLs menu
      const settingsMenuPopup = this.popup.querySelector("#calendar-settings-menupopup");
      if (settingsMenuPopup) {
        // Remove any old URL menus
        // Remove all children after the menuseparator (the first two children are paste and separator)
        while (settingsMenuPopup.children.length > 2) {
          settingsMenuPopup.removeChild(settingsMenuPopup.lastChild);
        }
        icsUrls.forEach((url, i) => {
          const urlMenu = document.createXULElement("menu");
          // Use the cached title if available, otherwise show 'Calendar'
          const label = icsTitles[url] || 'Calendar';
          urlMenu.setAttribute("label", label);
          urlMenu.setAttribute("style", "max-width:350px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;");
          const urlPopup = document.createXULElement("menupopup");
          const removeItem = document.createXULElement("menuitem");
          removeItem.setAttribute("label", "Remove");
          removeItem.setAttribute("style", "color:#e63a3a;font-weight:bold;");
          removeItem.addEventListener("command", async () => {
            icsUrls.splice(i, 1);
            await saveIcsUrls();
            cachedEvents = await fetchAndParseAllICS();
            this.updatePopupContent();
          });
          urlPopup.appendChild(removeItem);
          urlMenu.appendChild(urlPopup);
          settingsMenuPopup.appendChild(urlMenu);
        });
      }
    }
    showPopup(target) {
      if (!this.popup) return;
      this.updatePopupContent();
      this.popup.openPopup(target, "after_start");
      const handlePopupHidden = (event) => {
        if (event.target !== this.popup) return;
        this.popup.removeEventListener("popuphidden", handlePopupHidden);
      };
      this.popup.addEventListener("popuphidden", handlePopupHidden);
    }
  }

  /**
   * Tab management and initialization
   */
  class CalendarTabManager {
    constructor() {
      this.popupManager = new CalendarPopupManager();
      this.progressListener = null;
    }
    init() {
      this.popupManager.createPopupMenu();
      this.calendarTabFound = false;
      this.progressListener = {
        onLocationChange: (browser, webProgress, request, location) => {
          if (!this.calendarTabFound) {
            if (this.handleTabLocation(browser, location)) {
              this.calendarTabFound = true;
            }
          }
        },
      };
      gBrowser.addTabsProgressListener(this.progressListener);
      this.handleCurrentTab();
    }
    handleTabLocation(browser, location) {
      if (!CALENDAR_URL_PATTERN.test(location.spec)) return false;
      const tab = [...gBrowser.tabs].find((t) => t.linkedBrowser === browser);
      if (!tab?.hasAttribute("zen-essential")) return false;
      this.initializeCalendarTab(browser, tab);
      return true;
    }
    handleCurrentTab() {
      const currentBrowser = gBrowser.selectedBrowser;
      if (CALENDAR_URL_PATTERN.test(currentBrowser.currentURI.spec)) {
        const tab = [...gBrowser.tabs].find((t) => t.linkedBrowser === currentBrowser);
        if (tab?.hasAttribute("zen-essential")) {
          this.initializeCalendarTab(currentBrowser, tab);
        }
      }
    }
    initializeCalendarTab(browser, tab) {
      if (browser.hasAttribute("live-calendar-initialized")) return;
      browser.setAttribute("live-calendar-initialized", "true");
      this.setupHoverHandling(tab);
      this.observeAndExtract();
    }
    setupHoverHandling(tab) {
      if (!this._hoverTimers) this._hoverTimers = new WeakMap();  
      if (this._onMouseEnter) tab.removeEventListener("mouseenter", this._onMouseEnter);
      if (this._onMouseLeave) tab.removeEventListener("mouseleave", this._onMouseLeave);
      this._isMouseOverTab = false;
      this._onMouseEnter = (event) => {
        this._isMouseOverTab = true;
        const timer = setTimeout(() => {
          this.popupManager.showPopup(tab);
        }, 300);
        this._hoverTimers.set(tab, timer);
      };
      this._onMouseLeave = () => {
        this._isMouseOverTab = false;
        const timer = this._hoverTimers.get(tab);
        if (timer) {
          clearTimeout(timer);
          this._hoverTimers.delete(tab);
        }
        setTimeout(() => {
          if (!(this.popupManager && this.popupManager.popup && this.popupManager._isMouseOverPopup) && !this._isMouseOverTab) {
            this.popupManager.popup.hidePopup();
          }
        }, 100);
      };
      tab.addEventListener("mouseenter", this._onMouseEnter);
      tab.addEventListener("mouseleave", this._onMouseLeave);
    }
    observeAndExtract() {
      // No-op: ICS events are handled elsewhere
    }
  }

  // --- Initialize if on Google Calendar tab ---
  if (document.readyState === "complete") {
    const calendarTabManager = new CalendarTabManager();
    window.calendarTabManager = calendarTabManager;
    calendarTabManager.init();
  } else {
    window.addEventListener("load", function() {
      const calendarTabManager = new CalendarTabManager();
      window.calendarTabManager = calendarTabManager;
      calendarTabManager.init();
    }, { once: true });
  }

  // On startup, load ICS URLs and fetch events
  (async () => {
    await loadIcsUrls();
    cachedEvents = await fetchAndParseAllICS();
    if (window.calendarTabManager && window.calendarTabManager.popupManager) {
      window.calendarTabManager.popupManager.updatePopupContent();
    }
    scheduleMeetReminders();

    // --- TEST POPUP: Show reminder for last event if pref is set ---
    const testPref = getLiveCalendarTestPopupPref();
    debugLog('[TestPopup] Pref checked:', testPref);
    if (testPref && cachedEvents && cachedEvents.length) {
      const lastMeetEvent = [...cachedEvents].reverse().find(ev => ev.joinLink);
      if (lastMeetEvent) {
        debugLog('[TestPopup] Showing test popup for event:', { title: lastMeetEvent.title, startTime: lastMeetEvent.startTime });
        showMeetReminderPopup(lastMeetEvent);
      } else {
        debugLog('[TestPopup] No event with joinLink found for test popup.');
      }
    } else if (testPref) {
      debugLog('[TestPopup] No cached events available for test popup.');
    }

    // Refresh ICS events every minute
    setInterval(async () => {
      cachedEvents = await fetchAndParseAllICS();
      if (window.calendarTabManager && window.calendarTabManager.popupManager) {
        window.calendarTabManager.popupManager.updatePopupContent();
      }
      scheduleMeetReminders();
    }, 60 * 1000);

    setupLiveCalendarPrefObserver();
  })();
})();

// --- Meeting Reminder Popup System ---
let meetReminderTimers = [];

// Add: Pref for test popup
const LIVE_CALENDAR_TESTPOPUP_PREF = 'livecalendar.testpopup';

function getLiveCalendarTestPopupPref() {
  try {
    return Services.prefs.getBoolPref(LIVE_CALENDAR_TESTPOPUP_PREF, false);
  } catch (e) {
    return false;
  }
}

function clearMeetReminders() {
  meetReminderTimers.forEach(timer => clearTimeout(timer));
  meetReminderTimers = [];
}
function scheduleMeetReminders() {
  clearMeetReminders();
  const now = Date.now();
  // Only schedule for events with joinLink in the next 24h
  (cachedEvents || []).forEach(event => {
    if (!event.joinLink) return;
    const start = new Date(event.startTime).getTime();
    const msUntil = start - now;
    const msBefore = 5 * 60 * 1000; // 5 minutes
    if (msUntil > msBefore && msUntil < 24 * 60 * 60 * 1000) {
      const timer = setTimeout(() => showMeetReminderPopup(event), msUntil - msBefore);
      meetReminderTimers.push(timer);
    }
  });
}
function showMeetReminderPopup(event) {
  // Remove any existing popup
  const old = document.getElementById("live-calendar-meet-reminder-popup");
  if (old) old.remove();
  // Google Meet logo (SVG data URI, base64 for XUL image)
  const meetLogoSVG = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'><g><path fill='#34A853' d='M20 3.5c-9.1 0-16.5 7.4-16.5 16.5S10.9 36.5 20 36.5 36.5 29.1 36.5 20 29.1 3.5 20 3.5zm0 30c-7.4 0-13.5-6.1-13.5-13.5S12.6 6.5 20 6.5 33.5 12.6 33.5 20 27.4 33.5 20 33.5z'/><path fill='#4285F4' d='M28.5 13.5h-2.8v-2.8c0-.7-.6-1.2-1.2-1.2h-8c-.7 0-1.2.6-1.2 1.2v2.8h-2.8c-.7 0-1.2.6-1.2 1.2v8c0 .7.6 1.2 1.2 1.2h2.8v2.8c0 .7.6 1.2 1.2 1.2h8c.7 0 1.2-.6 1.2-1.2v-2.8h2.8c.7 0 1.2-.6 1.2-1.2v-8c0-.7-.6-1.2-1.2-1.2z'/></g></svg>`;
  const meetLogo = 'data:image/svg+xml;base64,' + btoa(meetLogoSVG);
  // XUL menupopup markup (no custom CSS, but set width/height attributes)
  const popupXUL = `
    <menupopup id="live-calendar-meet-reminder-popup" width="400" height="220">
      <image src="${meetLogo}" width="80" height="80" style="display:block;margin-left:auto;margin-right:auto;"/>
      <label id="live-calendar-meet-reminder-title" value="${event.title}" style="font-size:15px;max-width:360px;white-space:normal;display:block;text-align:center;margin:0 auto;font-weight:bold;"/>
      <label id="live-calendar-meet-reminder-time" style="font-size:12px;display:block;text-align:center;margin:0 auto;"/>
      <menuitem id="live-calendar-meet-reminder-join" label="Join Google Meet" style="display:flex;text-align:center;justify-content:center;"/>
      <menuitem id="live-calendar-meet-reminder-close" label="Close" style=" display:flex;text-align:center;justify-content:center;"/>
    </menupopup>
  `;
  const frag = window.MozXULElement.parseXULToFragment(popupXUL);
  const popup = frag.firstElementChild;
  document.getElementById("mainPopupSet").appendChild(popup);

  // Inject custom CSS for styling
  if (!document.getElementById('live-calendar-meet-reminder-style')) {
    const style = document.createElement('style');
    style.id = 'live-calendar-meet-reminder-style';
    style.textContent = `
#live-calendar-meet-reminder-join .menu-text, #live-calendar-meet-reminder-close .menu-text {
  display: flex !important;
  justify-content: center !important;
  align-items: center !important;
  margin-inline: auto !important;
  margin-inline-start: 2px !important;
  margin-inline-end: 2px !important;
}
#live-calendar-meet-reminder-time {
  color: #999 !important;
  font-size: 10px !important;
}
#live-calendar-meet-reminder-title {
  font-weight: bold !important;
}
`;
    document.documentElement.appendChild(style);
  }

  // Dynamically find the current Google Calendar tab to anchor the popup
  let tabAnchor = null;
  if (window.gBrowser) {
    // Find the first Google Calendar tab, regardless of which is selected
    const calendarTab = [...gBrowser.tabs].find(
      t => t.linkedBrowser && t.linkedBrowser.currentURI && /^https:\/\/calendar\.google\.com\//.test(t.linkedBrowser.currentURI.spec)
    );
    if (calendarTab) {
      tabAnchor = calendarTab;
      if (!(tabAnchor instanceof window.XULElement) && tabAnchor.firstElementChild) {
        tabAnchor = tabAnchor.firstElementChild;
      }
    }
  }
  if (tabAnchor && typeof tabAnchor.openPopup === 'function') {
    popup.openPopup(tabAnchor, "after_start");
  } else if (tabAnchor) {
    // Try as a fallback
    popup.openPopup(tabAnchor, "after_start");
  } else {
    const x = Math.round(window.screen.availWidth/2 - 200);
    const y = Math.round(window.screen.availHeight/2 - 110);
    popup.openPopupAtScreen(x, y, true);
  }

  // Prevent menupopup from closing except via the close button
  popup.addEventListener('popuphidden', function preventHide(e) {
    // If this was not triggered by our close button, re-show the popup
    if (!popup._allowClose) {
      setTimeout(() => {
        if (popup.parentNode) popup.showPopup();
      }, 0);
    }
  });

  // Time remaining updater
  function updateTime() {
    const now = Date.now();
    const start = new Date(event.startTime).getTime();
    let msLeft = start - now;
    let mins = Math.floor(msLeft / 60000);
    let secs = Math.floor((msLeft % 60000) / 1000);
    if (mins < 0) mins = 0;
    if (secs < 0) secs = 0;
    let timeStr = '';
    if (msLeft > 60000) {
      timeStr = `Starts in ${mins}m`;
    } else {
      timeStr = `Starts in ${mins}m ${secs}s`;
    }
    popup.querySelector("#live-calendar-meet-reminder-time").setAttribute("value", timeStr);
  }
  updateTime();
  const interval = setInterval(updateTime, 1000);

  // Track if join was clicked
  let joined = false;

  // Join button
  popup.querySelector("#live-calendar-meet-reminder-join").addEventListener("command", () => {
    joined = true;
    if (typeof UC_API !== "undefined" && UC_API.Utils && UC_API.Utils.loadURI) {
      UC_API.Utils.loadURI(window, {
        url: event.joinLink,
        where: "current"
      });
    } else {
      try {
        gBrowser.selectedBrowser.loadURI({
          uri: event.joinLink,
          triggeringPrincipal: gBrowser.selectedBrowser.contentPrincipal
        });
      } catch (e) {
        alert("Unable to open Google Meet link: " + e);
      }
    }
    popup._allowClose = true;
    popup.hidePopup();
    clearInterval(interval);
    popup.remove();
  });
  // Close button
  popup.querySelector("#live-calendar-meet-reminder-close").addEventListener("command", () => {
    popup._allowClose = true;
    popup.hidePopup();
    clearInterval(interval);
    popup.remove();
    // If not joined, reshow 30s before meeting
    if (!joined) {
      const now = Date.now();
      const start = new Date(event.startTime).getTime();
      const msUntil30s = start - now - 30000;
      if (msUntil30s > 0) {
        setTimeout(() => {
          showMeetReminderPopup(event);
        }, msUntil30s);
      }
    }
  });
}

async function handleLiveCalendarTestPopupPrefChange() {
  const newValue = getLiveCalendarTestPopupPref();
  debugLog(`[PrefObserver] livecalendar.testpopup changed to:`, newValue);

  if (newValue) {
    cachedEvents = await fetchAndParseAllICS();
    if (cachedEvents && cachedEvents.length) {
      // Show the first event, even if it does not have a joinLink
      const firstEvent = cachedEvents[0];
      debugLog('[PrefObserver] Showing test popup for event (regardless of joinLink):', { title: firstEvent.title, startTime: firstEvent.startTime, joinLink: firstEvent.joinLink });
      showMeetReminderPopup(firstEvent);
    } else {
      debugLog('[PrefObserver] No cached events available for test popup.');
    }
  }
}

function setupLiveCalendarPrefObserver() {
  try {
    const prefObserver = {
      observe: function(subject, topic, data) {
        if (topic === 'nsPref:changed' && data === LIVE_CALENDAR_TESTPOPUP_PREF) {
          handleLiveCalendarTestPopupPrefChange();
        }
      }
    };
    Services.prefs.addObserver(LIVE_CALENDAR_TESTPOPUP_PREF, prefObserver, false);
    debugLog("[PrefObserver] Added observer for livecalendar.testpopup");
    window.liveCalendarPrefObserver = prefObserver; // for cleanup if needed
  } catch (e) {
    debugLog("[PrefObserver] Error setting up preference observer:", e);
  }
}