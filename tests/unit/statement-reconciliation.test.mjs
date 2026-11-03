import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv,parseStatement,suggestStatementMatches,STATEMENT_HEADERS } from '../../js/shared/statement-utils.js';
import { createDefaultAppData } from '../../js/shared/app-data-utils.js';
import { encodeCloudSnapshot,decodeCloudSnapshot } from '../../js/app/services/cloud-snapshot-codec.js';
import { validateAppData } from '../../js/app/services/validation-service.js';
globalThis.localStorage={data:new Map(),getItem(k){return this.data.get(k)||null;},setItem(k,v){this.data.set(k,v);}};
globalThis.CustomEvent=class {constructor(type,options){this.type=type;this.detail=options.detail;}};
globalThis.document={dispatchEvent(){}};
const store=await import('../../js/app/services/storage-service.js');
const {retainStatement}=await import('../../js/app/services/statement-service.js');
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
