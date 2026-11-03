import { graphql } from '@keystone-6/core';
import { virtual, text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Check = domainList({
  minimumItemsMet: virtual({field: graphql.field({type: graphql.Boolean, async resolve(item: any, _args: any, context: any) { const items = await (context.prisma as any).checkItem.findMany({where:{checkId:item.id,voided:false,countsTowardMinimum:true},select:{qty:true}}); return items.reduce((n:number,i:any)=>n+i.qty,0) >= Number(item.minimumItemsRequired); }})}),
  show: relationship({ref:'Show.checks'}),
  seatingAssignment: relationship({ref:'SeatingAssignment.checks'}),
  server: relationship({ref:'User.checks'}),
  status: lifecycle(['open', 'presented', 'paid', 'voided']),
  guestCount: integer({defaultValue:1}),
  minimumItemsRequired: integer({defaultValue:2}),
  minimumShortfallCents: money(),
  minimumUnitPriceCents: money(),
  minimumCentsFloor: money(),
  subtotalCents: money(),
  taxBps: integer({defaultValue:0}),
  taxCents: money(),
  tipCents: money(),
  totalCents: money(),
  currencyCode: currency(),
  items: relationship({ref:'CheckItem.check',many:true}),
  payments: relationship({ref:'Payment.check',many:true}),
}, 'canManageChecks', true);
