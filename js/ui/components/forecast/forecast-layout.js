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
  main.className = 'forecast-main';

  const buildCard = ({ id = null, title, contentId, hidden = false }) => {
    const section = document.createElement('div');
    if (id) section.id = id;
    section.className = 'bg-main bordered rounded shadow-lg mb-lg';
    if (hidden) section.classList.add('hidden');

    const header = document.createElement('div');
    header.className = 'section-padding';
    header.innerHTML = `<h2 class="text-main section-title">${title}</h2>`;
    section.appendChild(header);

    const content = document.createElement('div');
    content.id = contentId;
    content.className = 'section-content';
    section.appendChild(content);

    return { section, content };
  };

  const { section: summaryCardsSection, content: summaryCardsContent } = buildCard({
    id: 'summaryCardsSection',
    title: 'Summary',
    contentId: 'summaryCardsContent',
    hidden: true
  });
  main.appendChild(summaryCardsSection);

  const { section: accountsSection, content: accountsTable } = buildCard({ title: 'Accounts', contentId: 'accountsTable' });
  main.appendChild(accountsSection);

  const generatePlanSection = document.createElement('div');
  generatePlanSection.id = 'generatePlanSection';
  generatePlanSection.className = 'bg-main bordered rounded shadow-lg mb-lg';
  generatePlanSection.style.display = 'none';
  const generatePlanHeader = document.createElement('div');
  generatePlanHeader.className = 'section-padding';
  generatePlanHeader.innerHTML = `<h2 class="text-main section-title">Generate Plan</h2>`;
  generatePlanSection.appendChild(generatePlanHeader);
  const generatePlanContent = document.createElement('div');
  generatePlanContent.id = 'generatePlanContent';
  generatePlanContent.className = 'section-content';
  generatePlanSection.appendChild(generatePlanContent);
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
