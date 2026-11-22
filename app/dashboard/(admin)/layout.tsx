export const dynamic = 'force-dynamic';

import { DashboardLayout } from '@/features/dashboard/components/DashboardLayout';
import { getAdminMetaAction, getAuthenticatedUser } from '@/features/dashboard/actions';
import { gqlCall } from '@/features/storefront/lib/data';

// One club name for every role: the venue name through the public storeLogo read.
// The same mark the storefront header shows (Settings > Store), so the club has one logo.
async function getAuthenticatedBrand() {
  const r = await gqlCall<{ storeLogo: { name: string; logoIcon: string; logoColor: string } }>('{ storeLogo { name logoIcon logoColor } }');
  return r.ok ? r.data.storeLogo ?? null : null;
}

export default async function ListLayout({ children }: { children: React.ReactNode }) {
  // Fetch adminMeta and user data server-side to avoid loading states
  const [adminMetaResponse, userResponse] = await Promise.all([
    getAdminMetaAction(),
    getAuthenticatedUser()
  ]);
  const logo = await getAuthenticatedBrand();
  
  const adminMeta = adminMetaResponse.success ? adminMetaResponse.data : null;
  const user = userResponse.success && userResponse.data?.authenticatedItem
    ? { ...userResponse.data.authenticatedItem, menuItemsCount: userResponse.data.showsCount ?? null, brandName: logo?.name ?? userResponse.data.venues?.[0]?.name ?? null, brandMark: logo?.logoIcon ? { svg: logo.logoIcon, hue: logo.logoColor || '0' } : null }
    : null;

  return (
    <DashboardLayout adminMeta={adminMeta} authenticatedItem={user}>
      {children}
    </DashboardLayout>
  );
}