'use client';

import * as React from 'react';
import { pillClass } from '../../components/ActionButton';

/** Copies a party's waitlist offer link so staff can send it. */
export function CopyLink({ href }: { href: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <button type="button" className={pillClass} onClick={() => navigator.clipboard.writeText(window.location.origin + href).then(() => setCopied(true))}>
      {copied ? 'Link copied' : 'Copy offer link'}
    </button>
  );
}
