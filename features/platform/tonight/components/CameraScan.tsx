'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';

/**
 * Reads ticket QR codes with the device camera through the browser's own BarcodeDetector, so no decoder is shipped.
 * Where the browser has none (for example Safari), the button is not shown: a handheld scanner or typing the code still works.
 * The same code is ignored for a few seconds so one ticket held in view is checked in once.
 */
export function CameraScan({ onCode }: { onCode: (code: string) => void }) {
  const [supported, setSupported] = React.useState(false);
  const [on, setOn] = React.useState(false);
  const [error, setError] = React.useState('');
  const video = React.useRef<HTMLVideoElement>(null);
  const handler = React.useRef(onCode); handler.current = onCode;
  React.useEffect(() => { setSupported(typeof window !== 'undefined' && 'BarcodeDetector' in window && !!navigator.mediaDevices?.getUserMedia); }, []);
  React.useEffect(() => {
    if (!on) return;
    let stream: MediaStream | null = null; let timer: ReturnType<typeof setTimeout> | null = null; let stopped = false;
    const recent = new Map<string, number>();
    (async () => {
      try {
        const Detector = (window as any).BarcodeDetector;
        const detector = new Detector({ formats: ['qr_code'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped || !video.current) return;
        video.current.srcObject = stream; await video.current.play();
        const tick = async () => {
          if (stopped || !video.current) return;
          try {
            for (const c of await detector.detect(video.current)) {
              const v = String(c.rawValue || '').trim(); const now = Date.now();
              if (!v || (recent.get(v) || 0) > now) continue;
              recent.set(v, now + 4000); handler.current(v);
            }
          } catch { /* a frame that cannot be read is skipped */ }
          timer = setTimeout(tick, 250);
        };
        void tick();
      } catch (e: any) { setError(e?.name === 'NotAllowedError' ? 'Camera access was refused' : 'The camera could not be started'); setOn(false); }
    })();
    return () => { stopped = true; if (timer) clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [on]);
  if (!supported) return null;
  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" size="sm" onClick={() => { setError(''); setOn((v) => !v); }}>{on ? 'Stop camera' : 'Scan with camera'}</Button>
      {on ? <video ref={video} muted playsInline aria-label="Camera" className="aspect-square w-full max-w-xs rounded-md bg-black object-cover" /> : null}
      {error ? <p role="alert" className="text-sm text-red-600">{error}</p> : null}
    </div>
  );
}
