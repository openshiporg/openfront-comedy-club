import { text } from "@keystone-6/core/fields";
import {
  DEFAULT_STORE_LOGO_COLOR,
  DEFAULT_STORE_LOGO_ICON,
  normalizeStoreLogoColor,
} from "../../platform/store-settings/lib/store-logo";
import { sanitizeStoreLogoSvg } from "../utils/storeLogo";

// The store logo fields from E-commerce's Store list (features/keystone/models/Store.ts), unchanged.
export const storeLogoFields = {
  logoIcon: text({
    defaultValue: DEFAULT_STORE_LOGO_ICON,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        if (value === undefined || value === null || value === '') return value;
        return typeof value === 'string' ? sanitizeStoreLogoSvg(value) : '';
      },
      validate: ({ inputData, resolvedData, fieldKey, addValidationError }) => {
        const submitted = inputData?.[fieldKey];
        if (typeof submitted === 'string' && submitted.trim() && !resolvedData?.[fieldKey]) {
          addValidationError('Logo must be a valid, safe SVG document');
        }
      },
    },
  }),
  logoColor: text({
    defaultValue: DEFAULT_STORE_LOGO_COLOR,
    hooks: {
      resolveInput: ({ resolvedData, fieldKey }) => {
        const value = resolvedData[fieldKey];
        return value === undefined ? value : normalizeStoreLogoColor(value);
      },
    },
  }),
};
