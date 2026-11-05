const {test,expect}=require('@playwright/test');
const {gotoFTrack,currentScenario,loadSmokeData,waitForAppReady}=require('../helpers/app-data');
const header='Nr,Account,Posting Date,Transaction Date,Description,Original Description,Parent Category,Category,Money In,Money Out,Fee,Balance';
const csv=(rows)=>header+'\n'+rows.join('\n');
const purchase=(n,date,description,original,amount,balance,parent='Expenses')=>`${n},synthetic,${date},${date} 12:00,${description},${original},${parent},Shopping,,-${amount},,${balance}`;
const review=page=>page.locator('.statement-reconciliation-modal');
const grid=page=>review(page).locator('.statement-review-grid');
const row=(page,n)=>grid(page).locator('.tabulator-row').filter({has:page.getByLabel(`Approve source row ${n}`,{exact:true})});
async function open(page,data){await gotoFTrack(page,data);await page.getByRole('button',{name:'Statements',exact:true}).click();}
async function upload(page,text,name='synthetic.csv',calendarWindow=true){await review(page).getByLabel('Statement CSV').setInputFiles({name,mimeType:'text/csv',buffer:Buffer.from(text)});await expect(grid(page)).toBeVisible();if(calendarWindow){const period=await review(page).getByLabel('Statement budget period').inputValue();if(/^\d{4}-\d{2}$/.test(period)){await review(page).getByLabel('Statement review from',{exact:true}).fill(period+'-01');const end=new Date(Number(period.slice(0,4)),Number(period.slice(5)),0).getDate();await review(page).getByLabel('Statement review to (inclusive)',{exact:true}).fill(period+'-'+end);await review(page).getByRole('button',{name:'Apply dates',exact:true}).click();}}}
test.beforeEach(async({page})=>{await page.clock.setFixedTime(new Date('2026-01-20T12:00:00Z'));});

test('statement payments do not count a recurring planned breakdown as actual spending',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0],planned=[{id:'a',date:'2026-01-10',description:'Policy A',amount:250},{id:'b',date:'2026-01-10',description:'Policy B',amount:200}];s.transactions.find(t=>t.id===1002).lineItems=planned;s.transactionOccurrences.find(o=>o.sourceTransactionId===1002).lineItems=planned;
 s.statementMappings=[{id:'insurance',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Insurance',comparison:'contains',direction:'out',defaultAction:'line'}];await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Insurance','Insurance A',100,900),purchase(2,'2026-01-16','Insurance','Insurance B',50,850)]));
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');const after=await currentScenario(page),actual=after.transactionOccurrences.find(o=>o.sourceTransactionId===1002);expect(actual.plannedAmount).toBe(450);expect(actual.actualAmount).toBe(150);expect(actual.plannedLineItems).toEqual(planned);expect(actual.lineItems).toHaveLength(2);expect(after.transactions.find(t=>t.id===1002).lineItems).toEqual(planned);
});

test('mapping amount variance distinguishes separate insurance policies sharing the same accounts',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0];s.transactionOccurrences.push({...s.transactionOccurrences.find(o=>o.sourceTransactionId===1002),id:2999,sourceTransactionId:null,occurrenceKey:'occurrence:2999',origin:'manual',scheduledDate:'2026-01-20',plannedAmount:250,baselineAmount:250,description:'Policy B'});
 s.statementMappings=[{id:'insurance',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Insurance',comparison:'contains',direction:'out',defaultAction:'line',amountMatchingEnabled:true,amountVariancePercent:5,amountVarianceDirection:'up'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Policy payment','Insurance A',470,530),purchase(2,'2026-01-20','Policy payment','Insurance B',255,275)]));
 for(const n of [1,2])await expect(review(page).getByLabel(`Action source row ${n}`,{exact:true})).toHaveValue('match');
 await expect(row(page,1).locator('[tabulator-field="budget"]')).toContainText('450.00');await expect(row(page,2).locator('[tabulator-field="budget"]')).toContainText('250.00');
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');const after=await currentScenario(page);expect(after.transactionOccurrences.find(o=>o.sourceTransactionId===1002).actualAmount).toBe(470);expect(after.transactionOccurrences.find(o=>o.id===2999).actualAmount).toBe(255);
});

test('amount tolerance can be bypassed for one row without changing its saved mapping',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'insurance',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Insurance',comparison:'contains',direction:'out',defaultAction:'line',amountMatchingEnabled:true,amountVariancePercent:5,amountVarianceDirection:'both'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Insurance','Insurance payment',600,400)]));const bypass=review(page).getByRole('button',{name:'Use amount tolerance source row 1',exact:true});await expect(bypass).toHaveAttribute('aria-pressed','true');
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveAttribute('title',/No unique match within/);
 await bypass.click();await expect(bypass).toHaveAttribute('aria-pressed','false');await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');const after=await currentScenario(page);expect(after.statementMappings[0].amountMatchingEnabled).toBe(true);expect(after.statementImports[0].decisions[0].amountToleranceOverridden).toBe(true);expect(after.transactionOccurrences.find(o=>o.sourceTransactionId===1002).actualAmount).toBe(600);
});

