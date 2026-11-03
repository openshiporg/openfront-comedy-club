import { randomUUID } from 'node:crypto';

/** Vertical tools. Each one calls an existing custom mutation or query, so permissions, state checks and audit apply exactly as in the dashboard. */
type ClubTool = {
  name: string;
  description: string;
  inputSchema: any;
  operation: string;
  kind: 'query' | 'mutation';
  vars: Record<string, string>;
  idempotent?: boolean;
};

const obj = (properties: Record<string, any>, required: string[]) => ({ type: 'object', properties, required });
const str = (description: string) => ({ type: 'string', description });

export const CLUB_TOOLS: ClubTool[] = [
  { name: 'showsOnSale', description: 'List upcoming shows on sale with ticket tiers and availability.', inputSchema: obj({}, []), operation: 'showsOnSale', kind: 'query', vars: {} },
  { name: 'showAvailability', description: 'Availability, lineup and free tables for one show.', inputSchema: obj({ showId: str('Show id') }, ['showId']), operation: 'showAvailability', kind: 'query', vars: { showId: 'ID!' } },
  { name: 'publishShow', description: 'Move a show forward in its lifecycle (publish, open doors, start, end). Staff with show permission only.', inputSchema: obj({ showId: str('Show id'), nextStatus: str('on_sale, doors_open, in_progress or completed') }, ['showId']), operation: 'publishShow', kind: 'mutation', vars: { showId: 'ID!', nextStatus: 'String' }, idempotent: true },
  { name: 'checkInTicket', description: 'Check a ticket in at the door by ticket code or scan token. A second scan returns duplicate.', inputSchema: obj({ tokenOrCode: str('Ticket code or token'), showId: str('Show id') }, ['tokenOrCode', 'showId']), operation: 'checkInTicket', kind: 'mutation', vars: { tokenOrCode: 'String!', showId: 'ID!' }, idempotent: true },
  { name: 'closeShow', description: 'Close the night: creates comedian payouts and freezes the settlement. Needs payout permission.', inputSchema: obj({ showId: str('Show id') }, ['showId']), operation: 'closeShow', kind: 'mutation', vars: { showId: 'ID!' }, idempotent: true },
  { name: 'refundTicketOrder', description: 'Refund tickets on an order. Amounts above the venue threshold need an approval from another user.', inputSchema: obj({ orderId: str('Order id'), reason: str('Reason'), approvalId: str('Approval id, when required') }, ['orderId', 'reason']), operation: 'refundTicketOrder', kind: 'mutation', vars: { orderId: 'ID!', reason: 'String!', approvalId: 'ID' }, idempotent: true },
];

export async function runClubTool(tool: ClubTool, args: Record<string, any>, endpoint: string, auth: Record<string, string>, selfFetch: typeof fetch) {
  const given = Object.keys(tool.vars).filter((k) => args[k] !== undefined && args[k] !== '');
  const decl = given.map((k) => `$${k}: ${tool.vars[k]}`);
  const use = given.map((k) => `${k}: $${k}`);
  const variables: Record<string, any> = Object.fromEntries(given.map((k) => [k, args[k]]));
  if (tool.idempotent) { decl.push('$idempotencyKey: String!'); use.push('idempotencyKey: $idempotencyKey'); variables.idempotencyKey = randomUUID(); }
  const query = `${tool.kind} Tool${decl.length ? `(${decl.join(', ')})` : ''} { ${tool.operation}${use.length ? `(${use.join(', ')})` : ''} }`;
  const response = await selfFetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...auth }, body: JSON.stringify({ query, variables }) });
  const result = await response.json();
  if (result.errors) return { error: result.errors.map((e: any) => e.message).join('; ') };
  return result.data[tool.operation];
}
