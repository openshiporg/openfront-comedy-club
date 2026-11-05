'use client';

import * as React from 'react';
import QRCode from 'qrcode';

/** A scannable code for one ticket. It carries only the opaque scan token, which the door accepts like a typed ticket code. */
export function TicketQr({ token, label }: { token: string; label: string }) {
  const [svg, setSvg] = React.useState('');
  React.useEffect(() => {
    let live = true;
    if (!/^[0-9a-f]{64}$/i.test(token)) { setSvg(''); return; }
    QRCode.toString(token, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => { if (live) setSvg(s); })
      .catch(() => { if (live) setSvg(''); });
    return () => { live = false; };
  }, [token]);
  if (!svg) return null;
  // the SVG is produced locally by the encoder from a validated hex token, never from user-supplied markup
  return <div role="img" aria-label={label} data-testid="ticket-qr" className="h-44 w-44 shrink-0 bg-white [&>svg]:h-full [&>svg]:w-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}
