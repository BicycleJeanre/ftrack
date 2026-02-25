// forecast-layout.js
// Forecast page layout builder.
// Updated to render the dashboard shell (sidebar + topbar + dash rows).

import { downloadAppData, uploadAppData } from '../../../app/services/export-service.js';
import { notifyError, notifySuccess } from '../../../shared/notifications.js';
import { getTheme, setTheme } from '../../../config.js';

const repoRootUrl = new URL('../../../../', import.meta.url);

function buildIconButton({ title, svg, onClick, extraClass = '' }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = `icon-btn${extraClass ? ` ${extraClass}` : ''}`;
  btn.title = title;
  btn.setAttribute('aria-label', title);
  btn.innerHTML = svg;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    onClick?.();
  });
  return btn;
}

function buildBurgerButton({ onClick }) {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'burger-menu icon-btn';
  btn.title = 'Menu';
  btn.setAttribute('aria-label', 'Menu');
  btn.innerHTML = `
    <span class="burger-line"></span>
    <span class="burger-line"></span>
    <span class="burger-line"></span>
  `;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    onClick?.();
  });
  return btn;
}

function applyTheme(themeBtn) {
  const theme = getTheme();
  document.documentElement.setAttribute('data-theme', theme);
  if (themeBtn) themeBtn.textContent = theme === 'dark' ? 'Light Theme' : 'Dark Theme';
}

function buildTopbarActions() {
  const actions = document.createElement('div');
  actions.className = 'topbar-actions';

  const themeBtn = document.createElement('button');
  themeBtn.type = 'button';
  themeBtn.className = 'btn btn-ghost';
  themeBtn.title = 'Toggle theme';
  applyTheme(themeBtn);
  themeBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const nextTheme = document.documentElement.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
    setTheme(nextTheme);
    applyTheme(themeBtn);
  });

  const exportBtn = document.createElement('button');
  exportBtn.type = 'button';
  exportBtn.className = 'btn btn-secondary';
  exportBtn.title = 'Export data to file';
  exportBtn.textContent = 'Export Data';
  exportBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await downloadAppData();
    } catch (err) {
      notifyError('Export failed: ' + err.message);
    }
  });

  const importBtn = document.createElement('button');
  importBtn.type = 'button';
  importBtn.className = 'btn btn-secondary';
  importBtn.title = 'Import data from file';
  importBtn.textContent = 'Import Data';
  importBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      await uploadAppData(false);
    } catch (err) {
      notifyError('Import failed: ' + err.message);
    }
  });

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'btn btn-danger';
  clearBtn.title = 'Clear all data from browser storage';
  clearBtn.textContent = 'Clear Data';
  clearBtn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!confirm('Are you sure you want to clear all data? This cannot be undone.\n\nConsider exporting your data first.')) return;
    try {
      localStorage.removeItem('ftrack:app-data');
      notifySuccess('All data cleared successfully. The page will now reload.');
      window.location.reload();
    } catch (err) {
      notifyError('Failed to clear data: ' + err.message);
    }
  });

  actions.appendChild(themeBtn);
  actions.appendChild(exportBtn);
  actions.appendChild(importBtn);
  actions.appendChild(clearBtn);
  return actions;
}

function buildSidebarNavSection() {
  const section = document.createElement('div');
  section.className = 'sidebar-section';

  const title = document.createElement('div');
  title.className = 'sidebar-section-title';
  title.textContent = 'Navigation';
  section.appendChild(title);

  const homeHref = new URL('index.html', repoRootUrl).href;
  const forecastHref = new URL('pages/forecast.html', repoRootUrl).href;
  const documentationHref = new URL('pages/documentation.html', repoRootUrl).href;

  const links = [
    { href: homeHref, label: 'Home' },
    { href: forecastHref, label: 'Forecast', active: true },
    { href: documentationHref, label: 'Documentation' }
  ];

  links.forEach((link) => {
    const a = document.createElement('a');
    a.className = `sidebar-item${link.active ? ' active' : ''}`;
    a.href = link.href;
    a.textContent = link.label;
    section.appendChild(a);
  });

  return section;
}

