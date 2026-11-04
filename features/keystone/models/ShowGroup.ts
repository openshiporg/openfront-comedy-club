import { text, relationship } from '@keystone-6/core/fields';
import { domainList, unique } from './domainFields';

/** A set of shows created together from one source show. Editing or cancelling the future ones happens as a unit. */
export const ShowGroup = domainList({
  name: text(),
  groupKey: unique(),
  sourceShow: relationship({ ref: 'Show.groupSources' }),
  shows: relationship({ ref: 'Show.group', many: true }),
}, 'canManageShows', true);