test('mapping variance settings save through form, inline cells and bulk edits without closing the section',async({page})=>{
 await open(page);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();await mappings.getByRole('button',{name:'New mapping',exact:true}).click();
 await mappings.locator('select[aria-label="Mapping primary account"]').selectOption('1');await mappings.locator('select[aria-label="Mapping secondary account"]').selectOption('5');await mappings.getByLabel('Mapping text',{exact:true}).fill('Insurance');await mappings.getByLabel('Mapping amount matching',{exact:true}).selectOption('true');await mappings.getByLabel('Mapping variance percent',{exact:true}).fill('5');await mappings.getByLabel('Mapping variance direction',{exact:true}).selectOption('up');await mappings.getByRole('button',{name:'Save mapping',exact:true}).click();await expect(mappings).toHaveAttribute('open','');
 const row=mappings.locator('.tabulator-row').first();await row.locator('[tabulator-field="amountVariancePercent"]').click();await mappings.getByLabel('Edit mapping Variance %',{exact:true}).fill('7.5');await mappings.getByLabel('Edit mapping Variance %',{exact:true}).press('Enter');await expect(row.locator('[tabulator-field="amountVariancePercent"]')).toContainText('7.5');
 await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await mappings.getByLabel('Bulk mapping amount matching',{exact:true}).selectOption('false');await mappings.getByLabel('Bulk mapping variance direction',{exact:true}).selectOption('down');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();await expect(mappings).toHaveAttribute('open','');const rule=(await currentScenario(page)).statementMappings[0];expect(rule.amountMatchingEnabled).toBe(false);expect(rule.amountVariancePercent).toBe(7.5);expect(rule.amountVarianceDirection).toBe('down');
});

test('partial approvals keep the remaining same-pair statement rows in line-item mode',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Merchant',comparison:'contains',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','First','Merchant',25,975),purchase(2,'2026-01-16','Second','Merchant',30,945)]));
 await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');await expect(review(page).getByLabel('Action source row 2',{exact:true})).toHaveValue('line');
 await review(page).getByLabel('Approve source row 2',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');const target=(await currentScenario(page)).transactionOccurrences.find(o=>o.sourceTransactionId===1002);expect(target.actualAmount).toBe(55);expect(target.lineItems).toHaveLength(2);
});

test('matches account pairs regardless of stored money direction and exposes the budget amount',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0];s.transactions.find(t=>t.id===1002).transactionTypeId=1;s.transactionOccurrences.find(o=>o.sourceTransactionId===1002).transactionTypeId=1;
 s.statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Merchant',comparison:'contains',direction:'out',defaultAction:'future'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Shop','Merchant',400,600)]));await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await expect(row(page,1).locator('[tabulator-field="budget"]')).toContainText('450.00');
 await expect(grid(page).getByRole('columnheader',{name:'Budget amount',exact:true})).toBeVisible();await expect(review(page).getByLabel('Action source row 1',{exact:true}).locator('option[value="existing"]')).toHaveCount(0);
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');const after=await currentScenario(page),target=after.transactionOccurrences.find(o=>o.sourceTransactionId===1002);expect(target.actualAmount).toBe(400);expect(target.transactionTypeId).toBe(1);expect(after.transactions.find(t=>t.id===1002).amount).toBe(450);
});

test('create plus recurring plan uses the chosen frequency and starts only after the current budget period',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'new',primaryAccountId:3,secondaryAccountId:5,field:'originalDescription',pattern:'New merchant',comparison:'contains',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Shop','New merchant',80,920)]));const action=review(page).getByLabel('Action source row 1',{exact:true});await expect(action).toHaveValue('create');await expect(row(page,1).locator('[tabulator-field="budget"]')).toContainText('—');
 await action.selectOption('createPlan');const frequency=page.locator('.modal-recurrence');await frequency.locator('#recurrenceType').selectOption('4');await frequency.locator('#dayOfMonth').fill('15');await frequency.locator('#endDate').fill('2026-04-30');await frequency.getByTitle('Save',{exact:true}).click();
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');const s=await currentScenario(page),created=s.transactions.filter(t=>t.primaryAccountId===3&&t.secondaryAccountId===5);expect(created).toHaveLength(1);expect(created[0].amount).toBe(80);expect(created[0].recurrence.startDate).toBe('2026-02-15');expect(created[0].recurrence.endDate).toBe('2026-04-30');expect(s.statementImports[0].decisions[0].createdTransactionId).toBe(created[0].id);
});

