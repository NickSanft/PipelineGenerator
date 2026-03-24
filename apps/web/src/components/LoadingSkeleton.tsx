export function LoadingSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-pulse">
      {/* Analysis panel skeleton */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-3">
        <div className="h-3 bg-[var(--border)] rounded w-1/2" />
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex gap-4 py-1.5">
            <div className="h-3 bg-[var(--border)] rounded w-28" />
            <div className="h-3 bg-[var(--border)] rounded w-24" />
          </div>
        ))}
      </div>

      {/* YAML panel skeleton */}
      <div className="bg-[var(--surface)] rounded-xl border border-[var(--border)] p-6 space-y-3">
        <div className="flex justify-between">
          <div className="h-3 bg-[var(--border)] rounded w-40" />
          <div className="flex gap-2">
            <div className="h-6 bg-[var(--border)] rounded w-14" />
            <div className="h-6 bg-[var(--border)] rounded w-18" />
          </div>
        </div>
        {Array.from({ length: 14 }).map((_, i) => (
          <div
            key={i}
            className="h-3 bg-[var(--border)] rounded"
            style={{ width: `${40 + ((i * 37) % 45)}%` }}
          />
        ))}
      </div>
    </div>
  );
}
