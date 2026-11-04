import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv,parseStatement,suggestStatementMatches,STATEMENT_HEADERS,defaultStatementWindow } from '../../js/shared/statement-utils.js';
import { createDefaultAppData } from '../../js/shared/app-data-utils.js';
import { encodeCloudSnapshot,decodeCloudSnapshot } from '../../js/app/services/cloud-snapshot-codec.js';
import { validateAppData } from '../../js/app/services/validation-service.js';
import { migrateAppData } from '../../js/shared/migration-utils.js';
globalThis.localStorage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
globalThis.document={dispatchEvent(){}};
const store=await import('../../js/app/services/storage-service.js');
const {retainStatement}=await import('../../js/app/services/statement-service.js');
const {saveStatementMapping,removeStatementMapping,removeStatementMappings,updateStatementMappings}=await import('../../js/app/services/statement-service.js');
const {statementMappingFor,statementMappingLabel,MAPPING_FIELDS,relevantMappingText,compileMappingSearch}=await import('../../js/shared/statement-mapping-utils.js');
const {applyStatementDecisions:applyStatementDecisionsCommand}=await import('../../js/app/managers/occurrence-manager.js');
const january={id:'2026-01',type:'Month',startDate:'2026-01-01',endDate:'2026-01-31'};
const applyStatementDecisions=(scenarioId,importId,decisions)=>applyStatementDecisionsCommand(scenarioId,importId,decisions.map(d=>({primaryAccountId:1,secondaryAccountId:2,period:january,...d})));
const header=STATEMENT_HEADERS.join(',');
const row=(nr,date,description,out,fee,balance)=>[nr,'bank-1',date,date+' 12:00',description,description,'Expenses','Services','',out,fee,balance].join(',');
const csv=header+'\r\n'+row(1,'2026-01-15','Service','-100.00','','900.00')+'\r\n'+row(2,'2026-01-15','Fee','','-3.00','897.00');

test('mapping search supports many/single wildcards and doubled literal escapes without changing contains semantics',()=>{
 for(const [query,text,expected] of [
   ['shop','My SHOP payment',true],['','anything',true],['a*b','ab',true],['a*b','prefix A long B suffix',true],['a*b','ac',false],
   ['a%b','ab',false],['a%b','prefix Axb suffix',true],['a%b','axxb',false],['%','',false],['*','',true],
   ['**','A*B',true],['**','AB',false],['%%','A%B',true],['%%','AB',false],['a**b','a*b',true],['a%%b','a%b',true],
   ['***','*long',true],['%%%','%x',true],['%%%','%',false],['a%b','a😀b',true],['a%b','a b',true],['a.b','axb',false],['[x]','value [x]',true]
 ])assert.equal(compileMappingSearch(query)(text),expected,JSON.stringify({query,text}));
 assert.equal(compileMappingSearch('*a'.repeat(100)+'z')('a'.repeat(500)),false);
});
function seed() {
 const data=createDefaultAppData();data.scenarios=[{id:1,version:1,name:'Test',accounts:[{id:1,name:'Bank',type:1,currency:1,startingBalance:1000,openDate:'2026-01-01'},{id:2,name:'Shop',type:5,currency:1,startingBalance:0,openDate:'2026-01-01'}],transactions:[],transactionOccurrences:[{id:1,occurrenceKey:'occurrence:1',sourceTransactionId:null,origin:'manual',primaryAccountId:1,secondaryAccountId:2,transactionTypeId:2,scheduledDate:'2026-01-15',plannedAmount:100,baselineAmount:null,actualAmount:null,status:'planned',description:'Service',lineItems:[]}],baselinePeriods:[],reviewReminders:[]}];return data;
}
test('CSV handles quoted commas, newlines and escaped quotes without source loss',()=>{
 assert.deepEqual(parseCsv('a,b\r\n"x, y","a""b\nc"'),[['a','b'],['x, y','a"b\nc']]);
 assert.throws(()=>parseCsv('a,"b'),/Unclosed/);
 const p=parseStatement(csv);assert.equal(p.entries.length,2);assert.equal(p.entries[1].amountCents,-300);assert.deepEqual(p.balanceIssues,[]);
 assert.equal(parseStatement(csv.replace('897.00','896.00')).balanceIssues.length,1);
 assert.throws(()=>parseStatement(csv.replace('-100.00','oops')),/monetary/);
});

