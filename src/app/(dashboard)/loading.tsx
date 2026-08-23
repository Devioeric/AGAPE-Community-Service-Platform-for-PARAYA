export default function Loading() {
  return (
    <div className="p-6 space-y-6 animate-pulse">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-border/50" />
        ))}
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 h-64 rounded-xl bg-border/50" />
        <div className="h-64 rounded-xl bg-border/50" />
      </div>
      <div className="h-48 rounded-xl bg-border/50" />
    </div>
  );
}
