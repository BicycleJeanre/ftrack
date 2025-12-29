// Projection Engine for Budget & Forecast System
// Generates period-based projections with interest/growth calculations and double-entry validation

export class ProjectionEngine {
    constructor(dataManager) {
        this.dataManager = dataManager;
    }

    /**
     * Generate projections for a scenario
     */
    async generateProjections(scenarioId) {
        const scenario = this.dataManager.getScenario(scenarioId);
        if (!scenario) throw new Error(`Scenario ${scenarioId} not found`);

        console.log(`Generating projections for scenario: ${scenario.name}`);

        // 1. Calculate periods
        const periods = this.calculatePeriods(
            scenario.startDate,
            scenario.endDate,
            scenario.projectionPeriod
        );
        console.log(`Generated ${periods.length} periods`);

        // 2. Get planned transactions
        const plannedTransactions = this.dataManager.getPlannedTransactions(scenarioId);
        console.log(`Found ${plannedTransactions.length} planned transactions`);

        // 3. Apply transaction overrides
        const effectivePlannedTxs = this.applyTransactionOverrides(
            plannedTransactions,
            scenario.transactionOverrides || []
        );

        // 4. Get accounts for scenario
        const allAccounts = this.dataManager.cachedData.accounts;
        
        // Start with scenario accounts
        const scenarioAccountIds = new Set((scenario.accounts || []).map(a => a.id));
        
        // Add all accounts involved in planned transactions
        effectivePlannedTxs.forEach(pt => {
            if (pt.fromAccount) scenarioAccountIds.add(pt.fromAccount.id);
            if (pt.toAccount) scenarioAccountIds.add(pt.toAccount.id);
        });
        
        // Build list of accounts to project
        const scenarioAccounts = Array.from(scenarioAccountIds).map(id => {
            const baseAccount = allAccounts.find(a => a.id === id);
            if (!baseAccount) return null;
            
            // Check if this is a primary account
            const isPrimary = (scenario.accounts || []).some(sa => sa.id === id && sa.isPrimary);
            return { ...baseAccount, isPrimary };
        }).filter(a => a !== null);
        
        console.log(`Processing ${scenarioAccounts.length} accounts (including related accounts)`);

        // 5. Generate projections for each account
        const allProjections = [];
        for (const account of scenarioAccounts) {
            const accountProjections = this.projectAccount(
                account,
                scenario,
                effectivePlannedTxs,
                periods
            );
            allProjections.push(...accountProjections);
        }

        // 6. Validate double-entry (debits = credits)
        this.validateDoubleEntry(allProjections, periods);
        console.log('Double-entry validation passed!');

        // 7. Save projections
        await this.dataManager.saveProjections(allProjections, scenarioId);
        console.log(`Saved ${allProjections.length} projections`);

        return allProjections;
    }

