// loan-allocation-utils.js
// Utilities for split payment allocations and split-set component transaction generation.

import { calculatePeriodicChange } from './calculation-engine.js';

const DAYS_PER_YEAR = 365.25;

function roundMoney(value) {
  const rounded = Math.round(Math.abs(Number(value || 0)) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toPositiveNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return roundMoney(n);
}

function normalizeRole(value) {
  const role = String(value || '').trim().toLowerCase();
  return role || 'adhoc';
}

function getComponentsAmount(components = []) {
  return (Array.isArray(components) ? components : []).reduce((sum, component) => {
    return sum + toPositiveNumber(component?.amount ?? component?.value);
  }, 0);
}

export function createTransactionGroupId(prefix = 'split') {
  const ts = Date.now();
  const rand = Math.floor(Math.random() * 100000);
  return `${prefix}-${ts}-${rand}`;
}

export function normalizeAllocationComponents(components = []) {
  if (!Array.isArray(components)) return [];
  return components
    .map((component, idx) => {
      const secondaryAccountId = Number(
        component?.secondaryAccountId ??
        component?.accountId ??
        0
      ) || null;
      const amountModeRaw = String(component?.amountMode || '').trim().toLowerCase();
      const amountMode =
        amountModeRaw === 'derived' || amountModeRaw === 'remainder' || amountModeRaw === 'fixed'
          ? amountModeRaw
          : 'fixed';
      return {
        role: normalizeRole(component?.role),
        secondaryAccountId,
        transactionTypeId: Number(component?.transactionTypeId || 2) === 1 ? 1 : 2,
        accountGroupId: Number(component?.accountGroupId || 0) || null,
        amount: toPositiveNumber(component?.amount ?? component?.value),
        description: String(component?.description || '').trim(),
        recurrence: component?.recurrence || null,
        periodicChange: component?.periodicChange || null,
        amountMode,
        order: Number.isFinite(Number(component?.order)) ? Number(component.order) : idx
      };
    })
    .filter((component) => component.amount > 0 && component.secondaryAccountId);
}

export function buildTopDownAllocation({
  totalAmount = 0,
  interestAmount = 0,
  feeAmount = 0,
  additionalComponents = []
} = {}) {
  const total = roundMoney(totalAmount);
  const fee = Math.min(total, roundMoney(feeAmount));
  const additional = Math.min(Math.max(total - fee, 0), roundMoney(getComponentsAmount(additionalComponents)));
  const interest = Math.min(Math.max(total - fee - additional, 0), roundMoney(interestAmount));
  const principal = roundMoney(total - fee - additional - interest);

  return {
    mode: 'top_down',
    totalAmount: total,
    principalAmount: principal,
    interestAmount: interest,
    feeAmount: fee,
    additionalAmount: additional,
    remainder: roundMoney(total - (principal + interest + fee + additional))
  };
}

export function buildManualAllocation({
  principalAmount = 0,
  interestAmount = 0,
  feeAmount = 0,
  additionalComponents = []
} = {}) {
  const principal = roundMoney(principalAmount);
  const interest = roundMoney(interestAmount);
  const fee = roundMoney(feeAmount);
  const additional = roundMoney(getComponentsAmount(additionalComponents));
  const total = roundMoney(principal + interest + fee + additional);

  return {
    mode: 'manual',
    totalAmount: total,
    principalAmount: principal,
    interestAmount: interest,
    feeAmount: fee,
    additionalAmount: additional,
    remainder: 0
  };
}

function estimateInterestFromPeriodicChange({ balance, periodicChange, years }) {
  const startingBalance = Math.abs(Number(balance || 0));
  if (!startingBalance || !periodicChange || years <= 0) return 0;
  try {
    const after = calculatePeriodicChange(startingBalance, periodicChange, years);
    const delta = Math.abs(Number(after || 0)) - startingBalance;
    return roundMoney(Math.max(delta, 0));
  } catch (_) {
    return 0;
  }
}

function estimateInterestFromCustomRate({ balance, customRate, years }) {
  const principal = Math.abs(Number(balance || 0));
  const rate = Math.abs(Number(customRate || 0));
  if (!principal || !rate || years <= 0) return 0;
  return roundMoney(principal * (rate / 100) * years);
}

export function estimateInterestFromAccountRate({
  account = null,
  days = 30,
  customRate = null,
  interestSource = 'account_rate'
} = {}) {
  const years = Math.max(0, Number(days || 0)) / DAYS_PER_YEAR;
  const balance = Math.abs(Number(account?.startingBalance || 0));
  if (!balance || years <= 0) return 0;

  if (interestSource === 'custom_rate') {
    return estimateInterestFromCustomRate({ balance, customRate, years });
  }
  if (interestSource === 'manual' || interestSource === 'none') {
    return 0;
  }

  const periodicChange = account?.periodicChange || null;
  if (!periodicChange) return 0;

  const modeId = Number(periodicChange?.changeMode?.id ?? periodicChange?.changeMode ?? 0);
  const value = Number(periodicChange?.value || 0);
  if (modeId !== 1 || !Number.isFinite(value) || !value) {
    return 0;
  }

  return estimateInterestFromPeriodicChange({ balance, periodicChange, years });
}

export function buildAutoRateAllocation({
  totalAmount = 0,
  feeAmount = 0,
  additionalComponents = [],
  account = null,
  days = 30,
  interestSource = 'account_rate',
  customRate = null,
  manualInterestAmount = 0
} = {}) {
  const total = roundMoney(totalAmount);
  const fee = Math.min(total, roundMoney(feeAmount));
  const additional = Math.min(Math.max(total - fee, 0), roundMoney(getComponentsAmount(additionalComponents)));

  let estimatedInterest = 0;
  if (interestSource === 'manual') {
    estimatedInterest = roundMoney(manualInterestAmount);
  } else {
    estimatedInterest = estimateInterestFromAccountRate({
      account,
      days,
      customRate,
      interestSource
    });
  }
  const interest = Math.min(Math.max(total - fee - additional, 0), estimatedInterest);
  const principal = roundMoney(total - fee - additional - interest);

  return {
    mode: 'auto_rate',
    totalAmount: total,
    principalAmount: principal,
    interestAmount: interest,
    feeAmount: fee,
    additionalAmount: additional,
    estimatedInterest,
    remainder: roundMoney(total - (principal + interest + fee + additional))
  };
}

function buildRoleDescription(description, role) {
  const base = String(description || '').trim();
  const roleLabel = role === 'principal'
    ? 'Principal'
    : (role === 'interest' ? 'Interest' : (role === 'fee' ? 'Fee' : 'Split Component'));
  return base || roleLabel;
}

function normalizeLegacyComponents({
  principalAmount = 0,
  interestAmount = 0,
  feeAmount = 0,
  principalAccountId = null,
  interestAccountId = null,
  feeAccountId = null
} = {}) {
  return normalizeAllocationComponents([
    {
      role: 'principal',
      secondaryAccountId: principalAccountId,
      amount: principalAmount,
      amountMode: 'remainder',
      order: 0
    },
    {
      role: 'interest',
      secondaryAccountId: interestAccountId,
      amount: interestAmount,
      amountMode: 'derived',
      order: 1
    },
    {
      role: 'fee',
      secondaryAccountId: feeAccountId,
      amount: feeAmount,
      amountMode: 'fixed',
      order: 2
    }
  ]);
}

export function buildCompoundTransactions({
  primaryAccountId,
  effectiveDate,
  description = '',
  baseDescription = '',
  transactionGroupId = createTransactionGroupId(),
  components = [],
  principalAmount = 0,
  interestAmount = 0,
  feeAmount = 0,
  principalAccountId = null,
  interestAccountId = null,
  feeAccountId = null,
  tags = []
} = {}) {
  const primaryId = Number(primaryAccountId || 0);
  if (!primaryId) return [];

  const normalizedComponents = normalizeAllocationComponents(components);
  const finalComponents = normalizedComponents.length
    ? normalizedComponents
    : normalizeLegacyComponents({
      principalAmount,
      interestAmount,
      feeAmount,
      principalAccountId,
      interestAccountId,
      feeAccountId
    });

  const shared = {
    primaryAccountId: primaryId,
    transactionTypeId: 2, // Money Out split payment
    effectiveDate: effectiveDate || null,
    status: 'planned',
    recurrence: null,
    periodicChange: null,
    tags: Array.isArray(tags) ? tags : []
  };

  const finalDescription = String(description || baseDescription || '').trim();

  return finalComponents
    .map((component) => ({
      ...shared,
      id: 0,
      transactionTypeId: Number(component?.transactionTypeId || shared.transactionTypeId || 2) === 1 ? 1 : 2,
      secondaryAccountId: component.secondaryAccountId,
      amount: toPositiveNumber(component.amount),
      description: String(component.description || '').trim() || buildRoleDescription(finalDescription, component.role),
      transactionGroupId,
      transactionGroupRole: normalizeRole(component.role),
      transactionGroupAccountGroupId: Number(component?.accountGroupId || 0) || null,
      recurrence: component?.recurrence || null,
      periodicChange: component?.periodicChange || null
    }))
    .filter((component) => component.amount > 0 && component.secondaryAccountId);
}
