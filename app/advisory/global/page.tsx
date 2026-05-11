import { redirect } from 'next/navigation'

export default function GlobalCcaIndexPage() {
  // The four-screen hub lives at /advisory/global/{crops,packages,
  // timelines,practices}. Land newcomers on Crops — the natural
  // top-of-funnel entry — and let them drill down from there.
  redirect('/advisory/global/crops')
}
