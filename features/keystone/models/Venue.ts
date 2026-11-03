import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Venue = domainList({
  name: text(),
  timezone: text(),
  address: text(),
  defaultAgeRestriction: choice(['all', '18', '21']),
  drinkMinimumItems: integer({defaultValue:2}),
  drinkMinimumCentsFloor: integer({defaultValue:0}),
  serviceFeeBps: integer({defaultValue:0}),
  taxBps: integer({defaultValue:0}),
  policies: text(),
  rooms: relationship({ref:'Room.venue',many:true}),
}, 'canManageSettings', false);
