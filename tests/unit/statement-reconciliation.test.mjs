import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv,parseStatement,suggestStatementMatches,STATEMENT_HEADERS,defaultStatementWindow } from '../../js/shared/statement-utils.js';
import { createDefaultAppData } from '../../js/shared/app-data-utils.js';
import { encodeCloudSnapshot,decodeCloudSnapshot } from '../../js/app/services/cloud-snapshot-codec.js';
import { validateAppData } from '../../js/app/services/validation-service.js';
globalThis.localStorage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
globalThis.document={dispatchEvent(){}};
const store=await import('../../js/app/services/storage-service.js');
const {retainStatement}=await import('../../js/app/services/statement-service.js');
const {saveStatementMapping,removeStatementMapping}=await import('../../js/app/services/statement-service.js');
const {statementMappingFor,generateStatementMappingDrafts,statementMappingLabel,MAPPING_FIELDS,relevantMappingText}=await import('../../js/shared/statement-mapping-utils.js');
const {applyStatementDecisions}=await import('../../js/app/managers/occurrence-manager.js');
const header=STATEMENT_HEADERS.join(',');
const row=(nr,date,description,out,fee,balance)=>[nr,'bank-1',date,date+' 12:00',description,description,'Expenses','Services','',out,fee,balance].join(',');
const csv=header+'\r\n'+row(1,'2026-01-15','Service','-100.00','','900.00')+'\r\n'+row(2,'2026-01-15','Fee','','-3.00','897.00');
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
 await assert.rejects(()=>applyStatementDecisions(1,id,[{index:0,action:'match',occurrenceKey:'occurrence:1',expectedAmount:100}]),/closed-period/);
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
 assert.equal(statementMappingFor(entry,scenario.statementMappings,2,scenario.accounts).rule,null);
 await assert.rejects(()=>saveStatementMapping(1,rule),/already exists/);
 await saveStatementMapping(1,{...saved,action:'create'});
 scenario=(await store.read()).scenarios[0];assert.equal(scenario.statementMappings[0].action,'create');
 const encoded=await encodeCloudSnapshot(await store.read());const decoded=await decodeCloudSnapshot(encoded,encoded.chunks);
 assert.deepEqual(decoded.scenarios[0].statementMappings,scenario.statementMappings);
 const conflict={...saved,id:'another',field:'description',action:'ignore',secondaryAccountId:null};
 assert.equal(statementMappingFor(entry,[saved,conflict],1,scenario.accounts).conflict,true);
 await assert.rejects(()=>saveStatementMapping(1,{...rule,pattern:'other',secondaryAccountId:1}),/different/);
 await removeStatementMapping(1,saved.id);assert.deepEqual((await store.read()).scenarios[0].statementMappings,[]);
});

test('mapping generation requires unique account evidence and does not mutate the scenario',()=>{
 const scenario=seed().scenarios[0];
 const entries=[{...parseStatement(csv).entries[0],description:'Shop purchase',originalDescription:'Shop purchase'}];
 assert.equal(generateStatementMappingDrafts(entries,scenario,1).length,1);
 assert.equal(scenario.statementMappings,undefined);
 assert.equal(generateStatementMappingDrafts(entries,{...scenario,accounts:[...scenario.accounts,{id:3,name:'Shop'}]},1).length,0);
 const drafts=generateStatementMappingDrafts(parseStatement(csv).entries,scenario,1,[{pattern:'Service',direction:'out',secondaryAccountId:2}]);
 assert.equal(drafts[0].secondaryAccountId,2);
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

test('mapping drafts can use unique plan description evidence without amount/date matching',()=>{
 const scenario=seed().scenarios[0];
 scenario.transactions=[{primaryAccountId:1,secondaryAccountId:2,transactionTypeId:2,description:'Merchant ABC'}];
 const entry={...parseStatement(csv).entries[0],description:'Card payment',originalDescription:'Merchant ABC reference 123'};
 const drafts=generateStatementMappingDrafts([entry],scenario,1);
 assert.equal(drafts.length,1);assert.equal(drafts[0].secondaryAccountId,2);assert.equal(Object.hasOwn(drafts[0],'action'),false);
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
