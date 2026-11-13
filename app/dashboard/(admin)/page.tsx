import { redirect } from "next/navigation";
import { getAdminMetaAction } from "@/features/dashboard/actions/getAdminMetaAction";
import { getAuthenticatedUser } from "@/features/dashboard/actions/auth";
import { platformNavItems } from "@/features/platform/lib/navigation";
import { canUsePlatformPage, canUseDashboardNav } from "@/features/dashboard/lib/sidebarAccess";

export const dynamic = "force-dynamic";

/** Sign-in landing: the first platform page this role can open, else its first visible list, else the no-access page. */
export default async function Page() {
  const [meta, me] = await Promise.all([getAdminMetaAction(), getAuthenticatedUser()]);
  const lists: { path: string; isHidden?: boolean | null }[] = meta.success ? meta.data?.lists ?? [] : [];
  const viewer = me.success ? (me.data as { authenticatedItem?: Parameters<typeof canUsePlatformPage>[2] } | undefined)?.authenticatedItem : null;
  if (!canUseDashboardNav(viewer)) redirect("/dashboard/no-access");
  for (const item of platformNavItems) {
    const slug = item.href.split("/platform/")[1]?.split(/[/?#]/)[0];
    if (slug && canUsePlatformPage(slug, lists, viewer)) redirect(`/dashboard${item.href}`);
  }
  const first = lists.find((list) => !list.isHidden);
  redirect(first ? `/dashboard/${first.path}` : "/dashboard/no-access");
}
