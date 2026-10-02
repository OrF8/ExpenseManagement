import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateTransactions, canonicalAmount, convert, minorUnits, formatMoney } from '../functions/shared/money.mjs';
import { resolveMoney } from '../functions/conversion.mjs';
import { parseRateCsv, latestRate } from '../functions/fx.mjs';
const getRate = async () => ({ rate: '117', source: 'automatic', provider: 'frankfurter', rateDate: '2026-10-01' });
test('exact totals, legacy defaults, and original breakdown', () => {
 assert.equal(aggregateTransactions([{amount:100},{amount:50}]).grandTotal,'150.00');
 const mixed=[{amount:'1000.00',currency:'RSD'},{amount:'10.00',currency:'EUR',conversion:{targetCurrency:'RSD',rate:'117',convertedAmount:'1170.00'}},{amount:'20.00',currency:'ILS',conversion:{targetCurrency:'RSD',rate:'32',convertedAmount:'640.00'}}];
 assert.equal(aggregateTransactions(mixed,'RSD').grandTotal,'2810.00');
 assert.deepEqual(aggregateTransactions(mixed,'RSD').originals,{RSD:'1000.00',EUR:'10.00',ILS:'20.00'});
 assert.equal(aggregateTransactions(mixed.slice(1),'RSD').grandTotal,'1810.00');
 assert.throws(()=>aggregateTransactions(mixed,'USD'));
});
test('precision and half-away-from-zero boundaries',()=>{
 for(const [currency,rate,expected] of [['JPY','1.5','2'],['ILS','1.005','1.01'],['KWD','1.0005','1.001'],['CLF','1.00005','1.0001']]){
  assert.equal(convert('1','USD',rate,currency),expected);
  assert.equal(convert('-1','USD',rate,currency),'-'+expected);
 }
 assert.equal(convert('1','USD','0.999999999999999999','CLF'),'1.0000');
 assert.throws(()=>canonicalAmount('1.001','ILS'));
 for(const amount of ['NaN','1e2','100000000','0','--2'])assert.throws(()=>canonicalAmount(amount,'ILS'));
 assert.throws(()=>minorUnits('1','BTC'));
 assert.match(formatMoney('123456789012345678.12','ILS','en-US'),/123,456,789,012,345,678\.12/);
});
test('snapshot stability, amount edits, manual preservation and refresh',async()=>{
 let calls=0;const rate=async()=>{calls++;return getRate();};
 const original={amount:'10.00',currency:'EUR',...(await resolveMoney({input:{amount:'10',currency:'EUR'},targetCurrency:'RSD',getRate:rate}))};
 const unchanged=await resolveMoney({previous:original,input:{},targetCurrency:'RSD',getRate:rate});
 assert.deepEqual(unchanged.conversion,original.conversion);assert.equal(calls,1);
 assert.equal((await resolveMoney({previous:original,input:{amount:'20'},targetCurrency:'RSD',getRate:rate})).conversion.convertedAmount,'2340.00');
 const manual={...original,...await resolveMoney({previous:original,input:{fxMode:'manual',manualRate:'120.000000000000000001'},targetCurrency:'RSD',getRate:rate})};
 assert.equal((await resolveMoney({previous:manual,input:{amount:'20'},targetCurrency:'RSD',getRate:rate})).conversion.rate,manual.conversion.rate);
 assert.equal(calls,2);
 assert.equal((await resolveMoney({previous:manual,input:{fxMode:'automatic'},targetCurrency:'RSD',getRate:rate})).conversion.source,'automatic');
 await assert.rejects(resolveMoney({previous:manual,input:{fxMode:'automatic'},targetCurrency:'RSD',getRate:async()=>{throw Error('offline');}}));
 assert.equal(manual.conversion.source,'manual');
 const legacy={amount:1.234};assert.equal((await resolveMoney({previous:legacy,targetCurrency:'ILS',getRate:rate})).amount,undefined);
});
test('CSV parser rejects mismatches, malformed dates and rates',()=>{
 assert.equal(parseRateCsv('date,base,quote,rate\n2026-10-01,EUR,RSD,117.123456789012345678','EUR','RSD').rate,'117.123456789012345678');
 for(const row of ['2026-10-01,USD,RSD,2','2026-02-30,EUR,RSD,2','2026-10-01,EUR,RSD,-1','2026-10-01,EUR,RSD,NaN','2026-10-01,EUR,RSD,1e2'])assert.throws(()=>parseRateCsv('date,base,quote,rate\n'+row,'EUR','RSD'));
 assert.throws(()=>parseRateCsv('date,base,quote,rate','EUR','RSD'));
 assert.throws(()=>parseRateCsv('x'.repeat(4097),'EUR','RSD'));
});
test('provider failure, size limit and timeout',async()=>{
 await assert.rejects(latestRate('EUR','RSD',{fetchImpl:async()=>new Response('',{status:503})}));
 await assert.rejects(latestRate('EUR','RSD',{fetchImpl:async()=>new Response('x'.repeat(5000))}));
 await assert.rejects(latestRate('EUR','RSD',{timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(Error('timeout'))))}));
 assert.equal((await latestRate('EUR','RSD',{fetchImpl:async()=>new Response('date,base,quote,rate\n2026-10-01,EUR,RSD,117')})).rate,'117');
});
test('ILS pairs prefer BOI representative rates and fall back to the blended feed',async()=>{
 const csv=(base,quote,rate)=>`date,base,quote,rate\n${base === undefined ? '' : '2026-10-01,' + base + ',' + quote + ',' + rate}`;
 let urls=[];
 const boi=await latestRate('EUR','ILS',{fetchImpl:async(url)=>{urls.push(String(url));return new Response(csv('EUR','ILS','3.4826'));}});
 assert.equal(boi.provider,'boi');assert.equal(urls.length,1);assert.match(urls[0],/providers=boi/);
 urls=[];
 const inverse=await latestRate('ILS','EUR',{fetchImpl:async(url)=>{urls.push(String(url));return new Response(csv('ILS','EUR','0.28714179'));}});
 assert.equal(inverse.provider,'boi');assert.match(urls[0],/providers=boi/);
 urls=[];
 const fallback=await latestRate('RSD','ILS',{fetchImpl:async(url)=>{urls.push(String(url));if(String(url).includes('providers=boi'))return new Response('',{status:422});return new Response(csv('RSD','ILS','0.0297'));}});
 assert.equal(fallback.provider,'frankfurter');assert.equal(urls.length,2);assert.match(urls[0],/providers=boi/);assert.doesNotMatch(urls[1],/providers=/);
 urls=[];
 const nonIls=await latestRate('EUR','RSD',{fetchImpl:async(url)=>{urls.push(String(url));return new Response(csv('EUR','RSD','117'));}});
 assert.equal(nonIls.provider,'frankfurter');assert.equal(urls.length,1);assert.doesNotMatch(urls[0],/providers=/);
});
test('legacy scientific-notation numbers read without rewriting or floating arithmetic',()=>{
 assert.equal(aggregateTransactions([{amount:1e-7}]).grandTotal,'0.00');
 assert.equal(aggregateTransactions([{amount:5e-324}]).grandTotal,'0.00');
 assert.equal(convert(1e-7,'ILS','10000000','USD'),'1.00');
});
