const {test,expect}=require('@playwright/test');
const {gotoFTrack,currentScenario,loadSmokeData,waitForAppReady}=require('../helpers/app-data');
const header='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance';
const csv=(rows)=>header+'\n'+rows.join('\n');
const purchase=(n,date,description,original,amount,balance,parent='Expenses')=>`${n},synthetic,${date},${date} 12:00,${description},${original},${parent},Shopping,,-${amount},,${balance}`;
const review=page=>page.locator('.statement-reconciliation-modal');
const grid=page=>review(page).locator('.statement-review-grid');
const row=(page,n)=>grid(page).locator('.tabulator-row').filter({has:page.getByLabel(`Approve source row ${n}`,{exact:true})});
async function open(page,data){await gotoFTrack(page,data);await page.getByRole('button',{name:'Statements',exact:true}).click();await review(page).getByLabel('Statement primary account').selectOption('1');}
async function upload(page,text,name='synthetic.csv'){await review(page).getByLabel('Statement CSV').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});await expect(grid(page)).toBeVisible();await expect(grid(page).locator('.tabulator-row').first()).toBeVisible();}
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-01-20T12:00:00Z'));});

test('account toolbar automatically retains source and scopes archive; dialog fills screen',async({page})=>{
 await open(page);const text=csv([purchase(1,'2026-01-15','Shop','Original shop',25,975)]);await upload(page,text);
 await expect(review(page).getByRole('button',{name:'Retain CSV for review'})).toHaveCount(0);
 await expect(review(page)).not.toContainText('rows in the selected window');
 expect((await currentScenario(page)).statementImports[0].rawCsv).toBe(text);
 const box=await review(page).boundingBox();expect(box.width).toBeGreaterThan(page.viewportSize().width*.94);
 const imports=review(page).locator('.statement-source-imports');await expect(imports.getByRole('button',{name:'Download original CSV'})).toBeVisible();await expect(imports.getByRole('button',{name:'Download reconciliation report'})).toBeVisible();
 const from=await review(page).getByLabel('Statement review from',{exact:true}).boundingBox(),to=await review(page).getByLabel('Statement review to (exclusive)',{exact:true}).boundingBox();expect(Math.abs(from.y-to.y)).toBeLessThan(5);
 await review(page).getByLabel('Statement primary account').selectOption('3');await expect(review(page)).toContainText('No statements retained for this account');
 await review(page).getByLabel('Statement primary account').selectOption('1');const archive=review(page).getByLabel('Retained statements');await expect(archive.locator('option')).toHaveCount(2);await archive.selectOption(await archive.locator('option').nth(1).getAttribute('value'));await expect(grid(page)).toBeVisible();
});

test('default close action requires a target and manually recorded actual survives reload',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-15','Unknown shop','Original shop',25,975)]));
 await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 await review(page).getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('create');await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Reviewed: create');
 await review(page).getByRole('button',{name:'Close',exact:true}).click();await page.reload();await waitForAppReady(page);await page.getByRole('button',{name:'Statements',exact:true}).click();await review(page).getByLabel('Statement primary account').selectOption('1');const archive=review(page).getByLabel('Retained statements');await archive.selectOption(await archive.locator('option').nth(1).getAttribute('value'));await expect(review(page)).toContainText('Reviewed: create');
});

test('saved descriptions match changing references and mapping controls share the account cell',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'groceries',accountId:1,field:'originalDescription',pattern:'Card purchase Groceries ref 123456',comparison:'exact',direction:'out',secondaryAccountId:5}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Card purchase Groceries ref 999999',450,550)]));
 await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('5');await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await expect(row(page,1)).toContainText('Linked to: Groceries budget');
 await expect(review(page).locator('.statement-mappings summary')).toContainText('1 saved');await expect(grid(page).getByRole('columnheader',{name:'Saved mapping rule',exact:true})).toHaveCount(0);
 const accountCell=row(page,1).locator('[tabulator-field="secondary"]');await expect(accountCell.getByLabel('View mapping source row 1',{exact:true})).toBeVisible();await expect(accountCell.getByRole('button',{name:'Create mapping',exact:true})).toBeHidden();
 await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('ignore');await expect(accountCell.getByRole('button',{name:'Update mapping'})).toBeHidden();
 await review(page).getByLabel('Secondary account source row 1',{exact:true}).selectOption('3');await expect(accountCell.getByRole('button',{name:'Update mapping'})).toBeVisible();expect((await currentScenario(page)).statementMappings[0].secondaryAccountId).toBe(5);
});

