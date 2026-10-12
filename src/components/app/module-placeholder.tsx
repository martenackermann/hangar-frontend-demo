/** PLACEHOLDER page body for module routes until their slice builds the real screens. */
export function ModulePlaceholder({
  title,
  owner,
  search,
}: {
  title: string
  owner: string
  search?: object
}) {
  return (
    <section className="p-8">
      <h1 className="text-xl font-semibold">{title}</h1>
      <p className="mt-2 text-sm text-slate-600">Screens for this module are built by {owner}.</p>
      {search && (
        <pre className="mt-4 rounded bg-slate-50 p-3 text-xs" data-testid="search-state">
          {JSON.stringify(search, null, 2)}
        </pre>
      )}
    </section>
  )
}
