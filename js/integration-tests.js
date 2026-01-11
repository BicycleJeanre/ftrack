// integration-tests.js
// Comprehensive integration tests for FTrack refactoring validation
// Tests all major features and data operations

import * as ScenarioManager from './managers/scenario-manager.js';
import * as AccountManager from './managers/account-manager.js';
import * as TransactionManager from './managers/transaction-manager.js';
import { applyPeriodicChange } from './financial-utils.js';
import { generateProjections } from './projection-engine.js';

/**
 * Test Suite Runner
 */
class IntegrationTests {
    constructor() {
        this.results = {
            passed: 0,
            failed: 0,
            tests: []
        };
    }

    /**
     * Run a test with error handling
     */
    async test(name, testFn) {
        console.log(`\n🧪 Testing: ${name}`);
        try {
            await testFn();
            this.results.passed++;
            this.results.tests.push({ name, status: 'PASSED' });
            console.log(`✅ PASSED: ${name}`);
            return true;
        } catch (error) {
            this.results.failed++;
            this.results.tests.push({ name, status: 'FAILED', error: error.message });
            console.error(`❌ FAILED: ${name}`, error);
            return false;
        }
    }

    /**
     * Assert helper
     */
    assert(condition, message) {
        if (!condition) {
            throw new Error(`Assertion failed: ${message}`);
        }
    }

    /**
     * Test 1: Scenario CRUD Operations
     */
    async testScenarioCRUD() {
        await this.test('Scenario Manager - Create, Read, Update, Delete', async () => {
            // Create
            const newScenario = await ScenarioManager.create({
                name: 'Test Scenario',
                type: { id: 1, name: 'Budget' },
                startDate: '2024-01-01',
                endDate: '2024-12-31'
            });
            this.assert(newScenario.id !== undefined, 'Scenario should have ID');
            this.assert(newScenario.name === 'Test Scenario', 'Scenario name should match');

            // Read
            const retrieved = await ScenarioManager.getById(newScenario.id);
            this.assert(retrieved !== null, 'Should retrieve created scenario');
            this.assert(retrieved.name === 'Test Scenario', 'Retrieved scenario name should match');

            // Update
            retrieved.name = 'Updated Test Scenario';
            await ScenarioManager.update(retrieved.id, retrieved);
            const updated = await ScenarioManager.getById(retrieved.id);
            this.assert(updated.name === 'Updated Test Scenario', 'Scenario should be updated');

            // List all
            const all = await ScenarioManager.getAll();
            this.assert(Array.isArray(all), 'getAll should return array');
            this.assert(all.length > 0, 'Should have at least one scenario');

            // Delete
            await ScenarioManager.deleteById(newScenario.id);
            const deleted = await ScenarioManager.getById(newScenario.id);
            this.assert(deleted === null, 'Deleted scenario should not exist');
        });
    }

    /**
     * Test 2: Account CRUD Operations
     */
    async testAccountCRUD() {
        await this.test('Account Manager - Create, Read, Update, Delete', async () => {
            // Get or create a test scenario
            const scenarios = await ScenarioManager.getAll();
            let testScenario = scenarios[0];
            if (!testScenario) {
                testScenario = await ScenarioManager.create({
                    name: 'Test Scenario for Accounts',
                    type: { id: 1, name: 'Budget' },
                    startDate: '2024-01-01',
                    endDate: '2024-12-31'
                });
            }

            const scenarioId = testScenario.id;

            // Create accounts
            const accounts = [
                {
                    id: Date.now(),
                    name: 'Test Checking',
                    type: 'Asset',
                    currency: 'USD',
                    balance: 5000,
                    openDate: '2024-01-01'
                },
                {
                    id: Date.now() + 1,
                    name: 'Test Savings',
                    type: 'Asset',
                    currency: 'USD',
                    balance: 10000,
                    openDate: '2024-01-01'
                }
            ];

            await AccountManager.saveAll(scenarioId, accounts);

            // Read
            const retrieved = await AccountManager.getAll(scenarioId);
            this.assert(Array.isArray(retrieved), 'getAll should return array');
            this.assert(retrieved.length === 2, 'Should have 2 accounts');

            // Update
            retrieved[0].balance = 6000;
            await AccountManager.saveAll(scenarioId, retrieved);
            const updated = await AccountManager.getAll(scenarioId);
            this.assert(updated[0].balance === 6000, 'Account balance should be updated');

            // Delete
            const filtered = updated.filter(a => a.id !== retrieved[0].id);
            await AccountManager.saveAll(scenarioId, filtered);
            const afterDelete = await AccountManager.getAll(scenarioId);
            this.assert(afterDelete.length === 1, 'Should have 1 account after delete');
        });
    }

