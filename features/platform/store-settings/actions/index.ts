'use server';

import { keystoneClient } from '@/features/dashboard/lib/keystoneClient';
import { revalidatePath } from 'next/cache';
import { normalizeStoreLogoColor } from '../lib/store-logo';
import { sanitizeStoreLogoSvg } from '@/features/keystone/utils/storeLogo';

// The logo lives on the club settings record (venueSettingsItems).
export async function getStoreSettings() {
  const query = `
    query GetStoreLogo {
      venueSettingsItems(take: 1) {
        id
        logoIcon
        logoColor
      }
    }
  `;

  const response = await keystoneClient(query);

  if (!response.success) {
    return { success: false, error: response.error };
  }

  return { success: true, data: response.data?.venueSettingsItems?.[0] || null };
}

export async function updateStoreSettings(storeId: string, data: {
  logoIcon?: string;
  logoColor?: string;
}) {
  // Sanitize SVG before saving to prevent XSS attacks
  const sanitizedData = {
    ...data,
    logoIcon: data.logoIcon ? sanitizeStoreLogoSvg(data.logoIcon) : undefined,
    logoColor:
      data.logoColor === undefined ? undefined : normalizeStoreLogoColor(data.logoColor),
  };

  // If SVG sanitization failed (returned empty string), reject the update
  if (data.logoIcon && !sanitizedData.logoIcon) {
    return { success: false, error: 'Invalid SVG format' };
  }

  const mutation = `
    mutation UpdateStoreLogo($id: ID!, $data: VenueSettingsUpdateInput!) {
      updateVenueSettings(where: { id: $id }, data: $data) {
        id
        logoIcon
        logoColor
      }
    }
  `;

  const response = await keystoneClient(mutation, { id: storeId, data: sanitizedData });

  if (!response.success) {
    return { success: false, error: response.error };
  }

  revalidatePath('/', 'layout');

  return { success: true, data: response.data?.updateVenueSettings };
}
