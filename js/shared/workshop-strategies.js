export const SOLVER_STRATEGIES = [
  { value: 'balanced', label: 'Balanced Monthly', allocationStrategy: 'parallel', payoffOrder: 'priority' },
  { value: 'priority-cascade', label: 'Priority Cascade', allocationStrategy: 'cascade', payoffOrder: 'priority' },
  { value: 'snowball', label: 'Debt Snowball', allocationStrategy: 'cascade', payoffOrder: 'snowball' },
  { value: 'avalanche', label: 'Debt Avalanche', allocationStrategy: 'cascade', payoffOrder: 'avalanche' }
];
export const WORKSHOP_STRATEGIES = [
  { value: 'goal-contribution', label: 'Goal Contribution' },
  ...SOLVER_STRATEGIES,
  { value: 'business', label: 'Business Model' }
];

export function getSolverStrategyFields(value) {
  const strategy = SOLVER_STRATEGIES.find(option => option.value === value);
  return strategy ? {
    strategy: strategy.value, allocationStrategy: strategy.allocationStrategy, payoffOrder: strategy.payoffOrder
  } : null;
}

export function resolveWorkshopStrategy(scenario) {
  const saved = scenario?.planning?.workshopStrategy;
  if (WORKSHOP_STRATEGIES.some(option => option.value === saved)) return saved;
  const legacyMode = scenario?.planning?.goalWorkshopMode;
  const settings = scenario?.advancedGoalSettings;
  if (legacyMode === 'simple' || (legacyMode !== 'advanced' && !settings?.goals?.length)) return 'goal-contribution';
  if (getSolverStrategyFields(settings?.strategy)) return settings.strategy;
  if (settings?.allocationStrategy !== 'cascade') return 'balanced';
  if (settings.payoffOrder === 'snowball' || settings.payoffOrder === 'avalanche') return settings.payoffOrder;
  return 'priority-cascade';
}
