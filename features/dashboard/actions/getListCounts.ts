/**
 * Get List Counts - dashboard server action to fetch item counts for all lists
 * Matches Dashboard1 implementation but uses dashboard's keystoneClient
 */

'use server'

import { PUBLIC_REQUEST_ERROR, safeErrorSummary } from '@/features/dashboard/lib/security';
import { keystonePartialQuery } from '../lib/keystoneClient'

export async function getListCounts(
  lists: Array<{
    key: string;
    isSingleton?: boolean;
    graphql?: {
      names: {
        listQueryName?: string;
        listQueryCountName?: string;
      };
    };
  }>
) {
  try {
    const listsToCount = lists.filter((list) => !list.isSingleton)
    const singletonLists = lists.filter((list) => list.isSingleton)

    const countQueries = listsToCount.flatMap((list) => {
      const countName = list.graphql?.names?.listQueryCountName
      return countName ? [`${list.key}: ${countName}`] : []
    })

    const singletonQueries = singletonLists.flatMap((list) => {
      const listQueryName = list.graphql?.names?.listQueryName
      return listQueryName ? [`singleton_${list.key}: ${listQueryName}(take: 1) { id }`] : []
    })

    const selections = [...countQueries, ...singletonQueries]
    if (selections.length === 0) return { success: true, data: {} }

    const query = `query GetListCounts { ${selections.join('\n')} }`
    
    // Each count is independent: a list this role cannot read, or a transient failure on one list, leaves that
    // card without a count and keeps every other count.
    const response = await keystonePartialQuery<Record<string, any>>(query)
    if (!response.success) return response
    const data: Record<string, any> = {}
    for (const [key, value] of Object.entries(response.data)) if (value !== null && value !== undefined) data[key] = value
    return { success: true as const, data }
  } catch (error: unknown) {
    console.error('Error fetching list counts:', safeErrorSummary(error))
    const errorMessage =
      PUBLIC_REQUEST_ERROR
    return { success: false, error: errorMessage }
  }
}