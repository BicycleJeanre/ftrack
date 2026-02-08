// notifications.js
// Thin wrapper over native alert for now (no UX change).

export function notifySuccess(message) {
  alert(String(message ?? ''));
}

export function notifyError(message) {
  alert(String(message ?? ''));
}
