import { test } from 'node:test';
import assert from 'node:assert/strict';
import { basisPoints,quote,minimum,checkBill,payout,settlement,selfRefundAllowed,runClosePlan } from './money';
test('basis point rounding uses integer arithmetic',()=>{assert.equal(basisPoints(101,500),5);assert.equal(basisPoints(1,5000),1);});
test('quote snapshots all charges',()=>{assert.deepEqual(quote({priceCents:2500,feeCents:200,quantity:2,serviceFeeBps:100,taxBps:825,discountType:'percent_bps',discountValue:1000}),{subtotalCents:5000,feesCents:450,discountCents:500,taxCents:371,totalCents:5321});});
test('discount cannot make subtotal negative',()=>{assert.equal(quote({priceCents:100,feeCents:0,quantity:1,serviceFeeBps:0,taxBps:0,discountType:'amount_cents',discountValue:200}).totalCents,0);});
test('two item minimum and independent waiver',()=>{assert.equal(minimum({requiredItems:6,qualifyingItems:3,cheapestCents:500}),1500);assert.equal(minimum({requiredItems:6,qualifyingItems:7,cheapestCents:500}),0);assert.equal(minimum({requiredItems:6,qualifyingItems:0,cheapestCents:500,waived:true}),0);});
test('minimum floor alternative',()=>assert.equal(minimum({requiredItems:0,qualifyingItems:0,cheapestCents:0,floorCents:2000,qualifyingCents:1200}),800));
test('payout freezes fees and run fee replaces base only',()=>{assert.equal(payout([{feeCents:5000,bonusCents:500}]),5500);assert.equal(payout([{feeCents:5000,bonusCents:500}],10000),10500);});
test('settlement excludes tips and tax',()=>assert.equal(settlement({ticketGrossCents:10000,feesCents:1000,discountsCents:500,refundsCents:2000,foodBeverageGrossCents:6000,minimumShortfallRevenueCents:500,talentCostCents:8000}),7000));
test('self-refund window boundary',()=>{const now=new Date('2026-11-01T00:00:00Z');assert.equal(selfRefundAllowed(new Date('2026-11-02T00:00:00Z'),24,now),true);assert.equal(selfRefundAllowed(new Date('2026-11-01T23:59:59Z'),24,now),false);});
test('invalid money rejected',()=>{assert.throws(()=>basisPoints(1.5,100));assert.throws(()=>minimum({requiredItems:-1,qualifyingItems:0,cheapestCents:1}));});

const base = { runStatus: 'in_progress', runFeeCents: 300000, showStatuses: ['settled', 'settled', 'cancelled'], headlinerPerformedShows: 2 };
test('run closes with the full run fee once every show is settled or cancelled', () => {
  assert.deepEqual(runClosePlan(base), { ok: true, createPayout: true, payoutCents: 300000, note: 'Run fee for the headliner' });
});
test('run cannot close while a show is still open', () => {
  const r: any = runClosePlan({ ...base, showStatuses: ['settled', 'on_sale', 'completed'] });
  assert.equal(r.ok, false); assert.match(r.reason, /2 shows/);
});
test('closed run cannot close again', () => assert.equal((runClosePlan({ ...base, runStatus: 'closed' }) as any).ok, false));
test('headliner who performed nothing earns no run payout', () => {
  const r: any = runClosePlan({ ...base, headlinerPerformedShows: 0 });
  assert.equal(r.ok, true); assert.equal(r.createPayout, false); assert.equal(r.payoutCents, 0);
});
test('zero run fee creates no payout; empty and invalid runs are rejected', () => {
  assert.equal((runClosePlan({ ...base, runFeeCents: 0 }) as any).createPayout, false);
  assert.equal((runClosePlan({ ...base, showStatuses: [] }) as any).ok, false);
  assert.throws(() => runClosePlan({ ...base, runFeeCents: 10.5 }));
});

test('check bill: voided items ignored, shortfall billed, tax excludes tip, waiver drops shortfall',()=>{
  const items=[{qty:1,priceCents:800,countsTowardMinimum:true},{qty:2,priceCents:500,countsTowardMinimum:false},{qty:3,priceCents:900,countsTowardMinimum:true,voided:true}];
  assert.deepEqual(checkBill({items,requiredItems:4,cheapestCents:400,taxBps:1000,tipCents:300}),{minimumShortfallCents:1200,subtotalCents:3000,taxCents:300,tipCents:300,totalCents:3600});
  assert.equal(checkBill({items,requiredItems:4,cheapestCents:400,taxBps:1000,waived:true}).totalCents,1980);
  assert.equal(checkBill({items,requiredItems:0,cheapestCents:0,taxBps:0,tipCents:-5}).tipCents,0);
});