test('proposals are clearly separate and save-all activates rules for review rows',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Groceries Expense ref 123456',450,550)]));
 const mappings=review(page).locator('.statement-mappings');await expect(mappings.locator('summary')).toContainText('0 saved · 1 proposals (not applied)');
 await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('');
 await mappings.locator('summary').click();await mappings.getByRole('button',{name:'Save all proposed mappings'}).click();
 await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('5');await expect(mappings.locator('summary')).toContainText('1 saved');await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 expect((await currentScenario(page)).statementMappings[0].pattern).toBe('groceries expense');
});

test('parent-category mappings, sorting, grouping and bulk approval preserve source identity',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-15','First shop','Merchant A',25,975,'Everyday living'),purchase(2,'2026-01-16','Other shop','Merchant B',30,945,'Everyday living')]));
 await review(page).getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');await row(page,1).getByRole('button',{name:'Create mapping',exact:true}).click();await review(page).getByLabel('Mapping field',{exact:true}).selectOption('parentCategory');await review(page).getByLabel('Mapping text',{exact:true}).fill('Everyday living');await review(page).getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(review(page).getByLabel('Secondary account source row 2',{exact:true})).toHaveValue('5');
 await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('create');await review(page).getByLabel('Action source row 2',{exact:true}).selectOption('create');await review(page).getByLabel('Approve source row 1',{exact:true}).check();
 await grid(page).locator('.tabulator-col[tabulator-field="amount"]').click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).toBeChecked();
 await review(page).getByLabel('Group statement rows by').selectOption('parentCategory');await expect(review(page).locator('.statement-group-row')).toContainText('Everyday living');await review(page).locator('.statement-group-row').getByRole('button',{name:'Approve group',exact:true}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toBeChecked();
 await review(page).evaluate(el=>{el.scrollTop=0;el.querySelector('.statement-review-grid .tabulator-tableholder').scrollTop=0;});await page.screenshot({path:test.info().outputPath('statement-shared-grid.png')});await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
});

test('line-item action accumulates multiple bank rows into one transaction',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-10','Groceries shop','Merchant',25,975),purchase(2,'2026-01-11','Groceries shop','Merchant',30,945)]));
 for(const n of [1,2]){await review(page).getByLabel(`Secondary account source row ${n}`,{exact:true}).selectOption('5');await review(page).getByLabel(`Action source row ${n}`,{exact:true}).selectOption('line');await review(page).getByLabel(`Choose match source row ${n}`,{exact:true}).click();await page.locator('.statement-match-picker').getByRole('button',{name:/Groceries budget/}).click();}
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toBeChecked();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
 const target=(await currentScenario(page)).transactionOccurrences.find(o=>o.description==='Groceries budget');expect(target.actualAmount).toBe(55);expect(target.lineItems).toHaveLength(2);
});

test('failed payments and out-of-window approvals remain excluded',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-24','Shop','Shop',25,975),purchase(2,'2026-01-24','Insufficient funds','Insufficient funds',50,975),purchase(3,'2026-01-25','Later','Later',20,955)]));
 await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toHaveCount(0);await expect(review(page).getByLabel('Approve source row 3',{exact:true})).toHaveCount(0);await expect(review(page).locator('.statement-insufficient-funds').first()).toBeVisible();await review(page).getByRole('button',{name:'Show full statement'}).click();await expect(review(page).getByLabel('Approve source row 3',{exact:true})).toBeVisible();
});

test('explicit future action records actual and updates the next recurring plan',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'groceries',accountId:1,field:'description',pattern:'Groceries',comparison:'contains',direction:'out',secondaryAccountId:5}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Groceries shop',500,500)]));
 await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('future');await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');
 const scenario=await currentScenario(page);expect(scenario.transactionOccurrences.find(o=>o.actualAmount===500)).toBeTruthy();expect(scenario.transactions.some(t=>t.amount===500&&t.recurrence?.startDate==='2026-02-10')).toBe(true);expect(scenario.statementImports[0].decisions[0].updateFuture).toBe(true);
});