    /**
     * Test 3: Transaction CRUD Operations
     */
    async testTransactionCRUD() {
        await this.test('Transaction Manager - Planned Transactions', async () => {
            const scenarios = await ScenarioManager.getAll();
            const testScenario = scenarios[0];
            this.assert(testScenario !== undefined, 'Need a scenario for testing');

            const scenarioId = testScenario.id;

            // Get accounts
            let accounts = await AccountManager.getAll(scenarioId);
            if (accounts.length < 2) {
                // Create test accounts
                accounts = [
                    { id: Date.now(), name: 'Account A', type: 'Asset', currency: 'USD', balance: 1000 },
                    { id: Date.now() + 1, name: 'Account B', type: 'Asset', currency: 'USD', balance: 2000 }
                ];
                await AccountManager.saveAll(scenarioId, accounts);
            }

            // Create transaction
            const transactions = [
                {
                    id: Date.now(),
                    debitAccount: accounts[0],
                    creditAccount: accounts[1],
                    amount: 500,
                    description: 'Test Transfer',
                    recurrence: {
                        pattern: 'Monthly',
                        startDate: '2024-01-01',
                        frequency: 1,
                        interval: 1,
                        recurrenceType: { id: 3, name: 'Monthly' }
                    }
                }
            ];

            await TransactionManager.savePlanned(scenarioId, transactions);

            // Read
            const retrieved = await TransactionManager.getAllPlanned(scenarioId);
            this.assert(Array.isArray(retrieved), 'getAllPlanned should return array');
            this.assert(retrieved.length > 0, 'Should have at least 1 transaction');

            // Verify structure
            const tx = retrieved[0];
            this.assert(tx.debitAccount !== undefined, 'Transaction should have debitAccount');
            this.assert(tx.creditAccount !== undefined, 'Transaction should have creditAccount');
            this.assert(tx.amount === 500, 'Transaction amount should match');
            this.assert(tx.recurrence !== null, 'Transaction should have recurrence');
        });
    }

    /**
     * Test 4: Financial Calculations
     */
    async testFinancialCalculations() {
        await this.test('Financial Utils - Periodic Change Calculations', async () => {
            // Test 1: Simple percentage growth
            const result1 = applyPeriodicChange(1000, {
                value: 5,
                changeMode: { id: 1, name: 'Percentage Rate' },
                changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
            }, 1);
            this.assert(Math.abs(result1 - 1050) < 0.01, 'Simple percentage should work');

            // Test 2: Compounded growth
            const result2 = applyPeriodicChange(1000, {
                value: 12,
                changeMode: { id: 1, name: 'Percentage Rate' },
                changeType: { id: 2, name: 'Nominal Annual, Compounded Monthly' }
            }, 1);
            const expected2 = 1000 * Math.pow(1 + 0.12/12, 12);
            this.assert(Math.abs(result2 - expected2) < 0.01, 'Compounded growth should work');

            // Test 3: Fixed amount
            const result3 = applyPeriodicChange(1000, {
                value: 100,
                changeMode: { id: 2, name: 'Fixed Amount' },
                changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
            }, 5);
            this.assert(result3 === 1500, 'Fixed amount should work');

            // Test 4: Null periodic change
            const result4 = applyPeriodicChange(1000, null, 10);
            this.assert(result4 === 1000, 'Null periodic change should return original value');

            // Test 5: Zero rate
            const result5 = applyPeriodicChange(1000, {
                value: 0,
                changeMode: { id: 1, name: 'Percentage Rate' },
                changeType: { id: 1, name: 'Nominal Annual (No Compounding)' }
            }, 5);
            this.assert(result5 === 1000, 'Zero rate should return original value');
        });
    }

    /**
     * Test 5: Data Persistence
     */
    async testDataPersistence() {
        await this.test('Data Persistence - Atomic Transactions', async () => {
            const testData = {
                testKey: 'testValue',
                timestamp: Date.now()
            };

            // Import DataStore
            const DataStore = await import('./core/data-store.js');

            // Write data
            await DataStore.write('test-data.json', testData);

            // Read data
            const retrieved = await DataStore.read('test-data.json');
            this.assert(retrieved !== null, 'Should read written data');
            this.assert(retrieved.testKey === 'testValue', 'Data should match');

            // Test transaction (atomic write)
            await DataStore.transaction(async (currentData) => {
                currentData.updated = true;
                currentData.newField = 'added';
                return currentData;
            }, 'test-data.json');

            const afterTransaction = await DataStore.read('test-data.json');
            this.assert(afterTransaction.updated === true, 'Transaction should update data');
            this.assert(afterTransaction.newField === 'added', 'Transaction should add fields');
        });
    }