test('budget month and salary source dates are independent, remembered per period, and audited separately',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Merchant',comparison:'contains',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-10-25','First','Merchant',25,975),purchase(2,'2026-11-25','Second','Merchant',30,945),purchase(3,'2026-12-01','Third','Merchant',20,925)]),'salary.csv',false);
 await review(page).getByLabel('Statement budget period').selectOption('2026-11');
 await expect(review(page).getByLabel('Statement review from',{exact:true})).toHaveValue('2026-10-25');await expect(review(page).getByLabel('Statement review to (inclusive)',{exact:true})).toHaveValue('2026-11-25');
 await expect(review(page).getByLabel('Approve source row 1',{exact:true})).toBeVisible();await expect(review(page).getByLabel('Approve source row 3',{exact:true})).toHaveCount(0);
 await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('line');await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
 let s=await currentScenario(page);const target=s.transactionOccurrences.find(o=>o.scheduledDate==='2026-11-10'&&o.secondaryAccountId===5);expect(target.actualAmount).toBe(55);expect(target.lineItems.map(l=>l.date)).toEqual(['2026-10-25','2026-11-25']);expect(s.statementImports[0].decisions[0].period.id).toBe('2026-11');expect(s.statementImports[0].decisions[0].transactionWindow.startDate).toBe('2026-10-25');
 await review(page).getByLabel('Statement budget period').selectOption('2026-12');await review(page).getByLabel('Statement review from',{exact:true}).fill('2026-11-26');await review(page).getByLabel('Statement review to (inclusive)',{exact:true}).fill('2026-12-15');await review(page).getByRole('button',{name:'Apply dates',exact:true}).click();
 await expect(review(page).getByLabel('Action source row 3',{exact:true})).toHaveValue('match');await review(page).getByLabel('Statement budget period').selectOption('2026-11');await review(page).getByLabel('Statement budget period').selectOption('2026-12');await expect(review(page).getByLabel('Statement review to (inclusive)',{exact:true})).toHaveValue('2026-12-15');
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');s=await currentScenario(page);expect(s.transactionOccurrences.find(o=>o.scheduledDate==='2026-12-10').actualAmount).toBe(20);
});

test('single-row actual completion updates an existing actual without adding duplicate money',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0];s.statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'originalDescription',pattern:'Merchant',comparison:'contains',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','First','Merchant',400,600)]));await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');
 await expect(row(page,1)).not.toContainText('Linked to:');await expect(row(page,1)).not.toContainText('Merchant →');await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveAttribute('title',/Groceries budget/);
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');
 await upload(page,csv([purchase(1,'2026-01-15','Different source text','Merchant second export',400,600)]),'second.csv');await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');
 const after=await currentScenario(page),target=after.transactionOccurrences.find(o=>o.actualAmount===400);expect(target.lineItems||[]).toHaveLength(0);expect(after.statementImports[1].decisions[0].action).toBe('match');
});

test('review and mapping accounts use the shared type/group picker and support quick account creation',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-15','Shop','Merchant',25,975)]));
 await review(page).getByRole('button',{name:'Primary account source row 1',exact:true}).click();const picker=page.locator('.selection-dialog');await picker.getByLabel('Account Type',{exact:true}).selectOption('type:1');await expect(picker).toBeVisible();await expect(picker.getByLabel('Account Group',{exact:true})).toBeVisible();await picker.getByRole('option',{name:/Checking/}).click();
 await review(page).getByRole('button',{name:'Secondary account source row 1',exact:true}).click();await picker.getByRole('option',{name:'＋ Add new account…',exact:true}).click();const quick=page.locator('.modal-quick-account');await quick.getByLabel('Name',{exact:true}).fill('New shop');await quick.getByRole('button',{name:'Use Account',exact:true}).click();
 await expect(review(page).getByRole('button',{name:'Secondary account source row 1',exact:true})).toContainText('New shop');
 const account=(await currentScenario(page)).accounts.find(a=>a.name==='New shop');expect(account.type.id).toBe(5);
 await row(page,1).getByRole('button',{name:'Create mapping',exact:true}).click();const mappings=review(page).locator('.statement-mappings');await expect(mappings.getByRole('button',{name:'Mapping secondary account',exact:true})).toContainText('New shop');await mappings.getByRole('button',{name:'Save mapping',exact:true}).click();await expect(mappings.locator('summary')).toContainText('1 saved');
 await mappings.locator('.tabulator-row [tabulator-field="secondaryAccountId"]').click();await mappings.getByRole('button',{name:'Edit mapping Secondary account',exact:true}).click();await picker.getByRole('option',{name:/Groceries Expense/}).click();await expect(mappings.locator('summary')).toContainText('1 saved');expect((await currentScenario(page)).statementMappings[0].secondaryAccountId).toBe(5);
});

