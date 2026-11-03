import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Section = domainList({
  room: relationship({ref:'Room.sections'}),
  name: text(),
  priceTier: relationship({ref:'PriceTier.sections'}),
  sort: integer({defaultValue:0}),
  tables: relationship({ref:'Table.section',many:true}),
}, 'canManageSettings', false);