function buildDashRow({ id, title, defaultCollapsed = false }) {
  const row = document.createElement('section');
  row.className = 'dash-row';
  row.id = id;
  if (defaultCollapsed) row.classList.add('collapsed');

  const header = document.createElement('div');
  header.className = 'dash-row-header';

  const chevron = document.createElement('span');
  chevron.className = 'dash-row-chevron';
  chevron.innerHTML = '<svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 4.5l4 4 4-4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  const titleEl = document.createElement('span');
  titleEl.className = 'dash-row-title';
  titleEl.textContent = title;

  const controls = document.createElement('div');
  controls.className = 'dash-row-controls';

  const refreshBtn = buildIconButton({
    title: 'Refresh',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    onClick: () => document.dispatchEvent(new CustomEvent('forecast:refresh'))
  });

  const minimizeBtn = buildIconButton({
    title: 'Minimize',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M6 12h12" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    onClick: () => {
      row.classList.toggle('minimized');
      row.classList.remove('collapsed');
    }
  });

  const focusBtn = buildIconButton({
    title: 'Focus',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M9 3H3v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 3h6v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M9 21H3v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M15 21h6v-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    onClick: () => {
      const isFocused = row.classList.toggle('focused');
      document.querySelectorAll('.dash-row.focused').forEach((el) => {
        if (el !== row) el.classList.remove('focused');
      });
      if (!isFocused) row.classList.remove('focused');
    }
  });

  controls.appendChild(refreshBtn);
  controls.appendChild(minimizeBtn);
  controls.appendChild(focusBtn);

  header.appendChild(chevron);
  header.appendChild(titleEl);
  header.appendChild(controls);

  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    row.classList.toggle('collapsed');
    row.classList.remove('minimized');
  });

  const body = document.createElement('div');
  body.className = 'dash-row-body';

  row.appendChild(header);
  row.appendChild(body);
  return { row, body };
}