test('period/date toolbar stays on one desktop row, reflows on phones, and full source opens from the top toolbar',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await open(page);await upload(page,csv([purchase(1,'2026-01-15','Shop','Merchant',25,975)]));const bar=review(page).locator('.statement-timeframe');
 const fields=await bar.locator('label').evaluateAll(nodes=>nodes.map(n=>({top:n.getBoundingClientRect().top,width:n.getBoundingClientRect().width})));expect(new Set(fields.map(f=>Math.round(f.top))).size).toBe(1);expect(fields[0].width).toBeLessThan(220);
 const headers=await grid(page).locator('.tabulator-header .tabulator-col').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));expect(new Set(headers).size).toBe(1);
 await review(page).getByRole('button',{name:'View full source',exact:true}).click();await expect(page.locator('.statement-source-modal .tabulator-row')).toHaveCount(1);await page.locator('.statement-source-modal').getByRole('button',{name:'Close source',exact:true}).click();await expect(grid(page)).toBeVisible();await page.screenshot({path:test.info().outputPath('statement-toolbar-desktop.png')});
 await page.setViewportSize({width:390,height:844});const tops=await bar.locator('label').evaluateAll(nodes=>nodes.map(n=>Math.round(n.getBoundingClientRect().top)));expect(new Set(tops).size).toBeGreaterThan(1);expect(await review(page).evaluate(n=>n.scrollWidth<=n.clientWidth+1)).toBe(true);await page.screenshot({path:test.info().outputPath('statement-toolbar-phone.png')});
});

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
 const account=mappings.locator('.tabulator-row').first().locator('[tabulator-field="secondaryAccountId"]');await account.click();await account.locator('select[aria-label="Edit mapping Secondary account"]').selectOption('3');await expect(mappings.locator('.tabulator-row').first()).toContainText('Credit Card');expect((await currentScenario(page)).statementMappings[0].secondaryAccountId).toBe(3);await page.screenshot({path:test.info().outputPath('mapping-cell-grid.png')});
});

test('bulk mapping edit changes only selected rules and keeps their individual text',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B','Merchant C'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();
 await mappings.getByLabel('Select mapping Merchant A',{exact:true}).check();await mappings.getByLabel('Select mapping Merchant B',{exact:true}).check();await expect(mappings).toContainText('2 selected');
 await mappings.locator('select[aria-label="Bulk mapping secondary account"]').selectOption('3');await mappings.getByLabel('Bulk mapping comparison',{exact:true}).selectOption('exact');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
 await expect(mappings).toHaveAttribute('open','');await expect(mappings).toContainText('2 selected');await expect(mappings.getByLabel('Select mapping Merchant A',{exact:true})).toBeChecked();const rules=(await currentScenario(page)).statementMappings;expect(rules.map(r=>r.pattern)).toEqual(['Merchant A','Merchant B','Merchant C']);expect(rules.slice(0,2).every(r=>r.secondaryAccountId===3&&r.comparison==='exact')).toBe(true);expect(rules[2].secondaryAccountId).toBe(5);expect(rules[2].comparison).toBe('contains');
 await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('3 selected');await mappings.getByRole('button',{name:'Clear mapping selection',exact:true}).click();await expect(mappings).toContainText('0 selected');
});

test('mapping filters combine description and account, persist after saving, and limit bulk selection',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[['Shop Alpha',5],['Shop Beta',3],['Salary',5],['Shop Gamma',5]].map(([pattern,secondaryAccountId],i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();const rows=mappings.locator('.statement-mapping-grid .tabulator-row');await expect(rows).toHaveCount(4);
 const search=mappings.getByLabel('Filter mappings by description',{exact:true}),account=mappings.locator('select[aria-label="Filter mappings by secondary account"]');await search.fill('SHOP');await expect(rows).toHaveCount(3);await account.selectOption('5');await expect(rows).toHaveCount(2);await expect(mappings).toContainText('2 of 4 shown');
 await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('2 selected');await mappings.getByLabel('Bulk mapping comparison',{exact:true}).selectOption('exact');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
 await expect(search).toHaveValue('SHOP');await expect(account).toHaveValue('5');await expect(rows).toHaveCount(2);const rules=(await currentScenario(page)).statementMappings;expect(rules.map(r=>r.comparison)).toEqual(['exact','contains','contains','exact']);
 await rows.first().locator('[tabulator-field="pattern"]').click();const editor=mappings.getByLabel('Edit mapping Text',{exact:true});await editor.fill('Shop Alpha revised');await editor.press('Enter');await expect(rows.first()).toContainText('Shop Alpha revised');await expect(search).toHaveValue('SHOP');await expect(account).toHaveValue('5');
 await search.fill('no match');await expect(mappings).toContainText('0 of 4 shown');await expect(mappings).toContainText('0 selected');await expect(mappings.locator('.statement-mapping-grid .tabulator-placeholder')).toBeVisible();
 await mappings.getByRole('button',{name:'Clear mapping filters',exact:true}).click();await expect(rows).toHaveCount(4);await expect(search).toHaveValue('');await expect(account).toHaveValue('');
});

test('changing mapping filters drops hidden selections before bulk updates',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'description',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();await expect(mappings.getByLabel('Select mapping Merchant A',{exact:true})).toBeVisible();await mappings.getByRole('button',{name:'Select all visible mappings',exact:true}).click();await expect(mappings).toContainText('2 selected');
 await mappings.getByLabel('Filter mappings by description',{exact:true}).fill('Merchant B');await expect(mappings).toContainText('1 selected');await mappings.locator('select[aria-label="Bulk mapping secondary account"]').selectOption('3');await mappings.getByRole('button',{name:'Apply to selected mappings',exact:true}).click();
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
 await open(page,data);const mappings=review(page).locator('.statement-mappings');await mappings.locator('summary').click();const search=mappings.getByLabel('Filter mappings by description',{exact:true}),account=mappings.locator('select[aria-label="Filter mappings by secondary account"]'),rows=mappings.locator('.statement-mapping-grid .tabulator-row');await expect(rows).toHaveCount(5);
 await search.fill('sHoP a*bc');await expect(rows).toHaveCount(2);await account.selectOption('5');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop ABC');
 await account.selectOption('');await search.fill('shop a%c');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop ABC');
 await search.fill('**');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Rate*Plan');await search.fill('%%');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Rate%Plan');
 await search.fill('*');await expect(rows).toHaveCount(5);await search.fill('shop ac');await expect(rows).toHaveCount(1);await expect(rows.first()).toContainText('Shop AC');
});

