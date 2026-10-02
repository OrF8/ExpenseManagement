import test from 'node:test';
import assert from 'node:assert/strict';
import { filterTransactions } from '../src/utils/transactionFilters.js';
import { getAggregateTotalForBoard } from '../src/utils/boardHierarchy.js';
import { mapTransactionToExportRow, exportBoardToExcel } from '../src/utils/exportBoardToExcel.js';
import ExcelJS from 'exceljs';
const txs=[{amount:'1000.00',currency:'RSD',name:'A',essence:'Cash',type:'cash'},{amount:'10.00',currency:'EUR',name:'B',essence:'Hotel',type:'cash',conversion:{targetCurrency:'RSD',rate:'117.123456789012345678',convertedAmount:'1171.23',source:'manual',provider:null,rateDate:null}}];
test('filters compare exact board amounts and retain text/date/payment behavior',()=>{
 assert.deepEqual(filterTransactions(txs,{minAmount:'1100'},'RSD'),[txs[1]]);
 assert.deepEqual(filterTransactions(txs,{query:'hotel',maxAmount:'1200',paymentMethod:'type:cash'},'RSD'),[txs[1]]);
 assert.equal(filterTransactions(txs,{transactionDate:'2026-01-01'},'RSD').length,0);
});
test('parent rollups group same currency, separate mixed children and guard missing data',()=>{
 const boards=[{id:'parent',subBoardIds:['a','b']},{id:'a'},{id:'b'}];
 assert.deepEqual(getAggregateTotalForBoard('parent',{a:{ILS:'100.00'},b:{ILS:'50.00'}},boards),{ILS:'150.00'});
 assert.deepEqual(getAggregateTotalForBoard('parent',{a:{ILS:'100.00'},b:{EUR:'50.00'}},boards),{ILS:'100.00',EUR:'50.00'});
 assert.deepEqual(getAggregateTotalForBoard('parent',{a:{ILS:'100.00'}},boards),{});
});
test('export preserves original, target, rate digits and formula-safe user text',()=>{
 const row=mapTransactionToExportRow({...txs[1],essence:'=HYPERLINK("bad")'},'RSD');
 assert.equal(row[1],"'=HYPERLINK(\"bad\")");assert.equal(row[2],'10.00');assert.equal(row[3],'EUR');assert.equal(row[4],'1171.23');assert.equal(row[5],'RSD');assert.equal(row[6],'117.123456789012345678');
 const refund=mapTransactionToExportRow({amount:'-1.23',currency:'ILS'},'ILS');assert.equal(refund[2],'-1.23');
});
test('actual XLSX roundtrip keeps money/rates as text and separates summary currencies',async()=>{
 let blob;
 globalThis.window={ExcelJS,URL:{createObjectURL:value=>{blob=value;return 'blob:test';},revokeObjectURL:()=>{}},setTimeout:fn=>fn()};
 globalThis.document={createElement:()=>({click:()=>{}}),body:{appendChild:()=>{},removeChild:()=>{}}};
 await exportBoardToExcel({boardName:'Test',includeSummarySheet:true,worksheets:[{name:'RSD',currency:'RSD',transactions:txs},{name:'ILS',currency:'ILS',transactions:[{amount:20}]}]});
 const workbook=new ExcelJS.Workbook();await workbook.xlsx.load(await blob.arrayBuffer());
 const sheet=workbook.getWorksheet('RSD');assert.equal(sheet.getCell('G3').value,'117.123456789012345678');assert.equal(sheet.getCell('C3').type,ExcelJS.ValueType.String);
 const summary=workbook.getWorksheet('סיכום');assert.equal(summary.getCell('C2').value,'RSD');assert.equal(summary.getCell('F2').value,'2171.23');assert.equal(summary.getCell('C3').value,'ILS');assert.equal(summary.getCell('F3').value,'20.00');
 delete globalThis.window;delete globalThis.document;
});
