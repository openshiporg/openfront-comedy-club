import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const ShowSettlement = domainList({
  show: relationship({ref:'Show.settlement'}),
  ticketGrossCents: money(),
  feesCents: money(),
  discountsCents: money(),
  refundsCents: money(),
  compsCount: integer({defaultValue:0}),
  foodBeverageGrossCents: money(),
  minimumShortfallRevenueCents: money(),
  tipsCents: money(),
  talentCostCents: money(),
  netCents: integer({defaultValue:0}),
  currencyCode: currency(),
  status: lifecycle(['open', 'closed']),
  closedBy: relationship({ref:'User.settlements'}),
}, 'canManagePayouts', true);