test('schema 45 statements and mappings upgrade losslessly to the account-independent workflow',async()=>{
 await store.write(seed());await retainStatement(1,'legacy.csv',csv);const old=await store.read();old.schemaVersion=45;
 old.scenarios[0].statementImports[0].accountId=1;old.scenarios[0].statementImports[0].decisions={0:{action:'ignore',occurrenceKey:null,appliedAt:'2026-01-16T00:00:00Z'}};
 old.scenarios[0].statementMappings=[{id:'old',accountId:1,field:'description',pattern:'Service',comparison:'contains',direction:'out',secondaryAccountId:2,action:'prefer-match'}];
 const original=JSON.stringify(old),upgraded=migrateAppData(old),scenario=upgraded.scenarios[0];
 assert.equal(upgraded.schemaVersion,46);assert.equal(scenario.statementImports[0].accountId,undefined);assert.equal(scenario.statementImports[0].legacyAccountId,1);assert.equal(scenario.statementImports[0].rawCsv,csv);assert.deepEqual(scenario.statementImports[0].rows,old.scenarios[0].statementImports[0].rows);assert.deepEqual(scenario.statementImports[0].decisions,old.scenarios[0].statementImports[0].decisions);
 assert.equal(scenario.statementMappings[0].primaryAccountId,1);assert.equal(scenario.statementMappings[0].defaultAction,'match');assert.equal(scenario.statementMappings[0].legacyStatementAccountId,1);assert.equal(JSON.stringify(old),original);assert.equal(validateAppData(upgraded).isValid,true);
 assert.equal(upgraded.migrationReport.statementWorkflowUpgrade.sourceRowsAndDecisionsPreserved,true);
 const bytes=new TextEncoder().encode(JSON.stringify(old)),sha256=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
 const decoded=await decodeCloudSnapshot({format:'ftrack-snapshot-v1',schemaVersion:45,chunkCount:1,byteLength:bytes.length,sha256},[{index:0,data:Buffer.from(bytes).toString('base64')}]);assert.equal(decoded.schemaVersion,46);assert.deepEqual(decoded.scenarios[0].statementImports,scenario.statementImports);
});

test('statement bank identity does not constrain the FTrack primary and repeated rows accumulate in a budget occurrence',async()=>{
 const data=seed();data.scenarios[0].accounts.push({id:3,name:'Running Costs',type:5,currency:1,startingBalance:0,openDate:'2026-01-01'});data.scenarios[0].transactionOccurrences[0].primaryAccountId=3;data.scenarios[0].transactionOccurrences[0].scheduledDate='2026-01-01';await store.write(data);
 const id=await retainStatement(1,'bank.csv',csv);await saveStatementMapping(1,{primaryAccountId:3,secondaryAccountId:2,field:'category',comparison:'exact',pattern:'Services',direction:'out',defaultAction:'line'});
 const scenario=(await store.read()).scenarios[0];assert.equal(statementMappingFor(parseStatement(csv).entries[0],scenario.statementMappings,scenario.accounts).rule.primaryAccountId,3);
 const decisions=[0,1].map(index=>({index,action:'line',primaryAccountId:3,secondaryAccountId:2,period:january,occurrenceKey:'occurrence:1',expectedAmount:100,expectedActualAmount:0}));
 await applyStatementDecisionsCommand(1,id,decisions);const after=(await store.read()).scenarios[0];assert.equal(after.transactionOccurrences.length,1);assert.equal(after.transactionOccurrences[0].actualAmount,103);assert.equal(after.transactionOccurrences[0].primaryAccountId,3);assert.equal(after.transactionOccurrences[0].lineItems.length,2);assert.equal(after.statementImports[0].accountId,undefined);
 const overlap=await retainStatement(1,'overlap.csv',csv+'\n');await assert.rejects(()=>applyStatementDecisionsCommand(1,overlap,[{...decisions[0],occurrenceKey:null}]),/already reconciled/);
});

