import Link from 'next/link';
import { q } from '../../lib/server';
import { money } from '../../lib/format';
import { Page, Section, Row, Empty, Meta } from '../../components/ui';

export default async function SettingsPage() {
  const [{ venues }, { venueSettingsItems }] = await Promise.all([
    q<any>(`{ venues(take: 1) { id name timezone address defaultAgeRestriction drinkMinimumItems drinkMinimumCentsFloor serviceFeeBps taxBps policies } }`),
    q<any>(`{ venueSettingsItems(take: 1) { id refundWindowHours holdMinutes approvalThresholdCents compApprovalQuantity } }`),
  ]);
  const v = venues[0]; const s = venueSettingsItems[0];
  if (!v) return <Page title="Settings"><Empty>No venue yet. Run club setup from the sidebar.</Empty></Page>;
  const rows: [string, string][] = [
    ['Name', v.name], ['Timezone', v.timezone], ['Address', v.address], ['Age at the door', v.defaultAgeRestriction === 'all' ? 'All ages' : `${v.defaultAgeRestriction}+`],
    ['Drink minimum', `${v.drinkMinimumItems} items per guest`], ['Service fee', `${v.serviceFeeBps / 100}%`], ['Tax', `${v.taxBps / 100}%`],
  ];
  return (
    <Page title="Settings">
      <Section title="Venue" aside={<Link className="text-sm underline underline-offset-4" href={`/dashboard/venues/${v.id}`}>Edit</Link>}>
        {rows.map(([k, val]) => <Row key={k}><span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{k}</span><span className="min-w-0 break-words">{val}</span></Row>)}
        <p className="break-words text-sm text-muted-foreground">{v.policies}</p>
      </Section>
      {s ? (
        <Section title="Sales and approvals" aside={<Link className="text-sm underline underline-offset-4" href={`/dashboard/venue-settings-items/${s.id}`}>Edit</Link>}>
          <Row><span>Self-cancel window</span><span>{s.refundWindowHours} hours</span></Row>
          <Row><span>Hold time</span><span>{s.holdMinutes} minutes</span></Row>
          <Row><span>Refund approval above</span><span>{money(s.approvalThresholdCents)}</span></Row>
          <Row><span>Comp approval above</span><span>{s.compApprovalQuantity} tickets</span></Row>
        </Section>
      ) : <Meta>Sales settings are created by club setup.</Meta>}
    </Page>
  );
}
