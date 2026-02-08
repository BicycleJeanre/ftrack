// forecast-generate-plan.js
// Goal-based "Generate Plan" feature extracted from forecast.js (no behavior change).

import { loadLookup } from '../lookup-loader.js';
import { formatMoneyDisplay } from '../grid-factory.js';
import { formatDateOnly } from '../date-utils.js';
import {
  calculateContributionAmount,
  calculateMonthsToGoal,
  calculateFutureValue,
  calculateMonthsBetweenDates,
  getFrequencyName,
  convertContributionFrequency
} from '../goal-calculation-utils.js';
import * as TransactionManager from '../managers/transaction-manager.js';
import { getScenario } from '../data-manager.js';
import { notifyError, notifySuccess } from '../notifications.js';

export async function loadGeneratePlanSection({
  container,
  scenarioState,
  loadMasterTransactionsGrid,
  loadProjectionsSection,
  logger
}) {
  const currentScenario = scenarioState?.get?.();
  if (!currentScenario) {
    container.innerHTML = '<div class="empty-message">No scenario selected</div>';
    return;
  }

  const accounts = currentScenario.accounts || [];
  const displayAccounts = accounts.filter(a => a.name !== 'Select Account' && (a.goalAmount !== null || a.goalAmount !== undefined));

  if (displayAccounts.length === 0) {
    container.innerHTML = '<div class="empty-message">No accounts with goals found. Set goal amounts and dates on accounts to generate plans.</div>';
    return;
  }

  container.innerHTML = '';

  const lookupData = await loadLookup('lookup-data.json');

  // Create form container
  const formContainer = document.createElement('div');
  formContainer.className = 'generate-plan-form';

  // Account selector
  const accountRowDiv = document.createElement('div');
  accountRowDiv.innerHTML = `
    <label for="goal-account-select" class="control-label">Select Account:</label>
    <select id="goal-account-select" class="input-select">
      <option value="">-- Choose an account --</option>
      ${displayAccounts.map(acc => `<option value="${acc.id}">${acc.name} (Goal: ${formatMoneyDisplay(acc.goalAmount)} by ${acc.goalDate})</option>`).join('')}
    </select>
  `;
  window.add(formContainer, accountRowDiv);

  // Solve For selector
  const solveForDiv = document.createElement('div');
  solveForDiv.innerHTML = `
    <label for="goal-solve-for" class="control-label">Solve For:</label>
    <select id="goal-solve-for" class="input-select">
      <option value="contribution">Contribution Amount</option>
      <option value="date">Goal Date</option>
      <option value="amount">Goal Amount</option>
    </select>
  `;
  window.add(formContainer, solveForDiv);

  // Frequency selector
  const frequencyDiv = document.createElement('div');
  frequencyDiv.innerHTML = `
    <label for="goal-frequency" class="control-label">Contribution Frequency:</label>
    <select id="goal-frequency" class="input-select">
      <option value="2">Weekly</option>
      <option value="3" selected>Monthly</option>
      <option value="4">Quarterly</option>
      <option value="5">Yearly</option>
    </select>
  `;
  window.add(formContainer, frequencyDiv);

  // Contribution Amount input (editable when solving for date/amount)
  const contributionDiv = document.createElement('div');
  contributionDiv.innerHTML = `
    <label for="goal-contribution" class="control-label">Contribution Amount:</label>
    <input type="number" id="goal-contribution" class="input-text" placeholder="0.00" step="0.01" />
  `;
  window.add(formContainer, contributionDiv);

  // Results/Summary area
  const summaryDiv = document.createElement('div');
  summaryDiv.id = 'goal-summary';
  summaryDiv.innerHTML = '<p class="text-muted">Select an account and adjust parameters to see calculations</p>';
  window.add(formContainer, summaryDiv);

  // Buttons
  const buttonDiv = document.createElement('div');
  buttonDiv.className = 'generate-plan-buttons';

  const generateBtn = document.createElement('button');
  generateBtn.className = 'btn btn-primary';
  generateBtn.textContent = 'Generate Plan';
  generateBtn.id = 'goal-generate-btn';

  const resetBtn = document.createElement('button');
  resetBtn.className = 'btn btn-secondary';
  resetBtn.textContent = 'Reset';
  resetBtn.id = 'goal-reset-btn';

  window.add(buttonDiv, generateBtn);
  window.add(buttonDiv, resetBtn);
  window.add(formContainer, buttonDiv);

  window.add(container, formContainer);

  // Store state for generate plan
  let generatePlanState = {
    selectedAccountId: null,
    solveFor: 'contribution',
    frequency: 3, // Monthly
    contribution: 0,
    lookupData: lookupData
  };

  // Attach event listeners
  const accountSelect = document.getElementById('goal-account-select');
  const solveForSelect = document.getElementById('goal-solve-for');
  const frequencySelect = document.getElementById('goal-frequency');
  const contributionInput = document.getElementById('goal-contribution');
  const summaryEl = document.getElementById('goal-summary');
  const generateBtnEl = document.getElementById('goal-generate-btn');
  const resetBtnEl = document.getElementById('goal-reset-btn');

  // Recalculate display whenever inputs change
  async function updateSummary() {
    const selectedId = parseInt(accountSelect.value);
    if (!selectedId) {
      summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
      return;
    }

    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    if (!selectedAccount || !selectedAccount.goalAmount || !selectedAccount.goalDate) {
      summaryEl.innerHTML = '<p class="error-message">Selected account does not have goal parameters set</p>';
      return;
    }

    const solveFor = solveForSelect.value;
    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;

    generatePlanState.selectedAccountId = selectedId;
    generatePlanState.solveFor = solveFor;
    generatePlanState.frequency = frequency;
    generatePlanState.contribution = contribution;

    // Calculate the requested value
    const monthsToGoal = calculateMonthsBetweenDates(formatDateOnly(new Date()), selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = selectedAccount.goalAmount;
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let summary = '';
    let error = '';

    if (solveFor === 'contribution') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else {
        const calculatedContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
        const displayContribution = convertContributionFrequency(calculatedContribution, 3, frequency); // Convert from monthly
        contributionInput.value = displayContribution.toFixed(2);
        summary = `<p><strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution: <strong>${formatMoneyDisplay(displayContribution)}</strong> · to reach <strong>${formatMoneyDisplay(goalAmount)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
      }
    } else if (solveFor === 'date') {
      if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const monthsNeeded = calculateMonthsToGoal(startingBalance, goalAmount, monthlyContribution, annualRate);
        if (monthsNeeded === null) {
          error = 'Goal is not reachable with the given contribution amount';
        } else {
          const daysInMonths = Math.ceil(monthsNeeded);
          const futureDate = new Date();
          futureDate.setMonth(futureDate.getMonth() + daysInMonths);
          const formattedDate = formatDateOnly(futureDate);
          summary = `<p><strong>Target date:</strong> <strong>${formattedDate}</strong> · at <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong></p>`;
        }
      }
    } else if (solveFor === 'amount') {
      if (monthsToGoal <= 0) {
        error = 'Goal date must be in the future';
      } else if (contribution <= 0) {
        error = 'Contribution amount must be greater than 0';
      } else {
        const monthlyContribution = convertContributionFrequency(contribution, frequency, 3); // Convert to monthly
        const projectedAmount = calculateFutureValue(startingBalance, monthlyContribution, monthsToGoal, annualRate);
        summary = `<p><strong>Projected goal:</strong> <strong>${formatMoneyDisplay(projectedAmount)}</strong> · with <strong>${getFrequencyName(frequency).toLowerCase()}</strong> contribution of <strong>${formatMoneyDisplay(contribution)}</strong> by <strong>${selectedAccount.goalDate}</strong></p>`;
      }
    }

    if (error) {
      summaryEl.innerHTML = `<p class="error-message">${error}</p>`;
      generateBtnEl.disabled = true;
    } else {
      summaryEl.innerHTML = summary;
      generateBtnEl.disabled = false;
    }
  }

  accountSelect.addEventListener('change', updateSummary);
  solveForSelect.addEventListener('change', () => {
    // Reset contribution when changing solve-for
    if (solveForSelect.value !== 'contribution') {
      contributionInput.disabled = false;
      contributionInput.focus();
    } else {
      contributionInput.disabled = true;
    }
    updateSummary();
  });
  frequencySelect.addEventListener('change', updateSummary);
  contributionInput.addEventListener('input', updateSummary);

  // Handle Generate button
  generateBtnEl.addEventListener('click', async () => {
    const selectedId = parseInt(accountSelect.value);
    if (!selectedId) {
      notifyError('Please select an account');
      return;
    }

    const selectedAccount = displayAccounts.find(a => a.id === selectedId);
    if (!selectedAccount || !selectedAccount.goalAmount || !selectedAccount.goalDate) {
      notifyError('Account does not have goal parameters set');
      return;
    }

    const solveFor = solveForSelect.value;
    const frequency = parseInt(frequencySelect.value);
    const contribution = parseFloat(contributionInput.value) || 0;
    const monthsToGoal = calculateMonthsBetweenDates(formatDateOnly(new Date()), selectedAccount.goalDate);
    const startingBalance = selectedAccount.startingBalance || 0;
    const goalAmount = selectedAccount.goalAmount;
    const annualRate = selectedAccount.periodicChange?.rateValue || 0;

    let monthlyContribution = contribution;

    // Calculate contribution amount if not already solved for
    if (solveFor === 'contribution') {
      monthlyContribution = calculateContributionAmount(startingBalance, goalAmount, monthsToGoal, annualRate);
    } else {
      monthlyContribution = convertContributionFrequency(contribution, frequency, 3);
    }

    // Create the transaction
    try {
      const frequencyLookup = lookupData.frequencies.find(f => f.id === frequency);
      const scenario = scenarioState?.get?.();
      const transactions = scenario?.transactions || [];

      // Remove any existing goal-generated transactions for this account
      const filteredTransactions = transactions.filter(tx => {
        const isGoalGenerated = tx.tags && tx.tags.includes('goal-generated');
        const isForThisAccount = tx.primaryAccountId === selectedId;
        return !(isGoalGenerated && isForThisAccount);
      });

      // Map frequency ID to recurrence type
      const frequencyToRecurrenceType = {
        1: { id: 2, name: 'Daily' },
        2: { id: 3, name: 'Weekly' },
        3: { id: 4, name: 'Monthly - Day of Month' },
        4: { id: 6, name: 'Quarterly' },
        5: { id: 7, name: 'Yearly' }
      };

      const startDateStr = formatDateOnly(new Date());
      const endDateStr = selectedAccount.goalDate;

      // Generate recurring transaction with proper recurrence structure
      const newTransaction = {
        id: 0, // Will be assigned by manager
        primaryAccountId: selectedId,
        secondaryAccountId: null,
        transactionTypeId: 1, // Money In
        amount: Math.abs(monthlyContribution),
        effectiveDate: startDateStr,
        description: `Goal: ${selectedAccount.name}`,
        recurrence: {
          recurrenceType: frequencyToRecurrenceType[frequency] || { id: 3, name: 'Weekly' },
          startDate: startDateStr,
          endDate: endDateStr,
          interval: 1,
          dayOfWeek: frequency === 2 ? { id: new Date().getDay(), name: '' } : null,
          dayOfMonth: frequency === 3 ? new Date().getDate() : null,
          weekOfMonth: null,
          dayOfWeekInMonth: null,
          dayOfQuarter: null,
          month: null,
          dayOfYear: null,
          customDates: null
        },
        periodicChange: selectedAccount.periodicChange || null,
        status: { name: 'planned' },
        tags: ['goal-generated']
      };

      // Use filtered transactions list (without old goal-generated transactions)
      filteredTransactions.push(newTransaction);
      await TransactionManager.saveAll(scenario.id, filteredTransactions);

      // Reload everything
      const refreshed = await getScenario(scenario.id);
      scenarioState?.set?.(refreshed);

      await loadMasterTransactionsGrid(document.getElementById('transactionsTable'));
      await loadProjectionsSection(document.getElementById('projectionsContent'));

      // Format currency for alert message (plain text, no HTML)
      const currencyFormatter = new Intl.NumberFormat('en-ZA', {
        style: 'currency',
        currency: 'ZAR',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      });
      const formattedAmount = currencyFormatter.format(Math.abs(monthlyContribution));

      notifySuccess(`Goal plan generated! ${getFrequencyName(frequency).toLowerCase()} transaction of ${formattedAmount} created.`);

      // Reset form
      accountSelect.value = '';
      contributionInput.value = '';
      await updateSummary();
    } catch (err) {
      logger?.error?.('[GeneratePlan] Failed to generate plan:', err);
      notifyError('Failed to generate plan: ' + err.message);
    }
  });

  // Handle Reset button
  resetBtnEl.addEventListener('click', () => {
    accountSelect.value = '';
    solveForSelect.value = 'contribution';
    frequencySelect.value = '3';
    contributionInput.value = '';
    contributionInput.disabled = true;
    summaryEl.innerHTML = '<p class="text-muted">Select an account to begin</p>';
    generateBtnEl.disabled = true;
  });

  // Set initial state
  contributionInput.disabled = true;
}
