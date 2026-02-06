const STORAGE_KEY = "dupTabCloserSettings";
const CONTEXT_MENU_ID = "duplicate-tab-closer";
const NOTIFICATION_ICON = browser.runtime.getURL("icons/pro-icon.svg");
const AUTO_NOTIFICATION_ID = "duplicate-tab-auto-detected";
const BADGE_CLEAR_TIMEOUT = 4000;

const DEFAULT_SETTINGS = {
  matching: {
    ignoreCase: false,
    ignoreWWW: false,
    ignoreHash: false,
    ignoreSearch: false,
    ignorePath: false,
    compareTitle: false
  },
  priority: "keepOlder",
  scope: "all",
  autoScan: true
};

let lastScan = null;
let autoScanTimer = null;
let lastAutoNotificationCount = 0;
let autoScanEnabled = DEFAULT_SETTINGS.autoScan;
let badgeTimeout = null;

async function getSettings() {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  return {
    ...DEFAULT_SETTINGS,
    ...stored,
    matching: {
      ...DEFAULT_SETTINGS.matching,
      ...(stored.matching || {})
    }
  };
}

function setBadge(text) {
  if (badgeTimeout) {
    clearTimeout(badgeTimeout);
    badgeTimeout = null;
  }
  if (!text) {
    browser.browserAction.setBadgeText({ text: "" });
    return;
  }
  browser.browserAction.setBadgeBackgroundColor({ color: "#0a7cff" });
  browser.browserAction.setBadgeText({ text });
}

function clearBadge(timeout = 0) {
  if (badgeTimeout) {
    clearTimeout(badgeTimeout);
    badgeTimeout = null;
  }
  if (timeout > 0) {
    badgeTimeout = setTimeout(() => {
      browser.browserAction.setBadgeText({ text: "" });
      badgeTimeout = null;
    }, timeout);
  } else {
    browser.browserAction.setBadgeText({ text: "" });
  }
}

function normalizeUrl(rawUrl, title, matching) {
  if (!rawUrl) return null;
  let normalized;
  try {
    const parsed = new URL(rawUrl);

    if (matching.ignoreHash) {
      parsed.hash = "";
    }
    if (matching.ignoreSearch) {
      parsed.search = "";
    }
    if (matching.ignorePath) {
      parsed.pathname = "";
    }
    if (matching.ignoreWWW) {
      const hostname = parsed.hostname;
      if (hostname.toLowerCase().startsWith("www.")) {
        parsed.hostname = hostname.slice(4);
      }
    }

    normalized = parsed.toString();
  } catch (error) {
    normalized = rawUrl;
  }

  if (matching.compareTitle) {
    normalized = `${normalized}|${title || ""}`;
  }

  if (matching.ignoreCase) {
    normalized = normalized.toLowerCase();
  }

  return normalized;
}

async function getActiveWindowIds() {
  const windows = await browser.windows.getAll();
  const focused = windows.filter((win) => win.focused).map((win) => win.id);
  if (focused.length) {
    return focused;
  }
  if (windows.length) {
    return [windows[0].id];
  }
  return [];
}

function comparatorForPriority(priority) {
  return (a, b) => {
    const aScore = typeof a.lastAccessed === "number" ? a.lastAccessed : a.id;
    const bScore = typeof b.lastAccessed === "number" ? b.lastAccessed : b.id;
    if (aScore === bScore) {
      return a.id - b.id;
    }
    if (priority === "keepNewer") {
      return bScore - aScore;
    }
    return aScore - bScore;
  };
}

async function scanDuplicateTabs() {
  const settings = await getSettings();
  const allTabs = await browser.tabs.query({});
  let eligibleTabs = allTabs;

  if (settings.scope === "active") {
    const activeWindows = await getActiveWindowIds();
    eligibleTabs = allTabs.filter((tab) => activeWindows.includes(tab.windowId));
  }

  const grouped = new Map();

  for (const tab of eligibleTabs) {
    const normalized = normalizeUrl(tab.url, tab.title, settings.matching);
    if (!normalized) {
      continue;
    }

    if (!grouped.has(normalized)) {
      grouped.set(normalized, []);
    }

    grouped.get(normalized).push({
      id: tab.id,
      url: tab.url,
      title: tab.title || "(untitled tab)",
      windowId: tab.windowId,
      lastAccessed: typeof tab.lastAccessed === "number" ? tab.lastAccessed : 0
    });
  }

  const toCloseIds = [];
  const duplicateGroupsDetail = [];
  const priorityComparator = comparatorForPriority(settings.priority);
  let duplicateGroupCount = 0;

  for (const group of grouped.values()) {
    if (group.length <= 1) {
      continue;
    }

    duplicateGroupCount += 1;
    const ordered = [...group].sort(priorityComparator);
    const kept = ordered[0];
    const duplicates = ordered.slice(1);

    toCloseIds.push(...duplicates.map((tab) => tab.id));

    duplicateGroupsDetail.push({
      url: ordered[0].url,
      total: ordered.length,
      keptTabId: kept.id,
      priority: settings.priority,
      tabs: ordered
    });
  }

  return {
    duplicateGroupCount,
    duplicateGroupsDetail,
    toCloseCount: toCloseIds.length,
    toCloseIds,
    optionsSnapshot: settings
  };
}

