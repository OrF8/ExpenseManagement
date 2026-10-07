import {describe, it, expect} from 'vitest';
import {ancestorPath, canReparent, subtreeBoards, indexHierarchy, boardPathLabel} from '../functions/shared/hierarchy.mjs';
import {getAggregateTotalForBoard} from '../src/utils/boardHierarchy';
import {resolveMoney} from '../functions/conversion.mjs';
import {aggregateTransactions} from '../functions/shared/money.mjs';
const boards = [{id:'a',title:'Trips',ownerUid:'u'},{id:'b',title:'Food',parentBoardId:'a',ownerUid:'u'},{id:'c',title:'Food',parentBoardId:'b',ownerUid:'u'},{id:'d',title:'Food',ownerUid:'other'}];
describe('arbitrary hierarchy', () => {
  it('legacy roots, immediate children and ordered ancestors', () => {
    expect(indexHierarchy(boards).children.get(null).map(b=>b.id)).toEqual(['a','d']);
    expect(indexHierarchy(boards).children.get('a').map(b=>b.id)).toEqual(['b']);
    expect(ancestorPath('c',boards).path.map(b=>b.id)).toEqual(['a','b','c']);
    expect(boardPathLabel('c',boards)).toBe('Trips / Food / Food');
  });
  it('reparents roots, existing parents and entire subtrees safely', () => {
    expect(canReparent('b',null,boards)).toBe(true);
    expect(canReparent('c','a',boards)).toBe(true);
    expect(canReparent('a','c',boards)).toBe(false);
    expect(canReparent('a','a',boards)).toBe(false);
    expect(canReparent('b','d',boards)).toBe(false);
    expect(canReparent('b','missing',boards)).toBe(false);
  });
  it('handles missing ancestors and malformed cycles without hanging', () => {
    const cycle=[{id:'a',parentBoardId:'b'},{id:'b',parentBoardId:'a'}];
    expect(ancestorPath('a',cycle).incomplete).toBe(true);
    expect(()=>subtreeBoards('a',cycle)).toThrow(/cycle/);
    expect(ancestorPath('b',[boards[1]]).incomplete).toBe(true);
    expect(canReparent('c','a',[...cycle,boards[2]])).toBe(false);
  });
  it('traverses 12000 levels iteratively without a product depth limit', () => {
    const deep=Array.from({length:12000},(_,i)=>({id:String(i),parentBoardId:i?String(i-1):null}));
    expect(ancestorPath('11999',deep).path).toHaveLength(12000);
    expect(subtreeBoards('0',deep)).toHaveLength(12000);
  });
  it('includes direct amounts at every level, exactly once, grouped by currency', () => {
    expect(getAggregateTotalForBoard('a',{a:{ILS:'1.01'},b:{USD:'2.22'},c:{ILS:'3.03'}},boards)).toEqual({ILS:'4.04',USD:'2.22'});
    expect(getAggregateTotalForBoard('a',{a:{ILS:'1.01'}},boards)).toBeUndefined();
  });
});
describe('existing authoritative FX path', () => {
  const getRate=async()=>({rate:'3.335',source:'automatic',provider:'boi',rateDate:'2026-10-07'});
  it('retains manual snapshots and half-away-from-zero rounding without reconversion', async () => {
    const money=await resolveMoney({input:{amount:'1.00',currency:'USD',fxMode:'manual',manualRate:'3.335'},targetCurrency:'ILS',getRate});
    expect(money.conversion.convertedAmount).toBe('3.34');
    const previous={...money,amount:'1.00',currency:'USD'};
    const preserved=await resolveMoney({previous,targetCurrency:'ILS',getRate:()=>{throw Error('should not fetch');}});
    expect(preserved.conversion).toEqual(money.conversion);
    expect(aggregateTransactions([previous],'ILS').grandTotal).toBe('3.34');
    const totals={a:{ILS:'1.00'},b:{ILS:'3.34'},c:{USD:'1.00'}};
    expect(getAggregateTotalForBoard('a',totals,boards)).toEqual({ILS:'4.34',USD:'1.00'});
  });
  it.each(['boi','frankfurter'])('preserves trusted %s provider metadata',async provider=>{
    const result=await resolveMoney({input:{amount:'-1.00',currency:'USD'},targetCurrency:'ILS',getRate:async()=>({...await getRate(),provider})});
    expect(result.conversion.provider).toBe(provider);
    expect(result.conversion.convertedAmount).toBe('-3.34');
  });
  it('keeps legacy numeric ILS amounts readable',()=>expect(aggregateTransactions([{amount:1.235}],'ILS').grandTotal).toBe('1.24'));
});
