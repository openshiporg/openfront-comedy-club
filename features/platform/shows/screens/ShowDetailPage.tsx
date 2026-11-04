import Link from 'next/link';
import { notFound } from 'next/navigation';
import { q, venueTimezone } from '../../lib/server';
import { money, when } from '../../lib/format';
import { Page, Section, Row, Empty, Stat, Status, Meta } from '../../components/ui';
import { ActionButton } from '../../components/ActionButton';
import { CheckPanel } from '../components/CheckPanel';
import { CompForm } from '../components/CompForm';
import { SalesWindowForm } from '../components/SalesWindowForm';
import { saleState } from '../../../keystone/lib/saleWindow';

export default async function ShowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tz = await venueTimezone();
  const { show } = await q<any>(
    `query($id: ID!) { show(where: { id: $id }) {
      id title startsAt doorsAt status capacity ageRestriction soldCount heldCount checkedInCount remaining isOpenMic publicNote
      room { name } template { title }
      tiers(orderBy: { priceCents: desc }) { id name priceCents feeCents capacity sold held status salesStartAt salesEndAt }
      lineup(orderBy: { position: asc }) { id role position setMinutes feeCents status comedian { stageName } }
      waitlist(where: { status: { in: [waiting, offered] } }, orderBy: { createdAt: asc }) { id name email partySize status offerExpiresAt }
      holds(where: { status: { equals: active } }) { id holdKey quantity expiresAt }
      orders(orderBy: { createdAt: desc }, take: 50) { id orderNumber name status totalCents partySize }
      assignments { id status tables { label } }
      checks { id status guestCount minimumItemsRequired minimumItemsMet seatingAssignment { id tables { label } } items { id name qty priceCents voided countsTowardMinimum } }
      settlement { status netCents }
    } }`, { id },
  );
  if (!show) notFound();
  const { menuItems } = await q<any>(`{ menuItems(where: { active: { equals: true } }, orderBy: { name: asc }, take: 100) { id name priceCents } }`);
  const { venueSettingsItems } = await q<any>(`{ venueSettingsItems(take: 1) { compApprovalQuantity } }`);
  const open = ['draft', 'on_sale', 'sold_out'].includes(show.status);
  return (
    <Page title={show.title} crumbs={[{ label: 'Shows', href: '/dashboard/platform/shows' }]}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <Status value={show.status} />
        <Meta>{when(show.startsAt, tz)} · {show.room?.name} · {show.ageRestriction === 'all' ? 'All ages' : `${show.ageRestriction}+`}{show.template ? ` · ${show.template.title}` : ''}</Meta>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat name="Sold" value={show.soldCount} /><Stat name="Held" value={show.heldCount} /><Stat name="Remaining" value={show.remaining} /><Stat name="Checked in" value={show.checkedInCount} />
      </div>
      <div className="flex flex-wrap gap-2">
        {show.status === 'draft' ? <ActionButton op="publishShow" vars={{ showId: show.id }}>Publish</ActionButton> : null}
        {['on_sale', 'sold_out'].includes(show.status) && show.tiers.some((t: any) => t.status === 'paused') ? <ActionButton op="resumeSales" vars={{ showId: show.id }}>Resume sales</ActionButton> : null}
        {['on_sale', 'sold_out'].includes(show.status) ? <ActionButton op="pauseSales" vars={{ showId: show.id }} confirm="Pause ticket sales for this show?">Pause sales</ActionButton> : null}
        {['doors_open', 'in_progress', 'completed'].includes(show.status) ? <ActionButton op="closeShow" vars={{ showId: show.id }} confirm="Close the night? This creates payouts and freezes the settlement.">Close night</ActionButton> : null}
        {!['cancelled', 'completed', 'settled'].includes(show.status) ? <ActionButton op="cancelShow" vars={{ showId: show.id, reason: 'Cancelled by venue' }} confirm="Cancel this show and refund every order?">Cancel show</ActionButton> : null}
        {show.isOpenMic ? <Link className="self-center text-sm underline underline-offset-4" href="/dashboard/platform/open-mic">Open mic list</Link> : null}
      </div>

      {show.waitlist.length || show.status === 'sold_out' ? (
        <Section title="Waitlist">
          {show.waitlist.length ? <div className="flex flex-wrap gap-2 pb-2"><ActionButton op="offerWaitlist" vars={{ showId: show.id }}>Offer open seats</ActionButton></div> : null}
          {show.waitlist.length ? show.waitlist.map((w: any, i: number) => (
            <Row key={w.id}>
              <span className="min-w-0 break-words"><span className="font-medium">{i + 1}. {w.name}</span> <Meta>party of {w.partySize} · {w.email}</Meta></span>
              <span className="inline-flex flex-wrap items-center gap-3">
                <Status value={w.status} />
                {w.status === 'offered' && w.offerExpiresAt ? <Meta>until {when(w.offerExpiresAt, tz, 'time')}</Meta> : null}
                <ActionButton op="removeWaitlistEntry" vars={{ entryId: w.id, reason: 'Removed by operator' }} confirm={`Remove ${w.name} from the waitlist?`}>Remove</ActionButton>
              </span>
            </Row>
          )) : <Empty>Nobody is waiting.</Empty>}
        </Section>
      ) : null}

      <Section title="Ticket tiers">
        {show.tiers.length ? show.tiers.map((t: any) => (
          <Row key={t.id}>
            <span className="min-w-0"><span className="font-medium">{t.name}</span> <Meta>{money(t.priceCents)} + {money(t.feeCents)} fee</Meta></span>
            <span className="inline-flex items-center gap-3"><Meta>{t.sold} sold · {t.held} held · {t.capacity} total</Meta><Status value={saleState(t) === 'scheduled' || saleState(t) === 'ended' ? saleState(t) : t.status} /></span>
            {t.salesStartAt || t.salesEndAt ? <span className="w-full text-xs text-muted-foreground">{t.salesStartAt ? `On sale ${when(t.salesStartAt, tz)}` : 'On sale now'}{t.salesEndAt ? ` · off sale ${when(t.salesEndAt, tz)}` : ''}</span> : null}
            {open ? <SalesWindowForm tierId={t.id} tz={tz} start={t.salesStartAt} end={t.salesEndAt} /> : null}
          </Row>
        )) : <Empty>No tiers.</Empty>}
      </Section>

      <Section title="Lineup">
        {show.lineup.length ? show.lineup.map((l: any) => (
          <Row key={l.id}>
            <span className="min-w-0"><span className="font-medium">{l.position}. {l.comedian?.stageName}</span> <Meta>{l.role.replace('_', ' ')} · {l.setMinutes} min · {money(l.feeCents)}</Meta></span>
            <span className="inline-flex flex-wrap items-center justify-end gap-2"><Status value={l.status} />{l.status === 'offered' ? <ActionButton op="confirmSlot" vars={{ slotId: l.id }}>Confirm</ActionButton> : null}{l.status === 'offered' ? <ActionButton op="updateSlotStatus" vars={{ slotId: l.id, status: 'declined' }}>Decline</ActionButton> : null}{['offered', 'confirmed'].includes(l.status) ? <ActionButton op="updateSlotStatus" vars={{ slotId: l.id, status: 'cancelled' }} confirm="Cancel this slot? The comedian will not be paid for it.">Cancel slot</ActionButton> : null}{l.status === 'confirmed' && ['doors_open', 'in_progress', 'completed'].includes(show.status) ? <ActionButton op="updateSlotStatus" vars={{ slotId: l.id, status: 'no_show' }} confirm="Mark as no-show? No fee will be paid.">No-show</ActionButton> : null}</span>
          </Row>
        )) : <Empty>No lineup yet.</Empty>}
      </Section>

      {show.holds.length ? <Section title="Active holds">{show.holds.map((h: any) => <Row key={h.id}><span className="font-mono text-xs">{h.holdKey}</span><Meta>{h.quantity} tickets · expires {when(h.expiresAt, tz, 'time')}</Meta></Row>)}</Section> : null}

      {!['draft', 'cancelled', 'completed', 'settled'].includes(show.status) ? <Section title="Issue comp"><CompForm showId={show.id} tiers={show.tiers} threshold={venueSettingsItems[0]?.compApprovalQuantity ?? 4} /></Section> : null}
      <Section title="Orders">
        {show.orders.length ? show.orders.map((o: any) => (
          <Row key={o.id} href={`/dashboard/platform/orders/${o.id}`}>
            <span className="min-w-0"><span className="font-mono text-xs">{o.orderNumber}</span> <span className="font-medium">{o.name}</span> <Meta>{o.partySize} guests</Meta></span>
            <span className="inline-flex items-center gap-3"><Meta>{money(o.totalCents)}</Meta><Status value={o.status} /></span>
          </Row>
        )) : <Empty>No orders.</Empty>}
      </Section>

      <Section title="Table service">{show.assignments.filter((a: any) => a.status === 'seated' && !show.checks.some((c: any) => c.seatingAssignment?.id === a.id)).map((a: any) => <Row key={a.id}><span>{a.tables.map((t: any) => t.label).join(', ')}</span><ActionButton op="openCheck" vars={{ seatingAssignmentId: a.id }}>Open check</ActionButton></Row>)}</Section>
      {show.checks.length ? (
        <Section title="Checks">
          <div className="space-y-3">
            {show.checks.map((c: any) => <CheckPanel key={c.id} menu={menuItems} check={{ id: c.id, status: c.status, guestCount: c.guestCount, minimumItemsRequired: c.minimumItemsRequired, minimumItemsMet: c.minimumItemsMet, items: c.items, seat: (c.seatingAssignment?.tables || []).map((t: any) => t.label).join(', ') || 'Table' }} />)}
          </div>
        </Section>
      ) : null}
      {show.settlement ? <Section title="Settlement"><Row><Status value={show.settlement.status} /><span className="font-mono">{money(show.settlement.netCents)} net</span></Row></Section> : null}
      {open ? null : null}
    </Page>
  );
}
