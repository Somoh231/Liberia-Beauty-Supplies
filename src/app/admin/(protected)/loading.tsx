export default function AdminProtectedLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 py-6 animate-pulse xl:max-w-7xl" aria-busy="true" aria-label="Loading">
      <div className="h-10 w-48 rounded-lg bg-white/[0.06]" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="admin-card h-28" />
        <div className="admin-card h-28" />
        <div className="admin-card h-28" />
      </div>
      <div className="admin-card h-72" />
      <div className="admin-card h-96" />
    </div>
  );
}
