import { text, integer, checkbox, timestamp, json, relationship, image } from '@keystone-6/core/fields';
import { domainList, money, currency, lifecycle, choice, unique, secret } from './domainFields';

export const Room = domainList({
  venue: relationship({ref:'Venue.rooms'}),
  name: text(),
  capacity: integer({defaultValue:180}),
  seatingMode: choice(['tables', 'ga']),
  active: checkbox({defaultValue:false}),
  sections: relationship({ref:'Section.room',many:true}),
  shows: relationship({ref:'Show.room',many:true}),
  templates: relationship({ref:'ShowTemplate.room',many:true}),
}, 'canManageSettings', false);