test('missing targets create one period transaction and later periods remain separate',async()=>{
 const data=seed();data.scenarios[0].transactionOccurrences=[];await store.write(data);const id=await retainStatement(1,'jan.csv',csv);
 await applyStatementDecisions(1,id,[{index:0,action:'line'},{index:1,action:'line'}]);let scenario=(await store.read()).scenarios[0];assert.equal(scenario.transactionOccurrences.length,1);assert.equal(scenario.transactionOccurrences[0].actualAmount,103);assert.equal(scenario.transactionOccurrences[0].lineItems.length,2);
 const feb=header+'\n'+row(1,'2026-02-15','Service','-70.00','','830.00'),febId=await retainStatement(1,'feb.csv',feb);await applyStatementDecisionsCommand(1,febId,[{index:0,action:'line',primaryAccountId:1,secondaryAccountId:2,period:{id:'2026-02',type:'Month',startDate:'2026-02-01',endDate:'2026-02-28'}}]);
 scenario=(await store.read()).scenarios[0];assert.deepEqual(scenario.transactionOccurrences.map(o=>o.actualAmount),[103,70]);assert.deepEqual(scenario.transactionOccurrences.map(o=>o.scheduledDate),['2026-01-01','2026-02-01']);
});

test('period and target ambiguity are enforced atomically by the command, not just the UI',async()=>{
 const data=seed();data.scenarios[0].transactionOccurrences.push({...data.scenarios[0].transactionOccurrences[0],id:2,occurrenceKey:'occurrence:2',scheduledDate:'2026-01-01'});await store.write(data);const id=await retainStatement(1,'test.csv',csv);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'line'}]),/Multiple transactions/);
 await assert.rejects(()=>applyStatementDecisionsCommand(1,id,[{index:0,action:'line',primaryAccountId:1,secondaryAccountId:2}]),/valid reporting/);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'line',period:{startDate:'2026-02-01',endDate:'2026-02-28'}}]),/outside/);
 assert.deepEqual((await store.read()).scenarios[0].statementImports[0].decisions,{});
 await applyStatementDecisions(1,id,[{index:0,action:'line',occurrenceKey:'occurrence:2',expectedAmount:100}]);assert.equal((await store.read()).scenarios[0].transactionOccurrences.find(o=>o.id===2).actualAmount,100);
});
test('suggestions respect direction and support the secondary-account perspective',()=>{
 const entry=parseStatement(csv).entries[0];const o=seed().scenarios[0].transactionOccurrences[0];
 assert.equal(suggestStatementMatches(entry,[o],1).length,1);
 assert.equal(suggestStatementMatches(entry,[o],2).length,0);
 assert.equal(suggestStatementMatches({...entry,amountCents:10000},[o],2).length,1);
});
test('retain, approve atomically, avoid repeat imports, and round-trip full sources through cloud',async()=>{
 await store.write(seed());const id=await retainStatement(1,1,'test.csv',csv);
 assert.equal(await retainStatement(1,1,'test.csv',csv),id);
 let data=await store.read();assert.equal(data.scenarios[0].transactionOccurrences[0].status,'planned');
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100},{index:1,action:'create',secondaryAccountId:999}]),/account/i);
 assert.equal((await store.read()).scenarios[0].transactionOccurrences[0].status,'planned');
 await applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100},{index:1,action:'create',secondaryAccountId:2}]);
 data=await store.read();assert.equal(data.scenarios[0].transactionOccurrences[0].actualAmount,100);assert.equal(data.scenarios[0].transactionOccurrences[1].actualAmount,3);
 assert.equal(data.scenarios[0].statementImports[0].rawCsv,csv);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100}]),/reviewed/);
 const overlapping=await retainStatement(1,1,'overlap.csv',csv+'\r\n');
 await assert.rejects(()=>applyStatementDecisions(1,overlapping,[{index:0,action:'create',secondaryAccountId:2}]),/already reconciled/);
 const ready=await store.read(); assert.equal(validateAppData(ready).isValid,true,JSON.stringify(validateAppData(ready)));
 const encoded=await encodeCloudSnapshot(ready);const decoded=await decodeCloudSnapshot(encoded,encoded.chunks);
 assert.equal(decoded.scenarios[0].statementImports[0].rawCsv,csv);
});

