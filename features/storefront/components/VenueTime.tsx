'use client';
import * as React from 'react';
import { DEFAULT_TIME_ZONE, showTime, type TimeStyle } from '../lib/format';

const Zone = React.createContext(DEFAULT_TIME_ZONE);

/** The storefront layout reads the venue's time zone once and hands it to every client component. */
export function VenueTimeProvider({ timeZone, children }: { timeZone: string; children: React.ReactNode }) {
  return <Zone.Provider value={timeZone}>{children}</Zone.Provider>;
}

/** showTime bound to the venue's time zone. */
export function useShowTime() {
  const timeZone = React.useContext(Zone);
  return React.useCallback((iso: string, style: TimeStyle = 'full') => showTime(iso, style, timeZone), [timeZone]);
}
