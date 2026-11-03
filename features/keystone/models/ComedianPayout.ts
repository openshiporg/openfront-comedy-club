import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const ComedianPayout = domainList({
  comedian: relationship({ref:'Comedian.payouts'}),
  show: relationship({ref:'Show.payouts'}),
  run: relationship({ref:'Run.payouts'}),
  lineupSlots: relationship({ref:'LineupSlot.payouts',many:true}),
  amountCents: money(),
  currencyCode: currency(),
  status: lifecycle(['draft', 'approved', 'paid', 'void']),
  paidAt: timestamp(),
  method: choice(['check', 'ach', 'venmo']),
  reference: text(),
  payoutKey: unique(),
}, 'canManagePayouts', true);
