'use client';

import { ActionButton } from '../../components/ActionButton';

export function CloseRun({ runId }: { runId: string }) {
  return <ActionButton op="closeRun" vars={{ runId }} paths={['/dashboard/platform/payouts']} confirm="Close this run? This creates the headliner's run-fee payout once.">Close run</ActionButton>;
}
