import { createTransport } from 'nodemailer';
import QRCode from 'qrcode';
import { emailButton, emailHeading, emailItems, emailLayout, emailMuted, emailParagraph, emailTotals, escapeHtml } from './email-layout';

/**
 * The buyer's tickets by email, sent once when the order turns paid (see verifyAndFinalize).
 * Each ticket carries its QR code as an inline PNG attachment (cid:), because Gmail and Outlook
 * drop inline SVG and data: images. The QR holds the same opaque scan token the door accepts.
 */
type Ticket = { ticketCode: string; token: string };
type Order = {
  orderNumber: string; email: string; name: string; currencyCode: string;
  totalCents: number; feesCents: number; taxCents: number; discountCents: number;
  lines: { tierName: string; quantity: number; lineTotalCents: number }[];
  show: { title: string; startsAt: Date | string; doorsAt: Date | string | null; room?: { name: string } | null };
  venue: { name: string; address?: string | null; timezone?: string | null; drinkMinimumItems?: number | null };
};

const money = (cents: number, currency = 'USD') => new Intl.NumberFormat('en-US', { style: 'currency', currency }).format((cents || 0) / 100);
const at = (d: Date | string, timeZone: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('en-US', { timeZone, ...opts }).format(new Date(d));

export function storefrontBase() {
  return (process.env.STOREFRONT_URL || process.env.SMTP_STORE_LINK || '').replace(/\/$/, '');
}

export async function ticketEmail(order: Order, tickets: Ticket[], base = storefrontBase()) {
  const tz = order.venue.timezone || 'America/Chicago';
  const day = at(order.show.startsAt, tz, { weekday: 'long', month: 'long', day: 'numeric' });
  const times = [order.show.doorsAt ? `Doors ${at(order.show.doorsAt, tz, { hour: 'numeric', minute: '2-digit' })}` : '', `Show ${at(order.show.startsAt, tz, { hour: 'numeric', minute: '2-digit' })}`].filter(Boolean).join(' · ');
  const attachments = await Promise.all(tickets.map(async (t, i) => ({
    filename: `ticket-${t.ticketCode}.png`,
    content: await QRCode.toBuffer(t.token, { type: 'png', margin: 2, width: 360, errorCorrectionLevel: 'M' }),
    cid: `qr${i}@tickets`,
    contentType: 'image/png',
  })));
  const ticketHtml = tickets.map((t, i) => `
<table role="presentation" width="100%" border="0" cellspacing="0" cellpadding="0" style="margin:0 0 16px;border:1px solid #e4e4e7;border-radius:8px;">
<tr><td align="center" style="padding:16px;background:#ffffff;border-radius:8px;">
<img src="cid:qr${i}@tickets" width="180" height="180" alt="QR code for ticket ${escapeHtml(t.ticketCode)}" style="display:block;width:180px;height:180px;border:0;">
<div style="margin-top:8px;font-family:ui-monospace,Menlo,monospace;font-size:14px;color:#18181b;">Ticket ${i + 1} of ${tickets.length} · ${escapeHtml(t.ticketCode)}</div>
${base ? `<div style="margin-top:6px;font-family:-apple-system,Helvetica,Arial,sans-serif;font-size:14px;"><a href="${escapeHtml(`${base}/tickets/${t.ticketCode}#${t.token}`)}" style="color:#18181b;">Open this ticket</a></div>` : ''}
</td></tr></table>`).join('');
  const minimum = order.venue.drinkMinimumItems ? ` A ${order.venue.drinkMinimumItems}-item minimum per guest applies at your table.` : '';
  const html = emailLayout({
    storeName: order.venue.name,
    preheader: `${order.show.title}, ${day}. Your tickets are inside.`,
    title: `Your tickets for ${order.show.title}`,
    body: `${emailParagraph(`${escapeHtml(day)} · ${escapeHtml(times)}<br>${escapeHtml([order.show.room?.name, order.venue.name, order.venue.address].filter(Boolean).join(' · '))}`)}
${emailMuted(`Show the QR code or the ticket code at the door.${escapeHtml(minimum)}`)}
${emailHeading('Tickets')}
${ticketHtml}
${emailHeading('Order ' + order.orderNumber)}
${emailItems(order.lines.map((l) => ({ title: l.tierName, quantity: l.quantity, amount: money(l.lineTotalCents, order.currencyCode) })))}
${emailTotals([
  ...(order.discountCents ? [{ label: 'Discount', value: `−${money(order.discountCents, order.currencyCode)}` }] : []),
  { label: 'Fees', value: money(order.feesCents, order.currencyCode) },
  { label: 'Tax', value: money(order.taxCents, order.currencyCode) },
  { label: 'Total paid', value: money(order.totalCents, order.currencyCode) },
])}
${base ? emailButton('Find my order', `${base}/lookup`) : ''}
${emailMuted('To cancel, use Find my order with this email address and the order number above.')}`,
  });
  return { subject: `Your tickets: ${order.show.title}, ${day}`, html, attachments };
}

export async function sendTicketEmail(order: Order, tickets: Ticket[]): Promise<{ sent: boolean; messageId?: string; error?: string }> {
  if (!order.email) return { sent: false, error: 'no_recipient' };
  if (!process.env.SMTP_HOST) return { sent: false, error: 'smtp_not_configured' };
  try {
    const transport = createTransport({ host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT || 587), auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } });
    const mail = await ticketEmail(order, tickets);
    const info = await transport.sendMail({ to: order.email, from: process.env.SMTP_FROM, ...mail });
    return { sent: true, messageId: typeof info?.messageId === 'string' ? info.messageId : undefined };
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 200) : 'send_failed';
    console.error('Ticket email failed:', message);
    return { sent: false, error: message };
  }
}
