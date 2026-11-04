import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const PriceTier = domainList({
  show: relationship({ref:'Show.tiers'}),
  name: text(),
  priceCents: money(),
  feeCents: money(),
  capacity: integer({defaultValue:180}),
  sold: integer({defaultValue:0}),
  held: integer({defaultValue:0}),
  isTableTier: checkbox({defaultValue:false}),
  seatsPerUnit: integer({defaultValue:1}),
  salesStartAt: timestamp(),
  salesEndAt: timestamp(),
  status: lifecycle(['on_sale', 'paused', 'sold_out', 'closed']),
  sections: relationship({ref:'Section.priceTier',many:true}),
  templates: relationship({ref:'ShowTemplate.defaultPriceTiers',many:true}),
  holds: relationship({ref:'InventoryHold.priceTier',many:true}),
  holdLines: relationship({ref:'InventoryHoldLine.priceTier',many:true}),
}, 'canManageShows', true);
