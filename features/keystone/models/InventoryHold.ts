import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const InventoryHold = domainList({
  holdKey: unique(),
  show: relationship({ref:'Show.holds'}),
  priceTier: relationship({ref:'PriceTier.holds'}),
  quantity: integer({defaultValue:1}),
  tables: relationship({ref:'Table.holds',many:true}),
  status: lifecycle(['active', 'converted', 'released', 'expired']),
  expiresAt: timestamp(),
  cartToken: secret(),
  quote: json(),
  
  promo: relationship({ ref: 'PromoCode.holds' }),
  redemption: relationship({ ref: 'PromoRedemption.hold' }),
  order: relationship({ref:'TicketOrder.hold'}),
  waitlistEntry: relationship({ref:'WaitlistEntry.hold'}),
  occupancies: relationship({ref:'TableOccupancy.hold',many:true}),
}, 'canManageOrders', true);
