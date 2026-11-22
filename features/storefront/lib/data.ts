import { GraphQLClient, gql } from 'graphql-request';
import { getServerGraphQLTarget } from '@/features/dashboard/lib/getBaseUrl';
import { PUBLIC_REQUEST_ERROR, publicGraphQLErrorMessage, safeErrorSummary } from '@/features/dashboard/lib/security';
import { getAuthHeaders } from '@/features/dashboard/lib/cookies';

/** Storefront reads and writes use only the custom operations; raw lists stay locked. `asBuyer` sends the signed-in buyer's session (My tickets, checkout). */
export async function gqlCall<T = any>(query: string, variables: Record<string, unknown> = {}, asBuyer = false): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const { endpoint, fetch: internalFetch } = await getServerGraphQLTarget();
    const headers = asBuyer ? await getAuthHeaders() : {};
    const client = new GraphQLClient(endpoint, { redirect: 'error', headers, ...(internalFetch ? { fetch: internalFetch } : {}) });
    return { ok: true, data: await client.request<T>(query, variables) };
  } catch (error) {
    console.error('Storefront request failed:', safeErrorSummary(error));
    return { ok: false, error: publicGraphQLErrorMessage(error) || PUBLIC_REQUEST_ERROR };
  }
}

export const SHOWS_ON_SALE = gql`{ showsOnSale }`;
export const SHOW_AVAILABILITY = gql`query($id: ID!) { showAvailability(showId: $id) }`;
export const OPEN_MIC = gql`{ openMicShows }`;
export const CONFIRMATION = gql`query($n: String!, $s: String!) { ticketOrderConfirmation(orderNumber: $n, orderSecret: $s) }`;
export const LOOKUP = gql`query($e: String!, $n: String!) { lookupTicketOrder(email: $e, orderNumber: $n) }`;

export async function venueInfo() {
  const r = await gqlCall<{ showsOnSale: any[] }>(SHOWS_ON_SALE);
  return r.ok ? r.data.showsOnSale : [];
}
