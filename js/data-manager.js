// Centralized Data Management Module
// Handles all data persistence, linking, and validation across the application

/**
 * DataManager - Centralized module for managing all data operations
 * 
 * Responsibilities:
 * 1. Read/write app-data.json with proper error handling
 * 2. Auto-generate IDs for new entities
 * 3. Link related data (transactions <-> accounts, forecasts <-> setup <-> results)
 * 4. Validate data integrity before saving
 * 5. Handle cascading updates (e.g., when adding account from transaction)
 */

class DataManager {
    constructor() {
        this.fs = window.require('fs').promises;
        this.dataPath = process.cwd() + '/assets/app-data.json';
        this.cachedData = null;
    }

    /**
     * Load app-data.json into memory
     */
    async loadData() {
        try {
            const dataFile = await this.fs.readFile(this.dataPath, 'utf8');
            this.cachedData = JSON.parse(dataFile);
            return this.cachedData;
        } catch (err) {
            console.error('Failed to load app data:', err);
            throw err;
        }
    }

    /**
     * Save cached data to disk
     */
    async saveData() {
        try {
            await this.fs.writeFile(
                this.dataPath, 
                JSON.stringify(this.cachedData, null, 2), 
                'utf8'
            );
            console.log('Data saved successfully!');
            return true;
        } catch (err) {
            console.error('Failed to save app data:', err);
            throw err;
        }
    }

    /**
     * Get next available ID for an entity type
     */
    getNextId(entityType) {
        if (!this.cachedData || !this.cachedData[entityType]) {
            return 1;
        }
        const maxId = this.cachedData[entityType].reduce(
            (max, item) => (item.id > max ? item.id : max), 
            0
        );
        return maxId + 1;
    }

    /**
     * Save accounts - simple update
     */
    async saveAccounts(updatedAccounts) {
        await this.loadData();
        this.cachedData.accounts = updatedAccounts;
        await this.saveData();
    }

    /**
     * Save transactions with auto-linking
     * - Detects new accounts in debit_account/credit_account
     * - Creates them with proper defaults
     * - Links them to transactions
     */
    async saveTransactions(updatedTransactions) {
        await this.loadData();
        
        // Load accounts schema for defaults
        const accountsSchemaPath = process.cwd() + '/assets/accounts-grid.json';
        const schemaFile = await this.fs.readFile(accountsSchemaPath, 'utf8');
        const accountsSchema = JSON.parse(schemaFile);
        const acctCols = accountsSchema.mainGrid.columns;

        // Process new accounts
        let nextId = this.getNextId('accounts');
        
        updatedTransactions.forEach(tx => {
            ['debit_account', 'credit_account'].forEach(field => {
                const acct = tx[field];
                if (acct && (acct.id === null || acct.id === undefined)) {
                    // New account detected - create with defaults
                    acct.id = nextId;
                    const newAcct = this._createAccountFromSchema(
                        nextId, 
                        acct.name, 
                        acctCols, 
                        accountsSchema
                    );
                    this.cachedData.accounts.push(newAcct);
                    nextId++;
                }
            });
        });

        // Save transactions
        this.cachedData.transactions = updatedTransactions;
        await this.saveData();
    }

    /**
     * Create a new account from schema defaults
     */
    _createAccountFromSchema(id, name, columns, schema) {
        const newAccount = { id, name };
        
        columns.forEach(col => {
            switch(col.field) {
                case 'type': {
                    const def = col.default;
                    const optList = schema.accountType || [];
                    const found = optList.find(o => o.name.toLowerCase() === String(def).toLowerCase());
                    newAccount.type = found || { id: null, name: def };
                    break;
                }
                case 'currency': {
                    const def = col.default;
                    const optList = schema.currencies || [];
                    const found = optList.find(o => o.name.toLowerCase() === String(def).toLowerCase());
                    newAccount.currency = found || { id: null, name: def };
                    break;
                }
                case 'balance':
                    newAccount.balance = col.default !== undefined ? col.default : 0;
                    break;
                case 'current_balance':
                    newAccount.current_balance = col.default !== undefined ? col.default : 0;
                    break;
                case 'interest':
                    newAccount.interest = col.default || null;
                    break;
                case 'growth':
                    newAccount.growth = col.default || null;
                    break;
                case 'openDate':
                    newAccount.openDate = col.default !== undefined ? col.default : '';
                    break;
            }
        });
        
        return newAccount;
    }

    /**
     * Save forecast versions (legacy - kept for compatibility)
     */
    async saveForecastVersions(updatedVersions) {
        await this.loadData();
        this.cachedData.forecastDefinitions = updatedVersions;
        await this.saveData();
    }

    /**
     * Save scenarios
     */
    async saveScenarios(scenarios) {
        await this.loadData();
        this.cachedData.scenarios = scenarios;
        await this.saveData();
    }

    /**
     * Get a specific scenario by ID
     */
    getScenario(scenarioId) {
        return this.cachedData?.scenarios?.find(s => s.id === scenarioId);
    }

