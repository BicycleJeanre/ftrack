// forecast-layout.js
// Forecast page layout builder.
// Updated to render the dashboard shell (sidebar + topbar + dash rows).

import { downloadAppData, uploadAppData } from '../../../app/services/export-service.js';
import { notifyError, notifySuccess, confirmDialog } from '../../../shared/notifications.js';
import { getTheme, setTheme } from '../../../config.js';

const repoRootUrl = new URL('../../../../', import.meta.url);
const logoPath = new URL('assets/ftrack-logo.svg', repoRootUrl).href;

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
  clearBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!await confirmDialog('Are you sure you want to clear all data? This cannot be undone.\n\nConsider exporting your data first.')) return;
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

function buildDashRow({ id, title, defaultCollapsed = false, showControls = true }) {
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

  if (showControls) {
    const controls = document.createElement('div');
    controls.className = 'dash-row-controls';

    const refreshBtn = buildIconButton({
      title: 'Refresh',
      svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M20 12a8 8 0 1 1-2.34-5.66" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M20 4v6h-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      onClick: () => document.dispatchEvent(new CustomEvent('forecast:refresh'))
    });

    controls.appendChild(refreshBtn);

    header.appendChild(chevron);
    header.appendChild(titleEl);
    header.appendChild(controls);
  } else {
    // Only chevron and title
    header.appendChild(chevron);
    header.appendChild(titleEl);
  }

  header.addEventListener('click', (e) => {
    if (e.target.closest('button')) return;
    row.classList.toggle('collapsed');
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

  const sidebarBrand = document.createElement('div');
  sidebarBrand.className = 'sidebar-brand';
  const sidebarLogo = document.createElement('img');
  sidebarLogo.className = 'sidebar-logo';
  sidebarLogo.src = logoPath;
  sidebarLogo.alt = 'FTrack';

  const sidebarTitle = document.createElement('div');
  sidebarTitle.className = 'sidebar-app-title';
  sidebarTitle.textContent = 'FTrack';

  sidebarBrand.appendChild(sidebarLogo);
  sidebarBrand.appendChild(sidebarTitle);
  sidebarHeader.appendChild(sidebarBrand);

  const sidebarContent = document.createElement('div');
  sidebarContent.className = 'sidebar-content';

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

  const topbarLogo = document.createElement('img');
  topbarLogo.className = 'topbar-logo';
  topbarLogo.src = logoPath;
  topbarLogo.alt = 'FTrack';

  const pageTitle = document.createElement('div');
  pageTitle.className = 'page-title';
  pageTitle.textContent = 'FTrack';

  topbar.appendChild(burger);
  topbar.appendChild(topbarLogo);
  topbar.appendChild(pageTitle);
  topbar.appendChild(buildTopbarActions());

  const contentArea = document.createElement('div');
  contentArea.className = 'content-area';
  const dashLayout = document.createElement('div');
  dashLayout.className = 'dash-layout';

  // SUMMARY ROW: Only the summary cards grid should be rendered here.
  const { row: summaryCardsSection, body: summaryCardsBody } = buildDashRow({
     id: 'summaryCardsSection',
     title: 'Summary',
     defaultCollapsed: true
  });
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
    title: 'Accounts & Transactions',
    defaultCollapsed: true
  });
  middleRow.classList.add('row-middle');
  middleBody.style.padding = '0';
  middleBody.style.overflow = 'hidden';

  const panels = document.createElement('div');
  panels.className = 'middle-panels';

  const accountsPanel = document.createElement('div');
  accountsPanel.className = 'dash-panel forecast-card';
  accountsPanel.id = 'accountsSection';
  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'dash-panel-header card-header';
  const accountsHeaderLeft = document.createElement('div');
  accountsHeaderLeft.className = 'card-header-actions';
  const accountsLabel = document.createElement('div');
  accountsLabel.className = 'dash-panel-label';
  accountsLabel.textContent = 'Accounts';
  accountsHeaderLeft.appendChild(accountsLabel);
  const accountsControls = document.createElement('div');
  accountsControls.className = 'card-header-controls';
  accountsHeader.appendChild(accountsHeaderLeft);
  accountsHeader.appendChild(accountsControls);
  const accountsBody = document.createElement('div');
  accountsBody.className = 'dash-panel-body';
  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  accountsBody.appendChild(accountsTable);
  accountsPanel.appendChild(accountsHeader);
  accountsPanel.appendChild(accountsBody);

  const txPanel = document.createElement('div');
  txPanel.className = 'dash-panel forecast-card';
  txPanel.id = 'transactionsSection';
  const txHeader = document.createElement('div');
  txHeader.className = 'dash-panel-header card-header';
  const txHeaderLeft = document.createElement('div');
  txHeaderLeft.className = 'card-header-actions';
  const txLabel = document.createElement('div');
  txLabel.className = 'dash-panel-label';
  txLabel.textContent = 'Transactions';
  txHeaderLeft.appendChild(txLabel);
  const txControls = document.createElement('div');
  txControls.className = 'card-header-controls';
  txHeader.appendChild(txHeaderLeft);
  txHeader.appendChild(txControls);
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
    title: 'Budget',
    defaultCollapsed: true
  });
  const budgetCard = document.createElement('div');
  budgetCard.className = 'forecast-card';
  const budgetHeader = document.createElement('div');
  budgetHeader.className = 'dash-panel-header card-header';
  const budgetHeaderLeft = document.createElement('div');
  budgetHeaderLeft.className = 'card-header-actions';
  const budgetLabel = document.createElement('div');
  budgetLabel.className = 'dash-panel-label';
  budgetLabel.textContent = 'Budget';
  budgetHeaderLeft.appendChild(budgetLabel);
  const budgetControls = document.createElement('div');
  budgetControls.className = 'card-header-controls';
  budgetHeader.appendChild(budgetHeaderLeft);
  budgetHeader.appendChild(budgetControls);
  const budgetContent = document.createElement('div');
  budgetContent.className = 'section-content';
  const budgetTable = document.createElement('div');
  budgetTable.id = 'budgetTable';
  budgetContent.appendChild(budgetTable);
  budgetCard.appendChild(budgetHeader);
  budgetCard.appendChild(budgetContent);
  budgetBody.appendChild(budgetCard);
  dashLayout.appendChild(budgetSection);

  const { row: projectionsSection, body: projectionsBody } = buildDashRow({
    id: 'projectionsSection',
    title: 'Projections',
    defaultCollapsed: true
  });
  const projectionsCard = document.createElement('div');
  projectionsCard.className = 'forecast-card';
  const projectionsHeader = document.createElement('div');
  projectionsHeader.className = 'dash-panel-header card-header';
  const projectionsHeaderLeft = document.createElement('div');
  projectionsHeaderLeft.className = 'card-header-actions';
  const projectionsLabel = document.createElement('div');
  projectionsLabel.className = 'dash-panel-label';
  projectionsLabel.textContent = 'Projections';
  projectionsHeaderLeft.appendChild(projectionsLabel);
  const projectionsControls = document.createElement('div');
  projectionsControls.className = 'card-header-controls';
  projectionsHeader.appendChild(projectionsHeaderLeft);
  projectionsHeader.appendChild(projectionsControls);
  const projectionsContentWrap = document.createElement('div');
  projectionsContentWrap.className = 'section-content';
  const projectionsContent = document.createElement('div');
  projectionsContent.id = 'projectionsContent';
  projectionsContentWrap.appendChild(projectionsContent);
  projectionsCard.appendChild(projectionsHeader);
  projectionsCard.appendChild(projectionsContentWrap);
  projectionsBody.appendChild(projectionsCard);
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
