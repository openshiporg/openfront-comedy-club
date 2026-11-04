import { mergeSchemas } from "@graphql-tools/schema";
import type { GraphQLSchema } from 'graphql';
import { GraphQLError } from "graphql";
import redirectToInit from "./redirectToInit";
import * as tickets from "./tickets";
import * as ops from "./operators";
import * as checkout from "./checkout";
import * as night from "./night";
import * as payouts from "./payouts";
import * as openMic from "./openMic";
import * as waitlist from "./waitlist";
import * as reports from "./reports";
import * as reminders from "./reminders";
import * as slotLink from "./slotLink";
import * as transfer from "./transfer";
import updateActiveUser from "./updateActiveUser";
import * as seed from "./seed";
import { matchingManagerApproval } from '../utils/managerApproval';

const graphql = String.raw;

// Every resolver validates proof or permission itself and runs money/inventory work
// under advisory locks in a transaction. Raw lists are not the storefront API.
const UNSAFE = /prisma|invocation|\bat\s+\S+\s*\(|node_modules|postgres(ql)?:\/\/|\bSQL\b|ECONN|query engine|\.ts:\d+|\.js:\d+/i;
// Business-rule messages reach the caller; database and driver detail never does.
const op = (fn: any) => async (root: any, args: any, context: any) => {
  try { return await fn(root, args, context); }
  catch (error: any) {
    if (error instanceof GraphQLError) throw error;
    const message = typeof error?.message === 'string' ? error.message : '';
    console.error('Operation failed:', message.slice(0, 300));
    const safe = message && message.length <= 300 && !UNSAFE.test(message) && !error?.code;
    throw new GraphQLError(safe ? message : 'Unable to complete the request. Please try again.', { extensions: { code: 'KS_USER_INPUT_ERROR' } });
  }
};

export function extendGraphqlSchema(baseSchema: GraphQLSchema) {
  return mergeSchemas({
    schemas: [baseSchema],
    typeDefs: graphql`
      scalar JSON
      type Query {
        redirectToInit: Boolean
        showsOnSale: JSON
        showAvailability(showId: ID!): JSON
        waitlistOffer(holdKey: String!, cartToken: String!): JSON
        slotInvite(slotId: ID!, token: String!): JSON
        holderTicket(ticketCode: String!, token: String!): JSON
        lookupTicketOrder(email: String!, orderNumber: String!): JSON
        ticketOrderConfirmation(orderNumber: String!, orderSecret: String!): JSON
        openMicShows: JSON
        showReport(from: String!, to: String!): JSON
        matchingManagerApproval(actionType: String!, targetId: String!, reason: String!, amount: Int): JSON
      }
      input UserUpdateProfileInput { name: String, email: String, password: String, onboardingStatus: String, notificationPreference: Boolean }
      input CustomerInput { name: String!, email: String!, phone: String }
      input HoldLineInput { tierId: ID!, quantity: Int!, tableIds: [ID!] }
      input SlotOrderInput { id: ID!, position: Int!, setMinutes: Int! }
      type Mutation {
        expireHolds(showId: ID): JSON
        createTicketHold(showId: ID!, tierId: ID, quantity: Int, tableIds: [ID!], lines: [HoldLineInput!], idempotencyKey: String!): JSON
        applyPromoToHold(holdKey: String!, cartToken: String!, code: String!, idempotencyKey: String!): JSON
        startTicketCheckout(holdKey: String!, cartToken: String!, customer: CustomerInput!, ageAttested: Boolean, seatingRequest: String, occasion: String, idempotencyKey: String!): JSON
        completeTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        abandonTicketCheckout(orderNumber: String!, orderSecret: String!): JSON
        cancelMyTicketOrder(orderNumber: String!, email: String!, idempotencyKey: String!): JSON
        transferTicket(orderNumber: String!, orderSecret: String!, ticketCode: String!, name: String!, email: String!, idempotencyKey: String!): JSON
        issueSlotLink(slotId: ID!, idempotencyKey: String!): JSON
        respondToSlot(slotId: ID!, token: String!, response: String!, idempotencyKey: String!): JSON
        joinWaitlist(showId: ID!, name: String!, email: String!, partySize: Int!, idempotencyKey: String!): JSON
        offerWaitlist(showId: ID!, idempotencyKey: String!): JSON
        removeWaitlistEntry(entryId: ID!, reason: String, idempotencyKey: String!): JSON
        openMicSignup(showId: ID!, name: String!, email: String!, comedianId: ID, idempotencyKey: String!): JSON

        generateShowsFromTemplate(templateId: ID!, from: String, idempotencyKey: String!): JSON
        publishShow(showId: ID!, nextStatus: String, idempotencyKey: String!): JSON
        pauseSales(showId: ID!, idempotencyKey: String!): JSON
        resumeSales(showId: ID!, idempotencyKey: String!): JSON
        cancelShow(showId: ID!, reason: String!, idempotencyKey: String!): JSON
        setLineup(showId: ID!, slots: [SlotOrderInput!]!, idempotencyKey: String!): JSON
        offerSlot(showId: ID!, comedianId: ID!, role: String!, position: Int, setMinutes: Int, feeCents: Int, idempotencyKey: String!): JSON
        confirmSlot(slotId: ID!, idempotencyKey: String!): JSON
        issueComp(showId: ID!, tierId: ID!, quantity: Int!, recipientName: String!, recipientEmail: String, reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        checkInTicket(tokenOrCode: String!, showId: ID!, method: String, scannedAt: String, idempotencyKey: String!): JSON
        seatParty(orderId: ID!, tableIds: [ID!]!, showId: ID!, serverId: ID, idempotencyKey: String!): JSON
        openCheck(seatingAssignmentId: ID!, idempotencyKey: String!): JSON
        addCheckItem(checkId: ID!, menuItemId: ID!, qty: Int!, idempotencyKey: String!): JSON
        voidCheckItem(itemId: ID!, checkId: ID!, reason: String!, approvalId: ID!, idempotencyKey: String!): JSON
        closeCheck(checkId: ID!, tipCents: Int, waive: Boolean, reason: String, approvalId: ID, idempotencyKey: String!): JSON
        runOpenMicLottery(showId: ID!, idempotencyKey: String!): JSON
        addBringerSignup(showId: ID!, name: String!, email: String!, guestsRequired: Int!, idempotencyKey: String!): JSON
        recordBringerArrival(signupId: ID!, guests: Int!, idempotencyKey: String!): JSON
        updatePromoLimit(promoId: ID!, perOrderLimit: Int!, idempotencyKey: String!): JSON
        undoCheckIn(ticketId: ID!, showId: ID!, reason: String!, idempotencyKey: String!): JSON
        setSignupStatus(signupId: ID!, status: String!, idempotencyKey: String!): JSON
        updateSlotStatus(slotId: ID!, status: String!, idempotencyKey: String!): JSON
        setSalesWindow(tierId: ID!, salesStartAt: String, salesEndAt: String, idempotencyKey: String!): JSON
        exportShowReport(from: String!, to: String!, idempotencyKey: String!): JSON
        closeShow(showId: ID!, idempotencyKey: String!): JSON
        closeRun(runId: ID!, idempotencyKey: String!): JSON
        approvePayout(payoutId: ID!, idempotencyKey: String!): JSON
        recordPayoutPaid(payoutId: ID!, method: String!, reference: String!, idempotencyKey: String!): JSON
        refundTicketOrder(orderId: ID!, amountCents: Int, ticketIds: [ID!], reason: String!, approvalId: ID, idempotencyKey: String!): JSON
        requestApproval(actionType: String!, targetId: String!, reason: String!, amount: Int): JSON
        approveRequest(approvalId: ID!): JSON
        sweepPendingCheckouts(secret: String!): JSON
        sweepShowReminders(secret: String!): JSON
        scheduleShowReminders(showId: ID!, idempotencyKey: String!): JSON
        updateActiveUser(data: UserUpdateProfileInput!): User
        ensureClubOnboardingRecord(entity: String!, data: JSON!): JSON
        seedClubOperations(template: String!): JSON
      }
    `,
    resolvers: {
      Query: {
        redirectToInit,
        showsOnSale: op(tickets.showsOnSale),
        showAvailability: op(tickets.showAvailability),
        waitlistOffer: op(waitlist.waitlistOffer),
        slotInvite: op(slotLink.slotInvite),
        holderTicket: op(transfer.holderTicket),
        lookupTicketOrder: op(tickets.lookupTicketOrder),
        ticketOrderConfirmation: op(checkout.ticketOrderConfirmation),
        openMicShows: op(tickets.openMicShows),
        matchingManagerApproval: op(matchingManagerApproval),
        showReport: op(reports.showReport),
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
        joinWaitlist: op(waitlist.joinWaitlist),
        transferTicket: op(transfer.transferTicket),
        issueSlotLink: op(slotLink.issueSlotLink),
        respondToSlot: op(slotLink.respondToSlot),
        offerWaitlist: op(waitlist.offerWaitlist),
        removeWaitlistEntry: op(waitlist.removeWaitlistEntry),
        generateShowsFromTemplate: op(night.generateShowsFromTemplate),
        publishShow: op(ops.publishShow),
        pauseSales: op(ops.pauseSales),
        resumeSales: op(ops.resumeSales),
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
        setSalesWindow: op(ops.setSalesWindow),
        updateSlotStatus: op(ops.updateSlotStatus),
        undoCheckIn: op(ops.undoCheckIn),
        updatePromoLimit: op(ops.updatePromoLimit),
        addBringerSignup: op(openMic.addBringerSignup),
        recordBringerArrival: op(openMic.recordBringerArrival),
        setSignupStatus: op(openMic.setSignupStatus),
        closeShow: op(night.closeShow),
        exportShowReport: op(reports.exportShowReport),
        closeRun: op(night.closeRun),
        approvePayout: op(payouts.approvePayout),
        recordPayoutPaid: op(payouts.recordPayoutPaid),
        refundTicketOrder: op(checkout.refundTicketOrder),
        requestApproval: op(night.requestApproval),
        approveRequest: op(night.approveRequest),
        sweepPendingCheckouts: op(checkout.sweepPendingCheckouts),
        sweepShowReminders: op(reminders.sweepShowReminders),
        scheduleShowReminders: op(reminders.scheduleShowReminders),
        updateActiveUser,
        ensureClubOnboardingRecord: op(seed.ensureClubOnboardingRecord),
        seedClubOperations: op(seed.seedClubOperations),
      },
    },
  });
}
