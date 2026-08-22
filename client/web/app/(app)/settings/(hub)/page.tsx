import { redirect } from 'next/navigation';

/**
 * `/settings` — a redirect, and deliberately not a page.
 *
 * The route was unclaimed until the card hub briefly landed here, and now that
 * the thirteen screens are each their own sidebar entry again there is nothing
 * left for this URL to show: a page whose only content is "pick something from
 * the menu" is a page that exists to say it has none.
 *
 * A redirect rather than deleting the route, because `/settings` has been a
 * real, linkable address — bookmarks, the sidebar's old collapsed row, anything
 * a brain has written down — and a 404 is a worse answer than a sensible
 * landing. Profile is that landing: it is the first entry in the group and the
 * one screen every owner has a reason to open.
 */
export default function SettingsIndexPage() {
  redirect('/settings/profile');
}
