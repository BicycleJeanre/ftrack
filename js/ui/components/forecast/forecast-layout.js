// forecast-layout.js
// Forecast page layout builder extracted from forecast.js (no behavior change).

export function buildGridContainer() {
  const forecastEl = getEl('panel-forecast');

  // Scenarios section with accordion (at the top)
  const scenarioSection = document.createElement('div');
  scenarioSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const scenarioHeader = document.createElement('div');
  scenarioHeader.className = 'pointer flex-between accordion-header section-padding';
  scenarioHeader.innerHTML = `<h2 class="text-main section-title">Scenarios</h2><span class="accordion-arrow">&#9662;</span>`;
  scenarioHeader.addEventListener('click', () => window.toggleAccordion('scenarioContent'));
  window.add(scenarioSection, scenarioHeader);

  const scenarioContent = document.createElement('div');
  scenarioContent.id = 'scenarioContent';
  scenarioContent.className = 'accordion-content hidden';
  window.add(scenarioSection, scenarioContent);

  const scenarioSelector = document.createElement('div');
  scenarioSelector.id = 'scenario-selector';
  window.add(scenarioContent, scenarioSelector);
  window.add(forecastEl, scenarioSection);

  // Summary Cards section with accordion (NEW - for debt repayment scenarios)
  const summaryCardsSection = document.createElement('div');
  summaryCardsSection.id = 'summaryCardsSection';
  summaryCardsSection.className = 'bg-main bordered rounded shadow-lg mb-lg hidden';

  const summaryCardsHeader = document.createElement('div');
  summaryCardsHeader.className = 'pointer flex-between accordion-header section-padding';
  summaryCardsHeader.innerHTML = `<h2 class="text-main section-title">Summary</h2><span class="accordion-arrow">&#9662;</span>`;
  summaryCardsHeader.addEventListener('click', () => window.toggleAccordion('summaryCardsContent'));
  window.add(summaryCardsSection, summaryCardsHeader);

  const summaryCardsContent = document.createElement('div');
  summaryCardsContent.id = 'summaryCardsContent';
  summaryCardsContent.className = 'accordion-content section-content';
  window.add(summaryCardsSection, summaryCardsContent);

  window.add(forecastEl, summaryCardsSection);

  // Accounts section with accordion
  const accountsSection = document.createElement('div');
  accountsSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const accountsHeader = document.createElement('div');
  accountsHeader.className = 'pointer flex-between accordion-header section-padding';
  accountsHeader.innerHTML = `<h2 class="text-main section-title">Accounts</h2><span class="accordion-arrow">&#9662;</span>`;
  accountsHeader.addEventListener('click', () => window.toggleAccordion('accountsContent'));
  window.add(accountsSection, accountsHeader);

  const accountsContent = document.createElement('div');
  accountsContent.id = 'accountsContent';
  accountsContent.className = 'accordion-content hidden';
  window.add(accountsSection, accountsContent);

  const accountsTable = document.createElement('div');
  accountsTable.id = 'accountsTable';
  window.add(accountsContent, accountsTable);
  window.add(forecastEl, accountsSection);

  // Generate Plan section (Goal-Based scenarios only)
  const generatePlanSection = document.createElement('div');
  generatePlanSection.id = 'generatePlanSection';
  generatePlanSection.className = 'bg-main bordered rounded shadow-lg mb-lg';
  generatePlanSection.style.display = 'none'; // Hidden by default

  const generatePlanHeader = document.createElement('div');
  generatePlanHeader.className = 'pointer flex-between accordion-header section-padding';
  generatePlanHeader.innerHTML = `<h2 class="text-main section-title">Generate Plan</h2><span class="accordion-arrow">&#9662;</span>`;
  generatePlanHeader.addEventListener('click', () => window.toggleAccordion('generatePlanContent'));
  window.add(generatePlanSection, generatePlanHeader);

  const generatePlanContent = document.createElement('div');
  generatePlanContent.id = 'generatePlanContent';
  generatePlanContent.className = 'accordion-content hidden';
  window.add(generatePlanSection, generatePlanContent);
  window.add(forecastEl, generatePlanSection);

  // Transactions section (unified planned and actual)
  const transactionsSection = document.createElement('div');
  transactionsSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const transactionsHeader = document.createElement('div');
  transactionsHeader.className = 'pointer flex-between accordion-header section-padding';
  transactionsHeader.innerHTML = `<h2 class="text-main section-title">Transactions</h2><span class="accordion-arrow">&#9662;</span>`;
  transactionsHeader.addEventListener('click', () => window.toggleAccordion('transactionsContent'));
  window.add(transactionsSection, transactionsHeader);

  const transactionsContent = document.createElement('div');
  transactionsContent.id = 'transactionsContent';
  transactionsContent.className = 'accordion-content section-content hidden';
  window.add(transactionsSection, transactionsContent);

  const transactionsTable = document.createElement('div');
  transactionsTable.id = 'transactionsTable';
  window.add(transactionsContent, transactionsTable);

  window.add(forecastEl, transactionsSection);

  // Budget section
  const budgetSection = document.createElement('div');
  budgetSection.id = 'budgetSection';
  budgetSection.className = 'bg-main bordered rounded shadow-lg mb-lg';

  const budgetHeader = document.createElement('div');
  budgetHeader.id = 'budgetAccordionHeader';
  budgetHeader.className = 'pointer flex-between accordion-header section-padding';
  budgetHeader.innerHTML = `<h2 class="text-main section-title">Budget</h2><span class="accordion-arrow">&#9662;</span>`;
  budgetHeader.addEventListener('click', () => window.toggleAccordion('budgetContent'));
  window.add(budgetSection, budgetHeader);

  const budgetContent = document.createElement('div');
  budgetContent.id = 'budgetContent';
  budgetContent.className = 'accordion-content section-content hidden';
  window.add(budgetSection, budgetContent);

  const budgetTable = document.createElement('div');
  budgetTable.id = 'budgetTable';
  window.add(budgetContent, budgetTable);

  window.add(forecastEl, budgetSection);

  // Projections section (full width)
  const projectionsSection = document.createElement('div');
  projectionsSection.id = 'projectionsSection';
  projectionsSection.className = 'bg-main bordered rounded shadow-lg';
  projectionsSection.classList.add('mb-lg');

  const projectionsHeader = document.createElement('div');
  projectionsHeader.id = 'projectionsAccordionHeader';
  projectionsHeader.className = 'pointer flex-between accordion-header section-padding';
  projectionsHeader.innerHTML = `<h2 class="text-main section-title">Projections</h2><span class="accordion-arrow">&#9662;</span>`;
  projectionsHeader.addEventListener('click', () => window.toggleAccordion('projectionsContent'));
  window.add(projectionsSection, projectionsHeader);

  const projectionsContent = document.createElement('div');
  projectionsContent.id = 'projectionsContent';
  projectionsContent.className = 'accordion-content hidden';
  window.add(projectionsSection, projectionsContent);
  window.add(forecastEl, projectionsSection);

  return {
    scenarioSelector,
    summaryCardsContent,
    accountsTable,
    transactionsTable,
    budgetTable,
    projectionsContent
  };
}
