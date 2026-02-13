// grid-state.js

export class GridStateManager {
  constructor(name) {
    this.name = name;
    this.clear();
  }

  capture(table, dropdownSelectors = {}) {
    const tableEl = table?.element || table?.getElement?.() || null;

    this.state.scrollTop = tableEl?.scrollTop || 0;
    this.state.sorters = table?.getSorters?.() || [];
    this.state.groupBy = table?.getGroupBy?.() ?? table?.options?.groupBy ?? null;

    Object.entries(dropdownSelectors).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      this.state.dropdowns[key] = element ? element.value : null;
    });
  }

  restore(table, options = {}) {
    if (!table) return;

    const {
      restoreSort = true,
      restoreGroupBy = true,
      restoreScroll = true
    } = options;

    if (restoreSort && this.state.sorters?.length > 0 && table.setSort) {
      try {
        table.setSort(this.state.sorters);
      } catch (_) {
        // Keep existing behavior: ignore restore errors.
      }
    }

    if (restoreGroupBy && this.state.groupBy && table.setGroupBy) {
      try {
        table.setGroupBy(this.state.groupBy);
      } catch (_) {
        // Keep existing behavior: ignore restore errors.
      }
    }

    if (restoreScroll && this.state.scrollTop > 0) {
      const tableEl = table?.element || table?.getElement?.() || null;
      if (tableEl) {
        setTimeout(() => {
          try {
            tableEl.scrollTop = this.state.scrollTop;
          } catch (_) {
            // ignore
          }
        }, 50);
      }
    }
  }

  restoreDropdowns(dropdownSelectors = {}) {
    Object.entries(dropdownSelectors).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      const value = this.state.dropdowns[key];
      if (!element) return;
      if (value === null || value === undefined) return;

      element.value = value;
      element.dispatchEvent(new Event('change'));
    });
  }

  clear() {
    this.state = {
      scrollTop: 0,
      sorters: [],
      groupBy: null,
      dropdowns: {}
    };
  }
}
