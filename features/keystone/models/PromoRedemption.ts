import { integer, relationship } from '@keystone-6/core/fields';
import { domainList, lifecycle, money } from './domainFields';

export const PromoRedemption = domainList({
  promoCode: relationship({ ref: 'PromoCode.redemptions' }),
  hold: relationship({ ref: 'InventoryHold.redemption' }),
  order: relationship({ ref: 'TicketOrder.redemptions' }),
  amountCents: money(),
  status: lifecycle(['reserved', 'committed', 'released']),
}, 'canManageOrders', true);
