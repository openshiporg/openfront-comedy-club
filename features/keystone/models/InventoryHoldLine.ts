import { integer, relationship } from '@keystone-6/core/fields';
import { domainList } from './domainFields';

/** One ticket type inside a hold. A party hold has several; the hold keeps the single expiry, token and status. */
export const InventoryHoldLine = domainList({
  hold: relationship({ ref: 'InventoryHold.lines' }),
  priceTier: relationship({ ref: 'PriceTier.holdLines' }),
  quantity: integer({ defaultValue: 1 }),
}, 'canManageOrders', true);
