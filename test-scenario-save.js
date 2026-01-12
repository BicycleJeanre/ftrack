// Test scenario save flow
// Run this in the browser console to test each step

async function testScenarioSaveFlow() {
    console.log('=== TESTING SCENARIO SAVE FLOW ===\n');
    
    // Step 1: Test DataStore.read()
    console.log('STEP 1: Testing DataStore.read()');
    const DataStore = await import('./js/core/data-store.js');
    const data = await DataStore.read();
    console.log('✓ Read data:', data.scenarios?.length, 'scenarios found');
    console.log('  First scenario:', data.scenarios?.[0]?.name);
    
    // Step 2: Test ScenarioManager.getAll()
    console.log('\nSTEP 2: Testing ScenarioManager.getAll()');
    const ScenarioManager = await import('./js/managers/scenario-manager.js');
    const scenarios = await ScenarioManager.getAll();
    console.log('✓ Retrieved scenarios:', scenarios.length);
    console.log('  Scenario IDs:', scenarios.map(s => s.id));
    
    // Step 3: Test updating a scenario
    console.log('\nSTEP 3: Testing ScenarioManager.update()');
    if (scenarios.length > 0) {
        const testScenario = scenarios[0];
        const originalName = testScenario.name;
        const testName = 'TEST_' + Date.now();
        
        console.log('  Original name:', originalName);
        console.log('  Test name:', testName);
        
        // Update scenario
        await ScenarioManager.update(testScenario.id, { name: testName });
        console.log('✓ Update called');
        
        // Read back from disk
        const updatedData = await DataStore.read();
        const updatedScenario = updatedData.scenarios.find(s => s.id === testScenario.id);
        console.log('  Name after update:', updatedScenario.name);
        
        if (updatedScenario.name === testName) {
            console.log('✓✓✓ SAVE SUCCESSFUL! Data persisted to disk.');
            
            // Restore original name
            await ScenarioManager.update(testScenario.id, { name: originalName });
            console.log('✓ Restored original name');
        } else {
            console.error('✗✗✗ SAVE FAILED! Name not updated on disk.');
            console.error('  Expected:', testName);
            console.error('  Got:', updatedScenario.name);
        }
    } else {
        console.error('✗ No scenarios found to test');
    }
    
    console.log('\n=== TEST COMPLETE ===');
}

// Run the test
testScenarioSaveFlow().catch(err => {
    console.error('TEST FAILED:', err);
});