test('mapping, review, source and native tables have row banding in light and dark themes',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=['Merchant A','Merchant B'].map((pattern,i)=>({id:`rule-${i}`,accountId:1,field:'originalDescription',pattern,comparison:'contains',direction:'out',secondaryAccountId:5}));
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','First shop','Merchant A',25,975),purchase(2,'2026-01-16','Other shop','Merchant B',30,945)]));
 await review(page).locator('.statement-mappings summary').click();await review(page).getByRole('button',{name:'View full source',exact:true}).click();await expect(page.locator('.statement-source-modal .tabulator-row')).toHaveCount(2);
 await page.mouse.move(0,0);
 for(const theme of ['light','dark']){
   await page.evaluate(theme=>document.documentElement.setAttribute('data-theme',theme),theme);
   for(const selector of ['.statement-mapping-grid','.statement-review-grid','.statement-source-grid']){
     const colors=await page.locator(`${selector} .tabulator-row`).evaluateAll(rows=>rows.slice(0,2).map(row=>({color:getComputedStyle(row).backgroundColor,classes:row.className})));expect(colors[0].color,`${theme} ${selector}: ${JSON.stringify(colors)}`).not.toBe(colors[1].color);
   }
   const native=await page.evaluate(()=>{const table=document.createElement('table');table.innerHTML='<tbody><tr><td>First</td></tr><tr><td>Second</td></tr></tbody>';document.body.append(table);const colors=[...table.rows].map(r=>getComputedStyle(r).backgroundColor);table.remove();return colors;});expect(native[0]).not.toBe(native[1]);
 }
 await page.screenshot({path:test.info().outputPath('banded-grids-dark.png')});
});

test('account-independent toolbar automatically retains sources; dialog fills screen',async({page})=>{
 await open(page);const text=csv([purchase(1,'2026-01-15','Shop','Original shop',25,975)]);await upload(page,text);
 await expect(review(page).getByRole('button',{name:'Retain CSV for review'})).toHaveCount(0);
 await expect(review(page)).not.toContainText('rows in the selected window');
 expect((await currentScenario(page)).statementImports[0].rawCsv).toBe(text);
 const box=await review(page).boundingBox();expect(box.width).toBeGreaterThan(page.viewportSize().width*.94);
 const imports=review(page).locator('.statement-source-imports');await expect(imports.getByRole('button',{name:'Download original CSV'})).toBeVisible();await expect(imports.getByRole('button',{name:'Download reconciliation report'})).toBeVisible();
 await expect(review(page).locator('select[aria-label="Statement primary account"]')).toHaveCount(0);await expect(review(page).getByLabel('Statement budget period')).toHaveValue('2026-01');
 expect((await currentScenario(page)).statementImports[0].accountId).toBeUndefined();const archive=review(page).getByLabel('Retained statements');await expect(archive.locator('option')).toHaveCount(2);await archive.selectOption(await archive.locator('option').nth(1).getAttribute('value'));await expect(grid(page)).toBeVisible();
});

test('default close action requires a target and manually recorded actual survives reload',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-15','Unknown shop','Original shop',25,975)]));
 await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('create');
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 await review(page).locator('select[aria-label="Primary account source row 1"]').selectOption('1');await review(page).locator('select[aria-label="Secondary account source row 1"]').selectOption('5');await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('match');await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Reviewed: match');
 await review(page).getByRole('button',{name:'Close',exact:true}).click();await page.reload();await waitForAppReady(page);await page.getByRole('button',{name:'Statements',exact:true}).click();const archive=review(page).getByLabel('Retained statements');await archive.selectOption(await archive.locator('option').nth(1).getAttribute('value'));await expect(review(page)).toContainText('Reviewed: match');
});

