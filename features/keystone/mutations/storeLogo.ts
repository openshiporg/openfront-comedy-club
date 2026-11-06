import { DEFAULT_STORE_LOGO_COLOR, DEFAULT_STORE_LOGO_ICON } from '../../platform/store-settings/lib/store-logo';

export const storeLogoTypeDefs = `
  type StoreLogo { logoIcon: String! logoColor: String! }
  extend type Query { storeLogo: StoreLogo! }
`;

// The storefront's mark: the club settings record's logo, or this vertical's registry default before setup.
export async function storeLogo(_root: unknown, _args: unknown, context: any) {
  const row = await context.prisma.venueSettings.findFirst({ select: { logoIcon: true, logoColor: true } });
  return { logoIcon: row?.logoIcon || DEFAULT_STORE_LOGO_ICON, logoColor: row?.logoColor || DEFAULT_STORE_LOGO_COLOR };
}
