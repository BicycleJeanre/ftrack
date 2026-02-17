// grid-state.js

export class GridStateManager {
  constructor(name) {
    this.name = name;
    this.clear();
  }

  capture(table, dropdownSelectors = {}) {
    const tableEl = table?.element || table?.getElement?.() || null;
    const scrollEl =
      tableEl?.querySelector?.('.tabulator-tableholder') ||
      tableEl;

    this.state.scrollTop = scrollEl?.scrollTop || 0;
    this.state.sorters = table?.getSorters?.() || [];
    this.state.groupBy = table?.getGroupBy?.() ?? table?.options?.groupBy ?? null;

    try {
      const selected = table?.getSelectedData?.() || [];
      this.state.selectedRowIds = selected
        .map((row) => row?.id)
        .filter((id) => id !== null && id !== undefined);
    } catch (_) {
      this.state.selectedRowIds = [];
    }

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
      restoreScroll = true,
      restoreSelection = true
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
      const scrollEl =
        tableEl?.querySelector?.('.tabulator-tableholder') ||
        tableEl;
      if (scrollEl) {
        setTimeout(() => {
          try {
            scrollEl.scrollTop = this.state.scrollTop;
          } catch (_) {
            // ignore
          }
        }, 50);
      }
    }

    if (restoreSelection && this.state.selectedRowIds?.length > 0 && table.selectRow) {
      try {
        table.selectRow(this.state.selectedRowIds);
      } catch (_) {
        // ignore
      }
    }
  }

  restoreDropdowns(dropdownSelectors = {}, options = {}) {
    const { dispatchChange = true } = options;
    Object.entries(dropdownSelectors).forEach(([key, selector]) => {
      const element = document.querySelector(selector);
      const value = this.state.dropdowns[key];
      if (!element) return;
      if (value === null || value === undefined) return;

      element.value = value;
      if (dispatchChange) {
        element.dispatchEvent(new Event('change'));
      }
    });
  }

  clear() {
    this.state = {
      scrollTop: 0,
      sorters: [],
      groupBy: null,
      selectedRowIds: [],
      dropdowns: {}
    };
  }
}