test('saved descriptions match changing references and mapping controls share the account cell',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'groceries',accountId:1,field:'originalDescription',pattern:'Card purchase Groceries ref 123456',comparison:'exact',direction:'out',secondaryAccountId:5}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Card purchase Groceries ref 999999',450,550)]));
 await expect(review(page).locator('select[aria-label="Secondary account source row 1"]')).toHaveValue('5');await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveAttribute('title',/Linked to: Groceries budget/);
 await expect(review(page).locator('.statement-mappings summary')).toContainText('1 saved');await expect(grid(page).getByRole('columnheader',{name:'Saved mapping rule',exact:true})).toHaveCount(0);
 const accountCell=row(page,1).locator('[tabulator-field="secondary"]');await expect(accountCell.getByLabel('View mapping source row 1',{exact:true})).toBeVisible();await expect(accountCell.getByRole('button',{name:'Create mapping',exact:true})).toBeHidden();
 await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('ignore');await expect(accountCell.getByRole('button',{name:'Update mapping'})).toBeVisible();
 await review(page).locator('select[aria-label="Secondary account source row 1"]').selectOption('3');await expect(accountCell.getByRole('button',{name:'Update mapping'})).toBeVisible();expect((await currentScenario(page)).statementMappings[0].secondaryAccountId).toBe(5);
});

test('only saved mappings are shown and removed rules never regenerate as proposals',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Groceries Expense ref 123456',450,550)]));
 const mappings=review(page).locator('.statement-mappings');await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');
 await expect(review(page).locator('select[aria-label="Secondary account source row 1"]')).toHaveValue('');
 await mappings.locator('summary').click();await expect(mappings).not.toContainText(/propos|draft/i);await expect(mappings.getByRole('button',{name:'Generate draft mappings'})).toHaveCount(0);
 await review(page).locator('select[aria-label="Primary account source row 1"]').selectOption('1');await review(page).locator('select[aria-label="Secondary account source row 1"]').selectOption('5');await row(page,1).getByRole('button',{name:'Create mapping',exact:true}).click();await mappings.getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(review(page).locator('select[aria-label="Secondary account source row 1"]')).toHaveValue('5');await expect(mappings.locator('summary')).toContainText('1 saved');await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();
 expect((await currentScenario(page)).statementMappings[0].pattern).toBe('groceries expense');
 await expect(mappings).toHaveAttribute('open','');await mappings.getByRole('button',{name:'Remove mapping',exact:true}).click();await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');await expect(mappings).toHaveAttribute('open','');await expect(mappings).not.toContainText(/propos|draft/i);await expect(review(page).locator('select[aria-label="Secondary account source row 1"]')).toHaveValue('');
 await review(page).getByLabel('Statement budget period').selectOption('2026-02');await expect(mappings.locator('summary')).toHaveText('Mapping rules — 0 saved');expect((await currentScenario(page)).statementMappings).toEqual([]);
});

test('parent-category mappings, sorting, grouping and bulk approval preserve source identity',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-15','First shop','Merchant A',25,975,'Everyday living'),purchase(2,'2026-01-16','Other shop','Merchant B',30,945,'Everyday living')]));
 await review(page).locator('select[aria-label="Primary account source row 1"]').selectOption('1');await review(page).locator('select[aria-label="Secondary account source row 1"]').selectOption('5');await row(page,1).getByRole('button',{name:'Create mapping',exact:true}).click();await review(page).getByLabel('Mapping field',{exact:true}).selectOption('parentCategory');await review(page).getByLabel('Mapping text',{exact:true}).fill('Everyday living');await review(page).getByRole('button',{name:'Save mapping',exact:true}).click();
 await expect(review(page).locator('select[aria-label="Secondary account source row 2"]')).toHaveValue('5');
 await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('line');await review(page).getByLabel('Action source row 2',{exact:true}).selectOption('line');await review(page).getByLabel('Approve source row 1',{exact:true}).check();
 await grid(page).locator('.tabulator-col[tabulator-field="amount"]').click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).toBeChecked();
 await review(page).getByLabel('Group statement rows by').selectOption('parentCategory');await expect(review(page).locator('.statement-group-row')).toContainText('Everyday living');await review(page).locator('.statement-group-row').getByRole('button',{name:'Approve group',exact:true}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toBeChecked();
 await review(page).evaluate(el=>{el.scrollTop=0;el.querySelector('.statement-review-grid .tabulator-tableholder').scrollTop=0;});await page.screenshot({path:test.info().outputPath('statement-shared-grid.png')});await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
});

