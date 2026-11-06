import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { DEFAULT_STORE_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON } from '@/features/platform/store-settings/lib/store-logo';

// The store mark as E-commerce's storefront header renders it (modules/layout/components/logo).
export async function StoreLogoMark() {
  const r = await keystoneClient<{ storeLogo: { logoIcon: string; logoColor: string } }>('{ storeLogo { logoIcon logoColor } }');
  const logoSvg = (r.success && r.data.storeLogo?.logoIcon) || DEFAULT_STORE_LOGO_ICON;
  const logoColor = (r.success && r.data.storeLogo?.logoColor) || DEFAULT_STORE_LOGO_COLOR;
  return (
    <div
      dangerouslySetInnerHTML={{ __html: logoSvg }}
      style={{ filter: `hue-rotate(${logoColor}deg)` }}
      className="size-4 sm:size-5 [&>svg]:block [&>svg]:h-full [&>svg]:w-full"
      data-testid="store-logo-mark"
    />
  );
}
