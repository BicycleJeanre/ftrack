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
                case 'openDate':
                    newAccount.openDate = col.default !== undefined ? col.default : '';
                    break;
            }
        });
        
        return newAccount;
    }

    /**
     * Save forecast versions
     */
    async saveForecastVersions(updatedVersions) {
        await this.loadData();
        this.cachedData.forecastDefinitions = updatedVersions;
        await this.saveData();
    }

    /**
     * Save forecast setup with linking
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
     * Save forecast results with linking to version
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
