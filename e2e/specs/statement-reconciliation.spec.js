const {test,expect}=require('@playwright/test');
const {gotoFTrack,waitForAppReady,currentScenario,loadSmokeData}=require('../helpers/app-data');
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-01-20T12:00:00Z'));});
test('retains a full CSV and applies only reviewed rows, with source history after reload',async({page})=>{
 await gotoFTrack(page);
 await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');
 await expect(modal).toBeVisible();
 await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\r\n1,synthetic,2026-01-15,2026-01-15 12:00,Test purchase,Original shop,Expenses,Shopping,,-25.00,,975.00\r\n2,synthetic,2026-01-15,2026-01-15 12:00,Fee,Fee,Fees,Fees,,,-3.00,972.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'synthetic.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await expect(modal).toContainText('2 monetary rows');
 await modal.locator('summary').filter({hasText:'Full original source table'}).click();
 await expect(modal).toContainText('Original shop');
 await modal.getByLabel('Action source row 1',{exact:true}).selectOption('create');
 await modal.getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');
 await modal.getByLabel('Approve source row 1',{exact:true}).check();
 await modal.getByRole('button',{name:'Apply approved rows',exact:true}).click();
 await expect(modal).toContainText('Reviewed: create');
 await expect(modal.getByLabel('Approve source row 2',{exact:true})).not.toBeChecked();
 await page.screenshot({path:test.info().outputPath('statement-review.png')});
 await modal.getByRole('button',{name:'Close',exact:true}).click();
 await page.reload();await waitForAppReady(page);
 await page.getByRole('button',{name:'Statements',exact:true}).click();
 const retained=modal.getByLabel('Retained statements');
 await retained.selectOption(await retained.locator('option').nth(1).getAttribute('value'));
 await expect(modal).toContainText('Reviewed: create');
 await modal.locator('summary').filter({hasText:'Full original source table'}).click();await expect(modal).toContainText('Original shop');
});

