// A ticket buyer's own account on the storefront: sign up and My tickets (orders bought while signed in).
// Guest orders are not attached by email: the address is never verified, and My tickets carries the ticket QR links.
// Buyers are plain users with no role, so the staff dashboard stays closed to them.
import { ticketToken } from './checkout';

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const OWN = ['paid', 'partially_refunded', 'refunded', 'cancelled', 'comp'];

function signedIn(context: any): string {
  const id = context.session?.itemId;
  if (!id) throw new Error('Sign in to see your tickets');
  return String(id);
}

export async function registerTicketBuyer(_: any, a: any, context: any) {
  const name = String(a.name || '').trim();
  const email = String(a.email || '').trim().toLowerCase();
  const password = String(a.password || '');
  if (!name) throw new Error('Enter your name');
  if (!EMAIL.test(email)) throw new Error('Enter a valid email address');
  if (password.length < 8) throw new Error('Use at least 8 characters for your password');
  const sudo = context.sudo();
  const taken = await sudo.prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } }, select: { id: true } });
  if (taken) throw new Error('An account with this email already exists. Sign in instead.');
  // through the list API so the password is hashed by the field; no role is set
  const user = await sudo.db.User.createOne({ data: { name, email, password } });
  return { id: user.id, email };
}

/** The signed-in buyer's orders, newest show first. Ticket links only for tickets still theirs (not passed on to someone else). */
export async function myTicketOrders(_: any, _a: any, context: any) {
  const id = signedIn(context);
  const user = await context.prisma.user.findUnique({ where: { id }, select: { name: true, email: true } });
  const orders = await context.prisma.ticketOrder.findMany({
    where: { customerId: id, status: { in: OWN } },
    orderBy: { show: { startsAt: 'desc' } },
    take: 100,
    select: {
      orderNumber: true, status: true, totalCents: true, partySize: true,
      show: { select: { id: true, title: true, startsAt: true, doorsAt: true, room: { select: { name: true } } } },
      tickets: { orderBy: { createdAt: 'asc' }, select: { ticketCode: true, status: true, transferredFromCode: true, holderName: true } },
    },
  });
  return {
    name: user?.name || '', email: user?.email || '',
    orders: orders.map((o: any) => {
      const passedOn = new Set(o.tickets.filter((t: any) => t.transferredFromCode).map((t: any) => t.transferredFromCode));
      const mine = o.tickets.filter((t: any) => !t.transferredFromCode);
      return {
        orderNumber: o.orderNumber, status: o.status, totalCents: o.totalCents, partySize: o.partySize, show: o.show,
        tickets: mine.map((t: any) => {
          const live = ['valid', 'checked_in'].includes(t.status) && !passedOn.has(t.ticketCode);
          return { ticketCode: t.ticketCode, status: passedOn.has(t.ticketCode) ? 'transferred' : t.status, token: live ? ticketToken(t.ticketCode) : null };
        }),
      };
    }),
  };
}
