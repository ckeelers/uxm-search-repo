export default function Loading() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <div className="h-7 w-48 animate-pulse rounded bg-neutral-200" />
      <div className="mt-3 h-4 w-80 max-w-full animate-pulse rounded bg-neutral-100" />
      <div className="mt-6 space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-5 w-64 max-w-full animate-pulse rounded bg-neutral-200" />
            <div className="h-4 w-40 animate-pulse rounded bg-neutral-100" />
          </div>
        ))}
      </div>
    </div>
  );
}
