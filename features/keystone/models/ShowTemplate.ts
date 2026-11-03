import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const ShowTemplate = domainList({
  room: relationship({ref:'Room.templates'}),
  title: text(),
  recurrenceRule: text(),
  startTime: text(),
  duration: integer({defaultValue:90}),
  defaultPriceTiers: relationship({ref:'PriceTier.templates',many:true}),
  defaultAgeRestriction: choice(['all', '18', '21']),
  isOpenMic: checkbox({defaultValue:false}),
  shows: relationship({ref:'Show.template',many:true}),
  promos: relationship({ref:'PromoCode.template',many:true}),
}, 'canManageShows', false);