test('period choices include shorter months and complete quarter boundaries',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-31','Shop','Shop',25,975)]));
 await expect(review(page).getByLabel('Statement budget period').locator('option[value="2026-02"]')).toHaveCount(1);
 await review(page).getByLabel('Statement period type').selectOption('Quarter');
 await expect(review(page).getByLabel('Statement budget period')).toHaveAttribute('title','2026-01-01 to 2026-03-31 (inclusive)');
});

test('line-item action accumulates multiple bank rows into one transaction',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-10','Groceries shop','Merchant',25,975),purchase(2,'2026-01-11','Groceries shop','Merchant',30,945)]));
 for(const n of [1,2]){await review(page).locator(`select[aria-label="Primary account source row ${n}"]`).selectOption('1');await review(page).locator(`select[aria-label="Secondary account source row ${n}"]`).selectOption('5');await review(page).getByLabel(`Action source row ${n}`,{exact:true}).selectOption('line');await review(page).getByLabel(`Choose match source row ${n}`,{exact:true}).click();await page.locator('.statement-match-picker').getByRole('button',{name:/Groceries budget/}).click();}
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toBeChecked();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
 const target=(await currentScenario(page)).transactionOccurrences.find(o=>o.description==='Groceries budget');expect(target.actualAmount).toBe(55);expect(target.lineItems).toHaveLength(2);
});

test('failed payments and out-of-window approvals remain excluded',async({page})=>{
 await open(page);await upload(page,csv([purchase(1,'2026-01-24','Shop','Shop',25,975),purchase(2,'2026-01-24','Insufficient funds','Insufficient funds',50,975),purchase(3,'2026-01-25','Later','Later',20,955)]));
 await review(page).getByLabel('Statement review from',{exact:true}).fill('2026-01-01');await review(page).getByLabel('Statement review to (inclusive)',{exact:true}).fill('2026-01-24');await review(page).getByRole('button',{name:'Apply dates'}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toHaveCount(0);await expect(review(page).getByLabel('Approve source row 3',{exact:true})).toHaveCount(0);await expect(review(page).locator('.statement-insufficient-funds').first()).toBeVisible();await review(page).getByLabel('Statement review to (inclusive)',{exact:true}).fill('2026-01-25');await review(page).getByRole('button',{name:'Apply dates'}).click();await expect(review(page).getByLabel('Approve source row 3',{exact:true})).toBeVisible();
});

test('explicit future action records actual and updates the next recurring plan',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'groceries',accountId:1,field:'description',pattern:'Groceries',comparison:'contains',direction:'out',secondaryAccountId:5}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Groceries budget','Groceries shop',500,500)]));
 await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveValue('match');await review(page).getByLabel('Action source row 1',{exact:true}).selectOption('future');await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');
 const scenario=await currentScenario(page);expect(scenario.transactionOccurrences.find(o=>o.actualAmount===500)).toBeTruthy();expect(scenario.transactions.some(t=>t.amount===500&&t.recurrence?.startDate==='2026-02-10')).toBe(true);expect(scenario.statementImports[0].decisions[0].updateFuture).toBe(true);
});

test('statement rows route to a budget primary, accumulate across the whole period, and recur separately next period',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0];s.accounts.push({...s.accounts.find(a=>a.id===5),id:7,name:'Running Costs'});s.transactions.find(t=>t.id===1002).primaryAccountId=7;s.transactionOccurrences.find(o=>o.sourceTransactionId===1002).primaryAccountId=7;
 s.statementMappings=[{id:'shop',primaryAccountId:7,secondaryAccountId:5,field:'originalDescription',pattern:'Merchant',comparison:'contains',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Shop purchase','Merchant',25,975),purchase(2,'2026-01-27','Another purchase','Merchant',30,945),purchase(3,'2026-02-05','Next period','Merchant',40,905)]));
 await review(page).getByLabel('Statement budget period').selectOption('2026-01');await review(page).getByLabel('Statement review from',{exact:true}).fill('2026-01-01');await review(page).getByLabel('Statement review to (inclusive)',{exact:true}).fill('2026-01-31');await review(page).getByRole('button',{name:'Apply dates',exact:true}).click();await expect(review(page).locator('select[aria-label="Statement primary account"]')).toHaveCount(0);await expect(review(page).locator('select[aria-label="Primary account source row 1"]')).toHaveValue('7');await expect(review(page).getByLabel('Action source row 2',{exact:true})).toHaveAttribute('title',/Linked to: Groceries budget/);
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 2',{exact:true})).toBeChecked();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');
 let scenario=await currentScenario(page);const jan=scenario.transactionOccurrences.find(o=>o.sourceTransactionId===1002&&o.scheduledDate==='2026-01-10');expect(jan.actualAmount).toBe(55);expect(jan.lineItems.map(i=>i.date)).toEqual(['2026-01-10','2026-01-27']);expect(jan.primaryAccountId).toBe(7);expect(scenario.transactions.find(t=>t.id===1002).amount).toBe(450);
 await review(page).getByLabel('Statement budget period').selectOption('2026-02');await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');scenario=await currentScenario(page);expect(scenario.transactionOccurrences.find(o=>o.scheduledDate==='2026-02-10'&&o.primaryAccountId===7).actualAmount).toBe(40);expect(scenario.transactionOccurrences.find(o=>o.id===jan.id).actualAmount).toBe(55);
});

