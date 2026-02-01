// grid-handlers.js
// Helper to register common Tabulator event handlers in a consistent way

const EVENT_MAP = {
  rowSelected: 'rowSelected',
  rowDeselected: 'rowDeselected',
  rowClick: 'rowClick',
  cellEdited: 'cellEdited',
  dataFiltered: 'dataFiltered',
  dataLoaded: 'dataLoaded',
  dataChanged: 'dataChanged'
};

export function attachGridHandlers(table, handlers = {}) {
  if (!table || typeof table.on !== 'function') return;

  Object.entries(handlers).forEach(([key, value]) => {
    const eventName = EVENT_MAP[key] || key;
    if (!eventName) return;

    const fns = Array.isArray(value) ? value : [value];
    fns.forEach((fn) => {
      if (typeof fn === 'function') {
        table.on(eventName, fn);
      }
    });
  });
}
