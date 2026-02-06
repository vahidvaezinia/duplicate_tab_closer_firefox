const STORAGE_KEY = "dupTabCloserSettings";
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
  scope: "all"
};

const summaryEl = document.getElementById("summary");
const optionsSummaryEl = document.getElementById("options-summary");
const groupCountEl = document.getElementById("group-count");
const closeCountEl = document.getElementById("close-count");
const closeButton = document.getElementById("close-button");
const cancelButton = document.getElementById("cancel-button");
const detailsEl = document.getElementById("details");
const optionsPanel = document.getElementById("options-panel");

const matchingInputs = {
  ignoreCase: document.getElementById("match-ignore-case"),
  ignoreWWW: document.getElementById("match-ignore-www"),
  ignoreHash: document.getElementById("match-ignore-hash"),
  ignoreSearch: document.getElementById("match-ignore-search"),
  ignorePath: document.getElementById("match-ignore-path"),
  compareTitle: document.getElementById("match-compare-title")
};

let currentScan = null;

function describeOptions(snapshot) {
  if (!snapshot) {
    return "Options are still loading…";
  }

  const matchingRules = [];
  const matching = snapshot.matching || {};
  if (matching.ignoreCase) matchingRules.push("ignore case");
  if (matching.ignoreWWW) matchingRules.push("ignore www");
  if (matching.ignoreHash) matchingRules.push("ignore hash");
  if (matching.ignoreSearch) matchingRules.push("ignore search");
  if (matching.ignorePath) matchingRules.push("ignore path");
  if (matching.compareTitle) matchingRules.push("compare title");
  const matchingText = matchingRules.length
    ? matchingRules.join(", ")
    : "exact URL matches";

  const priorityText = snapshot.priority === "keepNewer" ? "keep newer tab" : "keep older tab";
  const scopeText = snapshot.scope === "active" ? "active window" : "all windows";

  return `Matching rules: ${matchingText}. Priority: ${priorityText}. Scope: ${scopeText}.`;
}

function renderOptionsSummary(snapshot) {
  if (optionsSummaryEl) {
    optionsSummaryEl.textContent = describeOptions(snapshot);
  }
}

function renderDetails(details) {
  detailsEl.innerHTML = "";
  if (!details || details.length === 0) {
    const empty = document.createElement("p");
    empty.className = "detail-empty";
    empty.textContent = "No duplicate groups tracked yet.";
    detailsEl.appendChild(empty);
    return;
  }

  for (const group of details) {
    const entry = document.createElement("div");
    entry.className = "detail-entry";

    const urlLine = document.createElement("div");
    urlLine.className = "detail-url";
    urlLine.textContent = group.url;

    const meta = document.createElement("div");
    meta.className = "detail-meta";
    const priorityLabel = group.priority === "keepNewer" ? "keeps newest tab" : "keeps oldest tab";
    meta.textContent = `${group.total} tab${group.total === 1 ? "" : "s"} in this group — ${priorityLabel}.`;

    const list = document.createElement("ul");
    list.className = "tab-list";
    group.tabs.forEach((tab) => {
      const item = document.createElement("li");
      item.textContent = `#${tab.id} ${tab.title} (window ${tab.windowId})`;
      if (tab.id === group.keptTabId) {
        item.classList.add("kept");
        item.textContent += " (kept)";
      }
      list.appendChild(item);
    });

    entry.append(urlLine, meta, list);
    detailsEl.appendChild(entry);
  }
}

function applySettingsToUI(settings) {
  const matching = settings.matching || {};
  Object.entries(matchingInputs).forEach(([key, input]) => {
    if (input) input.checked = Boolean(matching[key]);
  });
  const priorityInput = document.querySelector(`input[name="priority"][value="${settings.priority}"]`);
  if (priorityInput) {
    priorityInput.checked = true;
  }
  const scopeInput = document.querySelector(`input[name="scope"][value="${settings.scope}"]`);
  if (scopeInput) {
    scopeInput.checked = true;
  }
}

function readSettingsFromUI() {
  const matching = {};
  Object.entries(matchingInputs).forEach(([key, input]) => {
    matching[key] = Boolean(input?.checked);
  });
  const priority = document.querySelector("input[name='priority']:checked")?.value || DEFAULT_SETTINGS.priority;
  const scope = document.querySelector("input[name='scope']:checked")?.value || DEFAULT_SETTINGS.scope;
  return { matching, priority, scope };
}

async function saveSettingsFromUI() {
  const settings = readSettingsFromUI();
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
  renderOptionsSummary(settings);
  await refresh();
}

function wireOptionInputs() {
  if (!optionsPanel) return;
  optionsPanel.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", () => {
      saveSettingsFromUI().catch(console.error);
    });
  });
}

async function loadSettings() {
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

async function initializeOptions() {
  const settings = await loadSettings();
  applySettingsToUI(settings);
  renderOptionsSummary(settings);
  wireOptionInputs();
}

async function refresh() {
  summaryEl.textContent = "Scanning all tabs…";
  closeButton.disabled = true;
  renderOptionsSummary(null);
  try {
    const scan = await browser.runtime.sendMessage({ type: "analyze" });
    currentScan = scan;
    groupCountEl.textContent = scan.duplicateGroupCount;
    closeCountEl.textContent = scan.toCloseCount;

    if (scan.toCloseCount > 0) {
      summaryEl.textContent = `Found ${scan.duplicateGroupCount} duplicate group${
        scan.duplicateGroupCount === 1 ? "" : "s"
      } and ${scan.toCloseCount} tab${scan.toCloseCount === 1 ? "" : "s"} will be closed.`;
      closeButton.disabled = false;
    } else {
      summaryEl.textContent = "No duplicate tabs detected right now.";
    }

    renderDetails(scan.duplicateGroupsDetail);
    renderOptionsSummary(scan.optionsSnapshot);
  } catch (error) {
    summaryEl.textContent = "Unable to scan tabs now. Please try again.";
    console.error("Duplicate Tab Closer scan error:", error);
  }
}

closeButton.addEventListener("click", async () => {
  if (!currentScan || currentScan.toCloseCount === 0) {
    window.close();
    return;
  }
  closeButton.disabled = true;
  closeButton.textContent = "Closing…";
  try {
    await browser.runtime.sendMessage({ type: "close" });
  } catch (error) {
    console.error("Duplicate Tab Closer close error:", error);
  } finally {
    window.close();
  }
});

cancelButton.addEventListener("click", () => window.close());

initializeOptions()
  .then(() => refresh())
  .catch((error) => console.error("Failed to initialize options:", error));