test('unmapped rows never auto-match by amount/date and manual links do not imply saved rules',async({page})=>{
 await gotoFTrack(page);
 const before=await currentScenario(page);
 await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');
 await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-10,2026-01-10 12:00,Groceries budget,Groceries,Expenses,Shopping,,-450.00,,550.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'match.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 const action=modal.getByLabel('Action source row 1',{exact:true});
 await expect(action).toHaveValue('');
 await expect(modal.getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('');
 await expect(modal).toContainText('No saved mapping');
 await action.selectOption('match');await modal.getByLabel('Choose match source row 1',{exact:true}).click();
 await page.locator('.statement-match-picker').getByRole('button',{name:/Groceries budget/}).click();
 await expect(modal).toContainText('No saved mapping');
 expect((await currentScenario(page)).statementMappings).toEqual([]);
 expect((await currentScenario(page)).transactionOccurrences).toEqual(before.transactionOccurrences);
 await expect(modal.getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 await modal.getByLabel('Approve source row 1',{exact:true}).check();
 await modal.getByRole('button',{name:'Apply approved rows',exact:true}).click();
 await expect(modal).toContainText('Reviewed: match');
 expect((await currentScenario(page)).transactionOccurrences.some(o=>o.status==='actual' && o.actualAmount===450 && o.actualDate==='2026-01-10')).toBe(true);
});

test('saves row mappings, groups mapped accounts, sorts without losing approvals and bulk applies',async({page})=>{
 await gotoFTrack(page);await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');
 await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-15,2026-01-15 12:00,First shop purchase,Original shop,Expenses,Shopping,,-25.00,,975.00\n2,synthetic,2026-01-16,2026-01-16 12:00,Second shop purchase,Original shop,Expenses,Shopping,,-35.00,,940.00\n3,synthetic,2026-01-16,2026-01-16 12:01,Fee,Fee,Fees,Fees,,,-3.00,937.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'mapping.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await modal.getByLabel('Action source row 1',{exact:true}).selectOption('create');
 await modal.getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');
 const row=modal.getByLabel('Approve source row 1',{exact:true}).locator('..').locator('..');
 await row.getByRole('button',{name:'Save as mapping',exact:true}).click();
 await expect(modal.getByLabel('Mapping text',{exact:true})).toHaveValue('Original shop');
 await modal.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(modal.getByLabel('Action source row 2',{exact:true})).toHaveValue('create');
 await expect(modal.getByLabel('Secondary account source row 2',{exact:true})).toHaveValue('5');
 await modal.getByLabel('Approve source row 1',{exact:true}).check();
 await modal.getByRole('button',{name:'Amount',exact:true}).click();
 await expect(modal.getByLabel('Approve source row 1',{exact:true})).toBeChecked();
 await modal.getByLabel('Group statement rows by').selectOption('secondary');
 const mapped=modal.locator('.statement-group-row').filter({hasText:'Groceries'});
 await mapped.getByRole('button',{name:'Approve group',exact:true}).click();
 await expect(modal.getByLabel('Approve source row 2',{exact:true})).toBeChecked();
 await expect(modal.getByLabel('Approve source row 3',{exact:true})).not.toBeChecked();
 await page.screenshot({path:test.info().outputPath('statement-mapping-groups.png')});
 await modal.getByRole('button',{name:'Apply approved rows',exact:true}).click();
 await expect(modal).toContainText('Applied 2 reviewed row(s)');
 const scenario=await currentScenario(page);expect(scenario.statementMappings).toHaveLength(1);expect(scenario.statementImports[0].rawCsv).toBe(csv);
 await modal.getByRole('button',{name:'Close',exact:true}).click();await page.reload();await waitForAppReady(page);
 await page.getByRole('button',{name:'Statements',exact:true}).click();
 await modal.locator('.statement-mappings summary').click();
 await modal.getByRole('button',{name:'Edit mapping',exact:true}).click();await modal.getByLabel('Mapping text',{exact:true}).fill('Changed merchant');
 await modal.getByRole('button',{name:'Save mapping',exact:true}).click();
 expect((await currentScenario(page)).statementMappings[0].pattern).toBe('Changed merchant');
 await modal.getByRole('button',{name:'Remove mapping',exact:true}).click();
 await expect(modal.locator('.statement-mappings summary')).toContainText('(0)');
});

test('generated mappings are inactive drafts until reviewed and saved',async({page})=>{
 await gotoFTrack(page);await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-10,2026-01-10 12:00,Groceries budget,Groceries Expense,Expenses,Shopping,,-450.00,,550.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'draft.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await modal.locator('.statement-mappings summary').click();
 await modal.getByRole('button',{name:'Generate draft mappings',exact:true}).click();
 await expect(modal).toContainText('1 draft mapping(s)');
 expect((await currentScenario(page)).statementMappings).toEqual([]);
 await modal.getByRole('button',{name:'Review draft: Groceries Expense',exact:true}).click();
 await expect(modal.getByLabel('Mapping secondary account',{exact:true})).toHaveValue('5');
 await modal.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(modal.locator('.statement-mappings summary')).toContainText('(1)');
 await expect(modal.getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('5');
 await expect(modal.getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 expect((await currentScenario(page)).statementImports[0].decisions).toEqual({});
});

test('conflicting mappings stay unresolved and bulk approval cannot reuse a plan target',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[
  {id:'rule-a',accountId:1,field:'category',comparison:'exact',pattern:'Shopping',direction:'out',action:'create',secondaryAccountId:5},
  {id:'rule-b',accountId:1,field:'originalDescription',comparison:'contains',pattern:'Groceries',direction:'out',action:'create',secondaryAccountId:3}
 ];
 await gotoFTrack(page,data);await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-10,2026-01-10 12:00,Groceries budget,Groceries,Expenses,Shopping,,-450.00,,550.00\n2,synthetic,2026-01-10,2026-01-10 12:01,Groceries budget,Groceries,Expenses,Shopping,,-450.00,,100.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'conflict.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});
 await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await expect(modal.getByLabel('Action source row 1',{exact:true})).toHaveValue('');
 await expect(modal).toContainText('Conflicting saved mapping rules');
 const first=modal.getByLabel('Action source row 1',{exact:true});
 await first.selectOption('match');await modal.getByLabel('Choose match source row 1',{exact:true}).click();
 await page.locator('.statement-match-picker').getByRole('button',{name:/Groceries budget/}).click();
 await modal.getByLabel('Action source row 2',{exact:true}).selectOption('match');await modal.getByLabel('Choose match source row 2',{exact:true}).click();
 await page.locator('.statement-match-picker').getByRole('button',{name:/Groceries budget/}).click();
 await modal.getByRole('button',{name:'Approve all eligible rows',exact:true}).click();
 await expect(modal.getByLabel('Approve source row 1',{exact:true})).toBeChecked();
 await expect(modal.getByLabel('Approve source row 2',{exact:true})).not.toBeChecked();
 await expect(modal).toContainText('same planned item is already selected');
});

test('date windows exclude hidden approvals and failed payments while preserving charged fees and source',async({page})=>{
 await gotoFTrack(page);await page.getByRole('button',{name:'Statements',exact:true}).click();
 const modal=page.locator('.statement-reconciliation-modal');await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-24,2026-01-24 12:00,Shop,Shop,Expenses,Shopping,,-25.00,,975.00\n2,synthetic,2026-01-24,2026-01-24 12:01,Insufficient funds,Insufficient funds,Expenses,Shopping,,-50.00,,975.00\n3,synthetic,2026-01-24,2026-01-24 12:02,Insufficient funds fee,Fee,Fees,Fees,,,-3.00,972.00\n4,synthetic,2026-01-25,2026-01-25 12:00,Later purchase,Later purchase,Expenses,Shopping,,-20.00,,952.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'window.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await expect(modal.getByLabel('Statement review from',{exact:true})).toHaveValue('2025-12-25');await expect(modal.getByLabel('Statement review to (exclusive)',{exact:true})).toHaveValue('2026-01-25');
 await expect(modal.locator('.statement-insufficient-funds').filter({hasText:'Source row 2'})).toBeVisible();
 await expect(modal.getByLabel('Approve source row 2',{exact:true})).toHaveCount(0);await expect(modal.getByLabel('Approve source row 3',{exact:true})).toBeVisible();await expect(modal.getByLabel('Approve source row 4',{exact:true})).toHaveCount(0);
 await modal.getByLabel('Action source row 1',{exact:true}).selectOption('create');await modal.getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');await modal.getByLabel('Approve source row 1',{exact:true}).check();
 await modal.getByLabel('Statement review from',{exact:true}).fill('2026-01-25');await modal.getByLabel('Statement review to (exclusive)',{exact:true}).fill('2026-02-25');await modal.getByRole('button',{name:'Apply time frame',exact:true}).click();
 await expect(modal.getByLabel('Approve source row 1',{exact:true})).toHaveCount(0);await modal.getByRole('button',{name:'Apply approved rows',exact:true}).click();await expect(modal).toContainText('Tick at least one row');
 expect((await currentScenario(page)).statementImports[0].decisions).toEqual({});
 await modal.getByRole('button',{name:'Show full statement',exact:true}).click();await expect(modal.getByLabel('Approve source row 4',{exact:true})).toBeVisible();
 expect((await currentScenario(page)).statementImports[0].rawCsv).toBe(csv);
});

test('changing a matched secondary account clears the link and offers a separate payment picker',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'groceries-rule',accountId:1,field:'originalDescription',pattern:'Groceries',comparison:'exact',direction:'out',action:'prefer-match',secondaryAccountId:5}];
 await gotoFTrack(page,data);await page.getByRole('button',{name:'Statements',exact:true}).click();const modal=page.locator('.statement-reconciliation-modal');await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-10,2026-01-10 12:00,Groceries budget,Groceries,Expenses,Shopping,,-450.00,,550.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'secondary.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 const action=modal.getByLabel('Action source row 1',{exact:true}),secondary=modal.getByLabel('Secondary account source row 1',{exact:true});
 await expect(action.locator('option')).toHaveCount(5);await expect(action).toHaveValue('match');await expect(secondary).toBeEnabled();
 await secondary.selectOption('3');await expect(action).toHaveValue('create');await expect(modal).toContainText('previous match cleared');
 await secondary.selectOption('5');await action.selectOption('match');await modal.getByLabel('Choose match source row 1',{exact:true}).click();
 const picker=page.locator('.statement-match-picker');await expect(picker).toContainText('existing FTrack transactions');await picker.getByRole('button',{name:/Groceries budget/}).click();
 await expect(action).toHaveValue('match');await expect(modal).toContainText('Linked to: Groceries budget');
 expect((await currentScenario(page)).statementImports[0].decisions).toEqual({});
});