function clearAutoNotification() {
  browser.notifications.clear(AUTO_NOTIFICATION_ID).catch(() => {});
}

async function refreshAutoScanState() {
  const settings = await getSettings();
  const enabled = Boolean(settings.autoScan);
  autoScanEnabled = enabled;
  if (!enabled) {
    if (autoScanTimer) {
      clearTimeout(autoScanTimer);
      autoScanTimer = null;
    }
    lastAutoNotificationCount = 0;
    clearAutoNotification();
  }
  return enabled;
}

async function runAutoDuplicateNotification() {
  autoScanTimer = null;
  if (!autoScanEnabled) {
    return;
  }
  try {
    const scan = await scanDuplicateTabs();
    if (scan.toCloseCount === 0) {
      if (lastAutoNotificationCount > 0) {
        lastAutoNotificationCount = 0;
        clearAutoNotification();
        clearBadge();
      }
      return;
    }
    if (scan.toCloseCount === lastAutoNotificationCount) {
      return;
    }
    lastAutoNotificationCount = scan.toCloseCount;

    const groupText =
      scan.duplicateGroupCount === 1
        ? "1 duplicate group"
        : `${scan.duplicateGroupCount} duplicate groups`;
    const tabText = `${scan.toCloseCount} tab${scan.toCloseCount === 1 ? "" : "s"}`;

    browser.notifications.create(AUTO_NOTIFICATION_ID, {
      type: "basic",
      iconUrl: NOTIFICATION_ICON,
      title: "Duplicate tabs detected",
      message: `${groupText} (${tabText}) found. Open the popup to clean up.`,
      silent: true
    });
    setBadge(`${scan.toCloseCount}`);
  } catch (error) {
    console.error("Auto duplicate scan failed:", error);
  }
}

function scheduleAutoDuplicateScan() {
  if (autoScanTimer) {
    clearTimeout(autoScanTimer);
  }
  if (!autoScanEnabled) {
    return;
  }
  autoScanTimer = setTimeout(() => {
    runAutoDuplicateNotification().catch((error) => {
      console.error("Auto duplicate notification failed:", error);
    });
  }, 1200);
}

async function closeDuplicateTabs() {
  if (!lastScan || lastScan.toCloseCount === 0) {
    lastScan = await scanDuplicateTabs();
  }

  const idsToClose = lastScan.toCloseIds.slice();
  lastScan = null;

  if (idsToClose.length === 0) {
    return 0;
  }

  try {
    await browser.tabs.remove(idsToClose);
  } catch (error) {
    console.warn("Failed to close some tabs:", error);
  }

  browser.notifications.create({
    type: "basic",
    iconUrl: NOTIFICATION_ICON,
    title: "Duplicate tabs closed",
    message: `Closed ${idsToClose.length} duplicate tab${idsToClose.length === 1 ? "" : "s"}.`
  });

    if (autoScanEnabled) {
      lastAutoNotificationCount = 0;
      clearAutoNotification();
      clearBadge();
    }

  return idsToClose.length;
}

browser.runtime.onMessage.addListener((message) => {
  if (message?.type === "analyze") {
    return scanDuplicateTabs().then((result) => {
      lastScan = result;
      return result;
    });
  }
  if (message?.type === "close") {
    return closeDuplicateTabs();
  }
});

async function createContextMenu() {
  await browser.menus.removeAll();
  await browser.menus.create({
    id: CONTEXT_MENU_ID,
    title: "Close duplicate tabs",
    contexts: ["page", "browser_action"]
  });
}

browser.menus.onClicked.addListener((info) => {
  if (info.menuItemId === CONTEXT_MENU_ID) {
    browser.windows
      .create({
        url: browser.runtime.getURL("popup.html?source=context-menu"),
        type: "popup",
        width: 360,
        height: 240
      })
      .catch(console.error);
  }
});

browser.tabs.onCreated.addListener(scheduleAutoDuplicateScan);
browser.tabs.onUpdated.addListener(scheduleAutoDuplicateScan);
browser.tabs.onRemoved.addListener(() => {
  lastAutoNotificationCount = 0;
  scheduleAutoDuplicateScan();
});
browser.tabs.onAttached.addListener(scheduleAutoDuplicateScan);
browser.tabs.onDetached.addListener(scheduleAutoDuplicateScan);
  browser.windows.onFocusChanged.addListener((windowId) => {
    if (windowId !== browser.windows.WINDOW_ID_NONE) {
      scheduleAutoDuplicateScan();
    }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes[STORAGE_KEY]) {
      autoScanEnabled = Boolean(
        changes[STORAGE_KEY].newValue?.autoScan ?? DEFAULT_SETTINGS.autoScan
      );
      if (autoScanEnabled) {
        scheduleAutoDuplicateScan();
      } else {
        if (autoScanTimer) {
          clearTimeout(autoScanTimer);
          autoScanTimer = null;
        }
        lastAutoNotificationCount = 0;
        clearAutoNotification();
      }
    }
  });

browser.runtime.onInstalled.addListener(createContextMenu);
createContextMenu();
refreshAutoScanState()
  .then(() => scheduleAutoDuplicateScan())
  .catch((error) => console.error("Auto scan initialization failed:", error));