    /**
     * Clone a scenario with all its planned transactions
     */
    async cloneScenario(scenarioId, newName) {
        await this.loadData();
        const original = this.getScenario(scenarioId);
        if (!original) throw new Error(`Scenario ${scenarioId} not found`);
        
        const clone = {
            ...original,
            id: this.getNextId('scenarios'),
            name: newName,
            createdDate: new Date().toISOString().split('T')[0],
            lastCalculated: null
        };
        
        this.cachedData.scenarios.push(clone);
        
        // Clone planned transactions
        const plannedTxs = (this.cachedData.plannedTransactions || []).filter(
            pt => pt.scenarioId === scenarioId
        );
        for (const pt of plannedTxs) {
            this.cachedData.plannedTransactions.push({
                ...pt,
                id: this.getNextId('plannedTransactions'),
                scenarioId: clone.id
            });
        }
        
        await this.saveData();
        return clone;
    }

    /**
     * Save forecast setup with linking (legacy - kept for compatibility)
     * - Links to forecast version (needs versionId field)
     * - Detects new accounts/transactions
     * - Creates and links them
     */
    async saveForecastSetup(updatedSetup, versionId = null) {
        await this.loadData();
        
        // Ensure forecastSetup exists
        if (!this.cachedData.forecastSetup) {
            this.cachedData.forecastSetup = [];
        }

        // Process each setup item
        let nextAccountId = this.getNextId('accounts');
        let nextTransactionId = this.getNextId('transactions');

        updatedSetup.forEach(setup => {
            // Link to forecast version if provided
            if (versionId) {
                setup.versionId = versionId;
            }

            // Handle new accounts
            if (setup.account && (setup.account.id === null || setup.account.id === undefined)) {
                setup.account.id = nextAccountId;
                // Create basic account (can be enhanced later)
                this.cachedData.accounts.push({
                    id: nextAccountId,
                    name: setup.account.name,
                    type: { id: 1, name: "Asset" }, // Default type
                    balance: 0,
                    current_balance: 0,
                    interest: null,
                    openDate: new Date().toISOString().split('T')[0]
                });
                nextAccountId++;
            }

            // Handle new transactions (if transaction field allows adding)
            if (setup.transaction && (setup.transaction.id === null || setup.transaction.id === undefined)) {
                setup.transaction.id = nextTransactionId;
                // Create basic transaction reference
                this.cachedData.transactions.push({
                    id: nextTransactionId,
                    description: setup.transaction.name,
                    amount: setup.amount || 0,
                    date: setup.date || '',
                    // Additional fields as needed
                });
                nextTransactionId++;
            }
        });

        this.cachedData.forecastSetup = updatedSetup;
        await this.saveData();
    }

    /**
     * Save planned transactions with auto-linking
     * - Auto-creates accounts from addSelect fields
     * - Auto-creates base transactions if needed
     * - Links planned transactions to scenario
     */
    async savePlannedTransactions(plannedTransactions, scenarioId) {
        await this.loadData();
        
        // Ensure plannedTransactions array exists
        if (!this.cachedData.plannedTransactions) {
            this.cachedData.plannedTransactions = [];
        }
        
        // Load accounts schema for defaults
        const accountsSchemaPath = process.cwd() + '/assets/accounts-grid.json';
        const schemaFile = await this.fs.readFile(accountsSchemaPath, 'utf8');
        const accountsSchema = JSON.parse(schemaFile);
        const acctCols = accountsSchema.mainGrid.columns;
        
        for (const plannedTx of plannedTransactions) {
            // Ensure scenarioId is set
            plannedTx.scenarioId = scenarioId;
            
            // Check if this is a new planned transaction (null or undefined id)
            if (!plannedTx.id) {
                plannedTx.id = this.getNextId('plannedTransactions');
                
                // If transactionTemplateId not set, create base transaction
                if (!plannedTx.transactionTemplateId && plannedTx.description) {
                    const newTransactionId = this.getNextId('transactions');
                    plannedTx.transactionTemplateId = newTransactionId;
                    
                    // Create simple base transaction
                    const baseTransaction = {
                        id: newTransactionId,
                        description: plannedTx.description,
                        debit_account: plannedTx.fromAccount,
                        credit_account: plannedTx.toAccount,
                        amount: plannedTx.amount,
                        date: plannedTx.recurrence?.startDate || new Date().toISOString().split('T')[0],
                        isRecurring: plannedTx.recurrence?.type === 'recurring'
                    };
                    this.cachedData.transactions.push(baseTransaction);
                }
            }
            
            // Auto-create accounts from addSelect fields
            if (plannedTx.fromAccount && (plannedTx.fromAccount.id === null || plannedTx.fromAccount.id === undefined)) {
                const newAcctId = this.getNextId('accounts');
                plannedTx.fromAccount.id = newAcctId;
                const newAccount = this._createAccountFromSchema(
                    newAcctId,
                    plannedTx.fromAccount.name,
                    acctCols,
                    accountsSchema
                );
                this.cachedData.accounts.push(newAccount);
            }
            
            if (plannedTx.toAccount && (plannedTx.toAccount.id === null || plannedTx.toAccount.id === undefined)) {
                const newAcctId = this.getNextId('accounts');
                plannedTx.toAccount.id = newAcctId;
                const newAccount = this._createAccountFromSchema(
                    newAcctId,
                    plannedTx.toAccount.name,
                    acctCols,
                    accountsSchema
                );
                this.cachedData.accounts.push(newAccount);
            }
        }
        
        // Remove old planned transactions for this scenario
        this.cachedData.plannedTransactions = this.cachedData.plannedTransactions.filter(
            pt => pt.scenarioId !== scenarioId
        );
        
        // Add updated planned transactions
        this.cachedData.plannedTransactions.push(...plannedTransactions);
        
        await this.saveData();
    }

