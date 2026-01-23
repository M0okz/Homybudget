import React from 'react';
import { ChevronRight, Home, Menu, Moon, Sun } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';

type HeaderBarProps = {
  darkMode: boolean;
  isSettingsView: boolean;
  isBudgetView: boolean;
  pageLabel: string;
  currentMonthKey: string;
  availableMonthKeys: string[];
  formatMonthKey: (key: string) => string;
  onSelectMonth: (key: string) => void;
  isHydrated: boolean;
  onBackToBudget: () => void;
  backLabel: string;
  settingsLabel: string;
  monthSelectLabel: string;
  showNextMonth: boolean;
  nextMonthAvailable: boolean;
  onToggleNextMonth: () => void;
  renderPaletteSelector: () => React.ReactNode;
  onOpenSidebar: () => void;
  onToggleTheme: () => void;
  themeLabel: string;
  userInitial: string;
  userDisplayName: string;
  userAvatarUrl: string | null;
  breadcrumbItems: string[];
};

const HeaderBar = React.memo(({
  darkMode,
  isSettingsView,
  isBudgetView,
  pageLabel,
  currentMonthKey,
  availableMonthKeys,
  formatMonthKey,
  onSelectMonth,
  isHydrated,
  onBackToBudget,
  backLabel,
  settingsLabel,
  monthSelectLabel,
  showNextMonth,
  nextMonthAvailable,
  onToggleNextMonth,
  renderPaletteSelector,
  onOpenSidebar,
  onToggleTheme,
  themeLabel,
  userInitial,
  userDisplayName,
  userAvatarUrl,
  breadcrumbItems
}: HeaderBarProps) => (
  <div className="flex flex-col gap-3 mb-4 sm:mb-6 sm:static sticky top-0 z-30 pb-2 sm:pb-0 bg-transparent">
    <div className="sm:hidden flex items-center justify-between gap-2">
      <button
        type="button"
        onClick={onOpenSidebar}
        className={`p-2 rounded-full shadow-sm ${darkMode ? 'bg-slate-900 text-white' : 'bg-white/90 text-slate-700'}`}
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>
      <div className="flex items-center gap-2">
        {renderPaletteSelector()}
        <button
          type="button"
          onClick={onToggleTheme}
          className={`h-9 w-9 rounded-full flex items-center justify-center shadow-sm ${
            darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-600'
          }`}
          aria-label={themeLabel}
        >
          {darkMode ? <Sun size={18} className="text-yellow-400" /> : <Moon size={18} />}
        </button>
        <div
          className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold overflow-hidden shadow-sm ${
            darkMode ? 'bg-slate-800 text-white' : 'bg-white text-slate-700'
          }`}
          aria-label={userDisplayName}
        >
          {userAvatarUrl ? (
            <img src={userAvatarUrl} alt={userDisplayName} className="h-full w-full object-cover" />
          ) : (
            userInitial
          )}
        </div>
      </div>
    </div>
    {isSettingsView ? (
      <div className="sm:hidden flex flex-col items-start gap-2">
        <button
          onClick={onBackToBudget}
          className={`px-3 py-2 rounded-lg text-sm font-semibold ${
            darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-white text-slate-700 hover:bg-slate-50'
          } transition-all`}
        >
          {backLabel}
        </button>
        <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          {settingsLabel}
        </h1>
      </div>
    ) : isBudgetView ? (
      <div className="sm:hidden flex items-center justify-end">
        <h1 className={`text-2xl font-bold flex items-center gap-2 min-w-0 text-right leading-snug ${darkMode ? 'text-white' : 'text-slate-800'}`}>
          <Select
            value={currentMonthKey}
            onValueChange={onSelectMonth}
            disabled={!isHydrated}
          >
            <SelectTrigger
              aria-label={monthSelectLabel}
              className={`month-live h-10 min-w-0 border-none bg-transparent px-0 py-0 text-2xl font-bold shadow-none [&_svg]:hidden ${
                darkMode
                  ? 'text-white hover:bg-white/5 focus:ring-white/30'
                  : 'text-slate-800 hover:bg-slate-900/5 focus:ring-slate-300/40'
              }`}
            >
              <SelectValue className="truncate" />
            </SelectTrigger>
            <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
              {(availableMonthKeys.length > 0 ? availableMonthKeys : [currentMonthKey]).map(monthKey => (
                <SelectItem key={monthKey} value={monthKey}>
                  {formatMonthKey(monthKey)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </h1>
      </div>
    ) : (
      <h1 className={`sm:hidden text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
        {pageLabel}
      </h1>
    )}
    <div className="hidden sm:flex items-center gap-3">
      <div className="flex flex-wrap items-center gap-3">
        {isSettingsView ? (
          <div className="flex flex-col items-start gap-2">
            <button
              onClick={onBackToBudget}
              className={`px-3 py-2 rounded-full text-sm font-semibold shadow-sm ${
                darkMode ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-white text-slate-700 hover:bg-slate-50'
              } transition-all`}
            >
              {backLabel}
            </button>
            <h1 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
              {settingsLabel}
            </h1>
          </div>
        ) : isBudgetView ? (
          <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            <Select
              value={currentMonthKey}
              onValueChange={onSelectMonth}
              disabled={!isHydrated}
            >
              <SelectTrigger
                aria-label={monthSelectLabel}
                className={`month-live h-auto border-none bg-transparent px-0 py-0 text-2xl sm:text-3xl font-bold leading-none shadow-none [&_svg]:hidden ${
                  darkMode
                    ? 'text-white hover:bg-white/5 focus:ring-white/30'
                    : 'text-slate-800 hover:bg-slate-900/5 focus:ring-slate-300/40'
                }`}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                {(availableMonthKeys.length > 0 ? availableMonthKeys : [currentMonthKey]).map(monthKey => (
                  <SelectItem key={monthKey} value={monthKey}>
                    {formatMonthKey(monthKey)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </h1>
        ) : (
          <h1 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
            {pageLabel}
          </h1>
        )}
      </div>
      <div className="ml-auto hidden sm:flex items-center gap-3">
        <div className={`flex items-center gap-2 rounded-full px-3 py-1 border ${
          darkMode ? 'bg-slate-900/60 border-slate-800' : 'bg-white/80 border-slate-100'
        }`}
        >
          {isBudgetView && (
            <button
              onClick={onToggleNextMonth}
              disabled={!isHydrated || !nextMonthAvailable}
              aria-pressed={showNextMonth}
              className={`hidden sm:inline-flex items-center justify-center px-4 py-1.5 rounded-full text-sm font-semibold transition-all border ${
                showNextMonth
                  ? 'bg-emerald-500 text-white border-emerald-500 shadow-[0_10px_24px_rgba(16,185,129,0.25)]'
                  : (darkMode ? 'bg-slate-900/70 text-slate-200 border-slate-700' : 'bg-white/80 text-slate-600 border-slate-200')
              } ${isHydrated && nextMonthAvailable ? '' : 'opacity-60 cursor-not-allowed'}`}
            >
              Split
            </button>
          )}
          <div className="hidden sm:flex">
            {renderPaletteSelector()}
          </div>
        </div>
      </div>
    </div>
    <nav
      aria-label="breadcrumb"
      className={`hidden sm:flex items-center gap-2 text-xs sm:text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
    >
      <Home size={14} className={darkMode ? 'text-slate-300' : 'text-slate-400'} />
      {breadcrumbItems.map((item, index) => (
        <span key={`${item}-${index}`} className="flex items-center gap-2">
          <ChevronRight size={12} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
          <span className={index === breadcrumbItems.length - 1 ? (darkMode ? 'text-slate-200' : 'text-slate-700') : ''}>
            {item}
          </span>
        </span>
      ))}
    </nav>
    {isBudgetView && (
      <div className="flex items-center justify-end sm:hidden" />
    )}
  </div>
));

HeaderBar.displayName = 'HeaderBar';

export default HeaderBar;
