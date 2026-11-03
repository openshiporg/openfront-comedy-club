import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import redirectToInit from "./redirectToInit";
import * as tickets from "./tickets";
import * as ops from "./operators";
import * as checkout from "./checkout";
import * as night from "./night";

const graphql = String.raw;

// Every resolver validates proof or permission itself and runs money/inventory work
// under advisory locks in a transaction. Raw lists are not the storefront API.
const op = (fn: any) => (root: any, args: any, context: any) => fn(root, args, context);

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        showsOnSale: JSON
        showAvailability(showId: ID!): JSON
        lookupTicketOrder(email: String!, orderNumber: String!): JSON
      }
      input CustomerInput { name: String!, email: String!, phone: String }
      input SlotOrderInput { id: ID!, position: Int!, setMinutes: Int! }
      type Mutation {
        expireHolds(showId: ID): JSON
        createTicketHold(showId: ID!, tierId: ID!, quantity: Int!, tableIds: [ID!], idempotencyKey: String!): JSON
        applyPromoToHold(holdKey: String!, cartToken: String!, code: String!, idempotencyKey: String!): JSON
        startTicketCheckout(holdKey: String!, cartToken: String!, customer: CustomerInput!, ageAttested: Boolean, seatingRequest: String, occasion: String, idempotencyKey: String!): JSON
        completeTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        abandonTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        cancelMyTicketOrder(orderNumber: String!, email: String!, idempotencyKey: String!): JSON
        openMicSignup(showId: ID!, name: String!, email: String!, comedianId: ID, idempotencyKey: String!): JSON

        generateShowsFromTemplate(templateId: ID!, from: String, idempotencyKey: String!): JSON
        publishShow(showId: ID!, nextStatus: String, idempotencyKey: String!): JSON
        pauseSales(showId: ID!, idempotencyKey: String!): JSON
        cancelShow(showId: ID!, reason: String!, idempotencyKey: String!): JSON
        setLineup(showId: ID!, slots: [SlotOrderInput!]!, idempotencyKey: String!): JSON
        offerSlot(showId: ID!, comedianId: ID!, role: String!, position: Int, setMinutes: Int, feeCents: Int, idempotencyKey: String!): JSON
        confirmSlot(slotId: ID!, idempotencyKey: String!): JSON
        issueComp(showId: ID!, tierId: ID!, quantity: Int!, recipientName: String!, recipientEmail: String, reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        checkInTicket(tokenOrCode: String!, showId: ID!, method: String, idempotencyKey: String!): JSON
        seatParty(orderId: ID!, tableIds: [ID!]!, showId: ID!, serverId: ID, idempotencyKey: String!): JSON
        openCheck(seatingAssignmentId: ID!, idempotencyKey: String!): JSON
        addCheckItem(checkId: ID!, menuItemId: ID!, qty: Int!, idempotencyKey: String!): JSON
        voidCheckItem(itemId: ID!, checkId: ID!, reason: String!, approvalId: ID!, idempotencyKey: String!): JSON
        closeCheck(checkId: ID!, tipCents: Int, waive: Boolean, reason: String, approvalId: ID, idempotencyKey: String!): JSON
        runOpenMicLottery(showId: ID!, idempotencyKey: String!): JSON
        closeShow(showId: ID!, idempotencyKey: String!): JSON
        refundTicketOrder(orderId: ID!, amountCents: Int, ticketIds: [ID!], reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        requestApproval(actionType: String!, targetId: String!, reason: String!, amount: Int): JSON
        approveRequest(approvalId: ID!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        showsOnSale: op(tickets.showsOnSale),
        showAvailability: op(tickets.showAvailability),
        lookupTicketOrder: op(tickets.lookupTicketOrder),
      },
      Mutation: {
        expireHolds: op(tickets.expireHolds),
        createTicketHold: op(tickets.createTicketHold),
        applyPromoToHold: op(tickets.applyPromoToHold),
        startTicketCheckout: op(checkout.startTicketCheckout),
        completeTicketCheckout: op(checkout.completeTicketCheckout),
        abandonTicketCheckout: op(checkout.abandonTicketCheckout),
        cancelMyTicketOrder: op(checkout.cancelMyTicketOrder),
        openMicSignup: op(tickets.openMicSignup),
        generateShowsFromTemplate: op(night.generateShowsFromTemplate),
        publishShow: op(ops.publishShow),
        pauseSales: op(ops.pauseSales),
        cancelShow: op(night.cancelShow),
        setLineup: op(ops.setLineup),
        offerSlot: op(ops.offerSlot),
        confirmSlot: op(ops.confirmSlot),
        issueComp: op(night.issueComp),
        checkInTicket: op(ops.checkInTicket),
        seatParty: op(ops.seatParty),
        openCheck: op(ops.openCheck),
        addCheckItem: op(ops.addCheckItem),
        voidCheckItem: op(night.voidCheckItem),
        closeCheck: op(night.closeCheck),
        runOpenMicLottery: op(ops.runOpenMicLottery),
        closeShow: op(night.closeShow),
        refundTicketOrder: op(checkout.refundTicketOrder),
        requestApproval: op(night.requestApproval),
        approveRequest: op(night.approveRequest),
      },
    },
  });
}
