import { Outlet, Link, useLocation } from 'react-router-dom';

export function Layout() {
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 font-bold text-lg text-gray-900">
            <span className="w-8 h-8 rounded-lg bg-accent-500 flex items-center justify-center text-white text-sm">
              CF
            </span>
            ComicFlow
          </Link>
          {!isHome && (
            <Link to="/" className="btn-secondary text-sm">
              ← 返回项目列表
            </Link>
          )}
        </div>
      </header>

      {/* Main */}
      <main className="flex-1">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-100 py-4 text-center text-xs text-gray-400">
        ComicFlow v0.1 — AI 漫画一条龙创作平台
      </footer>
    </div>
  );
}
