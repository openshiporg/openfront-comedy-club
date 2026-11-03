import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const PromoCode = domainList({
  code: unique(),
  discountType: choice(['percent_bps', 'amount_cents', 'comp']),
  value: integer({defaultValue:0}),
  maxUses: integer({defaultValue:100}),
  usedCount: integer({defaultValue:0}),
  reservedCount: integer({defaultValue:0}),
  show: relationship({ref:'Show.promos'}),
  template: relationship({ref:'ShowTemplate.promos'}),
  validFrom: timestamp(),
  validUntil: timestamp(),
  holds: relationship({ref:'InventoryHold.promo',many:true}),
}, 'canManageOrders', false);
