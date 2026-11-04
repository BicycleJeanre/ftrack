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

test('removing mappings keeps the section open through successive removals, including the last rule',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();
 for(const remaining of [1,0]){await mappings.getByRole('button',{name:'Remove mapping',exact:true}).first().click();await expect(mappings.locator('summary')).toContainText(`${remaining} saved`);await expect(mappings).toHaveAttribute('open','');expect((await currentScenario(page)).statementMappings).toHaveLength(remaining);}
});

test('mapping grid cells edit on click, cancel, validate, and keep the section open after saving',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();
 const first=mappings.locator('.tabulator-row').first();const text=first.locator('[tabulator-field="pattern"]');await expect(text).toHaveText('Merchant A');await text.click();await expect(text.getByLabel('Edit mapping Text')).toBeVisible();
 await text.getByLabel('Edit mapping Text').fill('Discarded edit');await text.getByLabel('Edit mapping Text').press('Escape');expect((await currentScenario(page)).statementMappings[0].pattern).toBe('Merchant A');
 await text.click();await text.getByLabel('Edit mapping Text').fill('');await text.getByLabel('Edit mapping Text').press('Enter');await expect(review(page).getByRole('alert')).toContainText('mapping pattern');await expect(text).toHaveText('Merchant A');
 await text.click();await text.getByLabel('Edit mapping Text').fill('Merchant A revised');await text.getByLabel('Edit mapping Text').press('Enter');await expect(mappings).toHaveAttribute('open','');await expect(mappings.locator('.tabulator-row').first()).toContainText('Merchant A revised');expect((await currentScenario(page)).statementMappings[1].pattern).toBe('Merchant B');
 const account=mappings.locator('.tabulator-row').first().locator('[tabulator-field="secondaryAccountId"]');await account.click();await account.getByLabel('Edit mapping Secondary account').selectOption('3');await expect(mappings.locator('.tabulator-row').first()).toContainText('Credit Card');expect((await currentScenario(page)).statementMappings[0].secondaryAccountId).toBe(3);await page.screenshot({path:test.info().outputPath('mapping-cell-grid.png')});
});

test('bulk mapping edit changes only selected rules and keeps their individual text',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B','Merchant C'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();
 await mappings.getByLabel('Select mapping Merchant A',{exact:true}).check();await mappings.getByLabel('Select mapping Merchant B',{exact:true}).check();await expect(mappings).toContainText('2 selected');
 await mappings.getByLabel('Bulk mapping secondary account',{exact:true}).selectOption('3');await mappings.getByLabel('Bulk mapping comparison',{exact:true}).selectOption('exact');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
 await expect(mappings).toHaveAttribute('open','');await expect(mappings).toContainText('2 selected');await expect(mappings.getByLabel('Select mapping Merchant A',{exact:true})).toBeChecked();const rules=(await currentScenario(page)).statementMappings;expect(rules.map(r=>r.pattern)).toEqual(['Merchant A','Merchant B','Merchant C']);expect(rules.slice(0,2).every(r=>r.secondaryAccountId===3&&r.comparison==='exact')).toBe(true);expect(rules[2].secondaryAccountId).toBe(5);expect(rules[2].comparison).toBe('contains');
 await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('3 selected');await mappings.getByRole('button',{name:'Clear mapping selection',exact:true}).click();await expect(mappings).toContainText('0 selected');
});

test('mapping filters combine description and account, persist after saving, and limit bulk selection',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[['Shop Alpha',5],['Shop Beta',3],['Salary',5],['Shop Gamma',5]].map(([pattern,secondaryAccountId],i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();const rows=mappings.locator('.statement-mapping-grid .tabulator-row');await expect(rows).toHaveCount(4);
 const search=mappings.getByLabel('Filter mappings by description',{exact:true}),account=mappings.getByLabel('Filter mappings by secondary account',{exact:true});await search.fill('SHOP');await expect(rows).toHaveCount(3);await account.selectOption('5');await expect(rows).toHaveCount(2);await expect(mappings).toContainText('2 of 4 shown');
 await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('2 selected');await mappings.getByLabel('Bulk mapping comparison',{exact:true}).selectOption('exact');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
 await expect(search).toHaveValue('SHOP');await expect(account).toHaveValue('5');await expect(rows).toHaveCount(2);const rules=(await currentScenario(page)).statementMappings;expect(rules.map(r=>r.comparison)).toEqual(['exact','contains','contains','exact']);
 await rows.first().locator('[tabulator-field="pattern"]').click();const editor=mappings.getByLabel('Edit mapping Text',{exact:true});await editor.fill('Shop Alpha revised');await editor.press('Enter');await expect(rows.first()).toContainText('Shop Alpha revised');await expect(search).toHaveValue('SHOP');await expect(account).toHaveValue('5');
 await search.fill('no match');await expect(mappings).toContainText('0 of 4 shown');await expect(mappings).toContainText('0 selected');await expect(mappings.locator('.statement-mapping-grid .tabulator-placeholder')).toBeVisible();
 await mappings.getByRole('button',{name:'Clear mapping filters',exact:true}).click();await expect(rows).toHaveCount(4);await expect(search).toHaveValue('');await expect(account).toHaveValue('');
});

test('changing mapping filters drops hidden selections before bulk updates',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();await expect(mappings.getByLabel('Select mapping Merchant A',{exact:true})).toBeVisible();await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('2 selected');
 await mappings.getByLabel('Filter mappings by description',{exact:true}).fill('Merchant B');await expect(mappings).toContainText('1 selected');await mappings.getByLabel('Bulk mapping secondary account',{exact:true}).selectOption('3');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
 expect((await currentScenario(page)).statementMappings.map(r=>r.secondaryAccountId)).toEqual([5,3]);await expect(mappings).toHaveAttribute('open','');
});