test('stale plans, repeated targets and closed periods never partially apply',async()=>{
 await store.write(seed());const id=await retainStatement(1,1,'test.csv',csv);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:99}]),/changed since review/);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100},{index:1,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100}]),/Two source rows/);
 let data=await store.read();assert.deepEqual(data.scenarios[0].statementImports[0].decisions,{});
 data.scenarios[0].baselinePeriods=[{id:'test',periodType:'Month',periodId:'2026-01',startDate:'2026-01-01',endDate:'2026-01-31',frozenAt:'2026-01-01T00:00:00Z'}];await store.write(data);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100}]),/closed period/);
 assert.equal((await store.read()).scenarios[0].transactionOccurrences[0].status,'planned');
});

test('source corruption is reported by the existing data validator',async()=>{
 await store.write(seed());await retainStatement(1,1,'test.csv',csv);
 const data=await store.read();data.scenarios[0].statementImports[0].rows[0][4]='changed';
 assert.equal(validateAppData(data).isValid,false);
});

test('mapping CRUD persists through cloud and checks scope, direction and conflicts',async()=>{
 await store.write(seed());
 const rule={accountId:1,field:'originalDescription',pattern:'service',comparison:'contains',direction:'out',action:'prefer-match',secondaryAccountId:2};
 await saveStatementMapping(1,rule);
 let scenario=(await store.read()).scenarios[0],entry=parseStatement(csv).entries[0];
 const saved=scenario.statementMappings[0];
 assert.equal(statementMappingFor(entry,scenario.statementMappings,1,scenario.accounts).rule.id,saved.id);
 assert.equal(statementMappingFor({...entry,amountCents:10000},scenario.statementMappings,1,scenario.accounts).rule,null);
 assert.equal(statementMappingFor(entry,scenario.statementMappings,2,scenario.accounts).rule.id,saved.id);
 await assert.rejects(()=>saveStatementMapping(1,rule),/already exists/);
 await saveStatementMapping(1,{...saved,defaultAction:'create'});
 scenario=(await store.read()).scenarios[0];assert.equal(scenario.statementMappings[0].defaultAction,'create');
 const encoded=await encodeCloudSnapshot(await store.read());const decoded=await decodeCloudSnapshot(encoded,encoded.chunks);
 assert.deepEqual(decoded.scenarios[0].statementMappings,scenario.statementMappings);
 const conflict={...saved,id:'another',field:'description',defaultAction:'ignore',secondaryAccountId:null};
 assert.equal(statementMappingFor(entry,[saved,conflict],1,scenario.accounts).conflict,true);
 await assert.rejects(()=>saveStatementMapping(1,{...rule,pattern:'other',secondaryAccountId:1}),/different/);
 await removeStatementMapping(1,saved.id);assert.deepEqual((await store.read()).scenarios[0].statementMappings,[]);
});

test('account-only mappings ignore legacy action differences and persist without an action',async()=>{
 await store.write(seed());
 const rule={accountId:1,field:'originalDescription',pattern:'Service',comparison:'exact',direction:'out',secondaryAccountId:2};
 await saveStatementMapping(1,rule);
 const scenario=(await store.read()).scenarios[0],saved=scenario.statementMappings[0];
 assert.equal(Object.hasOwn(saved,'action'),false);
 const entry=parseStatement(csv).entries[0];
 const mapping=statementMappingFor(entry,[{...saved,action:'create'},{...saved,id:'legacy',action:'prefer-match'}],1,scenario.accounts);
 assert.equal(mapping.conflict,false);
 assert.equal(mapping.rule.secondaryAccountId,2);
 assert.equal(validateAppData(await store.read()).isValid,true);
});

