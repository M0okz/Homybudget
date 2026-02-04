import React, { useCallback, useMemo, type CSSProperties } from 'react';
import { useTranslation, type LanguageCode } from '../i18n';
import type { BankAccount, BankAccountSettings, BudgetData, MonthlyBudget, Palette, PersonBudget } from '../App';

type ExpenseSeriesPoint = {
  key: string;
  label: string;
  planned: number;
  actual: number | null;
};

type DashboardCardProps = {
  title: string;
  subtitle?: string;
  darkMode: boolean;
  children: React.ReactNode;
};

const DashboardCard = ({ title, subtitle, darkMode, children }: DashboardCardProps) => (
  <div
    className={`rounded-2xl border p-4 shadow-sm ${
      darkMode ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-white/80 border-slate-200 text-slate-700'
    }`}
  >
    <div className="flex items-center justify-between gap-2">
      <div>
        <div className="text-sm font-semibold">{title}</div>
        {subtitle && <div className="text-xs text-slate-400">{subtitle}</div>}
      </div>
    </div>
    <div className="mt-3">{children}</div>
  </div>
);

type MonthlyExpenseChartProps = {
  points: ExpenseSeriesPoint[];
  darkMode: boolean;
  variant?: 'spending' | 'default';
};

const MonthlyExpenseChart = ({ points, darkMode, variant = 'spending' }: MonthlyExpenseChartProps) => {
  if (!points.length) {
    return null;
  }
  const width = 260;
  const height = 120;
  const padding = 12;
  const maxValue = Math.max(
    1,
    ...points.map(point => Math.max(point.planned, point.actual ?? 0))
  );
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const getY = (value: number) => {
    const ratio = Math.min(value / maxValue, 1);
    return height - padding - ratio * (height - padding * 2);
  };
  const buildPath = (values: Array<number | null>) => values
    .map((value, index) => {
      if (value === null) {
        return null;
      }
      const x = padding + step * index;
      const y = getY(value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .filter(Boolean)
    .join(' ');

  const plannedPath = buildPath(points.map(point => point.planned));
  const actualPath = buildPath(points.map(point => (point.actual === null ? null : point.actual)));
  const plannedColor = darkMode ? '#94A3B8' : '#CBD5F5';
  const actualColor = darkMode ? '#22C55E' : '#16A34A';
  const gradientId = `actual-gradient-${darkMode ? 'dark' : 'light'}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-28">
      <defs>
        <linearGradient id={gradientId} x1="0%" x2="100%" y1="0%" y2="0%">
          <stop offset="0%" stopColor={darkMode ? '#F97316' : '#FB923C'} />
          <stop offset="50%" stopColor={darkMode ? '#FACC15' : '#FDE047'} />
          <stop offset="100%" stopColor={actualColor} />
        </linearGradient>
      </defs>
      {[0.25, 0.5, 0.75].map((tick, index) => (
        <line
          key={index}
          x1={padding}
          x2={width - padding}
          y1={padding + tick * (height - padding * 2)}
          y2={padding + tick * (height - padding * 2)}
          stroke={darkMode ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.35)'}
          strokeDasharray="4 6"
        />
      ))}
      {plannedPath && (
        <path
          d={plannedPath}
          fill="none"
          stroke={plannedColor}
          strokeWidth={2}
          strokeDasharray={variant === 'spending' ? '6 6' : undefined}
          strokeLinecap="round"
          strokeOpacity={variant === 'spending' ? 0.7 : 1}
        />
      )}
      {actualPath && (
        <path
          d={actualPath}
          fill="none"
          stroke={variant === 'spending' ? `url(#${gradientId})` : actualColor}
          strokeWidth={2.8}
          strokeLinecap="round"
        />
      )}
      {points.map((point, index) => {
        const x = padding + step * index;
        const plannedY = getY(point.planned);
        return (
          <circle
            key={`planned-${point.key}`}
            cx={x}
            cy={plannedY}
            r={3}
            fill={plannedColor}
          />
        );
      })}
      {points.map((point, index) => {
        if (point.actual === null) {
          return null;
        }
        const x = padding + step * index;
        const actualY = getY(point.actual);
        return (
          <circle
            key={`actual-${point.key}`}
            cx={x}
            cy={actualY}
            r={3}
            fill={actualColor}
          />
        );
      })}
    </svg>
  );
};

type DashboardViewProps = {
  monthlyBudgets: MonthlyBudget;
  currentMonthKey: string;
  darkMode: boolean;
  currencyPreference: 'EUR' | 'USD';
  palette: Palette;
  monthOptions: string[];
  formatMonthKey: (value: string) => string;
  data: BudgetData;
  jointAccountEnabled: boolean;
  onOpenTransactions: () => void;
  bankAccountsEnabled: boolean;
  bankAccounts: BankAccountSettings;
  soloModeEnabled: boolean;
  calculatePlannedExpensesForData: (budget: BudgetData) => number;
  calculateActualExpensesForData: (budget: BudgetData) => number;
  calculateTotalIncomeForData: (budget: BudgetData) => number;
  calculateJointBalanceForData: (budget: BudgetData) => number;
  formatCurrency: (value: number, currencyPreference: 'EUR' | 'USD') => string;
  formatExpenseDate: (value: string, language: LanguageCode) => string;
  coerceNumber: (value: number | string) => number;
  getAccountChipStyle: (color: string) => CSSProperties;
  getPaletteTone: (palette: Palette, slotIndex: number, darkMode: boolean) => {
    background: string;
    text: string;
    border: string;
  };
};

const DashboardView = ({
  monthlyBudgets,
  currentMonthKey,
  darkMode,
  currencyPreference,
  palette,
  monthOptions,
  formatMonthKey,
  data,
  jointAccountEnabled,
  onOpenTransactions,
  bankAccountsEnabled,
  bankAccounts,
  soloModeEnabled,
  calculatePlannedExpensesForData,
  calculateActualExpensesForData,
  calculateTotalIncomeForData,
  calculateJointBalanceForData,
  formatCurrency,
  formatExpenseDate,
  coerceNumber,
  getAccountChipStyle,
  getPaletteTone
}: DashboardViewProps) => {
  const { t, language } = useTranslation();
  const accentTone = useMemo(() => getPaletteTone(palette, 1, darkMode), [palette, darkMode, getPaletteTone]);
  const formatMonthShort = useCallback((monthKey: string) => {
    const [, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    return monthOptions[monthIndex] ?? monthKey;
  }, [monthOptions]);

  const expenseSeries = useMemo(() => {
    const keys = Object.keys(monthlyBudgets).filter(key => key <= currentMonthKey).sort();
    const recentKeys = keys.slice(-12);
    return recentKeys.map(key => {
      const budget = monthlyBudgets[key];
      const planned = budget ? calculatePlannedExpensesForData(budget) : 0;
      const actual = budget && key < currentMonthKey ? calculateActualExpensesForData(budget) : null;
      return {
        key,
        label: formatMonthShort(key),
        planned,
        actual
      };
    });
  }, [calculateActualExpensesForData, calculatePlannedExpensesForData, currentMonthKey, formatMonthShort, monthlyBudgets]);

  const plannedTotal = useMemo(() => calculatePlannedExpensesForData(data), [calculatePlannedExpensesForData, data]);
  const actualTotal = useMemo(() => calculateActualExpensesForData(data), [calculateActualExpensesForData, data]);
  const incomeTotal = useMemo(() => calculateTotalIncomeForData(data), [calculateTotalIncomeForData, data]);
  const availableTotal = incomeTotal - plannedTotal;
  const progressRatio = plannedTotal > 0 ? Math.min(actualTotal / plannedTotal, 1) : 0;
  const isOverBudget = actualTotal > plannedTotal && plannedTotal > 0;
  const jointBalance = useMemo(() => calculateJointBalanceForData(data), [calculateJointBalanceForData, data]);
  const transactionCount = data.jointAccount.transactions.length;
  const remainingBudget = plannedTotal - actualTotal;
  const remainingLabel = remainingBudget >= 0 ? t('underBudgetLabel') : t('overBudgetLabel');

  const topCategories = useMemo(() => {
    const grouped = new Map<string, { name: string; amount: number; actual: number }>();
    [...data.person1.categories, ...data.person2.categories].forEach(category => {
      const name = category.name || t('newCategoryLabel');
      const amount = coerceNumber(category.amount);
      if (amount <= 0) {
        return;
      }
      const actual = category.isChecked ? amount : 0;
      const current = grouped.get(name);
      if (current) {
        grouped.set(name, {
          name,
          amount: current.amount + amount,
          actual: current.actual + actual
        });
      } else {
        grouped.set(name, { name, amount, actual });
      }
    });
    return Array.from(grouped.values())
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5)
      .map((item, index) => ({
        ...item,
        id: `${item.name}-${index}`
      }));
  }, [coerceNumber, data.person1.categories, data.person2.categories, t]);

  const upcomingExpenses = useMemo(() => {
    const today = new Date();
    const todayKey = today.toISOString().slice(0, 10);
    const upcoming = [
      ...data.person1.fixedExpenses.map(expense => ({
        name: expense.name || t('newFixedExpenseLabel'),
        amount: coerceNumber(expense.amount),
        date: expense.date,
        isChecked: Boolean(expense.isChecked)
      })),
      ...data.person2.fixedExpenses.map(expense => ({
        name: expense.name || t('newFixedExpenseLabel'),
        amount: coerceNumber(expense.amount),
        date: expense.date,
        isChecked: Boolean(expense.isChecked)
      })),
      ...data.person1.categories.map(category => ({
        name: category.name || t('newCategoryLabel'),
        amount: coerceNumber(category.amount),
        date: category.date,
        isChecked: Boolean(category.isChecked)
      })),
      ...data.person2.categories.map(category => ({
        name: category.name || t('newCategoryLabel'),
        amount: coerceNumber(category.amount),
        date: category.date,
        isChecked: Boolean(category.isChecked)
      }))
    ]
      .filter(item => item.date && item.date.startsWith(currentMonthKey) && item.date >= todayKey && !item.isChecked)
      .sort((a, b) => (a.date || '').localeCompare(b.date || ''))
      .slice(0, 4);
    return upcoming;
  }, [coerceNumber, currentMonthKey, data.person1.categories, data.person1.fixedExpenses, data.person2.categories, data.person2.fixedExpenses, t]);

  const accountTotals = useMemo(() => {
    const buildTotals = (person: PersonBudget, accounts: BankAccount[]) => {
      const totals = new Map<string, number>();
      accounts.forEach(account => totals.set(account.id, 0));
      const addAmount = (accountId: string | undefined, value: number) => {
        if (!accountId || !totals.has(accountId)) {
          return;
        }
        totals.set(accountId, (totals.get(accountId) ?? 0) + coerceNumber(value));
      };
      person.fixedExpenses.forEach(expense => addAmount(expense.accountId, expense.amount));
      person.categories.forEach(category => addAmount(category.accountId, category.amount));
      return accounts.map(account => ({
        ...account,
        total: totals.get(account.id) ?? 0
      }));
    };
    return {
      person1: buildTotals(data.person1, bankAccounts.person1),
      person2: buildTotals(data.person2, bankAccounts.person2)
    };
  }, [bankAccounts.person1, bankAccounts.person2, coerceNumber, data.person1, data.person2]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            className={`rounded-2xl border p-5 shadow-sm ${
              darkMode ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-white/90 border-slate-200 text-slate-700'
            }`}
          >
            <div className="flex items-center justify-between text-sm font-semibold">
              <span>{t('monthlySpendingTitle')}</span>
              <button
                type="button"
                onClick={onOpenTransactions}
                className={`flex items-center gap-1 text-xs font-semibold ${
                  darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
                }`}
              >
                {t('transactionsCta')}
                <span aria-hidden="true">›</span>
              </button>
            </div>
            <div className="mt-4 text-center">
              <div className="text-2xl sm:text-3xl font-semibold">
                {formatCurrency(Math.abs(remainingBudget), currencyPreference)} {t('leftLabel')}
              </div>
              <div className="mt-1 text-xs text-slate-400">
                {formatCurrency(plannedTotal, currencyPreference)} {t('budgetedLabel')}
              </div>
            </div>
            <div className="mt-4">
              {expenseSeries.length > 0 ? (
                <MonthlyExpenseChart points={expenseSeries} darkMode={darkMode} variant="spending" />
              ) : (
                <div className="text-sm text-slate-400">{t('noDataLabel')}</div>
              )}
            </div>
            <div className="mt-3 flex justify-center">
              <span
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
                  remainingBudget >= 0 ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white'
                }`}
              >
                {formatCurrency(Math.abs(remainingBudget), currencyPreference)} {remainingLabel}
              </span>
            </div>
          </div>
        </div>
        <DashboardCard
          title={t('availableNowLabel')}
          subtitle={t('monthlyBalanceLabel')}
          darkMode={darkMode}
        >
          <div className={`text-3xl font-semibold ${availableTotal < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
            {formatCurrency(availableTotal, currencyPreference)}
          </div>
          <div className="mt-2 text-xs text-slate-400">
            {t('incomeLabel')}: <span className="font-semibold text-slate-500">{formatCurrency(incomeTotal, currencyPreference)}</span>
          </div>
          <div className="text-xs text-slate-400">
            {t('totalExpensesShortLabel')}: <span className="font-semibold text-slate-500">{formatCurrency(plannedTotal, currencyPreference)}</span>
          </div>
          <div className="mt-3 rounded-full border p-2 text-xs font-semibold text-center" style={{ borderColor: accentTone.border, color: accentTone.text }}>
            {t('budgetLabel')} {t('inProgressLabel')}
          </div>
        </DashboardCard>
        <DashboardCard
          title={t('monthProgressTitle')}
          subtitle={t('actualVsForecastLabel')}
          darkMode={darkMode}
        >
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>{t('actualLabel')}</span>
            <span>{formatCurrency(actualTotal, currencyPreference)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-xs text-slate-400">
            <span>{t('forecastLabel')}</span>
            <span>{formatCurrency(plannedTotal, currencyPreference)}</span>
          </div>
          <div className="mt-3 h-2 rounded-full bg-slate-200/40">
            <div
              className={`h-2 rounded-full ${isOverBudget ? 'bg-rose-400' : 'bg-emerald-400'}`}
              style={{ width: `${Math.round(progressRatio * 100)}%` }}
            />
          </div>
          <div className={`mt-2 text-xs font-semibold ${isOverBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
            {Math.round(progressRatio * 100)}%
          </div>
        </DashboardCard>
        {jointAccountEnabled ? (
          <DashboardCard
            title={t('jointAccountCardTitle')}
            subtitle={t('jointAccountCardSubtitle')}
            darkMode={darkMode}
          >
            <div className={`text-2xl font-semibold ${jointBalance < 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
              {formatCurrency(jointBalance, currencyPreference)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {t('initialBalanceLabel')}: <span className="font-semibold text-slate-500">{formatCurrency(coerceNumber(data.jointAccount.initialBalance), currencyPreference)}</span>
            </div>
            <div className="text-xs text-slate-400">
              {t('transactionsLabel')}: <span className="font-semibold text-slate-500">{transactionCount}</span>
            </div>
          </DashboardCard>
        ) : (
          <DashboardCard
            title={t('savingsCardTitle')}
            subtitle={t('savingsCardSubtitle')}
            darkMode={darkMode}
          >
            <div className="text-2xl font-semibold text-emerald-400">
              {formatCurrency(Math.max(0, availableTotal), currencyPreference)}
            </div>
            <div className="mt-2 text-xs text-slate-400">
              {t('availableNowLabel')}
            </div>
          </DashboardCard>
        )}
        {bankAccountsEnabled && (
          <DashboardCard
            title={t('accountsBreakdownTitle')}
            subtitle={t('accountsBreakdownSubtitle')}
            darkMode={darkMode}
          >
            <div className={`grid gap-4 ${soloModeEnabled ? '' : 'sm:grid-cols-2'}`}>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                  {data.person1.name || t('person1Label')}
                </div>
                <div className="mt-2 space-y-2">
                  {accountTotals.person1.map((account) => (
                    <div key={account.id} className="flex items-center justify-between text-sm">
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={getAccountChipStyle(account.color)}
                      >
                        {account.name}
                      </span>
                      <span className="font-semibold">{formatCurrency(account.total, currencyPreference)}</span>
                    </div>
                  ))}
                </div>
              </div>
              {!soloModeEnabled && (
                <div>
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                    {data.person2.name || t('person2Label')}
                  </div>
                  <div className="mt-2 space-y-2">
                    {accountTotals.person2.map((account) => (
                      <div key={account.id} className="flex items-center justify-between text-sm">
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={getAccountChipStyle(account.color)}
                        >
                          {account.name}
                        </span>
                        <span className="font-semibold">{formatCurrency(account.total, currencyPreference)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </DashboardCard>
        )}
        <DashboardCard
          title={t('topCategoriesTitle')}
          subtitle={t('topCategoriesSubtitle')}
          darkMode={darkMode}
        >
          {topCategories.length > 0 ? (
            <div className="space-y-3">
              {topCategories.map((item, index) => {
                const ratio = item.amount > 0 ? Math.min(item.actual / item.amount, 1) : 0;
                const palette = darkMode
                  ? ['bg-amber-400', 'bg-emerald-400', 'bg-sky-400', 'bg-rose-400', 'bg-violet-400']
                  : ['bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-rose-500', 'bg-violet-500'];
                const badgeColor = palette[index % palette.length];
                const nameClass = darkMode ? 'text-slate-100' : 'text-slate-700';
                const valueClass = darkMode ? 'text-slate-300' : 'text-slate-600';
                return (
                  <div key={item.id} className="flex items-center gap-3 text-xs">
                    <div className="flex min-w-[9rem] items-center gap-2">
                      <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-semibold ${badgeColor} text-white`}>
                        {index + 1}
                      </span>
                      <span className={`truncate text-sm font-semibold ${nameClass}`}>{item.name}</span>
                    </div>
                    <span className={`w-16 text-right font-semibold tabular-nums ${valueClass}`}>
                      {formatCurrency(item.actual, currencyPreference)}
                    </span>
                    <div className={`h-2 flex-1 rounded-full ${darkMode ? 'bg-slate-800/70' : 'bg-slate-200/70'}`}>
                      <div
                        className={`h-2 rounded-full ${badgeColor}`}
                        style={{ width: `${Math.round(ratio * 100)}%` }}
                      />
                    </div>
                    <span className={`w-16 text-right font-semibold tabular-nums ${valueClass}`}>
                      {formatCurrency(item.amount, currencyPreference)}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-sm text-slate-400">{t('noDataLabel')}</div>
          )}
        </DashboardCard>
        <DashboardCard
          title={t('upcomingLabel')}
          subtitle={t('upcomingSubtitle')}
          darkMode={darkMode}
        >
          {upcomingExpenses.length > 0 ? (
            <div className="space-y-2">
              {upcomingExpenses.map((item, index) => (
                <div key={`${item.name}-${index}`} className="flex items-center justify-between text-sm">
                  <div className="flex flex-col">
                    <span className="truncate">{item.name}</span>
                    {item.date && (
                      <span className="text-xs text-slate-400">{formatExpenseDate(item.date, language)}</span>
                    )}
                  </div>
                  <span className="font-semibold">{formatCurrency(item.amount, currencyPreference)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-slate-400">{t('noUpcomingLabel')}</div>
          )}
        </DashboardCard>
      </div>
    </div>
  );
};

export default DashboardView;