test('search is case-insensitive with escaped literal wildcard characters and bulk removal confirms only visible selected mappings',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A first','Merchant A second','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const before=await currentScenario(page),mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();const search=mappings.getByLabel('Filter mappings by description',{exact:true}),remove=mappings.getByRole('button',{name:'Remove selected mappings',exact:true});
 await expect(remove).toBeDisabled();for(const literal of ['**','%%']){await search.fill(literal);await expect(mappings).toContainText('0 of 3 shown');}
 await search.fill('mErChAnT a');await expect(mappings).toContainText('2 of 3 shown');await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await remove.click();
 const confirm=page.locator('.confirm-dialog');await expect(confirm).toContainText('Remove 2 selected mappings?');await confirm.getByTitle('Cancel',{exact:true}).click();expect((await currentScenario(page)).statementMappings).toHaveLength(3);
 await remove.click();await confirm.getByTitle('Confirm',{exact:true}).click();await expect(mappings.locator('summary')).toHaveText('Mapping rules — 1 saved');await expect(mappings).toHaveAttribute('open','');await expect(search).toHaveValue('mErChAnT a');await expect(mappings).toContainText('0 of 1 shown');await expect(remove).toBeDisabled();
 const after=await currentScenario(page);expect(after.statementMappings.map(r=>r.pattern)).toEqual(['Merchant B']);expect(after.transactionOccurrences).toEqual(before.transactionOccurrences);
 await mappings.getByRole('button',{name:'Clear mapping filters',exact:true}).click();await expect(mappings.getByLabel('Select mapping Merchant B',{exact:true})).toBeVisible();
});

test('wildcard mapping searches support star, single percent, escapes and combined account filters',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Shop ABC','Shop AC','Shop A long BC','Rate*Plan','Rate%Plan'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:i===2?3:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();const search=mappings.getByLabel('Filter mappings by description',{exact:true}),account=mappings.getByLabel('Filter mappings by secondary account',{exact:true}),rows=mappings.locator('.statement-mapping-grid .tabulator-row');await expect(rows).toHaveCount(5);
 await search.fill('sHoP a*bc');await expect(rows).toHaveCount(2);await account.selectOption('5');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop ABC');
 await account.selectOption('');await search.fill('shop a%c');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop ABC');
 await search.fill('**');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Rate*Plan');await search.fill('%%');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Rate%Plan');
 await search.fill('*');await expect(rows).toHaveCount(5);await search.fill('shop ac');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop AC');
});

test('mapping, review, source and native tables have row banding in light and dark themes',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'originalDescription',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','First shop','Merchant A',25,975),purchase(2,'2026-01-16','Other shop','Merchant B',30,945)]));
 await review(page).locator('.statement-mappings summary').click();await review(page).getByText('Full original source table (all columns and rows)',{exact:true}).click();await expect(review(page).locator('.statement-source-grid .tabulator-row')).toHaveCount(2);
 await page.mouse.move(0,0);
 for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
   for(const selector of ['.statement-mapping-grid','.statement-review-grid','.statement-source-grid']){
     const colors=await review(page).locator(`${selector} .tabulator-row`).evaluateAll(rows=>rows.slice(0,2).map(row=>({color:getComputedStyle(row).backgroundColor,classes:row.className})));expect(colors[0].color,`${theme} ${selector}: ${JSON.stringify(colors)}`).not.toBe(colors[1].color);
   }
   const native=await page.evaluate(()=>{const table=document.createElement('table');table.innerHTML='<tbody><tr><td>First</td></tr><tr><td>Second</td></tr></tbody>';document.body.append(table);const colors=[...table.rows].map(r=>getComputedStyle(r).backgroundColor);table.remove();return colors;});expect(native[0]).not.toBe(native[1]);
 }
 await page.screenshot({path:test.info().outputPath('banded-grids-dark.png')});
});

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

test('only saved mappings are shown and removed rules never regenerate as proposals',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Groceries Expense ref 123456',450,550)]));
 const mappings=review(page).locator('.statement-mappings');await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');
 await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('');
 await mappings.locator('summary').click();await expect(mappings).not.toContainText(/propos|draft/i);await expect(mappings.getByRole('button',{name:'Generate draft mappings'})).toHaveCount(0);
 await review(page).getByLabel('Secondary account source row 1',{exact:true}).selectOption('5');await row(page,1).getByRole('button',{name:'Create mapping',exact:true}).click();await mappings.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('5');await expect(mappings.locator('summary')).toContainText('1 saved');await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 expect((await currentScenario(page)).statementMappings[0].pattern).toBe('groceries expense');
 await expect(mappings).toHaveAttribute('open','');await mappings.getByRole('button',{name:'Remove mapping',exact:true}).click();await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');await expect(mappings).toHaveAttribute('open','');await expect(mappings).not.toContainText(/propos|draft/i);await expect(review(page).getByLabel('Secondary account source row 1',{exact:true})).toHaveValue('');
 await review(page).getByRole('button',{name:'Show full statement'}).click();await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');expect((await currentScenario(page)).statementMappings).toEqual([]);
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