    /**
     * Calculate periods between start and end dates
     */
    calculatePeriods(startDate, endDate, periodType) {
        const periods = [];
        let currentDate = new Date(startDate);
        const end = new Date(endDate);

        while (currentDate <= end) {
            const periodEnd = this.addPeriod(new Date(currentDate), periodType);
            const periodStart = new Date(currentDate);

            periods.push({
                startDate: periodStart,
                endDate: periodEnd < end ? periodEnd : end,
                label: this.formatPeriodLabel(periodStart, periodType),
                days: this.daysBetween(periodStart, periodEnd < end ? periodEnd : end)
            });

            currentDate = new Date(periodEnd);
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return periods;
    }

    /**
     * Add a period to a date based on period type
     */
    addPeriod(date, periodType) {
        const result = new Date(date);
        switch (periodType) {
            case 'Day':
                result.setDate(result.getDate() + 1);
                break;
            case 'Week':
                result.setDate(result.getDate() + 7);
                break;
            case 'Month':
                result.setMonth(result.getMonth() + 1);
                break;
            case 'Quarter':
                result.setMonth(result.getMonth() + 3);
                break;
            case 'Year':
                result.setFullYear(result.getFullYear() + 1);
                break;
        }
        result.setDate(result.getDate() - 1); // Last day of period
        return result;
    }

    /**
     * Format period label for display
     */
    formatPeriodLabel(date, periodType) {
        const month = date.toLocaleString('default', { month: 'long' });
        const year = date.getFullYear();

        switch (periodType) {
            case 'Day':
                return date.toLocaleDateString();
            case 'Week':
                return `Week of ${date.toLocaleDateString()}`;
            case 'Month':
                return `${month} ${year}`;
            case 'Quarter':
                const quarter = Math.floor(date.getMonth() / 3) + 1;
                return `Q${quarter} ${year}`;
            case 'Year':
                return `${year}`;
            default:
                return date.toLocaleDateString();
        }
    }

    /**
     * Calculate days between two dates
     */
    daysBetween(start, end) {
        const msPerDay = 1000 * 60 * 60 * 24;
        return Math.ceil((end - start) / msPerDay) + 1;
    }

    /**
     * Apply transaction overrides to planned transactions
     */
    applyTransactionOverrides(plannedTransactions, overrides) {
        if (!overrides || overrides.length === 0) return plannedTransactions;

        return plannedTransactions.map(pt => {
            const override = overrides.find(o => o.plannedTransactionId === pt.id);
            if (!override) return pt;

            // Deep merge override onto planned transaction
            return {
                ...pt,
                ...override,
                recurrence: {
                    ...(pt.recurrence || {}),
                    ...(override.recurrence || {})
                }
            };
        });
    }

    /**
     * Project account balance over periods
     */
    projectAccount(account, scenario, plannedTransactions, periods) {
        const projections = [];

        // Get effective account parameters (with overrides)
        const effectiveParams = this.getEffectiveAccountParams(account, scenario);
        let currentBalance = effectiveParams.startingBalance ?? account.balance ?? 0;

        for (const period of periods) {
            // 1. Expand planned transactions for this period
            const periodTransactions = plannedTransactions
                .filter(pt => pt.enabled !== false)
                .flatMap(pt => this.expandRecurrence(pt, period));

            // 2. Calculate debits and credits for this account
            const debits = periodTransactions
                .filter(tx => tx.fromAccount && tx.fromAccount.id === account.id)
                .reduce((sum, tx) => sum + tx.amount, 0);

            const credits = periodTransactions
                .filter(tx => tx.toAccount && tx.toAccount.id === account.id)
                .reduce((sum, tx) => sum + tx.amount, 0);

            const netTransactions = credits - debits;

            // 3. Calculate interest
            let interest = 0;
            if (effectiveParams.interest?.enabled) {
                interest = this.calculateInterest(
                    currentBalance,
                    effectiveParams.interest.nominalRate || effectiveParams.interest.rate || 0,
                    effectiveParams.interest.compoundingInterval || effectiveParams.interest.compounding || 'Monthly',
                    period.days
                );
            }

            // 4. Calculate growth
            let growth = 0;
            if (effectiveParams.growth?.enabled) {
                growth = this.calculateGrowth(
                    currentBalance,
                    effectiveParams.growth.rate,
                    effectiveParams.growth.type,
                    period.days
                );
            }

            // 5. Calculate projected balance
            const netChange = netTransactions + interest + growth;
            const projectedBalance = currentBalance + netChange;

            // 6. Create projection
            projections.push({
                id: null, // Will be assigned when saved
                scenarioId: scenario.id,
                accountId: account.id,
                accountName: effectiveParams.customLabel || account.name,
                isPrimary: account.isPrimary || false,
                period: period.endDate.toISOString().split('T')[0],
                periodLabel: period.label,
                periodType: scenario.projectionPeriod,
                openingBalance: currentBalance,
                totalDebits: debits,
                totalCredits: credits,
                netTransactions: netTransactions,
                interestEarned: interest,
                growthAmount: growth,
                netChange: netChange,
                projectedBalance: projectedBalance,
                transactionCount: periodTransactions.filter(tx =>
                    (tx.fromAccount && tx.fromAccount.id === account.id) ||
                    (tx.toAccount && tx.toAccount.id === account.id)
                ).length,
                calculatedAt: new Date().toISOString()
            });

            // 7. Carry forward
            currentBalance = projectedBalance;
        }

        return projections;
    }

    /**
     * Get effective account parameters with overrides applied
     */
    getEffectiveAccountParams(account, scenario) {
        const override = (scenario.accountOverrides || []).find(o => o.accountId === account.id);

        return {
            startingBalance: override?.startingBalance ?? account.balance,
            interest: override?.interest ?? account.interest,
            growth: override?.growth ?? account.growth,
            customLabel: override?.customLabel
        };
    }

    /**
     * Expand recurrence pattern into transaction instances for a period
     */
    expandRecurrence(plannedTransaction, period) {
        const recurrence = plannedTransaction.recurrence;

        if (!recurrence || recurrence.type === 'one-time') {
            const txDate = new Date(recurrence?.startDate || new Date());
            if (txDate >= period.startDate && txDate <= period.endDate) {
                return [{
                    date: txDate,
                    amount: plannedTransaction.amount,
                    fromAccount: plannedTransaction.fromAccount,
                    toAccount: plannedTransaction.toAccount,
                    description: plannedTransaction.description
                }];
            }
            return [];
        }

        // Recurring transactions
        const instances = [];
        const startDate = new Date(recurrence.startDate);
        const endDate = recurrence.endDate ? new Date(recurrence.endDate) : period.endDate;

        let currentDate = new Date(startDate);
        while (currentDate <= period.endDate && currentDate <= endDate) {
            if (currentDate >= period.startDate) {
                instances.push({
                    date: new Date(currentDate),
                    amount: plannedTransaction.amount,
                    fromAccount: plannedTransaction.fromAccount,
                    toAccount: plannedTransaction.toAccount,
                    description: plannedTransaction.description
                });
            }

            // Advance to next occurrence
            currentDate = this.nextOccurrence(currentDate, recurrence);
        }

        return instances;
    }

    /**
     * Calculate next occurrence based on recurrence pattern
     */
    nextOccurrence(date, recurrence) {
        const next = new Date(date);
        const interval = recurrence.interval || 1;

        switch (recurrence.frequency) {
            case 'Daily':
                next.setDate(next.getDate() + interval);
                break;
            case 'Weekly':
                next.setDate(next.getDate() + (7 * interval));
                break;
            case 'Biweekly':
                next.setDate(next.getDate() + 14);
                break;
            case 'Monthly':
                next.setMonth(next.getMonth() + interval);
                if (recurrence.dayOfMonth) {
                    next.setDate(recurrence.dayOfMonth);
                }
                break;
            case 'Quarterly':
                next.setMonth(next.getMonth() + (3 * interval));
                break;
            case 'Yearly':
                next.setFullYear(next.getFullYear() + interval);
                if (recurrence.monthOfYear) {
                    next.setMonth(recurrence.monthOfYear - 1);
                }
                if (recurrence.dayOfMonth) {
                    next.setDate(recurrence.dayOfMonth);
                }
                break;
        }

        return next;
    }

    /**
     * Calculate interest based on rate and compounding
     */
    calculateInterest(principal, annualRate, compounding, days) {
        const rate = annualRate / 100;

        switch (compounding) {
            case 'Daily':
                return principal * Math.pow(1 + rate / 365, days) - principal;
            case 'Weekly':
                const weeks = days / 7;
                return principal * Math.pow(1 + rate / 52, weeks) - principal;
            case 'Monthly':
                const months = days / 30.44;
                return principal * Math.pow(1 + rate / 12, months) - principal;
            case 'Quarterly':
                const quarters = days / 91.31;
                return principal * Math.pow(1 + rate / 4, quarters) - principal;
            case 'Annually':
                const years = days / 365.25;
                return principal * Math.pow(1 + rate, years) - principal;
            default:
                return 0;
        }
    }

    /**
     * Calculate growth based on rate and type
     */
    calculateGrowth(principal, annualRate, type, days) {
        const rate = annualRate / 100;
        const years = days / 365.25;

        switch (type) {
            case 'Linear':
                return principal * rate * years;
            case 'Compound-Annual':
                return principal * Math.pow(1 + rate, years) - principal;
            default:
                return 0;
        }
    }

    /**
     * Validate double-entry bookkeeping (debits = credits)
     */
    validateDoubleEntry(projections, periods) {
        for (const period of periods) {
            const periodEnd = period.endDate.toISOString().split('T')[0];
            const periodProjections = projections.filter(p => p.period === periodEnd);

            const totalDebits = periodProjections.reduce((sum, p) => sum + p.totalDebits, 0);
            const totalCredits = periodProjections.reduce((sum, p) => sum + p.totalCredits, 0);

            if (Math.abs(totalDebits - totalCredits) > 0.01) {
                throw new Error(
                    `Double-entry validation failed for ${period.label}: ` +
                    `Debits=$${totalDebits.toFixed(2)}, Credits=$${totalCredits.toFixed(2)}`
                );
            }
        }
    }
}
