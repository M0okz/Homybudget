import React from 'react';
import { LayoutGroup, motion } from 'framer-motion';
import { Moon, Sun, LogOut, type LucideIcon } from 'lucide-react';

type NavItem = {
  key: 'dashboard' | 'budget' | 'reports' | 'settings';
  label: string;
  icon: LucideIcon;
};

type SidebarProps = {
  darkMode: boolean;
  navItems: NavItem[];
  activePage: NavItem['key'];
  sidebarOpen: boolean;
  onNavigate: (page: NavItem['key']) => void;
  onCloseMobile: () => void;
  onToggleTheme: () => void;
  onLogout: () => void;
  appName: string;
  userDisplayName: string;
  userHandle: string;
  userInitial: string;
  userAvatarUrl: string | null;
  themeLabel: string;
  darkLabel: string;
  lightLabel: string;
  logoutLabel: string;
  appVersion: string;
  updateAvailable: boolean;
  latestVersion: string | null;
};

const Sidebar = React.memo(({
  darkMode,
  navItems,
  activePage,
  sidebarOpen,
  onNavigate,
  onCloseMobile,
  onToggleTheme,
  onLogout,
  appName,
  userDisplayName,
  userHandle,
  userInitial,
  userAvatarUrl,
  themeLabel,
  darkLabel,
  lightLabel,
  logoutLabel,
  appVersion,
  updateAvailable,
  latestVersion
}: SidebarProps) => {
  const [hoveredKey, setHoveredKey] = React.useState<NavItem['key'] | null>(null);
  const [isNavHovering, setIsNavHovering] = React.useState(false);

  const sidebarNav = (
    <LayoutGroup>
      <nav
        className="flex flex-col gap-1"
        onMouseEnter={() => setIsNavHovering(true)}
        onMouseLeave={() => {
          setIsNavHovering(false);
          setHoveredKey(null);
        }}
      >
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = activePage === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => {
                setHoveredKey(null);
                onNavigate(item.key);
              }}
              onMouseEnter={() => setHoveredKey(item.key)}
              onMouseLeave={() => setHoveredKey(null)}
              onFocus={() => setHoveredKey(item.key)}
              onBlur={() => setHoveredKey(null)}
              className={`relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                isActive
                  ? (darkMode ? 'text-[color:var(--brand-accent-3)]' : 'text-[color:var(--brand-primary)]')
                  : (darkMode ? 'text-slate-300 hover:bg-slate-900/60' : 'text-slate-600 hover:bg-slate-100/70')
              }`}
            >
              {isNavHovering && hoveredKey === item.key && !isActive && (
                <motion.span
                  layoutId="sidebar-hover"
                  className={`absolute inset-0 rounded-xl ${
                    darkMode ? 'bg-slate-900/70' : 'bg-slate-100/80'
                  }`}
                  transition={{ type: 'tween', duration: 0.22, ease: 'easeOut' }}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.98 }}
                />
              )}
              {isActive && (
                <motion.span
                  layoutId="sidebar-active"
                  className="absolute inset-0 rounded-xl shadow-sm"
                  style={{
                    backgroundColor: darkMode ? 'rgba(58, 63, 143, 0.28)' : 'var(--brand-primary-soft)'
                  }}
                  transition={{ type: 'spring', stiffness: 240, damping: 24, mass: 0.6 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-3">
                <Icon size={18} />
                <span>{item.label}</span>
              </span>
            </button>
          );
        })}
      </nav>
    </LayoutGroup>
  );

  const sidebarFooter = (
    <div className={`mt-auto pt-4 pb-4 border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onNavigate('settings')}
          className={`flex-1 flex items-center gap-3 px-3 py-2 rounded-xl transition-all ${
            darkMode ? 'hover:bg-slate-900/70 text-slate-200' : 'hover:bg-white/80 text-slate-700'
          }`}
        >
          <div className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold overflow-hidden ${
            darkMode ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
          }`}>
            {userAvatarUrl ? (
              <img src={userAvatarUrl} alt={userDisplayName} className="h-full w-full object-cover" />
            ) : (
              userInitial
            )}
          </div>
          <div className="text-left">
            <div className="text-sm font-semibold">{userDisplayName}</div>
            {userHandle && (
              <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                @{userHandle}
              </div>
            )}
          </div>
        </button>
        <button
          type="button"
          onClick={onLogout}
          className={`h-9 w-9 flex items-center justify-center rounded-xl transition-all ${
            darkMode ? 'bg-slate-800 text-slate-200 hover:bg-slate-700' : 'bg-white text-slate-500 hover:bg-slate-100'
          }`}
          aria-label={logoutLabel}
          title={logoutLabel}
        >
          <LogOut size={16} />
        </button>
      </div>
      <button
        type="button"
        onClick={onToggleTheme}
        className={`mt-3 w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all ${
          darkMode ? 'hover:bg-slate-900/70 text-slate-200' : 'hover:bg-white/80 text-slate-700'
        }`}
        aria-label={themeLabel}
      >
        {darkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
        <span>{themeLabel}</span>
        <span className={`ml-auto text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
          {darkMode ? darkLabel : lightLabel}
        </span>
      </button>
      <div className={`mt-3 flex items-center justify-center gap-2 text-xs uppercase tracking-wide ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
        <span>V{appVersion}</span>
        {updateAvailable && latestVersion && (
          <span className="version-pill version-breathing">{latestVersion}</span>
        )}
      </div>
    </div>
  );

  return (
    <>
      <aside
        className={`hidden sm:flex sm:flex-col sm:w-64 sm:shrink-0 sm:pt-6 sm:pb-0 sm:px-4 sm:border-r transition-colors sm:fixed sm:left-0 sm:top-0 sm:h-[100dvh] sm:z-40 sidebar-float ${
          darkMode ? 'bg-slate-950/80 border-slate-800' : 'bg-white/70 border-slate-100'
        } backdrop-blur-lg`}
      >
        <div className="flex items-center gap-3 px-2 mb-6">
          <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${
            darkMode ? 'bg-slate-800 text-white' : 'bg-[var(--brand-primary-soft)] text-[color:var(--brand-primary)]'
          }`}>
            HB
          </div>
          <div className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            {appName}
          </div>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto">
          {sidebarNav}
        </div>
        {sidebarFooter}
      </aside>

      <div className={`fixed inset-0 z-40 sm:hidden transition-opacity ${sidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div
          className="absolute inset-0 bg-black/40"
          onClick={onCloseMobile}
        />
        <aside
          className={`absolute left-0 top-0 h-full w-64 p-4 flex flex-col transition-transform duration-300 safe-area-inset sidebar-float ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } ${darkMode ? 'bg-slate-950 text-white' : 'bg-white/90 text-slate-800'} backdrop-blur-lg`}
        >
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-bold ${
                darkMode ? 'bg-slate-800 text-white' : 'bg-[var(--brand-primary-soft)] text-[color:var(--brand-primary)]'
              }`}>
                HB
              </div>
              <div className="text-lg font-semibold">{appName}</div>
            </div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {sidebarNav}
          </div>
          {sidebarFooter}
        </aside>
      </div>
    </>
  );
});

Sidebar.displayName = 'Sidebar';

export default Sidebar;
