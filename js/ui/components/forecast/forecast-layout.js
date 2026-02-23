// forecast-layout.js
// Forecast page layout builder extracted from forecast.js (no behavior change).

export function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Layout: workflow sidebar + main card stack (cards only, no accordions).
  forecastEl.innerHTML = '';

  const layout = document.createElement('div');
  layout.className = 'forecast-layout';

  const sidebar = document.createElement('div');
  sidebar.className = 'forecast-sidebar';

  const sidebarInner = document.createElement('div');
  sidebarInner.className = 'forecast-sidebar-inner bg-main bordered rounded shadow-lg';

  const scenariosTitle = document.createElement('div');
  scenariosTitle.className = 'forecast-sidebar-title section-padding';
  scenariosTitle.textContent = 'Scenarios';

  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  scenarioSelector.className = 'sidebar-scenarios-container';

  sidebarInner.appendChild(scenariosTitle);
  sidebarInner.appendChild(scenarioSelector);

  const workflowTitle = document.createElement('div');
  workflowTitle.className = 'forecast-sidebar-title section-padding';
  workflowTitle.textContent = 'Workflows';

  const workflowNav = document.createElement('div');
  workflowNav.id = 'workflowNav';
  workflowNav.className = 'forecast-workflow-nav';

  sidebarInner.appendChild(workflowTitle);
  sidebarInner.appendChild(workflowNav);
  sidebar.appendChild(sidebarInner);

  const main = document.createElement('div');
  main.className = 'forecast-main forecast-cards-grid';

  const buildCard = ({ id = null, title, contentId, hidden = false }) => {
    const section = document.createElement('div');
    if (id) section.id = id;
    section.className = 'forecast-card bg-main bordered rounded shadow-lg';
    if (hidden) section.classList.add('hidden');

    const header = document.createElement('div');
    header.className = 'section-padding card-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'text-main section-title';
    const chevron = document.createElement('span');
    chevron.className = 'card-chevron';
    chevron.textContent = '▾';
    titleEl.appendChild(chevron);
    titleEl.appendChild(document.createTextNode(title));

    const actions = document.createElement('div');
    actions.className = 'card-header-actions';

    const controls = document.createElement('div');
    controls.className = 'card-header-controls';

    actions.appendChild(controls);

    header.appendChild(titleEl);
    header.appendChild(actions);
    section.appendChild(header);

    const content = document.createElement('div');
    content.id = contentId;
    content.className = 'section-content';
    section.appendChild(content);

    header.addEventListener('click', (e) => {
      if (e.target.closest('.card-header-actions')) return;
      const isCollapsed = section.classList.toggle('card-collapsed');
      chevron.textContent = isCollapsed ? '▸' : '▾';
    });

    return { section, content };
  };

  const { section: summaryCardsSection, content: summaryCardsContent } = buildCard({
    id: 'summaryCardsSection',
    title: 'Summary',
    contentId: 'summaryCardsContent',
    hidden: true
  });
  main.appendChild(summaryCardsSection);

  const { section: accountsSection, content: accountsTable } = buildCard({
    title: 'Accounts',
    contentId: 'accountsTable'
  });
  main.appendChild(accountsSection);

  const { section: generatePlanSection, content: generatePlanContent } = buildCard({
    id: 'generatePlanSection',
    title: 'Generate Plan',
    contentId: 'generatePlanContent',
    hidden: true
  });
  generatePlanSection.style.display = 'none';
  main.appendChild(generatePlanSection);

  const { section: transactionsSection, content: transactionsTable } = buildCard({
    title: 'Transactions',
    contentId: 'transactionsTable'
  });
  main.appendChild(transactionsSection);

  const { section: budgetSection, content: budgetTable } = buildCard({
    id: 'budgetSection',
    title: 'Budget',
    contentId: 'budgetTable'
  });
  main.appendChild(budgetSection);

  const { section: projectionsSection, content: projectionsContent } = buildCard({
    id: 'projectionsSection',
    title: 'Projections',
    contentId: 'projectionsContent'
  });
  main.appendChild(projectionsSection);

  layout.appendChild(sidebar);
  layout.appendChild(main);
  forecastEl.appendChild(layout);

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