    /**
     * Get planned transactions for a specific scenario
     */
    getPlannedTransactions(scenarioId) {
        return (this.cachedData?.plannedTransactions || []).filter(
            pt => pt.scenarioId === scenarioId
        );
    }

    /**
     * Save forecast results with linking to version (legacy - kept for compatibility)
     */
    async saveForecastResults(updatedResults, versionId = null) {
        await this.loadData();
        
        // Optionally link results to version
        if (versionId) {
            updatedResults.forEach(result => {
                result.versionId = versionId;
            });
        }

        this.cachedData.forecastSnapshots = updatedResults;
        await this.saveData();
    }

    /**
     * Save projections for a scenario
     * - Clears old projections for the scenario
     * - Saves new projections
     * - Updates scenario lastCalculated timestamp
     */
    async saveProjections(projections, scenarioId) {
        await this.loadData();
        
        // Ensure projections array exists
        if (!this.cachedData.projections) {
            this.cachedData.projections = [];
        }
        
        // Assign IDs to projections
        let nextId = this.getNextId('projections');
        projections.forEach(proj => {
            if (!proj.id) {
                proj.id = nextId++;
            }
        });
        
        // Remove old projections for this scenario
        this.cachedData.projections = this.cachedData.projections.filter(
            p => p.scenarioId !== scenarioId
        );
        
        // Add new projections
        this.cachedData.projections.push(...projections);
        
        // Update scenario lastCalculated timestamp
        const scenario = this.cachedData.scenarios?.find(s => s.id === scenarioId);
        if (scenario) {
            scenario.lastCalculated = new Date().toISOString();
        }
        
        await this.saveData();
    }

    /**
     * Get projections for a specific scenario
     * Optionally filter by account
     */
    getProjections(scenarioId, accountId = null) {
        const projections = (this.cachedData?.projections || []).filter(
            p => p.scenarioId === scenarioId
        );
        
        if (accountId) {
            return projections.filter(p => p.accountId === accountId);
        }
        
        return projections;
    }

    /**
     * Clear projections for a scenario
     */
    async clearProjections(scenarioId) {
        await this.loadData();
        this.cachedData.projections = (this.cachedData.projections || []).filter(
            p => p.scenarioId !== scenarioId
        );
        await this.saveData();
    }

    /**
     * Validate data integrity
     * - Check that all account IDs in transactions exist
     * - Check that all versionIds in forecast setup exist
     * - etc.
     */
    async validateData() {
        await this.loadData();
        
        const issues = [];
        
        // Validate transaction accounts
        const accountIds = new Set(this.cachedData.accounts.map(a => a.id));
        this.cachedData.transactions.forEach((tx, idx) => {
            if (tx.debit_account && !accountIds.has(tx.debit_account.id)) {
                issues.push(`Transaction ${idx}: debit_account ID ${tx.debit_account.id} not found`);
            }
            if (tx.credit_account && !accountIds.has(tx.credit_account.id)) {
                issues.push(`Transaction ${idx}: credit_account ID ${tx.credit_account.id} not found`);
            }
        });

        // Validate forecast setup links
        if (this.cachedData.forecastSetup) {
            const versionIds = new Set(this.cachedData.forecastDefinitions.map(v => v.id));
            this.cachedData.forecastSetup.forEach((setup, idx) => {
                if (setup.versionId && !versionIds.has(setup.versionId)) {
                    issues.push(`Forecast setup ${idx}: versionId ${setup.versionId} not found`);
                }
            });
        }

        return issues;
    }

    /**
     * Get all data for a specific entity type
     */
    async getData(entityType) {
        await this.loadData();
        return this.cachedData[entityType] || [];
    }

    /**
     * Get data with related entities populated
     * Example: Get transactions with full account objects instead of just IDs
     */
    async getPopulatedData(entityType) {
        await this.loadData();
        
        // This can be extended to populate relationships
        // For now, just return the data
        return this.cachedData[entityType] || [];
    }
}

// Export singleton instance
export const dataManager = new DataManager();