export function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');
  forecastEl.innerHTML = '';

  document.body.classList.add('dashboard-shell');

  const app = document.createElement('div');
  app.className = 'app-container';

  const backdrop = document.createElement('div');
  backdrop.className = 'sidebar-backdrop hidden';

  const sidebar = document.createElement('aside');
  sidebar.className = 'sidebar';

  const sidebarHeader = document.createElement('div');
  sidebarHeader.className = 'sidebar-header';
  const sidebarTitle = document.createElement('div');
  sidebarTitle.className = 'sidebar-app-title';
  sidebarTitle.textContent = 'FTrack';
  sidebarHeader.appendChild(sidebarTitle);

  const sidebarContent = document.createElement('div');
  sidebarContent.className = 'sidebar-content';
  sidebarContent.appendChild(buildSidebarNavSection());

  const scenariosSection = document.createElement('div');
  scenariosSection.className = 'sidebar-section';
  const scenariosTitle = document.createElement('div');
  scenariosTitle.className = 'sidebar-section-title';
  scenariosTitle.textContent = 'Scenarios';

  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  scenarioSelector.className = 'sidebar-scenarios-container';
  scenariosSection.appendChild(scenariosTitle);
  scenariosSection.appendChild(scenarioSelector);

  const workflowSection = document.createElement('div');
  workflowSection.className = 'sidebar-section';
  const workflowTitle = document.createElement('div');
  workflowTitle.className = 'sidebar-section-title';
  workflowTitle.textContent = 'Workflows';

  const workflowNav = document.createElement('div');
  workflowNav.id = 'workflowNav';
  workflowNav.className = 'forecast-workflow-nav';
  workflowSection.appendChild(workflowTitle);
  workflowSection.appendChild(workflowNav);

  sidebarContent.appendChild(scenariosSection);
  sidebarContent.appendChild(workflowSection);

  sidebar.appendChild(sidebarHeader);
  sidebar.appendChild(sidebarContent);

  const main = document.createElement('main');
  main.className = 'main-content';

  const topbar = document.createElement('div');
  topbar.className = 'topbar';

  const toggleSidebar = () => {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    if (isMobile) {
      const open = sidebar.classList.toggle('open');
      backdrop.classList.toggle('hidden', !open);
    } else {
      sidebar.classList.toggle('collapsed');
    }
  };

  const burger = buildBurgerButton({ onClick: toggleSidebar });
  const pageTitle = document.createElement('div');
  pageTitle.className = 'page-title';
  pageTitle.textContent = 'Forecast';

  topbar.appendChild(burger);
  topbar.appendChild(pageTitle);
  topbar.appendChild(buildTopbarActions());

  const contentArea = document.createElement('div');
  contentArea.className = 'content-area';
  const dashLayout = document.createElement('div');
  dashLayout.className = 'dash-layout';

  const { row: summaryCardsSection, body: summaryCardsBody } = buildDashRow({
    id: 'summaryCardsSection',
    title: 'Summary'
  });
  summaryCardsSection.classList.add('hidden');
  const summaryCardsContent = document.createElement('div');
  summaryCardsContent.id = 'summaryCardsContent';
  summaryCardsBody.appendChild(summaryCardsContent);
  dashLayout.appendChild(summaryCardsSection);

  const { row: generatePlanSection, body: generatePlanBody } = buildDashRow({
    id: 'generatePlanSection',
    title: 'Generate Plan',
    defaultCollapsed: true
  });
  generatePlanSection.style.display = 'none';
  const generatePlanContent = document.createElement('div');
  generatePlanContent.id = 'generatePlanContent';
  generatePlanBody.appendChild(generatePlanContent);
  dashLayout.appendChild(generatePlanSection);

  const { row: middleRow, body: middleBody } = buildDashRow({
    id: 'row-middle',
    title: 'Accounts & Transactions'
  });
  middleRow.classList.add('row-middle');
  middleBody.style.padding = '0';
  middleBody.style.overflow = 'hidden';

  const panels = document.createElement('div');
  panels.className = 'middle-panels';

  const accountsPanel = document.createElement('div');
  accountsPanel.className = 'dash-panel';
  accountsPanel.id = 'accountsSection';
  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'dash-panel-header';
  const accountsLabel = document.createElement('div');
  accountsLabel.className = 'dash-panel-label';
  accountsLabel.textContent = 'Accounts';
  accountsHeader.appendChild(accountsLabel);
  const accountsBody = document.createElement('div');
  accountsBody.className = 'dash-panel-body';
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  accountsBody.appendChild(accountsTable);
  accountsPanel.appendChild(accountsHeader);
  accountsPanel.appendChild(accountsBody);

  const txPanel = document.createElement('div');
  txPanel.className = 'dash-panel';
  txPanel.id = 'transactionsSection';
  const txHeader = document.createElement('div');
  txHeader.className = 'dash-panel-header';
  const txLabel = document.createElement('div');
  txLabel.className = 'dash-panel-label';
  txLabel.textContent = 'Transactions';
  txHeader.appendChild(txLabel);
  const txBody = document.createElement('div');
  txBody.className = 'dash-panel-body';
  const transactionsTable = document.createElement('div');
  transactionsTable.id = 'transactionsTable';
  txBody.appendChild(transactionsTable);
  txPanel.appendChild(txHeader);
  txPanel.appendChild(txBody);

  panels.appendChild(accountsPanel);
  panels.appendChild(txPanel);
  middleBody.appendChild(panels);
  dashLayout.appendChild(middleRow);

  const { row: budgetSection, body: budgetBody } = buildDashRow({
    id: 'budgetSection',
    title: 'Budget'
  });
  const budgetTable = document.createElement('div');
  budgetTable.id = 'budgetTable';
  budgetBody.appendChild(budgetTable);
  dashLayout.appendChild(budgetSection);

  const { row: projectionsSection, body: projectionsBody } = buildDashRow({
    id: 'projectionsSection',
    title: 'Projections'
  });
  const projectionsContent = document.createElement('div');
  projectionsContent.id = 'projectionsContent';
  projectionsBody.appendChild(projectionsContent);
  dashLayout.appendChild(projectionsSection);

  contentArea.appendChild(dashLayout);
  main.appendChild(topbar);
  main.appendChild(contentArea);

  app.appendChild(sidebar);
  app.appendChild(main);
  app.appendChild(backdrop);
  forecastEl.appendChild(app);

  backdrop.addEventListener('click', () => {
    sidebar.classList.remove('open');
    backdrop.classList.add('hidden');
  });

  window.addEventListener('resize', () => {
    const isMobile = window.matchMedia && window.matchMedia('(max-width: 640px)').matches;
    if (!isMobile) {
      sidebar.classList.remove('open');
      backdrop.classList.add('hidden');
    }
  });

  return {
    workflowNav,
    scenarioSelector,
    summaryCardsContent,
    accountsTable,
    transactionsTable,
    budgetTable,
    projectionsContent
  };
}
