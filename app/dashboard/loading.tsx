export default function DashboardLoading() {
  return (
    <main className="dashboard-page" aria-busy="true" aria-label="Loading DetailFlow">
      <aside className="dashboard-sidebar"><div className="brand"><span className="brand-mark" /></div><div className="dashboard-nav">
        {Array.from({ length: 8 }).map((_, index) => <div className="dashboard-loading-nav" key={index} />)}
      </div></aside>
      <section className="dashboard-workspace"><div className="dashboard-main">
        <div className="dashboard-loading-kicker" /><div className="dashboard-loading-title" /><div className="dashboard-loading-copy" />
        <div className="dashboard-loading-trial" /><div className="dashboard-loading-metrics">
          {Array.from({ length: 4 }).map((_, index) => <div key={index} />)}
        </div><div className="dashboard-loading-grid"><div /><div /></div>
      </div></section>
    </main>
  );
}
