import { gqlCall } from '@/features/storefront/lib/data';
import { Logo } from './Logo';

/** The club's name and mark (Settings > Store) for the signed-out screens. */
export async function ClubLogo() {
  const r = await gqlCall<{ storeLogo: { name: string; logoIcon: string; logoColor: string } }>('{ storeLogo { name logoIcon logoColor } }');
  const s = r.ok ? r.data.storeLogo : null;
  return <Logo name={s?.name} mark={s?.logoIcon ? { svg: s.logoIcon, hue: s.logoColor || '0' } : null} />;
}
