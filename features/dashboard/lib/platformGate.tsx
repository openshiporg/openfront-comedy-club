import { notFound } from 'next/navigation'
import type { ComponentType } from 'react'
import { getAdminMetaAction } from '@/features/dashboard/actions/getAdminMetaAction'
import { getAuthenticatedUser } from '@/features/dashboard/actions/auth'
import { canUsePlatformPage } from './sidebarAccess'

/** 404s a platform page the role cannot use (same rule as the sidebar). */
export function gatePlatformPage<P extends object>(slug: string, Page: ComponentType<P>) {
  return async function GatedPlatformPage(props: P) {
    const [meta, me] = await Promise.all([getAdminMetaAction(), getAuthenticatedUser()])
    const lists: { path: string; isHidden?: boolean | null }[] = meta.success ? meta.data?.lists ?? [] : []
    const viewer = me.success ? (me.data as { authenticatedItem?: Parameters<typeof canUsePlatformPage>[2] } | undefined)?.authenticatedItem : null
    if (!canUsePlatformPage(slug, lists, viewer)) notFound()
    return <Page {...props} />
  }
}