test('bulk mapping edits are atomic, preserve individual patterns, and reject invalid or duplicate results',async()=>{
 const data=seed();data.scenarios[0].accounts.push({id:3,name:'Other shop',type:5,currency:1,startingBalance:0,openDate:'2026-01-01'});await store.write(data);
 const base={accountId:1,field:'description',comparison:'contains',direction:'out',secondaryAccountId:2};
 await saveStatementMapping(1,{...base,pattern:'Merchant A'});await saveStatementMapping(1,{...base,pattern:'Merchant B'});
 const original=(await store.read()).scenarios[0].statementMappings,ids=original.map(r=>r.id);
 await updateStatementMappings(1,ids,{secondaryAccountId:3,comparison:'exact'});
 let rules=(await store.read()).scenarios[0].statementMappings;assert.deepEqual(rules.map(r=>r.pattern),['Merchant A','Merchant B']);assert.ok(rules.every(r=>r.secondaryAccountId===3&&r.comparison==='exact'));
 const before=JSON.stringify(rules);await assert.rejects(()=>updateStatementMappings(1,ids,{secondaryAccountId:1}),/different/);assert.equal(JSON.stringify((await store.read()).scenarios[0].statementMappings),before);
 await assert.rejects(()=>updateStatementMappings(1,[ids[0],'removed'],{direction:'in'}),/removed/);
 await assert.rejects(()=>updateStatementMappings(1,ids,{}),/Choose fields/);
 await saveStatementMapping(1,{...base,pattern:'Merchant A',field:'category'});
 await assert.rejects(()=>updateStatementMappings(1,[ids[0]],{field:'category',comparison:'contains'}),/already exists/);
 rules=(await store.read()).scenarios[0].statementMappings;assert.equal(rules[0].field,'description');
});

test('bulk mapping removal is atomic and leaves transactions and unselected rules unchanged',async()=>{
 await store.write(seed());const base={accountId:1,field:'description',comparison:'contains',direction:'out',secondaryAccountId:2};for(const pattern of ['Merchant A','Merchant B','Merchant C'])await saveStatementMapping(1,{...base,pattern});
 const before=(await store.read()).scenarios[0],ids=before.statementMappings.map(r=>r.id);
 await assert.rejects(()=>removeStatementMappings(1,[]),/Select/);await assert.rejects(()=>removeStatementMappings(1,[ids[0],ids[0]]),/Select/);
 await assert.rejects(()=>removeStatementMappings(1,[ids[0],'missing']),/No mappings were changed/);assert.deepEqual((await store.read()).scenarios[0].statementMappings,before.statementMappings);
 await removeStatementMappings(1,[ids[0],ids[2]]);const after=(await store.read()).scenarios[0];assert.deepEqual(after.statementMappings,[before.statementMappings[1]]);assert.deepEqual(after.transactionOccurrences,before.transactionOccurrences);
 await removeStatementMappings(1,[ids[1]]);assert.deepEqual((await store.read()).scenarios[0].statementMappings,[]);
});

test('description mappings ignore volatile references while preserving merchant identity',()=>{
 const scenario=seed().scenarios[0];const rule={id:'r',accountId:1,secondaryAccountId:2,field:'originalDescription',comparison:'exact',direction:'out',pattern:'Card purchase Merchant ABC 2026/01/15 ref 123456'};
 const entry={...parseStatement(csv).entries[0],originalDescription:'Card purchase Merchant ABC 2026/02/15 ref 987654'};
 assert.equal(relevantMappingText(rule.pattern),'merchant abc');
 assert.equal(statementMappingFor(entry,[rule],1,scenario.accounts).rule.id,'r');
 assert.equal(statementMappingFor({...entry,originalDescription:'Different merchant ref 987654'},[rule],1,scenario.accounts).rule,null);
 assert.equal(statementMappingFor(entry,[{...rule,pattern:'123456'}],1,scenario.accounts).rule,null);
});

test('statement line items preserve existing actuals, accumulate, validate and prevent double application',async()=>{
 const data=seed();const target=data.scenarios[0].transactionOccurrences[0];target.status='actual';target.actualAmount=40;target.actualDate='2026-01-14';await store.write(data);
 const id=await retainStatement(1,1,'lines.csv',csv);
 await applyStatementDecisions(1,id,[{index:0,action:'line',occurrenceKey:'occurrence:1',expectedAmount:100,expectedActualAmount:40},{index:1,action:'line',occurrenceKey:'occurrence:1',expectedAmount:100,expectedActualAmount:40}]);
 const updated=(await store.read()).scenarios[0].transactionOccurrences[0];assert.equal(updated.actualAmount,143);assert.equal(updated.plannedAmount,100);assert.equal(updated.lineItems.length,3);assert.equal(updated.lineItems[0].amount,40);assert.equal(validateAppData(await store.read()).isValid,true);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'line',occurrenceKey:'occurrence:1',expectedAmount:100,expectedActualAmount:143}]),/reviewed/);
});

