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
  scope: "all",
  autoScan: true
};

const matchingInputs = {
  ignoreCase: document.getElementById("match-ignore-case"),
  ignoreWWW: document.getElementById("match-ignore-www"),
  ignoreHash: document.getElementById("match-ignore-hash"),
  ignoreSearch: document.getElementById("match-ignore-search"),
  ignorePath: document.getElementById("match-ignore-path"),
  compareTitle: document.getElementById("match-compare-title")
};
const autoScanInput = document.getElementById("opt-auto-scan");
const statusEl = document.getElementById("status-message");
let statusTimer = null;

function applySettings(settings) {
  const matching = settings.matching || {};
  Object.entries(matchingInputs).forEach(([key, input]) => {
    input.checked = Boolean(matching[key]);
  });

  const priority = document.querySelector(`input[name="priority"][value="${settings.priority}"]`);
  const scope = document.querySelector(`input[name="scope"][value="${settings.scope}"]`);
  if (priority) {
    priority.checked = true;
  }
  if (scope) {
    scope.checked = true;
  }
  if (autoScanInput) {
    autoScanInput.checked = Boolean(settings.autoScan);
  }
}

function readSettingsFromUI() {
  const matching = {};
  Object.entries(matchingInputs).forEach(([key, input]) => {
    matching[key] = input.checked;
  });
  const priority = document.querySelector("input[name='priority']:checked")?.value || DEFAULT_SETTINGS.priority;
  const scope = document.querySelector("input[name='scope']:checked")?.value || DEFAULT_SETTINGS.scope;
  return {
    matching,
    priority,
    scope,
    autoScan: Boolean(autoScanInput?.checked)
  };
}

async function saveSettings(settings, showStatus = true) {
  await browser.storage.local.set({ [STORAGE_KEY]: settings });
  if (showStatus && statusEl) {
    statusEl.textContent = "Settings saved.";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.textContent = "";
    }, 1500);
  }
}

async function loadSettings() {
  const stored = (await browser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] || {};
  const merged = {
    ...DEFAULT_SETTINGS,
    ...stored,
    matching: {
      ...DEFAULT_SETTINGS.matching,
      ...(stored.matching || {})
    }
  };
  applySettings(merged);
  if (statusEl) {
    statusEl.textContent = "Settings loaded.";
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => {
      statusEl.textContent = "";
    }, 1500);
  }
}

function wireInputs() {
  document.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", async () => {
      const settings = readSettingsFromUI();
      await saveSettings(settings);
    });
  });
}

wireInputs();
loadSettings();