    /**
     * Test 6: Projection Generation
     */
    async testProjectionGeneration() {
        await this.test('Projection Engine - Generate Projections', async () => {
            // Get or create test scenario
            let scenarios = await ScenarioManager.getAll();
            let testScenario = scenarios.find(s => s.name.includes('Test'));
            
            if (!testScenario) {
                testScenario = await ScenarioManager.create({
                    name: 'Test Projection Scenario',
                    type: { id: 1, name: 'Budget' },
                    startDate: '2024-01-01',
                    endDate: '2024-06-30'
                });

                // Add test account
                await AccountManager.saveAll(testScenario.id, [{
                    id: Date.now(),
                    name: 'Test Account',
                    type: 'Asset',
                    currency: 'USD',
                    balance: 10000,
                    periodicChange: {
                        value: 5,
                        changeMode: { id: 1, name: 'Percentage Rate' },
                        changeType: { id: 2, name: 'Nominal Annual, Compounded Monthly' }
                    }
                }]);
            }

            // Generate projections
            const projections = await generateProjections(testScenario.id);
            
            this.assert(Array.isArray(projections), 'Projections should be an array');
            this.assert(projections.length > 0, 'Should generate at least one projection');
            
            // Verify projection structure
            const proj = projections[0];
            this.assert(proj.date !== undefined, 'Projection should have date');
            this.assert(proj.accountId !== undefined, 'Projection should have accountId');
            this.assert(proj.balance !== undefined, 'Projection should have balance');
        });
    }

    /**
     * Test 7: Cross-module Integration
     */
    async testCrossModuleIntegration() {
        await this.test('Cross-module Integration - Full Workflow', async () => {
            // Create scenario
            const scenario = await ScenarioManager.create({
                name: 'Integration Test Scenario',
                type: { id: 1, name: 'Budget' },
                startDate: '2024-01-01',
                endDate: '2024-12-31'
            });

            // Add accounts
            const accounts = [
                {
                    id: Date.now(),
                    name: 'Checking',
                    type: 'Asset',
                    currency: 'USD',
                    balance: 5000
                },
                {
                    id: Date.now() + 1,
                    name: 'Savings',
                    type: 'Asset',
                    currency: 'USD',
                    balance: 15000
                }
            ];
            await AccountManager.saveAll(scenario.id, accounts);

            // Add transactions
            const transactions = [
                {
                    id: Date.now(),
                    debitAccount: accounts[1],
                    creditAccount: accounts[0],
                    amount: 1000,
                    description: 'Monthly Savings',
                    recurrence: {
                        pattern: 'Monthly',
                        startDate: '2024-01-15',
                        frequency: 1,
                        interval: 1,
                        recurrenceType: { id: 3, name: 'Monthly' }
                    }
                }
            ];
            await TransactionManager.savePlanned(scenario.id, transactions);

            // Generate projections
            const projections = await generateProjections(scenario.id);

            // Verify complete workflow
            this.assert(scenario.id !== undefined, 'Scenario created');
            this.assert(accounts.length === 2, 'Accounts added');
            this.assert(transactions.length === 1, 'Transactions added');
            this.assert(projections.length > 0, 'Projections generated');

            // Cleanup
            await ScenarioManager.deleteById(scenario.id);
        });
    }

    /**
     * Run all tests
     */
    async runAll() {
        console.log('\n' + '='.repeat(60));
        console.log('🚀 FTRACK INTEGRATION TESTS');
        console.log('='.repeat(60));

        await this.testScenarioCRUD();
        await this.testAccountCRUD();
        await this.testTransactionCRUD();
        await this.testFinancialCalculations();
        await this.testDataPersistence();
        await this.testProjectionGeneration();
        await this.testCrossModuleIntegration();

        console.log('\n' + '='.repeat(60));
        console.log('📊 TEST RESULTS');
        console.log('='.repeat(60));
        console.log(`✅ Passed: ${this.results.passed}`);
        console.log(`❌ Failed: ${this.results.failed}`);
        console.log(`📈 Total: ${this.results.passed + this.results.failed}`);
        console.log(`🎯 Success Rate: ${((this.results.passed / (this.results.passed + this.results.failed)) * 100).toFixed(1)}%`);
        console.log('='.repeat(60));

        if (this.results.failed === 0) {
            console.log('\n🎉 ALL TESTS PASSED! 🎉\n');
        } else {
            console.log('\n⚠️  SOME TESTS FAILED - Review errors above\n');
        }

        return this.results;
    }
}

// Export test suite
export default IntegrationTests;
export { IntegrationTests };
