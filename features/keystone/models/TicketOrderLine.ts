import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const TicketOrderLine = domainList({
  order: relationship({ref:'TicketOrder.lines'}),
  tierName: text(),
  unitPriceCents: money(),
  unitFeeCents: money(),
  quantity: integer({defaultValue:1}),
  lineTotalCents: money(),
  discountCents: money(),
  taxCents: money(),
  currencyCode: currency(),
  priceTierId: text(),
  tickets: relationship({ref:'Ticket.line',many:true}),
}, 'canManageOrders', true);
