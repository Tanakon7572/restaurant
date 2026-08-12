/**
 * The guest scope.
 *
 * `/q` renders from four different return paths (loading, dead link, order
 * tracking, ordering), so the scope class lives here rather than on each of
 * them — a fifth path added later inherits it for free.
 *
 * `.cust` re-declares a handful of design tokens for someone browsing on
 * their own phone instead of working a rush. See DESIGN.md.
 */
export default function GuestLayout({ children }: { children: React.ReactNode }) {
  return <div className="cust">{children}</div>
}