test('row account/action overrides do not rewrite mappings, and create lines group into one new period transaction',async({page})=>{
 const data=loadSmokeData();data.scenarios[0].statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'category',pattern:'Shopping',comparison:'exact',direction:'out',defaultAction:'create'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-15','Shop','Merchant A',25,975),purchase(2,'2026-01-16','Other','Merchant B',30,945)]));
 for(const n of [1,2]){await review(page).locator(`select[aria-label="Primary account source row ${n}"]`).selectOption('3');await expect(review(page).getByLabel(`Action source row ${n}`,{exact:true})).toHaveValue('create');}
 await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 2 reviewed row(s)');const s=await currentScenario(page),created=s.transactionOccurrences.filter(o=>o.primaryAccountId===3&&o.secondaryAccountId===5);expect(created).toHaveLength(1);expect(created[0].lineItems).toHaveLength(2);expect(created[0].actualAmount).toBe(55);expect(s.statementMappings[0].primaryAccountId).toBe(1);expect(s.statementImports[0].decisions[0].period.id).toBe('2026-01');
});

test('ambiguous period targets require an explicit choice instead of amount/date guessing',async({page})=>{
 const data=loadSmokeData(),s=data.scenarios[0];s.transactionOccurrences.push({...s.transactionOccurrences[0],id:2999,occurrenceKey:'occurrence:2999',sourceTransactionId:null,scheduledDate:'2026-01-20',description:'Other groceries budget'});s.statementMappings=[{id:'shop',primaryAccountId:1,secondaryAccountId:5,field:'category',pattern:'Shopping',comparison:'exact',direction:'out',defaultAction:'line'}];
 await open(page,data);await upload(page,csv([purchase(1,'2026-01-10','Shop','Merchant',25,975)]));await expect(review(page).getByLabel('Action source row 1',{exact:true})).toHaveAttribute('title',/Multiple transactions/);await review(page).getByRole('button',{name:'Approve all eligible rows'}).click();await expect(review(page).getByLabel('Approve source row 1',{exact:true})).not.toBeChecked();await review(page).getByLabel('Choose match source row 1',{exact:true}).click();await page.locator('.statement-match-picker').getByRole('button',{name:/Other groceries budget/}).click();await review(page).getByLabel('Approve source row 1',{exact:true}).check();await review(page).getByRole('button',{name:'Apply approved rows'}).click();await expect(review(page)).toContainText('Applied 1 reviewed row(s)');expect((await currentScenario(page)).transactionOccurrences.find(o=>o.id===2999).actualAmount).toBe(25);
});

test('existing browser statements and mappings upgrade through Data Check without losing source or decisions',async({page})=>{
 const data=loadSmokeData();data.schemaVersion=45;const text=csv([purchase(1,'2026-01-15','Shop','Merchant',25,975)]),rows=text.split('\n').map(r=>r.split(','));
 data.scenarios[0].statementImports=[{id:'old-statement',accountId:1,fileName:'legacy.csv',rawCsv:text,headers:rows[0],rows:rows.slice(1),sha256:require('node:crypto').createHash('sha256').update(text).digest('hex'),importedAt:'2026-01-16T00:00:00Z',decisions:{0:{action:'ignore',occurrenceKey:null,appliedAt:'2026-01-16T00:00:00Z'}}}];data.scenarios[0].statementMappings=[{id:'old-rule',accountId:1,secondaryAccountId:5,field:'description',comparison:'contains',pattern:'Shop',direction:'out'}];
 await page.addInitScript(data=>localStorage.setItem('ftrack:app-data',JSON.stringify(data)),data);await page.goto('/pages/ftrack.html');const upgrade=page.locator('.data-upgrade-modal');await expect(upgrade).toContainText('45 → 46');await upgrade.getByRole('button',{name:'Apply Upgrade to Browser Data'}).click();await waitForAppReady(page);
 const upgraded=await currentScenario(page);expect(upgraded.statementImports[0].rawCsv).toBe(text);expect(upgraded.statementImports[0].legacyAccountId).toBe(1);expect(upgraded.statementImports[0].decisions).toEqual(data.scenarios[0].statementImports[0].decisions);expect(upgraded.statementMappings[0].primaryAccountId).toBe(1);expect(upgraded.statementMappings[0].defaultAction).toBe('line');
 await page.getByRole('button',{name:'Statements',exact:true}).click();await review(page).getByLabel('Retained statements').selectOption('old-statement');await expect(review(page)).toContainText('Reviewed: ignore');await expect(review(page).locator('select[aria-label="Statement primary account"]')).toHaveCount(0);
});
