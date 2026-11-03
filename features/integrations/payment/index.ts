export const paymentProviderAdapters = {
  stripe: () => import("./stripe"),
  manual: () => import("./manual"),
};
