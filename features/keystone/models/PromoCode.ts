import { text, integer, timestamp, relationship } from '@keystone-6/core/fields';
import { domainList, lifecycle, choice, unique } from './domainFields';

export const PromoCode = domainList({
  code: unique(),
  discountType: choice(['percent_bps', 'amount_cents', 'comp']),
  value: integer({ defaultValue: 0, validation: { min: 0 } }),
  maxUses: integer({ db: { isNullable: true }, validation: { min: 1 } }),
  usedCount: integer({ defaultValue: 0, access: { create: () => false, update: () => false } }),
  perOrderLimit: integer({ defaultValue: 1, validation: { min: 1 } }),
  startsAt: timestamp(),
  endsAt: timestamp(),
  status: choice(['active', 'paused', 'expired']),
  show: relationship({ ref: 'Show.promos' }),
  template: relationship({ ref: 'ShowTemplate.promos' }),
  holds: relationship({ ref: 'InventoryHold.promo', many: true }),
  redemptions: relationship({ ref: 'PromoRedemption.promoCode', many: true }),
}, 'canManageOrders', false);