test('parent category is visible and can become the sole stored mapping for different descriptions',async({page})=>{
 await gotoFTrack(page);await page.getByRole('button',{name:'Statements',exact:true}).click();const modal=page.locator('.statement-reconciliation-modal');await modal.getByLabel('Statement primary account').selectOption('1');
 const csv='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance\n1,synthetic,2026-01-15,2026-01-15 12:00,Readable shop,Original merchant A,Everyday living,Shopping,,-25.00,,975.00\n2,synthetic,2026-01-16,2026-01-16 12:00,Other shop,Original merchant B,Everyday living,Shopping,,-30.00,,945.00';
 await modal.getByLabel('Statement CSV').setInputFiles({name:'fields.csv',mimeType:'text/csv',buffer:Buffer.from(csv)});await modal.getByRole('button',{name:'Retain CSV for review',exact:true}).click();
 await expect(modal.getByRole('columnheader',{name:'Original description',exact:true})).toBeVisible();await expect(modal.getByRole('columnheader',{name:'Parent category',exact:true})).toBeVisible();
 const row=modal.getByLabel('Approve source row 1',{exact:true}).locator('..').locator('..');await expect(row).toContainText('Original merchant A');await expect(row).toContainText('Everyday living');
 await modal.getByLabel('Action source row 1',{exact:true}).selectOption('create');await modal.getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');await modal.getByLabel('Mapping source field row 1',{exact:true}).selectOption('parentCategory');
 await row.getByRole('button',{name:'Save as mapping',exact:true}).click();await expect(modal.getByLabel('Mapping field',{exact:true})).toHaveValue('parentCategory');await expect(modal.getByLabel('Mapping text',{exact:true})).toHaveValue('Everyday living');await modal.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(modal.getByLabel('Action source row 2',{exact:true})).toHaveValue('create');await expect(modal.getByLabel('Secondary account source row 2',{exact:true})).toHaveValue('5');
 await expect(row).toContainText('Parent category equals “Everyday living”');
 await modal.getByLabel('Group statement rows by').selectOption('parentCategory');await expect(modal.locator('.statement-group-row')).toContainText('Everyday living');
 await page.screenshot({path:test.info().outputPath('stored-mapping-fields.png')});
 expect((await currentScenario(page)).statementMappings[0].field).toBe('parentCategory');
 await modal.getByRole('button',{name:'Remove mapping',exact:true}).click();await expect(modal.getByLabel('Action source row 2',{exact:true})).toHaveValue('');await expect(row).toContainText('No saved mapping');
});
