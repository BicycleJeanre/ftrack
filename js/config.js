let shortcuts = {};
let selectedScenarioId = null;

export async function loadConfig() {
  if (Object.keys(shortcuts).length) return; // Already loaded
  const resp = await fetch('../assets/shortcuts.json');
  shortcuts = await resp.json();
  
  // Load selected scenario from localStorage or default to 1
  const stored = localStorage.getItem('selectedScenarioId');
  selectedScenarioId = stored ? parseInt(stored, 10) : 1;
}

export function getSelectedScenarioId() {
  return selectedScenarioId;
}

export function setSelectedScenarioId(scenarioId) {
  selectedScenarioId = scenarioId;
  localStorage.setItem('selectedScenarioId', scenarioId.toString());
}

export function getShortcut(module, action) {
  return (shortcuts[module] && shortcuts[module][action]) || null;
}

export function getAllShortcuts() {
  return shortcuts;
}

// Utility to match key events to shortcut strings like 'Meta+Shift+A'
export function matchShortcut(event, shortcut) {
  if (!shortcut) return false;
  const parts = shortcut.split('+');
  let key = parts.pop().toLowerCase();
  let meta = parts.includes('Meta');
  let shift = parts.includes('Shift');
  let alt = parts.includes('Alt');
  let ctrl = parts.includes('Control') || parts.includes('Ctrl');
  return (
    event.key.toLowerCase() === key &&
    event.metaKey === meta &&
    event.shiftKey === shift &&
    event.altKey === alt &&
    event.ctrlKey === ctrl
  );
}