test('future-plan adjustment records actual without changing previous history',async()=>{
 const data=seed(),scenario=data.scenarios[0];
 scenario.transactions=[{id:10,primaryAccountId:1,secondaryAccountId:2,transactionTypeId:2,amount:80,effectiveDate:'2026-01-15',description:'Service',recurrence:{recurrenceType:4,startDate:'2026-01-15',endDate:null,interval:1,dayOfMonth:15}}];
 scenario.transactionOccurrences=[];await store.write(data);const id=await retainStatement(1,1,'future.csv',csv);
 await applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'tx:10|date:2026-01-15|role:none',expectedAmount:80,updateFuture:true}]);
 const after=(await store.read()).scenarios[0];const {resolveScenarioOccurrences}=await import('../../js/domain/queries/resolve-scenario-occurrences.js');
 const {occurrences}=resolveScenarioOccurrences({scenario:after,startDate:'2026-01-01',endDate:'2026-03-31'});
 assert.equal(occurrences.find(o=>o.scheduledDate==='2026-01-15').actualAmount,100);
 assert.equal(occurrences.find(o=>o.scheduledDate==='2026-02-15').plannedAmount,100);
 assert.equal(after.transactions.find(t=>t.id===10).amount,80);
 assert.equal(after.statementImports[0].decisions[0].updateFuture,true);
});

test('account-mapped merchants can suggest a changed amount without guessing unrelated actuals',()=>{
 const entry={...parseStatement(csv).entries[0],description:'Unknown merchant',originalDescription:'Unknown merchant',amountCents:-12500};
 const occurrence=seed().scenarios[0].transactionOccurrences[0];
 assert.equal(suggestStatementMatches(entry,[occurrence],1).length,0);
 assert.equal(suggestStatementMatches(entry,[occurrence],1,{allowAmountDifference:true}).length,1);
 assert.equal(suggestStatementMatches(entry,[{...occurrence,status:'actual',actualAmount:100,actualDate:entry.postingDate}],1,{allowAmountDifference:true}).length,0);
});

test('25th cycles handle month and year boundaries',()=>{
 assert.deepEqual(defaultStatementWindow(new Date(2026,10,3)),{startDate:'2026-10-25',endDate:'2026-11-25'});
 assert.deepEqual(defaultStatementWindow(new Date(2026,10,25)),{startDate:'2026-11-25',endDate:'2026-12-25'});
 assert.deepEqual(defaultStatementWindow(new Date(2026,0,1)),{startDate:'2025-12-25',endDate:'2026-01-25'});
});

test('insufficient funds are excluded but charged fees remain reconcilable',async()=>{
 const source=header+'\n'+row(1,'2026-01-15','Service','-100.00','','900.00')+'\n'+row(2,'2026-01-16','Insufficient funds','-50.00','','900.00')+'\n'+row(3,'2026-01-16','Insufficient funds fee','','-3.00','897.00');
 const parsed=parseStatement(source);assert.equal(parsed.entries[1].insufficientFunds,true);assert.equal(parsed.entries[2].insufficientFunds,false);assert.deepEqual(parsed.balanceIssues,[]);
 assert.deepEqual(suggestStatementMatches(parsed.entries[1],seed().scenarios[0].transactionOccurrences,1),[]);
 await store.write(seed());const id=await retainStatement(1,1,'failed.csv',source);
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:1,action:'create',secondaryAccountId:2}]),/Insufficient-funds/);
 assert.equal((await store.read()).scenarios[0].statementImports[0].rawCsv,source);
});

test('all four source fields support stored mapping rules and labels never describe amount/date heuristics',()=>{
 const entry=parseStatement(csv).entries[0],scenario=seed().scenarios[0];
 for(const field of MAPPING_FIELDS){
  const rule={id:'rule-'+field,accountId:1,field,pattern:entry[field],comparison:'exact',direction:'out',action:'create',secondaryAccountId:2};
  const mapping=statementMappingFor(entry,[rule],1,scenario.accounts);
  assert.equal(mapping.rule.id,rule.id);
  assert.match(statementMappingLabel(mapping,scenario.accounts),/equals.*Shop/);
  assert.doesNotMatch(statementMappingLabel(mapping,scenario.accounts),/amount|days apart/);
 }
 assert.equal(statementMappingLabel({rule:null,conflict:false},scenario.accounts),'No saved mapping');
});
