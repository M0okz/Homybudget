import React, { useEffect, useMemo, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { MONTH_LABELS, useTranslation, type LanguageCode } from '../i18n';
import type { AuthUser, BudgetData, MonthlyBudget } from '../App';

type ReportsViewProps = {
  monthlyBudgets: MonthlyBudget;
  currentMonthKey: string;
  darkMode: boolean;
  currencyPreference: 'EUR' | 'USD';
  data: BudgetData;
  soloModeEnabled: boolean;
  authProfile: AuthUser | null;
  formatMonthKey: (value: string) => string;
  calculateTotalIncome: (incomeSources: BudgetData['person1']['incomeSources']) => number;
  calculateTotalFixed: (expenses: BudgetData['person1']['fixedExpenses']) => number;
  calculateTotalCategories: (categories: BudgetData['person1']['categories']) => number;
  coerceNumber: (value: number | string) => number;
  formatCurrency: (value: number, currencyPreference: 'EUR' | 'USD') => string;
};

type ReportMetricCardProps = {
  title: string;
  subtitle: string;
  value: string;
  tone: 'income' | 'expense' | 'neutral';
  darkMode: boolean;
};

const ReportMetricCard = ({ title, subtitle, value, tone, darkMode }: ReportMetricCardProps) => {
  const toneClass = tone === 'income'
    ? (darkMode ? 'text-sky-300' : 'text-sky-600')
    : tone === 'expense'
      ? (darkMode ? 'text-rose-300' : 'text-rose-500')
      : (darkMode ? 'text-slate-200' : 'text-slate-700');
  return (
    <div
      className={`rounded-2xl border p-4 sm:p-5 ${
        darkMode ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'
      }`}
    >
      <div className="text-sm font-semibold">{title}</div>
      <div className="text-xs text-slate-400">{subtitle}</div>
      <div className={`mt-6 text-3xl sm:text-4xl font-semibold ${toneClass}`}>{value}</div>
    </div>
  );
};

type ReportSeriesPoint = {
  key: string;
  label: string;
  income: number;
  expenses: number;
  balance: number;
  transactions: number;
};

type ReportCalendarMonth = {
  key: string;
  year: number;
  monthIndex: number;
  label: string;
  incomeTotal: number;
  expenseTotal: number;
  dailyTotals: Map<number, { income: number; expense: number }>;
};

type ReportLineChartProps = {
  points: ReportSeriesPoint[];
  darkMode: boolean;
};

const ReportLineChart = ({ points, darkMode }: ReportLineChartProps) => {
  if (!points.length) {
    return null;
  }
  const width = 320;
  const height = 140;
  const padding = 14;
  const maxValue = Math.max(
    1,
    ...points.map(point => Math.max(point.income, point.expenses))
  );
  const step = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const getY = (value: number) => {
    const ratio = Math.min(value / maxValue, 1);
    return height - padding - ratio * (height - padding * 2);
  };
  const buildPath = (values: number[]) => values
    .map((value, index) => {
      const x = padding + step * index;
      const y = getY(value);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const incomePath = buildPath(points.map(point => point.income));
  const expensePath = buildPath(points.map(point => point.expenses));
  const incomeColor = darkMode ? '#7DD3FC' : '#0EA5E9';
  const expenseColor = darkMode ? '#FCA5A5' : '#F87171';

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      {[0.25, 0.5, 0.75].map((tick, index) => (
        <line
          key={index}
          x1={padding}
          x2={width - padding}
          y1={padding + tick * (height - padding * 2)}
          y2={padding + tick * (height - padding * 2)}
          stroke={darkMode ? 'rgba(148,163,184,0.2)' : 'rgba(148,163,184,0.3)'}
          strokeDasharray="4 6"
        />
      ))}
      <path
        d={incomePath}
        fill="none"
        stroke={incomeColor}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      <path
        d={expensePath}
        fill="none"
        stroke={expenseColor}
        strokeWidth={2.6}
        strokeLinecap="round"
      />
      {points.map((point, index) => {
        const x = padding + step * index;
        return (
          <circle
            key={`income-${point.key}`}
            cx={x}
            cy={getY(point.income)}
            r={3}
            fill={incomeColor}
          />
        );
      })}
      {points.map((point, index) => {
        const x = padding + step * index;
        return (
          <circle
            key={`expense-${point.key}`}
            cx={x}
            cy={getY(point.expenses)}
            r={3}
            fill={expenseColor}
          />
        );
      })}
    </svg>
  );
};

type ReportBarChartProps = {
  points: ReportSeriesPoint[];
  darkMode: boolean;
};

const ReportBarChart = ({ points, darkMode }: ReportBarChartProps) => {
  if (!points.length) {
    return null;
  }
  const width = 320;
  const height = 140;
  const padding = 14;
  const maxValue = Math.max(
    1,
    ...points.map(point => Math.abs(point.balance))
  );
  const step = points.length > 0 ? (width - padding * 2) / points.length : 0;
  const barWidth = Math.max(6, step * 0.6);
  const centerY = height / 2;
  const scale = (height - padding * 2) / (maxValue * 2);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-32">
      <line
        x1={padding}
        x2={width - padding}
        y1={centerY}
        y2={centerY}
        stroke={darkMode ? 'rgba(148,163,184,0.25)' : 'rgba(148,163,184,0.35)'}
      />
      {points.map((point, index) => {
        const x = padding + step * index + (step - barWidth) / 2;
        const barHeight = Math.max(2, Math.abs(point.balance) * scale);
        const isPositive = point.balance >= 0;
        const y = isPositive ? centerY - barHeight : centerY;
        const fill = isPositive
          ? (darkMode ? 'rgba(52, 211, 153, 0.7)' : '#34D399')
          : (darkMode ? 'rgba(248, 113, 113, 0.7)' : '#F87171');
        return (
          <rect
            key={point.key}
            x={x}
            y={y}
            width={barWidth}
            height={barHeight}
            rx={4}
            fill={fill}
          />
        );
      })}
    </svg>
  );
};

type ReportCalendarProps = {
  months: ReportCalendarMonth[];
  darkMode: boolean;
  language: LanguageCode;
  rangeLabel: string;
  maxExpense: number;
  maxIncome: number;
  currencyPreference: 'EUR' | 'USD';
  title: string;
  formatCurrency: (value: number, currencyPreference: 'EUR' | 'USD') => string;
};

const ReportCalendar = ({
  months,
  darkMode,
  language,
  rangeLabel,
  maxExpense,
  maxIncome,
  currencyPreference,
  title,
  formatCurrency
}: ReportCalendarProps) => {
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const weekStart = language === 'en' ? 0 : 1;
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
    const base = new Date(2023, 0, 1);
    return Array.from({ length: 7 }, (_, index) => {
      const dayIndex = (weekStart + index) % 7;
      const date = new Date(base);
      date.setDate(base.getDate() + dayIndex);
      return formatter.format(date);
    });
  }, [locale, weekStart]);

  if (!months.length) {
    return null;
  }

  const buildMonthGrid = (year: number, monthIndex: number) => {
    const firstOfMonth = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const offset = (firstOfMonth.getDay() - weekStart + 7) % 7;
    const totalSlots = Math.ceil((offset + daysInMonth) / 7) * 7;
    return Array.from({ length: totalSlots }, (_, index) => {
      const day = index - offset + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    });
  };

  return (
    <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-slate-400">{rangeLabel}</div>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        {months.map(month => {
          const slots = buildMonthGrid(month.year, month.monthIndex);
          return (
            <div key={month.key} className="space-y-2">
              <div className={`flex items-center justify-between text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className={`font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-600'}`}>{month.label}</span>
                <span className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1 text-sky-300">
                    ↑ {formatCurrency(month.incomeTotal, currencyPreference)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-rose-300">
                    ↓ {formatCurrency(month.expenseTotal, currencyPreference)}
                  </span>
                </span>
              </div>
              <div className={`grid grid-cols-7 gap-1 text-[10px] uppercase tracking-wide ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                {weekdayLabels.map(label => (
                  <span key={`${month.key}-${label}`} className="text-center">{label}</span>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {slots.map((day, index) => {
                  if (!day) {
                    return <span key={`${month.key}-empty-${index}`} className="h-10 rounded-lg" />;
                  }
                  const totals = month.dailyTotals.get(day) ?? { income: 0, expense: 0 };
                  const expenseRatio = maxExpense > 0 ? Math.min(1, totals.expense / maxExpense) : 0;
                  const incomeRatio = maxIncome > 0 ? Math.min(1, totals.income / maxIncome) : 0;
                  const expenseHeight = Math.max(2, Math.round(expenseRatio * 24));
                  const incomeHeight = Math.max(2, Math.round(incomeRatio * 24));
                  const expenseLabel = formatCurrency(totals.expense, currencyPreference);
                  return (
                    <div
                      key={`${month.key}-${day}`}
                      className={`group relative h-12 rounded-lg border px-1 pt-1 text-xs font-semibold ${
                        darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-200 bg-slate-50 text-slate-700'
                      }`}
                    >
                      {day}
                      {expenseRatio > 0 && (
                        <span
                          className="absolute left-1 bottom-1 w-1.5 rounded bg-rose-400"
                          style={{ height: `${expenseHeight}px` }}
                        />
                      )}
                      {incomeRatio > 0 && (
                        <span
                          className="absolute right-1 bottom-1 w-1.5 rounded bg-sky-400"
                          style={{ height: `${incomeHeight}px` }}
                        />
                      )}
                      {totals.expense > 0 && (
                        <span
                          className={`pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md px-2 py-1 text-[10px] font-semibold opacity-0 shadow-lg transition-opacity group-hover:opacity-100 ${
                            darkMode ? 'bg-slate-900 text-slate-100' : 'bg-white text-slate-700'
                          }`}
                        >
                          ↓ {expenseLabel}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const ReportsView = ({
  monthlyBudgets,
  currentMonthKey,
  darkMode,
  currencyPreference,
  data,
  soloModeEnabled,
  authProfile,
  formatMonthKey,
  calculateTotalIncome,
  calculateTotalFixed,
  calculateTotalCategories,
  coerceNumber,
  formatCurrency
}: ReportsViewProps) => {
  const { t, language } = useTranslation();
  const currentYear = currentMonthKey.slice(0, 4);
  const availableYears = useMemo(() => {
    const years = new Set<string>();
    Object.keys(monthlyBudgets).forEach(monthKey => {
      if (/^\d{4}-\d{2}$/.test(monthKey)) {
        years.add(monthKey.slice(0, 4));
      }
    });
    return Array.from(years).sort();
  }, [monthlyBudgets]);
  const [selectedYear, setSelectedYear] = useState(currentYear);
  const linkedUserId = authProfile?.id ?? null;
  const personKey = soloModeEnabled
    ? 'person1'
    : linkedUserId === data.person1UserId
      ? 'person1'
      : linkedUserId === data.person2UserId
        ? 'person2'
        : null;
  const activePersonKey = personKey ?? 'person1';

  useEffect(() => {
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(currentYear);
    }
  }, [availableYears, currentYear, selectedYear]);

  const monthKeys = useMemo(
    () => Object.keys(monthlyBudgets)
      .filter(monthKey => monthKey.startsWith(`${selectedYear}-`) && monthKey <= (selectedYear === currentYear ? currentMonthKey : `${selectedYear}-12`))
      .sort(),
    [currentMonthKey, currentYear, monthlyBudgets, selectedYear]
  );

  const metrics = useMemo(() => {
    let incomeYtd = 0;
    let expensesYtd = 0;
    let monthsCount = 0;
    let transactionCount = 0;
    monthKeys.forEach(monthKey => {
      const month = monthlyBudgets[monthKey];
      if (!month) {
        return;
      }
      monthsCount += 1;
      const person = month[activePersonKey];
      incomeYtd += calculateTotalIncome(person.incomeSources);
      expensesYtd += calculateTotalFixed(person.fixedExpenses) + calculateTotalCategories(person.categories);
      transactionCount += person.fixedExpenses.filter(exp => coerceNumber(exp.amount) !== 0).length
        + person.categories.filter(cat => coerceNumber(cat.amount) !== 0).length;
    });
    const avgPerMonth = monthsCount > 0 ? expensesYtd / monthsCount : 0;
    const avgPerTransaction = transactionCount > 0 ? expensesYtd / transactionCount : 0;
    return {
      incomeYtd,
      expensesYtd,
      avgPerMonth,
      avgPerTransaction,
      monthsCount
    };
  }, [activePersonKey, calculateTotalCategories, calculateTotalFixed, calculateTotalIncome, coerceNumber, monthKeys, monthlyBudgets]);

  const subtitle = selectedYear === currentYear ? formatMonthKey(currentMonthKey) : selectedYear;

  const monthSeries = useMemo<ReportSeriesPoint[]>(() => {
    return monthKeys.map(monthKey => {
      const month = monthlyBudgets[monthKey];
      const person = month ? month[activePersonKey] : null;
      const income = person ? calculateTotalIncome(person.incomeSources) : 0;
      const expenses = person ? calculateTotalFixed(person.fixedExpenses) + calculateTotalCategories(person.categories) : 0;
      const balance = income - expenses;
      const transactions = person
        ? person.fixedExpenses.filter(exp => coerceNumber(exp.amount) !== 0).length
          + person.categories.filter(cat => coerceNumber(cat.amount) !== 0).length
        : 0;
      const monthIndex = Number(monthKey.slice(5, 7)) - 1;
      const monthLabel = MONTH_LABELS[language]?.[monthIndex] ?? monthKey;
      const shortLabel = monthLabel.slice(0, 3);
      return {
        key: monthKey,
        label: shortLabel,
        income,
        expenses,
        balance,
        transactions
      };
    });
  }, [activePersonKey, calculateTotalCategories, calculateTotalFixed, calculateTotalIncome, coerceNumber, language, monthKeys, monthlyBudgets]);

  const calendarMonths = useMemo<ReportCalendarMonth[]>(() => {
    const [currentYearValue, currentMonthValue] = currentMonthKey.split('-');
    const currentMonthIndex = Number(currentMonthValue) - 1;
    const currentYearNumber = Number(currentYearValue);
    const endYear = selectedYear === currentYear ? currentYearNumber : Number(selectedYear);
    const endMonthIndex = selectedYear === currentYear ? currentMonthIndex : 11;
    const months: ReportCalendarMonth[] = [];
    for (let i = 2; i >= 0; i -= 1) {
      let year = endYear;
      let monthIndex = endMonthIndex - i;
      while (monthIndex < 0) {
        monthIndex += 12;
        year -= 1;
      }
      const key = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
      const monthData = monthlyBudgets[key];
      const person = monthData ? monthData[activePersonKey] : null;
      const incomeTotal = person ? calculateTotalIncome(person.incomeSources) : 0;
      const expenseTotal = person ? calculateTotalFixed(person.fixedExpenses) + calculateTotalCategories(person.categories) : 0;
      const dailyTotals = new Map<number, { income: number; expense: number }>();
      if (person) {
        const addExpense = (dateValue: string | undefined, amountValue: number) => {
          if (!dateValue || !dateValue.startsWith(key)) {
            return;
          }
          const day = Number(dateValue.slice(8, 10));
          if (!Number.isFinite(day)) {
            return;
          }
          const current = dailyTotals.get(day) ?? { income: 0, expense: 0 };
          dailyTotals.set(day, { ...current, expense: current.expense + coerceNumber(amountValue) });
        };
        person.fixedExpenses.forEach(exp => addExpense(exp.date, exp.amount));
        person.categories.forEach(cat => addExpense(cat.date, cat.amount));
      }
      const label = formatMonthKey(key);
      months.push({ key, year, monthIndex, label, incomeTotal, expenseTotal, dailyTotals });
    }
    return months;
  }, [activePersonKey, calculateTotalCategories, calculateTotalFixed, calculateTotalIncome, coerceNumber, currentMonthKey, currentYear, formatMonthKey, monthlyBudgets, selectedYear]);

  const maxCalendarExpense = useMemo(
    () => Math.max(
      0,
      ...calendarMonths.flatMap(month => Array.from(month.dailyTotals.values()).map(item => item.expense))
    ),
    [calendarMonths]
  );
  const maxCalendarIncome = useMemo(
    () => Math.max(
      0,
      ...calendarMonths.flatMap(month => Array.from(month.dailyTotals.values()).map(item => item.income))
    ),
    [calendarMonths]
  );
  const calendarRangeLabel = calendarMonths.length > 0
    ? `${calendarMonths[0].label} - ${calendarMonths[calendarMonths.length - 1].label}`
    : '';

  if (!personKey) {
    return (
      <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-900/40 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
        <div className="text-sm uppercase tracking-wide text-slate-400">{t('reportsLabel')}</div>
        <div className={`mt-2 text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{t('reportsNoLinkedUserLabel')}</div>
      </div>
    );
  }

  if (metrics.monthsCount === 0) {
    return (
      <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-900/40 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
        <div className="text-sm uppercase tracking-wide text-slate-400">{t('reportsLabel')}</div>
        <div className={`mt-2 text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{t('reportsNoDataLabel')}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm uppercase tracking-wide text-slate-400">{t('reportsLabel')}</div>
        {availableYears.length > 0 && (
          <div className="w-40">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className={darkMode ? 'bg-slate-900 border-slate-700 text-slate-100' : 'bg-white border-slate-200 text-slate-700'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year}>
                    {t('reportsYearLabel')} {year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <ReportMetricCard
          title={t('reportsIncomeYtdLabel')}
          subtitle={subtitle}
          value={formatCurrency(metrics.incomeYtd, currencyPreference)}
          tone="income"
          darkMode={darkMode}
        />
        <ReportMetricCard
          title={t('reportsExpensesYtdLabel')}
          subtitle={subtitle}
          value={formatCurrency(metrics.expensesYtd, currencyPreference)}
          tone="expense"
          darkMode={darkMode}
        />
        <ReportMetricCard
          title={t('reportsAvgPerMonthLabel')}
          subtitle={subtitle}
          value={formatCurrency(metrics.avgPerMonth, currencyPreference)}
          tone="expense"
          darkMode={darkMode}
        />
        <ReportMetricCard
          title={t('reportsAvgPerTransactionLabel')}
          subtitle={subtitle}
          value={formatCurrency(metrics.avgPerTransaction, currencyPreference)}
          tone="expense"
          darkMode={darkMode}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <div className="text-sm font-semibold">{t('reportsTrendTitle')}</div>
          <div className="text-xs text-slate-400">{t('reportsTrendSubtitle')}</div>
          <div className="mt-3">
            <ReportLineChart points={monthSeries} darkMode={darkMode} />
            <div className="mt-2 flex items-center gap-4 text-xs text-slate-400">
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-sky-400" /> {t('incomeLabel')}</span>
              <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-rose-400" /> {t('totalExpensesShortLabel')}</span>
            </div>
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <div className="text-sm font-semibold">{t('reportsBalanceTitle')}</div>
          <div className="text-xs text-slate-400">{t('reportsBalanceSubtitle')}</div>
          <div className="mt-3">
            <ReportBarChart points={monthSeries} darkMode={darkMode} />
          </div>
        </div>
      </div>

      <ReportCalendar
        months={calendarMonths}
        darkMode={darkMode}
        language={language}
        rangeLabel={calendarRangeLabel}
        maxExpense={maxCalendarExpense}
        maxIncome={maxCalendarIncome}
        currencyPreference={currencyPreference}
        title={t('reportsCalendarTitle')}
        formatCurrency={formatCurrency}
      />

      <div className={`rounded-2xl border p-4 ${darkMode ? 'bg-slate-900/70 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
        <div className="text-sm font-semibold">{t('reportsTableTitle')}</div>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
              <tr>
                <th className="text-left py-2">{t('reportsTableMonthLabel')}</th>
                <th className="text-right py-2">{t('reportsTableIncomeLabel')}</th>
                <th className="text-right py-2">{t('reportsTableExpensesLabel')}</th>
                <th className="text-right py-2">{t('reportsTableBalanceLabel')}</th>
                <th className="text-right py-2">{t('reportsTableTransactionsLabel')}</th>
              </tr>
            </thead>
            <tbody>
              {monthSeries.map(item => (
                <tr key={item.key} className={darkMode ? 'border-t border-slate-800' : 'border-t border-slate-200'}>
                  <td className="py-2">{formatMonthKey(item.key)}</td>
                  <td className="py-2 text-right">{formatCurrency(item.income, currencyPreference)}</td>
                  <td className="py-2 text-right">{formatCurrency(item.expenses, currencyPreference)}</td>
                  <td className={`py-2 text-right font-semibold ${item.balance >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {formatCurrency(item.balance, currencyPreference)}
                  </td>
                  <td className="py-2 text-right">{item.transactions}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ReportsView;
