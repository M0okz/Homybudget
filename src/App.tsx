import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, Moon, Sun, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react';
import { LanguageCode, MONTH_LABELS, TranslationContext, createTranslator, useTranslation } from './i18n';

interface Category {
  id: string;
  name: string;
  amount: number;
  icon: string;
  isChecked?: boolean;
  isRecurring?: boolean;
  recurringMonths?: number;
  startMonth?: string; // format: "YYYY-MM"
}

interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  isChecked?: boolean;
}

interface IncomeSource {
  id: string;
  name: string;
  amount: number;
}

interface PersonBudget {
  name: string;
  incomeSources: IncomeSource[];
  fixedExpenses: FixedExpense[];
  categories: Category[];
}

interface JointTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'deposit' | 'expense';
  person: string;
}

interface JointAccount {
  initialBalance: number;
  transactions: JointTransaction[];
}

interface BudgetData {
  person1: PersonBudget;
  person2: PersonBudget;
  jointAccount: JointAccount;
  person1UserId?: string | null;
  person2UserId?: string | null;
}

type MonthlyBudget = Record<string, BudgetData>;

type ApiMonth = {
  monthKey: string;
  data: BudgetData;
};

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

type LoginResponse = {
  token: string;
  user: AuthUser;
};

type UsersResponse = {
  users: AuthUser[];
};

type UserResponse = {
  user: AuthUser;
};

type ResetTokenResponse = {
  resetToken: string;
  expiresAt: string;
};

type ApiError = Error & { status?: number };

const getInitialThemePreference = (): 'light' | 'dark' => {
  if (typeof window === 'undefined') {
    return 'light';
  }
  const stored = localStorage.getItem('themePreference');
  return stored === 'dark' ? 'dark' : 'light';
};

const getInitialSortByCost = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return localStorage.getItem('sortByCost') === 'true';
};

const getInitialJointAccountEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return localStorage.getItem('jointAccountEnabled') !== 'false';
};

const getInitialSoloModeEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return false;
  }
  return localStorage.getItem('soloModeEnabled') === 'true';
};

const getInitialLanguagePreference = (): LanguageCode => {
  if (typeof window === 'undefined') {
    return 'fr';
  }
  return localStorage.getItem('languagePreference') === 'en' ? 'en' : 'fr';
};

const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('authToken');
};

const getAuthHeaders = () => {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const createApiError = (message: string, status: number): ApiError => {
  const error = new Error(message) as ApiError;
  error.status = status;
  return error;
};

const parseApiErrorMessage = async (response: Response, fallback: string) => {
  try {
    const data = await response.json();
    if (data && typeof data.error === 'string') {
      return data.error;
    }
  } catch (error) {
    // Ignore JSON parsing errors and use fallback message.
  }
  return fallback;
};

const isAuthError = (error: unknown) => {
  return Boolean(error && typeof error === 'object' && (error as ApiError).status === 401);
};

type PaletteSlot = {
  lightBg: string;
  darkBg: string;
  lightText: string;
  darkText: string;
  swatch: string;
};

type Palette = {
  id: string;
  name: string;
  slots: [PaletteSlot, PaletteSlot, PaletteSlot];
};

const PALETTES: Palette[] = [
  {
    id: 'sage-sky-honey',
    name: 'Sage / Sky / Honey',
    slots: [
      {
        lightBg: '#E7F6EC',
        darkBg: '#0F2A1E',
        lightText: '#1F6F46',
        darkText: '#7BE6A7',
        swatch: '#27A968'
      },
      {
        lightBg: '#E7F0FF',
        darkBg: '#0B2345',
        lightText: '#2155D6',
        darkText: '#9DB7FF',
        swatch: '#3867F0'
      },
      {
        lightBg: '#FFF3D6',
        darkBg: '#3A2B0A',
        lightText: '#B45309',
        darkText: '#FAD38A',
        swatch: '#E2A13A'
      }
    ]
  },
  {
    id: 'teal-citrus-clay',
    name: 'Teal / Citrus / Clay',
    slots: [
      {
        lightBg: '#E0F7F4',
        darkBg: '#0B2F2D',
        lightText: '#0F766E',
        darkText: '#5EEAD4',
        swatch: '#18A89E'
      },
      {
        lightBg: '#F6FFD8',
        darkBg: '#2A340A',
        lightText: '#4D7C0F',
        darkText: '#BEF264',
        swatch: '#8AC926'
      },
      {
        lightBg: '#FEECE0',
        darkBg: '#3B1F12',
        lightText: '#C2410C',
        darkText: '#FDBA74',
        swatch: '#F07F4F'
      }
    ]
  },
  {
    id: 'navy-mint-apricot',
    name: 'Navy / Mint / Apricot',
    slots: [
      {
        lightBg: '#E9EFF9',
        darkBg: '#0B1E3A',
        lightText: '#1D3B8B',
        darkText: '#A5B8FF',
        swatch: '#3454C5'
      },
      {
        lightBg: '#E9FBEF',
        darkBg: '#10351F',
        lightText: '#15803D',
        darkText: '#86EFAC',
        swatch: '#2BB673'
      },
      {
        lightBg: '#FFEADB',
        darkBg: '#3A2212',
        lightText: '#C2410C',
        darkText: '#FDBA74',
        swatch: '#F39C5A'
      }
    ]
  }
];

const getCurrentMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const calculateTotalIncome = (incomeSources: IncomeSource[]) => {
  return incomeSources.reduce((sum, source) => sum + source.amount, 0);
};

const calculateTotalFixed = (expenses: FixedExpense[]) => {
  return expenses.reduce((sum, exp) => sum + exp.amount, 0);
};

const calculateTotalCategories = (categories: Category[]) => {
  return categories.reduce((sum, cat) => sum + cat.amount, 0);
};

const calculateAvailable = (person: PersonBudget) => {
  return calculateTotalIncome(person.incomeSources)
    - calculateTotalFixed(person.fixedExpenses)
    - calculateTotalCategories(person.categories);
};

const parseNumberInput = (rawValue: string) => {
  const trimmed = rawValue.trim();
  if (trimmed === '') {
    return 0;
  }
  const normalized = trimmed.replace(/^0+(?=\d)/, '');
  const parsed = Number(normalized);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const coerceNumber = (value: unknown) => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    return parseNumberInput(value);
  }
  return 0;
};

const useAnimatedNumber = (value: number, duration = 350) => {
  const [animated, setAnimated] = useState(value);
  const animatedRef = useRef(value);

  useEffect(() => {
    animatedRef.current = animated;
  }, [animated]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setAnimated(value);
      animatedRef.current = value;
      return;
    }
    if (!Number.isFinite(value)) {
      setAnimated(0);
      animatedRef.current = 0;
      return;
    }
    const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
      setAnimated(value);
      animatedRef.current = value;
      return;
    }

    const start = animatedRef.current;
    const end = value;
    if (start === end) {
      return;
    }

    const startTime = window.performance?.now?.() ?? Date.now();
    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
    let rafId = 0;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const nextValue = start + (end - start) * easeOutCubic(progress);
      setAnimated(nextValue);
      animatedRef.current = nextValue;
      if (progress < 1) {
        rafId = window.requestAnimationFrame(step);
      } else {
        setAnimated(end);
        animatedRef.current = end;
      }
    };

    rafId = window.requestAnimationFrame(step);
    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [value, duration]);

  return animated;
};

const calculateJointBalanceForData = (budget: BudgetData) => {
  const account = budget.jointAccount;
  if (!account) {
    return 0;
  }
  const startingBalance = coerceNumber(account.initialBalance);
  return (account.transactions ?? []).reduce((balance, transaction) => {
    const amount = coerceNumber(transaction.amount);
    return transaction.type === 'deposit' ? balance + amount : balance - amount;
  }, startingBalance);
};

const normalizeBudgetData = (data: BudgetData): BudgetData => ({
  ...data,
  person1UserId: data.person1UserId ?? null,
  person2UserId: data.person2UserId ?? null,
  person1: {
    ...data.person1,
    incomeSources: (data.person1?.incomeSources ?? []).map(source => ({
      ...source,
      amount: coerceNumber(source.amount)
    })),
    fixedExpenses: (data.person1?.fixedExpenses ?? []).map(expense => ({
      ...expense,
      amount: coerceNumber(expense.amount),
      isChecked: Boolean(expense.isChecked)
    })),
    categories: (data.person1?.categories ?? []).map(category => ({
      ...category,
      amount: coerceNumber(category.amount),
      isChecked: Boolean(category.isChecked)
    }))
  },
  person2: {
    ...data.person2,
    incomeSources: (data.person2?.incomeSources ?? []).map(source => ({
      ...source,
      amount: coerceNumber(source.amount)
    })),
    fixedExpenses: (data.person2?.fixedExpenses ?? []).map(expense => ({
      ...expense,
      amount: coerceNumber(expense.amount),
      isChecked: Boolean(expense.isChecked)
    })),
    categories: (data.person2?.categories ?? []).map(category => ({
      ...category,
      amount: coerceNumber(category.amount),
      isChecked: Boolean(category.isChecked)
    }))
  },
  jointAccount: {
    ...data.jointAccount,
    initialBalance: coerceNumber(data.jointAccount?.initialBalance),
    transactions: (data.jointAccount?.transactions ?? []).map(transaction => ({
      ...transaction,
      amount: coerceNumber(transaction.amount)
    }))
  }
});

const getPaletteById = (paletteId: string) => {
  return PALETTES.find(palette => palette.id === paletteId) ?? PALETTES[0];
};

const applyJointBalanceCarryover = (budgets: MonthlyBudget, startMonthKey: string) => {
  const monthKeys = Object.keys(budgets).sort();
  const startIndex = monthKeys.indexOf(startMonthKey);
  if (startIndex === -1) {
    return budgets;
  }

  const nextBudgets: MonthlyBudget = { ...budgets };
  let runningBalance = calculateJointBalanceForData(nextBudgets[startMonthKey]);

  for (let i = startIndex + 1; i < monthKeys.length; i += 1) {
    const monthKey = monthKeys[i];
    const monthData = nextBudgets[monthKey];
    if (!monthData) {
      continue;
    }
    const updatedMonth: BudgetData = {
      ...monthData,
      jointAccount: {
        ...monthData.jointAccount,
        initialBalance: runningBalance
      }
    };
    nextBudgets[monthKey] = updatedMonth;
    runningBalance = calculateJointBalanceForData(updatedMonth);
  }

  return nextBudgets;
};

const getDefaultBudgetData = (): BudgetData => ({
  person1UserId: null,
  person2UserId: null,
  person1: {
    name: 'Personne 1',
    incomeSources: [
      { id: '1', name: 'Salaire', amount: 2500 }
    ],
    fixedExpenses: [
      { id: '1', name: 'Loyer', amount: 800, isChecked: false },
      { id: '2', name: 'Electricite', amount: 60, isChecked: false }
    ],
    categories: [
      { id: '1', name: 'Alimentation', amount: 300, icon: '🍽️', isChecked: false },
      { id: '2', name: 'Transport', amount: 100, icon: '🚗', isChecked: false },
      { id: '3', name: 'Loisirs', amount: 150, icon: '🎮', isChecked: false }
    ]
  },
  person2: {
    name: 'Personne 2',
    incomeSources: [
      { id: '1', name: 'Salaire', amount: 2800 }
    ],
    fixedExpenses: [
      { id: '1', name: 'Assurance', amount: 120, isChecked: false },
      { id: '2', name: 'Internet', amount: 40, isChecked: false }
    ],
    categories: [
      { id: '1', name: 'Alimentation', amount: 280, icon: '🍽️', isChecked: false },
      { id: '2', name: 'Shopping', amount: 200, icon: '🛍️', isChecked: false },
      { id: '3', name: 'Sport', amount: 80, icon: '⚽', isChecked: false }
    ]
  },
  jointAccount: {
    initialBalance: 0,
    transactions: []
  }
});

const fetchMonths = async (): Promise<ApiMonth[]> => {
  const response = await fetch(apiUrl('/api/months'), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    throw createApiError(`Failed to load months (${response.status})`, response.status);
  }
  const payload = await response.json() as { months?: ApiMonth[] };
  return Array.isArray(payload.months) ? payload.months : [];
};

const upsertMonth = async (monthKey: string, data: BudgetData) => {
  const response = await fetch(apiUrl(`/api/months/${monthKey}`), {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ data })
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    throw createApiError(`Failed to save month (${response.status})`, response.status);
  }
};

const deleteMonth = async (monthKey: string) => {
  const response = await fetch(apiUrl(`/api/months/${monthKey}`), {
    method: 'DELETE',
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    throw createApiError(`Failed to delete month (${response.status})`, response.status);
  }
};

const loginRequest = async (username: string, password: string): Promise<LoginResponse> => {
  const response = await fetch(apiUrl('/api/login'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ username, password })
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to login (${response.status})`);
    throw createApiError(message, response.status);
  }
  return response.json() as Promise<LoginResponse>;
};

const fetchCurrentUser = async (): Promise<AuthUser> => {
  const response = await fetch(apiUrl('/api/users/me'), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to load profile (${response.status})`);
    throw createApiError(message, response.status);
  }
  const payload = await response.json() as UserResponse;
  return payload.user;
};

const fetchUsers = async (): Promise<AuthUser[]> => {
  const response = await fetch(apiUrl('/api/users'), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to load users (${response.status})`);
    throw createApiError(message, response.status);
  }
  const payload = await response.json() as UsersResponse;
  return payload.users;
};

const createUserRequest = async (payload: {
  username: string;
  password: string;
  displayName?: string | null;
  role?: 'admin' | 'user';
}): Promise<AuthUser> => {
  const response = await fetch(apiUrl('/api/users'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to create user (${response.status})`);
    throw createApiError(message, response.status);
  }
  const data = await response.json() as UserResponse;
  return data.user;
};

const updateUserRequest = async (userId: string, payload: {
  displayName?: string | null;
  role?: 'admin' | 'user';
  isActive?: boolean;
}): Promise<AuthUser> => {
  const response = await fetch(apiUrl(`/api/users/${userId}`), {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify(payload)
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to update user (${response.status})`);
    throw createApiError(message, response.status);
  }
  const data = await response.json() as UserResponse;
  return data.user;
};

const resetUserPasswordRequest = async (userId: string): Promise<ResetTokenResponse> => {
  const response = await fetch(apiUrl(`/api/users/${userId}/reset-password`), {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to reset password (${response.status})`);
    throw createApiError(message, response.status);
  }
  return response.json() as Promise<ResetTokenResponse>;
};

const changePasswordRequest = async (currentPassword: string, newPassword: string) => {
  const response = await fetch(apiUrl('/api/auth/change-password'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ currentPassword, newPassword })
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to change password (${response.status})`);
    throw createApiError(message, response.status);
  }
};

type BudgetColumnProps = {
  person: PersonBudget;
  personKey: 'person1' | 'person2';
  darkMode: boolean;
  sortByCost: boolean;
  palette: Palette;
  editingName: string | null;
  tempName: string;
  currentMonthKey: string;
  setTempName: (value: string) => void;
  startEditingName: (personKey: 'person1' | 'person2') => void;
  saveName: (personKey: 'person1' | 'person2') => void;
  cancelEditingName: () => void;
  addIncomeSource: (personKey: 'person1' | 'person2') => void;
  deleteIncomeSource: (personKey: 'person1' | 'person2', id: string) => void;
  updateIncomeSource: (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount', value: string | number) => void;
  addFixedExpense: (personKey: 'person1' | 'person2') => void;
  deleteFixedExpense: (personKey: 'person1' | 'person2', id: string) => void;
  updateFixedExpense: (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount' | 'isChecked', value: string | number | boolean) => void;
  moveFixedExpense: (personKey: 'person1' | 'person2', id: string, direction: 'up' | 'down') => void;
  addCategory: (personKey: 'person1' | 'person2') => void;
  deleteCategory: (personKey: 'person1' | 'person2', id: string) => void;
  updateCategory: (personKey: 'person1' | 'person2', id: string, field: keyof Category, value: string | number | boolean) => void;
  moveCategory: (personKey: 'person1' | 'person2', id: string, direction: 'up' | 'down') => void;
};

type BudgetHeaderSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'darkMode'
  | 'palette'
  | 'addIncomeSource'
  | 'deleteIncomeSource'
  | 'updateIncomeSource'
>;

type BudgetFixedSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'darkMode'
  | 'sortByCost'
  | 'palette'
  | 'addFixedExpense'
  | 'deleteFixedExpense'
  | 'updateFixedExpense'
  | 'moveFixedExpense'
>;

type BudgetFreeSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'darkMode'
  | 'sortByCost'
  | 'palette'
  | 'currentMonthKey'
  | 'addCategory'
  | 'deleteCategory'
  | 'updateCategory'
  | 'moveCategory'
>;

type PersonColumnHeaderProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'darkMode'
  | 'editingName'
  | 'tempName'
  | 'setTempName'
  | 'startEditingName'
  | 'saveName'
  | 'cancelEditingName'
>;

const PersonColumnHeader = ({
  person,
  personKey,
  darkMode,
  editingName,
  tempName,
  setTempName,
  startEditingName,
  saveName,
  cancelEditingName,
  isLinked
}: PersonColumnHeaderProps & { isLinked: boolean }) => (
  <div className="flex items-center justify-between sm:justify-center">
    {editingName === personKey && !isLinked ? (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          className={`px-2 py-1 border rounded text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
        />
        <button onClick={() => saveName(personKey)} className={darkMode ? 'text-white' : 'text-gray-800'}>
          <Check size={16} />
        </button>
        <button onClick={cancelEditingName} className="text-red-600">
          <X size={16} />
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <h2 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
          {person.name}
        </h2>
        {!isLinked && (
          <button onClick={() => startEditingName(personKey)} className={darkMode ? 'text-gray-200' : 'text-gray-700'}>
            <Edit2 size={16} />
          </button>
        )}
      </div>
    )}
  </div>
);

const BudgetHeaderSection = ({
  person,
  personKey,
  darkMode,
  palette,
  addIncomeSource,
  deleteIncomeSource,
  updateIncomeSource
}: BudgetHeaderSectionProps) => {
  const { t } = useTranslation();
  const available = calculateAvailable(person);
  const totalFixed = calculateTotalFixed(person.fixedExpenses);
  const totalCategories = calculateTotalCategories(person.categories);
  const totalIncome = calculateTotalIncome(person.incomeSources);
  const totalExpenses = totalFixed + totalCategories;
  const animatedIncome = useAnimatedNumber(totalIncome);
  const animatedExpenses = useAnimatedNumber(totalExpenses);
  const animatedAvailable = useAnimatedNumber(available);
  const [availableColors] = palette.slots;
  const availableBgStyle = { backgroundColor: darkMode ? availableColors.darkBg : availableColors.lightBg };
  const availableTextStyle = { color: darkMode ? availableColors.darkText : availableColors.lightText };

  return (
    <div className="min-w-0 rounded-lg p-4 mb-4 flex flex-col sm:h-full" style={availableBgStyle}>
      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold" style={availableTextStyle}>{t('incomeLabel')}:</span>
          <button onClick={() => addIncomeSource(personKey)} style={availableTextStyle}>
            <Plus size={16} />
          </button>
        </div>
        <div className="space-y-2">
          {person.incomeSources.map(source => (
            <div key={source.id} className={`flex flex-wrap items-center gap-2 ${darkMode ? 'bg-gray-800' : 'bg-white'} p-2 rounded`}>
              <input
                type="text"
                value={source.name}
                onChange={(e) => updateIncomeSource(personKey, source.id, 'name', e.target.value)}
                className={`flex-1 min-w-[10rem] px-2 py-1 border rounded text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                placeholder={t('incomePlaceholder')}
              />
              <input
                type="number"
                value={coerceNumber(source.amount)}
                onChange={(e) => updateIncomeSource(personKey, source.id, 'amount', parseNumberInput(e.target.value))}
                className={`w-24 flex-none px-2 py-1 border rounded text-right text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
              />
              <button onClick={() => deleteIncomeSource(personKey, source.id)} className="text-red-500">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className={`mt-auto space-y-1 text-sm border-t pt-2 ${darkMode ? 'border-gray-600' : ''}`}>
        <div className="flex justify-between">
          <span className={darkMode ? 'text-gray-300' : ''}>{t('totalIncomeLabel')}:</span>
          <span className={`font-semibold ${darkMode ? 'text-gray-100' : ''}`}>{animatedIncome.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between">
          <span className={darkMode ? 'text-gray-300' : ''}>{t('totalExpensesLabel')}:</span>
          <span className={`font-semibold ${darkMode ? 'text-gray-100' : ''}`}>{animatedExpenses.toFixed(2)} €</span>
        </div>
        <div className="flex justify-between font-bold" style={availableTextStyle}>
          <span>{t('availableLabel')}:</span>
          <span className={available < 0 ? 'text-red-600' : ''}>{animatedAvailable.toFixed(2)} €</span>
        </div>
      </div>
    </div>
  );
};

const BudgetFixedSection = ({
  person,
  personKey,
  darkMode,
  sortByCost,
  palette,
  addFixedExpense,
  deleteFixedExpense,
  updateFixedExpense,
  moveFixedExpense
}: BudgetFixedSectionProps) => {
  const { t } = useTranslation();
  const totalFixed = calculateTotalFixed(person.fixedExpenses);
  const animatedTotalFixed = useAnimatedNumber(totalFixed);
  const orderedExpenses = sortByCost
    ? [...person.fixedExpenses].sort((a, b) => {
        const amountDiff = coerceNumber(b.amount) - coerceNumber(a.amount);
        if (amountDiff !== 0) {
          return amountDiff;
        }
        const nameDiff = a.name.localeCompare(b.name);
        return nameDiff !== 0 ? nameDiff : a.id.localeCompare(b.id);
      })
    : person.fixedExpenses;
  const fixedColors = palette.slots[1];
  const fixedBgStyle = { backgroundColor: darkMode ? fixedColors.darkBg : fixedColors.lightBg };
  const fixedTextStyle = { color: darkMode ? fixedColors.darkText : fixedColors.lightText };

  return (
    <div className="min-w-0 rounded-lg p-4 mb-4 flex flex-col sm:h-full" style={fixedBgStyle}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold" style={fixedTextStyle}>{t('fixedMoneyLabel')}</h3>
      </div>
      <div className="space-y-2">
        {orderedExpenses.length === 0 ? (
          <div className={`flex items-center justify-end ${darkMode ? 'bg-gray-800' : 'bg-white'} p-2 rounded`}>
            <button
              type="button"
              onClick={() => addFixedExpense(personKey)}
              className={`inline-flex items-center gap-1 text-sm font-semibold ${darkMode ? 'text-green-300' : 'text-green-600'}`}
            >
              <Plus size={16} />
              {t('addLabel')}
            </button>
          </div>
        ) : (
          orderedExpenses.map((expense, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedExpenses.length - 1;
            return (
              <div key={expense.id} className={`flex flex-wrap items-center gap-2 ${darkMode ? 'bg-gray-800' : 'bg-white'} p-2 rounded`}>
                <input
                  type="checkbox"
                  checked={expense.isChecked || false}
                  onChange={(e) => updateFixedExpense(personKey, expense.id, 'isChecked', e.target.checked)}
                  className="h-4 w-4"
                  aria-label={t('validateExpenseLabel')}
                />
                <input
                  type="text"
                  value={expense.name}
                  onChange={(e) => updateFixedExpense(personKey, expense.id, 'name', e.target.value)}
                  className={`flex-1 min-w-[10rem] px-2 py-1 border rounded text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                />
                <input
                  type="number"
                  value={coerceNumber(expense.amount)}
                  onChange={(e) => updateFixedExpense(personKey, expense.id, 'amount', parseNumberInput(e.target.value))}
                  className={`w-20 flex-none px-2 py-1 border rounded text-right text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                />
                <div className="flex items-center gap-1 ml-auto">
                  <button
                    type="button"
                    onClick={() => moveFixedExpense(personKey, expense.id, 'up')}
                    disabled={sortByCost || isFirst}
                    className={`p-1 rounded ${sortByCost || isFirst ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}
                    aria-label={t('moveUpLabel')}
                  >
                    <ChevronUp size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveFixedExpense(personKey, expense.id, 'down')}
                    disabled={sortByCost || isLast}
                    className={`p-1 rounded ${sortByCost || isLast ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}
                    aria-label={t('moveDownLabel')}
                  >
                    <ChevronDown size={14} />
                  </button>
                  <button onClick={() => deleteFixedExpense(personKey, expense.id)} className="text-red-500">
                    <Trash2 size={14} />
                  </button>
                  {isLast && (
                    <button
                      type="button"
                      onClick={() => addFixedExpense(personKey)}
                      className={`${darkMode ? 'text-green-300' : 'text-green-600'}`}
                      aria-label={t('addRowLabel')}
                    >
                      <Plus size={16} />
                    </button>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={`mt-3 pt-3 flex justify-between border-t text-base font-semibold ${darkMode ? 'border-gray-700 text-white' : 'border-gray-200 text-black'} sm:mt-auto`}>
        <span>{t('totalExpensesShortLabel')}:</span>
        <span>{animatedTotalFixed.toFixed(2)} €</span>
      </div>
    </div>
  );
};

const BudgetFreeSection = ({
  person,
  personKey,
  darkMode,
  sortByCost,
  palette,
  currentMonthKey,
  addCategory,
  deleteCategory,
  updateCategory,
  moveCategory
}: BudgetFreeSectionProps) => {
  const { t } = useTranslation();
  const totalCategories = calculateTotalCategories(person.categories);
  const animatedTotalCategories = useAnimatedNumber(totalCategories);
  const orderedCategories = sortByCost
    ? [...person.categories].sort((a, b) => {
        const amountDiff = coerceNumber(b.amount) - coerceNumber(a.amount);
        if (amountDiff !== 0) {
          return amountDiff;
        }
        const nameDiff = a.name.localeCompare(b.name);
        return nameDiff !== 0 ? nameDiff : a.id.localeCompare(b.id);
      })
    : person.categories;
  const freeColors = palette.slots[2];
  const freeBgStyle = { backgroundColor: darkMode ? freeColors.darkBg : freeColors.lightBg };
  const freeTextStyle = { color: darkMode ? freeColors.darkText : freeColors.lightText };

  return (
    <div className="min-w-0 rounded-lg p-4 mb-4 flex flex-col sm:h-full" style={freeBgStyle}>
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-bold" style={freeTextStyle}>{t('freeMoneyLabel')}</h3>
      </div>
      <div className="space-y-2">
        {orderedCategories.length === 0 ? (
          <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} p-2 rounded`}>
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => addCategory(personKey)}
                className={`inline-flex items-center gap-1 text-sm font-semibold ${darkMode ? 'text-green-300' : 'text-green-600'}`}
              >
                <Plus size={16} />
                {t('addLabel')}
              </button>
            </div>
          </div>
        ) : (
          orderedCategories.map((category, index) => {
            const isFirst = index === 0;
            const isLast = index === orderedCategories.length - 1;
            return (
              <div key={category.id} className={`${darkMode ? 'bg-gray-800' : 'bg-white'} p-2 rounded`}>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    checked={category.isChecked || false}
                    onChange={(e) => updateCategory(personKey, category.id, 'isChecked', e.target.checked)}
                    className="h-4 w-4"
                    aria-label={t('validateExpenseLabel')}
                  />
                  <input
                    type="text"
                    value={category.icon}
                    onChange={(e) => updateCategory(personKey, category.id, 'icon', e.target.value)}
                    className={`w-10 px-2 py-1 border rounded text-center text-sm ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}
                  />
                  <input
                    type="text"
                    value={category.name}
                    onChange={(e) => updateCategory(personKey, category.id, 'name', e.target.value)}
                    className={`flex-1 min-w-[10rem] px-2 py-1 border rounded text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                  />
                  <input
                    type="number"
                    value={coerceNumber(category.amount)}
                    onChange={(e) => updateCategory(personKey, category.id, 'amount', parseNumberInput(e.target.value))}
                    className={`w-20 flex-none px-2 py-1 border rounded text-right text-sm ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                  />
                  <div className="flex items-center gap-1 ml-auto">
                    <button
                      type="button"
                      onClick={() => moveCategory(personKey, category.id, 'up')}
                      disabled={sortByCost || isFirst}
                      className={`p-1 rounded ${sortByCost || isFirst ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}
                      aria-label={t('moveUpLabel')}
                    >
                      <ChevronUp size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveCategory(personKey, category.id, 'down')}
                      disabled={sortByCost || isLast}
                      className={`p-1 rounded ${sortByCost || isLast ? 'opacity-40 cursor-not-allowed' : ''} ${darkMode ? 'text-gray-200' : 'text-gray-600'}`}
                      aria-label={t('moveDownLabel')}
                    >
                      <ChevronDown size={14} />
                    </button>
                    <button onClick={() => deleteCategory(personKey, category.id)} className="text-red-500">
                      <Trash2 size={14} />
                    </button>
                    {isLast && (
                      <button
                        type="button"
                        onClick={() => addCategory(personKey)}
                        className={`${darkMode ? 'text-green-300' : 'text-green-600'}`}
                        aria-label={t('addRowLabel')}
                      >
                        <Plus size={16} />
                      </button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:gap-3 ml-0 sm:ml-12">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={category.isRecurring || false}
                      onChange={(e) => updateCategory(personKey, category.id, 'isRecurring', e.target.checked)}
                      className="cursor-pointer"
                    />
                    <span className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{t('installmentLabel')}</span>
                  </label>

                  {category.isRecurring && (
                    <>
                      <select
                        value={category.recurringMonths || 3}
                        onChange={(e) => updateCategory(personKey, category.id, 'recurringMonths', parseInt(e.target.value, 10))}
                        className={`px-2 py-1 border rounded text-xs ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                      >
                        <option value={2}>2x</option>
                        <option value={3}>3x</option>
                        <option value={4}>4x</option>
                        <option value={5}>5x</option>
                        <option value={6}>6x</option>
                        <option value={12}>12x</option>
                      </select>
                      <span className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        {t('startLabel')}: {category.startMonth || currentMonthKey}
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
      <div className={`mt-3 pt-3 flex justify-between border-t text-base font-semibold ${darkMode ? 'border-gray-700 text-white' : 'border-gray-200 text-black'} sm:mt-auto`}>
        <span>{t('totalExpensesShortLabel')}:</span>
        <span>{animatedTotalCategories.toFixed(2)} €</span>
      </div>
    </div>
  );
};

const BudgetColumn = ({
  person,
  personKey,
  darkMode,
  sortByCost,
  palette,
  editingName,
  tempName,
  currentMonthKey,
  setTempName,
  startEditingName,
  saveName,
  cancelEditingName,
  addIncomeSource,
  deleteIncomeSource,
  updateIncomeSource,
  addFixedExpense,
  deleteFixedExpense,
  updateFixedExpense,
  moveFixedExpense,
  addCategory,
  deleteCategory,
  updateCategory,
  moveCategory
}: BudgetColumnProps) => (
  <div className="flex-1 min-w-0">
    <BudgetHeaderSection
      person={person}
      personKey={personKey}
      darkMode={darkMode}
      palette={palette}
      addIncomeSource={addIncomeSource}
      deleteIncomeSource={deleteIncomeSource}
      updateIncomeSource={updateIncomeSource}
    />
    <BudgetFixedSection
      person={person}
      personKey={personKey}
      darkMode={darkMode}
      sortByCost={sortByCost}
      palette={palette}
      addFixedExpense={addFixedExpense}
      deleteFixedExpense={deleteFixedExpense}
      updateFixedExpense={updateFixedExpense}
      moveFixedExpense={moveFixedExpense}
    />
    <BudgetFreeSection
      person={person}
      personKey={personKey}
      darkMode={darkMode}
      sortByCost={sortByCost}
      palette={palette}
      currentMonthKey={currentMonthKey}
      addCategory={addCategory}
      deleteCategory={deleteCategory}
      updateCategory={updateCategory}
      moveCategory={moveCategory}
    />
  </div>
);

type PaletteSelectorProps = {
  palettes: Palette[];
  value: string;
  onChange: (paletteId: string) => void;
  darkMode: boolean;
};

const PaletteSelector = ({ palettes, value, onChange, darkMode }: PaletteSelectorProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedPalette = palettes.find(palette => palette.id === value) ?? palettes[0];
  const otherPalettes = palettes.filter(palette => palette.id !== selectedPalette?.id);

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!containerRef.current) {
        return;
      }
      if (containerRef.current.contains(event.target as Node)) {
        return;
      }
      setIsOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [isOpen]);

  const handleSelect = (paletteId: string) => {
    onChange(paletteId);
    setIsOpen(false);
  };

  if (!selectedPalette) {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(prev => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex items-center gap-1.5 px-2 py-1.5 rounded-xl border shadow-sm backdrop-blur-sm transition ${
          darkMode ? 'bg-slate-900/70 border-slate-700/60' : 'bg-white/80 border-slate-200'
        }`}
      >
        <span className="flex items-center gap-1">
          {selectedPalette.slots.map((slot, index) => (
            <span
              key={`${selectedPalette.id}-${index}`}
              className="h-2.5 w-2.5 rounded-[3px]"
              style={{ backgroundColor: slot.swatch }}
            />
          ))}
        </span>
      </button>
      {isOpen && (
        <div className="absolute left-1/2 top-full mt-2 -translate-x-1/2 z-10">
          <div
            className={`palette-pop relative rounded-xl border px-2 py-2 shadow-lg ${
              darkMode ? 'bg-slate-900/95 border-slate-700/70 text-white' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <span
              className={`absolute left-1/2 -top-1 h-2 w-2 -translate-x-1/2 rotate-45 border ${
                darkMode ? 'bg-slate-900 border-slate-700/70' : 'bg-white border-slate-200'
              }`}
            />
            {otherPalettes.length === 0 ? (
              <div className="px-2 py-1 text-xs">{t('noOtherPaletteLabel')}</div>
            ) : (
              <div className="flex items-center gap-2">
                {otherPalettes.map(palette => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => handleSelect(palette.id)}
                    title={palette.name}
                    aria-label={palette.name}
                    className={`flex items-center gap-1 px-2 py-1 rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700/70 hover:border-slate-500/80 focus-visible:ring-slate-200/70 focus-visible:ring-offset-slate-900'
                        : 'bg-white border-slate-200 hover:border-slate-300 focus-visible:ring-slate-300 focus-visible:ring-offset-white'
                    }`}
                  >
                    {palette.slots.map((slot, index) => (
                      <span
                        key={`${palette.id}-${index}`}
                        className="h-2.5 w-2.5 rounded-[3px]"
                        style={{ backgroundColor: slot.swatch }}
                      />
                    ))}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

type LoginScreenProps = {
  onLogin: (username: string, password: string) => Promise<void> | void;
  error: string | null;
  loading: boolean;
  darkMode: boolean;
  pageStyle: React.CSSProperties;
};

const LoginScreen = ({ onLogin, error, loading, darkMode, pageStyle }: LoginScreenProps) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onLogin(username.trim(), password);
  };

  return (
    <div
      className={`min-h-screen p-6 flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
      style={pageStyle}
    >
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm rounded-2xl border shadow-lg p-6 space-y-4 ${
          darkMode ? 'bg-gray-900/90 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
        }`}
      >
        <div className="space-y-1">
          <p className="text-sm uppercase tracking-wide text-gray-500">{t('appName')}</p>
          <h1 className="text-2xl font-semibold">{t('loginTitle')}</h1>
        </div>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="login-username">{t('loginUsernameLabel')}</label>
            <input
              id="login-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
              placeholder="admin"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="login-password">{t('loginPasswordLabel')}</label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
              placeholder="********"
            />
          </div>
        </div>

        {error && (
          <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded-md font-semibold transition ${
            darkMode
              ? 'bg-slate-200 text-slate-900 hover:bg-white'
              : 'bg-slate-900 text-white hover:bg-slate-800'
          } ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {loading ? t('loginLoading') : t('loginButton')}
        </button>
      </form>
    </div>
  );
};

type SettingsViewProps = {
  user: AuthUser | null;
  fallbackUsername: string;
  darkMode: boolean;
  onLogout: () => void;
  onAuthFailure: (error: unknown) => boolean;
  sortByCost: boolean;
  onToggleSortByCost: (value: boolean) => void;
  themePreference: 'light' | 'dark';
  onThemePreferenceChange: (value: 'light' | 'dark') => void;
  languagePreference: LanguageCode;
  onLanguagePreferenceChange: (value: LanguageCode) => void;
  jointAccountEnabled: boolean;
  onToggleJointAccountEnabled: (value: boolean) => void;
  soloModeEnabled: boolean;
  onToggleSoloModeEnabled: (value: boolean) => void;
  person1UserId: string | null;
  person2UserId: string | null;
  onPersonLinkChange: (personKey: 'person1' | 'person2', user: AuthUser | null) => void;
};

const SettingsView = ({
  user,
  fallbackUsername,
  darkMode,
  onLogout,
  onAuthFailure,
  sortByCost,
  onToggleSortByCost,
  themePreference,
  onThemePreferenceChange,
  languagePreference,
  onLanguagePreferenceChange,
  jointAccountEnabled,
  onToggleJointAccountEnabled,
  soloModeEnabled,
  onToggleSoloModeEnabled,
  person1UserId,
  person2UserId,
  onPersonLinkChange
}: SettingsViewProps) => {
  const { t, language } = useTranslation();
  const displayName = user?.displayName || user?.username || fallbackUsername || 'admin';
  const roleDisplay = user?.role === 'admin' ? t('roleAdminLabel') : t('roleUserLabel');
  const isAdmin = user?.role === 'admin';
  const currentUserId = user?.id;
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [resetInfo, setResetInfo] = useState<{ userId: string; token: string; expiresAt: string } | null>(null);
  const [createForm, setCreateForm] = useState({
    username: '',
    displayName: '',
    password: '',
    confirmPassword: '',
    role: 'user' as 'user' | 'admin'
  });
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);
  const [createLoading, setCreateLoading] = useState(false);
  const makeUserLabel = (item: AuthUser) => item.displayName || item.username;

  const formatTimestamp = (value: string | null) => {
    if (!value) {
      return '-';
    }
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) {
      return '-';
    }
    return parsed.toLocaleString(language === 'en' ? 'en-US' : 'fr-FR');
  };

  const resolveErrorMessage = (error: unknown, fallback: string) => {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return fallback;
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError(null);
    try {
      const list = await fetchUsers();
      setUsers(list);
    } catch (error) {
      if (!onAuthFailure(error)) {
        setUsersError(resolveErrorMessage(error, t('userLoadError')));
      }
    } finally {
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) {
      void loadUsers();
    }
  }, [isAdmin]);

  const handleChangePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);
    if (!passwordForm.current || !passwordForm.next) {
      setPasswordError(t('passwordRequiredError'));
      return;
    }
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError(t('passwordMismatchError'));
      return;
    }
    setPasswordLoading(true);
    try {
      await changePasswordRequest(passwordForm.current, passwordForm.next);
      setPasswordForm({ current: '', next: '', confirm: '' });
      setPasswordSuccess(t('passwordUpdatedSuccess'));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setPasswordError(resolveErrorMessage(error, t('passwordChangeError')));
      }
    } finally {
      setPasswordLoading(false);
    }
  };

  const handleCreateUser = async (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    const username = createForm.username.trim();
    if (!username || !createForm.password) {
      setCreateError(t('userCreateRequiredError'));
      return;
    }
    if (createForm.password !== createForm.confirmPassword) {
      setCreateError(t('userCreateMismatchError'));
      return;
    }
    setCreateLoading(true);
    try {
      const newUser = await createUserRequest({
        username,
        password: createForm.password,
        displayName: createForm.displayName.trim() ? createForm.displayName.trim() : null,
        role: createForm.role
      });
      setUsers(prev => [...prev, newUser].sort((a, b) => a.username.localeCompare(b.username)));
      setCreateForm({
        username: '',
        displayName: '',
        password: '',
        confirmPassword: '',
        role: 'user'
      });
      setCreateSuccess(t('userCreateSuccess'));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setCreateError(resolveErrorMessage(error, t('userCreateError')));
      }
    } finally {
      setCreateLoading(false);
    }
  };

  const handleRoleChange = async (userId: string, role: 'admin' | 'user') => {
    setUserActionId(userId);
    setUsersError(null);
    try {
      const updated = await updateUserRequest(userId, { role });
      setUsers(prev => prev.map(item => (item.id === userId ? updated : item)));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setUsersError(resolveErrorMessage(error, t('userRoleUpdateError')));
      }
    } finally {
      setUserActionId(null);
    }
  };

  const handleActiveChange = async (userId: string, isActive: boolean) => {
    setUserActionId(userId);
    setUsersError(null);
    try {
      const updated = await updateUserRequest(userId, { isActive });
      setUsers(prev => prev.map(item => (item.id === userId ? updated : item)));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setUsersError(resolveErrorMessage(error, t('userStatusUpdateError')));
      }
    } finally {
      setUserActionId(null);
    }
  };

  const handleResetPassword = async (userId: string) => {
    setUserActionId(userId);
    setUsersError(null);
    try {
      const result = await resetUserPasswordRequest(userId);
      setResetInfo({ userId, token: result.resetToken, expiresAt: result.expiresAt });
    } catch (error) {
      if (!onAuthFailure(error)) {
        setUsersError(resolveErrorMessage(error, t('resetTokenError')));
      }
    } finally {
      setUserActionId(null);
    }
  };

  return (
    <div
      className={`w-full max-w-5xl rounded-2xl border shadow-sm p-6 ${
        darkMode ? 'bg-gray-900/80 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-900'
      }`}
    >
      <h2 className="text-xl font-semibold mb-4">{t('settingsLabel')}</h2>
    <div className="space-y-6">
      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('profileTitle')}</h3>
          <div className="space-y-3">
            <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
              <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>{t('userLabel')}</span>
              <span className="font-semibold">{displayName}</span>
            </div>
            <div className={`flex items-center justify-between rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
              <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>{t('roleLabel')}</span>
              <span className="font-semibold">{roleDisplay}</span>
            </div>
          </div>
      </section>

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('settingsSectionTitle')}</h3>
        <div className="space-y-3">
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
            <div>
              <div className="font-semibold">{t('sortExpensesLabel')}</div>
              <div className={darkMode ? 'text-gray-400 text-xs' : 'text-gray-500 text-xs'}>
                {t('fixedFreeLabel')}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={sortByCost}
                onChange={(event) => onToggleSortByCost(event.target.checked)}
              />
              <span>{sortByCost ? t('activeLabel') : t('inactiveLabel')}</span>
            </label>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
            <div>
              <div className="font-semibold">{t('jointAccountSettingLabel')}</div>
              <div className={darkMode ? 'text-gray-400 text-xs' : 'text-gray-500 text-xs'}>
                {t('jointAccountSettingHint')}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={jointAccountEnabled}
                onChange={(event) => onToggleJointAccountEnabled(event.target.checked)}
              />
              <span>{jointAccountEnabled ? t('activeLabel') : t('inactiveLabel')}</span>
            </label>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
            <div>
              <div className="font-semibold">{t('soloModeSettingLabel')}</div>
              <div className={darkMode ? 'text-gray-400 text-xs' : 'text-gray-500 text-xs'}>
                {t('soloModeSettingHint')}
              </div>
            </div>
            <label className="inline-flex items-center gap-2 text-sm font-semibold">
              <input
                type="checkbox"
                checked={soloModeEnabled}
                onChange={(event) => onToggleSoloModeEnabled(event.target.checked)}
              />
              <span>{soloModeEnabled ? t('activeLabel') : t('inactiveLabel')}</span>
            </label>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
            <div className="font-semibold">{t('defaultModeLabel')}</div>
            <select
              value={themePreference}
              onChange={(event) => onThemePreferenceChange(event.target.value === 'dark' ? 'dark' : 'light')}
              className={`px-3 py-1.5 rounded-md border text-sm font-semibold ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            >
              <option value="light">{t('lightLabel')}</option>
              <option value="dark">{t('darkLabel')}</option>
            </select>
          </div>
          <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
            <div className="font-semibold">{t('languageLabel')}</div>
            <select
              value={languagePreference}
              onChange={(event) => onLanguagePreferenceChange(event.target.value === 'en' ? 'en' : 'fr')}
              className={`px-3 py-1.5 rounded-md border text-sm font-semibold ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
            >
              <option value="fr">{t('frenchLabel')}</option>
              <option value="en">{t('englishLabel')}</option>
            </select>
          </div>
          <div className={`rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
            {t('moreSettingsSoon')}
          </div>
        </div>
      </section>

      {isAdmin && (
        <section className="space-y-3">
          <h3 className="text-lg font-semibold">{t('personLinkSectionTitle')}</h3>
          <div className="space-y-3">
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
              <div className="font-semibold">{t('person1Label')}</div>
              <select
                value={person1UserId ?? ''}
                onChange={(event) => {
                  const selected = users.find(item => item.id === event.target.value) ?? null;
                  onPersonLinkChange('person1', selected);
                }}
                disabled={usersLoading}
                className={`min-w-[12rem] px-3 py-1.5 rounded-md border text-sm font-semibold ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
              >
                <option value="">{t('unassignedLabel')}</option>
                {users.map(item => {
                  const isDisabled = (!item.isActive) || (item.id === person2UserId && item.id !== person1UserId);
                  const label = makeUserLabel(item);
                  return (
                    <option key={item.id} value={item.id} disabled={isDisabled}>
                      {item.isActive ? label : `${label} (${t('inactiveLabel')})`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200'}`}>
              <div className="font-semibold">{t('person2Label')}</div>
              <select
                value={person2UserId ?? ''}
                onChange={(event) => {
                  const selected = users.find(item => item.id === event.target.value) ?? null;
                  onPersonLinkChange('person2', selected);
                }}
                disabled={usersLoading}
                className={`min-w-[12rem] px-3 py-1.5 rounded-md border text-sm font-semibold ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
              >
                <option value="">{t('unassignedLabel')}</option>
                {users.map(item => {
                  const isDisabled = (!item.isActive) || (item.id === person1UserId && item.id !== person2UserId);
                  const label = makeUserLabel(item);
                  return (
                    <option key={item.id} value={item.id} disabled={isDisabled}>
                      {item.isActive ? label : `${label} (${t('inactiveLabel')})`}
                    </option>
                  );
                })}
              </select>
            </div>
            <div className={`rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-400' : 'border-gray-200 text-gray-500'}`}>
              {usersLoading ? t('loadingUsers') : t('personLinkSectionHint')}
            </div>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="text-lg font-semibold">{t('changePasswordTitle')}</h3>
          <form onSubmit={handleChangePassword} className="space-y-3">
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <input
                type="password"
                autoComplete="current-password"
                value={passwordForm.current}
                onChange={(event) => setPasswordForm(prev => ({ ...prev, current: event.target.value }))}
                className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                placeholder={t('currentPasswordPlaceholder')}
              />
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.next}
                onChange={(event) => setPasswordForm(prev => ({ ...prev, next: event.target.value }))}
                className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                placeholder={t('newPasswordPlaceholder')}
              />
              <input
                type="password"
                autoComplete="new-password"
                value={passwordForm.confirm}
                onChange={(event) => setPasswordForm(prev => ({ ...prev, confirm: event.target.value }))}
                className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                placeholder={t('confirmPasswordPlaceholder')}
              />
            </div>
            {passwordError && (
              <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                {passwordError}
              </div>
            )}
            {passwordSuccess && (
              <div className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                {passwordSuccess}
              </div>
            )}
            <button
              type="submit"
              disabled={passwordLoading}
              className={`px-4 py-2 rounded-md font-semibold transition ${
                darkMode
                  ? 'bg-slate-200 text-slate-900 hover:bg-white'
                  : 'bg-slate-900 text-white hover:bg-slate-800'
              } ${passwordLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {passwordLoading ? t('updatingButton') : t('updateButton')}
            </button>
          </form>
        </section>

        {isAdmin && (
          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">{t('userManagementTitle')}</h3>
              <button
                type="button"
                onClick={() => void loadUsers()}
                disabled={usersLoading}
                className={`px-3 py-1.5 rounded-md text-sm font-semibold border ${
                  darkMode ? 'border-gray-700 text-gray-100 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                } ${usersLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {t('refreshButton')}
              </button>
            </div>

            <form onSubmit={handleCreateUser} className={`rounded-lg border p-4 space-y-3 ${darkMode ? 'border-gray-800 bg-gray-900/60' : 'border-gray-200 bg-gray-50'}`}>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                <input
                  type="text"
                  value={createForm.username}
                  onChange={(event) => setCreateForm(prev => ({ ...prev, username: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                  placeholder={t('createUserUsernamePlaceholder')}
                />
                <input
                  type="text"
                  value={createForm.displayName}
                  onChange={(event) => setCreateForm(prev => ({ ...prev, displayName: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                  placeholder={t('createUserDisplayNamePlaceholder')}
                />
              </div>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  type="password"
                  value={createForm.password}
                  onChange={(event) => setCreateForm(prev => ({ ...prev, password: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                  placeholder={t('createUserPasswordPlaceholder')}
                />
                <input
                  type="password"
                  value={createForm.confirmPassword}
                  onChange={(event) => setCreateForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                  placeholder={t('createUserConfirmPlaceholder')}
                />
                <select
                  value={createForm.role}
                  onChange={(event) => setCreateForm(prev => ({ ...prev, role: event.target.value === 'admin' ? 'admin' : 'user' }))}
                  className={`w-full px-3 py-2 rounded-md border text-sm ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
                >
                  <option value="user">{t('roleUserLabel')}</option>
                  <option value="admin">{t('roleAdminLabel')}</option>
                </select>
              </div>
              {createError && (
                <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {createError}
                </div>
              )}
              {createSuccess && (
                <div className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                  {createSuccess}
                </div>
              )}
              <button
                type="submit"
                disabled={createLoading}
                className={`px-4 py-2 rounded-md font-semibold transition ${
                  darkMode
                    ? 'bg-slate-200 text-slate-900 hover:bg-white'
                    : 'bg-slate-900 text-white hover:bg-slate-800'
                } ${createLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {createLoading ? t('creatingUserButton') : t('createUserButton')}
              </button>
            </form>

            {resetInfo && (
              <div className={`rounded-lg border px-4 py-3 text-sm ${darkMode ? 'border-gray-800 text-gray-200' : 'border-gray-200 text-gray-700'}`}>
                <div className="font-semibold mb-1">{t('resetTokenTitle')}</div>
                <div className="break-all">{resetInfo.token}</div>
                <div className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {t('expiresOnLabel')} {formatTimestamp(resetInfo.expiresAt)}
                </div>
              </div>
            )}

            <div className={`rounded-lg border ${darkMode ? 'border-gray-800' : 'border-gray-200'}`}>
              <div className="p-4">
                {usersLoading ? (
                  <div className="text-sm">{t('loadingUsers')}</div>
                ) : users.length === 0 ? (
                  <div className="text-sm">{t('noUsers')}</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className={darkMode ? 'text-gray-400' : 'text-gray-500'}>
                          <th className="text-left font-medium py-2">{t('accountLabel')}</th>
                          <th className="text-left font-medium py-2">{t('roleLabel')}</th>
                          <th className="text-left font-medium py-2">{t('statusLabel')}</th>
                          <th className="text-left font-medium py-2">{t('lastLoginLabel')}</th>
                          <th className="text-left font-medium py-2">{t('actionsLabel')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {users.map(item => {
                          const isSelf = item.id === currentUserId;
                          return (
                            <tr key={item.id} className={darkMode ? 'border-t border-gray-800' : 'border-t border-gray-200'}>
                              <td className="py-2 pr-4">
                                <div className="font-semibold">{item.displayName || item.username}</div>
                                <div className={darkMode ? 'text-gray-500 text-xs' : 'text-gray-500 text-xs'}>{item.username}</div>
                              </td>
                              <td className="py-2 pr-4">
                                <select
                                  value={item.role}
                                  disabled={Boolean(userActionId) || isSelf}
                                  onChange={(event) => handleRoleChange(item.id, event.target.value === 'admin' ? 'admin' : 'user')}
                                  className={`px-2 py-1 rounded-md border text-sm ${
                                    darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'
                                  } ${isSelf ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  <option value="user">{t('roleUserLabel')}</option>
                                  <option value="admin">{t('roleAdminLabel')}</option>
                                </select>
                              </td>
                              <td className="py-2 pr-4">
                                <label className="inline-flex items-center gap-2">
                                  <input
                                    type="checkbox"
                                    checked={item.isActive}
                                    disabled={Boolean(userActionId) || isSelf}
                                    onChange={(event) => handleActiveChange(item.id, event.target.checked)}
                                  />
                                  <span>{item.isActive ? t('activeLabel') : t('blockedLabel')}</span>
                                </label>
                              </td>
                              <td className="py-2 pr-4">{formatTimestamp(item.lastLoginAt)}</td>
                              <td className="py-2">
                                <button
                                  type="button"
                                  disabled={Boolean(userActionId)}
                                  onClick={() => handleResetPassword(item.id)}
                                  className={`px-3 py-1.5 rounded-md text-xs font-semibold border ${
                                    darkMode ? 'border-gray-700 text-gray-100 hover:bg-gray-800' : 'border-gray-300 text-gray-700 hover:bg-gray-100'
                                  } ${userActionId ? 'opacity-60 cursor-not-allowed' : ''}`}
                                >
                                  {t('resetButton')}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {usersError && (
                  <div className={`text-sm mt-3 ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                    {usersError}
                  </div>
                )}
              </div>
            </div>
          </section>
        )}

        <div>
          <button
            type="button"
            onClick={onLogout}
            className="px-4 py-2 rounded-md bg-red-600 text-white font-semibold hover:bg-red-700"
          >
            {t('logoutLabel')}
          </button>
        </div>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [themePreference, setThemePreference] = useState<'light' | 'dark'>(() => getInitialThemePreference());
  const [darkMode, setDarkMode] = useState(() => getInitialThemePreference() === 'dark');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [authToken, setAuthToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    return localStorage.getItem('authToken');
  });
  const [authUser, setAuthUser] = useState(() => {
    if (typeof window === 'undefined') {
      return '';
    }
    return localStorage.getItem('authUser') ?? '';
  });
  const [authProfile, setAuthProfile] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') {
      return null;
    }
    const cached = localStorage.getItem('authProfile');
    if (!cached) {
      return null;
    }
    try {
      return JSON.parse(cached) as AuthUser;
    } catch (error) {
      return null;
    }
  });
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activePage, setActivePage] = useState<'budget' | 'settings'>('budget');
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [sortByCost, setSortByCost] = useState<boolean>(() => getInitialSortByCost());
  const [languagePreference, setLanguagePreference] = useState<LanguageCode>(() => getInitialLanguagePreference());
  const [jointAccountEnabled, setJointAccountEnabled] = useState<boolean>(() => getInitialJointAccountEnabled());
  const [soloModeEnabled, setSoloModeEnabled] = useState<boolean>(() => getInitialSoloModeEnabled());
  const [paletteId, setPaletteId] = useState(() => {
    if (typeof window === 'undefined') {
      return PALETTES[0].id;
    }
    return localStorage.getItem('paletteId') ?? PALETTES[0].id;
  });

  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<Record<string, string>>({});
  const menuRef = useRef<HTMLDivElement | null>(null);

  const palette = getPaletteById(paletteId);
  const t = useMemo(() => createTranslator(languagePreference), [languagePreference]);
  const isSettingsView = activePage === 'settings';
  const userDisplayName = authProfile?.displayName || authProfile?.username || authUser || t('accountLabel');
  const userInitial = (userDisplayName.trim()[0] || 'U').toUpperCase();
  const currentMonthKey = getCurrentMonthKey(currentDate);
  const data = monthlyBudgets[currentMonthKey] || getDefaultBudgetData();
  const person1UserId = data.person1UserId ?? null;
  const person2UserId = data.person2UserId ?? null;
  const isPerson1Linked = Boolean(person1UserId);
  const isPerson2Linked = Boolean(person2UserId);
  const previousMonthKey = getCurrentMonthKey(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const nextMonthKey = getCurrentMonthKey(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const canGoToPreviousMonth = Boolean(monthlyBudgets[previousMonthKey]);
  const canGoToNextMonth = Boolean(monthlyBudgets[nextMonthKey]);
  const availableMonthKeys = Object.keys(monthlyBudgets).sort();
  const monthOptions = MONTH_LABELS[languagePreference];
  const pageStyle = {
    backgroundImage: darkMode
      ? 'radial-gradient(1200px circle at 85% -10%, rgba(255,255,255,0.08), transparent 45%), radial-gradient(900px circle at 0% 100%, rgba(255,255,255,0.06), transparent 50%)'
      : 'radial-gradient(1200px circle at 85% -10%, rgba(59,130,246,0.10), transparent 45%), radial-gradient(900px circle at 0% 100%, rgba(16,185,129,0.10), transparent 50%)'
  } as React.CSSProperties;

  const setData = (updater: (prev: BudgetData) => BudgetData) => {
    setMonthlyBudgets(prev => {
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: updater(prev[currentMonthKey] || getDefaultBudgetData())
      };
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const handleAuthFailure = (error: unknown) => {
    if (!isAuthError(error)) {
      return false;
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      localStorage.removeItem('authProfile');
    }
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setAuthToken(null);
    setAuthUser('');
    setAuthProfile(null);
    setAuthError(t('sessionExpiredError'));
    setActivePage('budget');
    setMonthlyBudgets({});
    setIsHydrated(false);
    return true;
  };

  const handleLogin = async (username: string, password: string) => {
    if (!username || !password) {
      setAuthError(t('authRequiredError'));
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await loginRequest(username, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('authToken', result.token);
        localStorage.setItem('authUser', result.user.username);
      }
      setAuthToken(result.token);
      setAuthUser(result.user.username);
      setAuthProfile(result.user);
      setActivePage('budget');
    } catch (error) {
      if (isAuthError(error)) {
        setAuthError(t('authInvalidError'));
      } else {
        setAuthError(t('authServerError'));
      }
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('paletteId', palette.id);
  }, [palette.id]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('themePreference', themePreference);
  }, [themePreference]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('sortByCost', sortByCost ? 'true' : 'false');
  }, [sortByCost]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('jointAccountEnabled', jointAccountEnabled ? 'true' : 'false');
  }, [jointAccountEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('soloModeEnabled', soloModeEnabled ? 'true' : 'false');
  }, [soloModeEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('languagePreference', languagePreference);
  }, [languagePreference]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const root = document.body;
    root.classList.add('theme-transition');
    const timeout = window.setTimeout(() => {
      root.classList.remove('theme-transition');
    }, 260);
    return () => {
      window.clearTimeout(timeout);
      root.classList.remove('theme-transition');
    };
  }, [darkMode]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (authToken) {
      localStorage.setItem('authToken', authToken);
    } else {
      localStorage.removeItem('authToken');
    }
    if (authUser) {
      localStorage.setItem('authUser', authUser);
    } else {
      localStorage.removeItem('authUser');
    }
    if (authProfile) {
      localStorage.setItem('authProfile', JSON.stringify(authProfile));
    } else {
      localStorage.removeItem('authProfile');
    }
  }, [authToken, authUser, authProfile]);

  useEffect(() => {
    let isActive = true;
    if (!authToken) {
      setAuthProfile(null);
      return () => {
        isActive = false;
      };
    }
    const loadProfile = async () => {
      try {
        const profile = await fetchCurrentUser();
        if (!isActive) {
          return;
        }
        setAuthProfile(profile);
        setAuthUser(profile.username);
      } catch (error) {
        if (!isActive) {
          return;
        }
        if (!handleAuthFailure(error)) {
          console.error('Failed to load profile', error);
        }
      }
    };
    void loadProfile();
    return () => {
      isActive = false;
    };
  }, [authToken]);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (menuRef.current.contains(event.target as Node)) {
        return;
      }
      setMenuOpen(false);
    };
    window.addEventListener('mousedown', handleClick);
    return () => {
      window.removeEventListener('mousedown', handleClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    setSelectorError(null);
  }, [currentMonthKey]);

  useEffect(() => {
    let isActive = true;
    let hadAuthFailure = false;

    if (!authToken) {
      setIsHydrated(false);
      setMonthlyBudgets({});
      lastSavedPayloadRef.current = {};
      return () => {
        isActive = false;
      };
    }

    const loadMonths = async () => {
      try {
        const months = await fetchMonths();
        if (!isActive) {
          return;
        }

        const nextBudgets: MonthlyBudget = {};
        months.forEach(month => {
          if (!month || typeof month.monthKey !== 'string') {
            return;
          }
          const normalized = normalizeBudgetData(month.data);
          nextBudgets[month.monthKey] = normalized;
          lastSavedPayloadRef.current[month.monthKey] = JSON.stringify(normalized);
        });

        const initialKey = getCurrentMonthKey(new Date());
        if (Object.keys(nextBudgets).length === 0 || !nextBudgets[initialKey]) {
          nextBudgets[initialKey] = getDefaultBudgetData();
        }

        const sortedKeys = Object.keys(nextBudgets).sort();
        const anchorKey = sortedKeys[0];
        const carriedBudgets = anchorKey ? applyJointBalanceCarryover(nextBudgets, anchorKey) : nextBudgets;
        setMonthlyBudgets(carriedBudgets);
        setAuthError(null);
      } catch (error) {
        if (!isActive) {
          return;
        }
        if (handleAuthFailure(error)) {
          hadAuthFailure = true;
          return;
        }
        console.error('Failed to load months', error);
        const initialKey = getCurrentMonthKey(new Date());
        setMonthlyBudgets({ [initialKey]: getDefaultBudgetData() });
      } finally {
        if (isActive && !hadAuthFailure) {
          setIsHydrated(true);
        }
      }
    };

    loadMonths();

    return () => {
      isActive = false;
    };
  }, [authToken]);

  useEffect(() => {
    if (!isHydrated || !authToken) {
      return;
    }
    const dirtyKeys = Object.keys(monthlyBudgets).filter(monthKey => {
      const monthData = monthlyBudgets[monthKey];
      if (!monthData) {
        return false;
      }
      const payload = JSON.stringify(monthData);
      return lastSavedPayloadRef.current[monthKey] !== payload;
    });

    if (dirtyKeys.length === 0) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = window.setTimeout(() => {
      dirtyKeys.forEach(monthKey => {
        const monthData = monthlyBudgets[monthKey];
        if (!monthData) {
          return;
        }
        const payload = JSON.stringify(monthData);
        if (lastSavedPayloadRef.current[monthKey] === payload) {
          return;
        }
        void upsertMonth(monthKey, monthData)
          .then(() => {
            lastSavedPayloadRef.current[monthKey] = payload;
          })
          .catch(error => {
            if (!handleAuthFailure(error)) {
              console.error('Failed to save month', error);
            }
          });
      });
    }, 400);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [authToken, isHydrated, monthlyBudgets]);

  const flushSave = () => {
    if (!isHydrated || !authToken) {
      return;
    }
    const dirtyKeys = Object.keys(monthlyBudgets).filter(monthKey => {
      const monthData = monthlyBudgets[monthKey];
      if (!monthData) {
        return false;
      }
      const payload = JSON.stringify(monthData);
      return lastSavedPayloadRef.current[monthKey] !== payload;
    });

    if (dirtyKeys.length === 0) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }

    dirtyKeys.forEach(monthKey => {
      const monthData = monthlyBudgets[monthKey];
      if (!monthData) {
        return;
      }
      const payload = JSON.stringify(monthData);
      if (lastSavedPayloadRef.current[monthKey] === payload) {
        return;
      }
      void upsertMonth(monthKey, monthData)
        .then(() => {
          lastSavedPayloadRef.current[monthKey] = payload;
        })
        .catch(error => {
          if (!handleAuthFailure(error)) {
            console.error('Failed to save month', error);
          }
        });
    });
  };

  const handleLogout = () => {
    flushSave();
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (typeof window !== 'undefined') {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      localStorage.removeItem('authProfile');
    }
    setAuthToken(null);
    setAuthUser('');
    setAuthProfile(null);
    setActivePage('budget');
    setMenuOpen(false);
    setMonthlyBudgets({});
    setIsHydrated(false);
  };

  const copyRecurringCategories = (categories: Category[], targetMonth: string): Category[] => {
    const recurringCategories: Category[] = [];

    const nonRecurringCategories = categories.filter(cat => !cat.isRecurring).map(cat => ({
      ...cat,
      id: Date.now().toString() + Math.random()
    }));

    categories.forEach(cat => {
      if (cat.isRecurring && cat.startMonth && cat.recurringMonths) {
        const startDate = new Date(cat.startMonth + '-01');
        const targetDate = new Date(targetMonth + '-01');
        const monthsDiff = (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
          (targetDate.getMonth() - startDate.getMonth());

        if (monthsDiff >= 0 && monthsDiff < cat.recurringMonths) {
          recurringCategories.push({
            ...cat,
            id: Date.now().toString() + Math.random()
          });
        }
      }
    });

    return [...nonRecurringCategories, ...recurringCategories];
  };

  const goToPreviousMonth = () => {
    flushSave();
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    const monthKey = getCurrentMonthKey(newDate);
    if (monthlyBudgets[monthKey]) {
      setCurrentDate(newDate);
    }
  };

  const goToNextMonth = () => {
    flushSave();
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    const monthKey = getCurrentMonthKey(newDate);
    if (monthlyBudgets[monthKey]) {
      setCurrentDate(newDate);
    }
  };

  const addNextMonth = () => {
    flushSave();
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    const monthKey = getCurrentMonthKey(newDate);
    if (monthlyBudgets[monthKey]) {
      setCurrentDate(newDate);
      return;
    }

    const previousMonthKey = getCurrentMonthKey(currentDate);
    const previousData = monthlyBudgets[previousMonthKey];
    const newData = getDefaultBudgetData();

    if (previousData) {
      newData.person1.fixedExpenses = previousData.person1.fixedExpenses.map(exp => ({
        ...exp,
        id: Date.now().toString() + Math.random()
      }));
      newData.person2.fixedExpenses = previousData.person2.fixedExpenses.map(exp => ({
        ...exp,
        id: Date.now().toString() + Math.random()
      }));

      newData.person1.categories = copyRecurringCategories(previousData.person1.categories, monthKey);
      newData.person2.categories = copyRecurringCategories(previousData.person2.categories, monthKey);

      newData.person1.incomeSources = previousData.person1.incomeSources.map(src => ({
        ...src,
        id: Date.now().toString() + Math.random()
      }));
      newData.person2.incomeSources = previousData.person2.incomeSources.map(src => ({
        ...src,
        id: Date.now().toString() + Math.random()
      }));

      newData.person1.name = previousData.person1.name;
      newData.person2.name = previousData.person2.name;
      newData.person1UserId = previousData.person1UserId ?? null;
      newData.person2UserId = previousData.person2UserId ?? null;
    }

    setMonthlyBudgets(prev => {
      const updated = {
        ...prev,
        [monthKey]: newData
      };
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
    setCurrentDate(newDate);
  };

  const deleteCurrentMonth = async () => {
    const monthKey = currentMonthKey;
    if (!monthlyBudgets[monthKey]) {
      return;
    }
    if (!window.confirm(`${t('deleteMonth')}? ${t('deleteMonthConfirm')}`)) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    try {
      await deleteMonth(monthKey);
      delete lastSavedPayloadRef.current[monthKey];
    } catch (error) {
      if (!handleAuthFailure(error)) {
        console.error('Failed to delete month', error);
        alert(t('deleteMonthError'));
      }
      return;
    }

    const remainingKeys = Object.keys(monthlyBudgets).filter(key => key !== monthKey).sort();
    if (remainingKeys.length === 0) {
      setMonthlyBudgets({ [monthKey]: getDefaultBudgetData() });
      return;
    }

    const previousKey = remainingKeys.filter(key => key < monthKey).pop();
    const targetKey = previousKey || remainingKeys[0];
    setMonthlyBudgets(prev => {
      const next = { ...prev };
      delete next[monthKey];
      return applyJointBalanceCarryover(next, targetKey);
    });
    setCurrentDate(new Date(`${targetKey}-01`));
  };

  const formatMonthKey = (monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    const monthLabel = monthOptions[monthIndex] ?? monthKey;
    return `${monthLabel} ${year}`;
  };

  const trySelectMonthKey = (monthKey: string) => {
    if (!monthlyBudgets[monthKey]) {
      setSelectorError(t('monthUnavailableError'));
      return;
    }
    flushSave();
    setCurrentDate(new Date(`${monthKey}-01`));
  };

  const [editingName, setEditingName] = useState<string | null>(null);
  const [tempName, setTempName] = useState('');
  const [activePersonKey, setActivePersonKey] = useState<'person1' | 'person2'>('person1');

  useEffect(() => {
    if (soloModeEnabled && activePersonKey !== 'person1') {
      setActivePersonKey('person1');
    }
  }, [soloModeEnabled, activePersonKey]);

  useEffect(() => {
    if (editingName === 'person1' && isPerson1Linked) {
      setEditingName(null);
      setTempName('');
    }
    if (editingName === 'person2' && isPerson2Linked) {
      setEditingName(null);
      setTempName('');
    }
  }, [editingName, isPerson1Linked, isPerson2Linked]);

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    setThemePreference(next ? 'dark' : 'light');
  };

  const handleThemePreferenceChange = (value: 'light' | 'dark') => {
    setThemePreference(value);
    setDarkMode(value === 'dark');
  };

  const resolveUserLabel = (profile: AuthUser | null) => {
    if (!profile) {
      return null;
    }
    return profile.displayName || profile.username || null;
  };

  const updatePersonMapping = (personKey: 'person1' | 'person2', profile: AuthUser | null) => {
    const userId = profile?.id ?? null;
    const label = resolveUserLabel(profile);
    const fallbackLabel = personKey === 'person1' ? t('person1Label') : t('person2Label');
    setMonthlyBudgets(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(monthKey => {
        const month = next[monthKey];
        if (!month) {
          return;
        }
        const updated = { ...month };
        if (personKey === 'person1') {
          const nextName = label ?? fallbackLabel;
          if (updated.person1UserId === userId && updated.person1?.name === nextName) {
            return;
          }
          updated.person1UserId = userId;
          const previousName = updated.person1?.name;
          updated.person1 = { ...updated.person1, name: nextName };
          if (previousName && previousName !== nextName) {
            updated.jointAccount = {
              ...updated.jointAccount,
              transactions: updated.jointAccount.transactions.map(transaction =>
                transaction.person === previousName ? { ...transaction, person: nextName } : transaction
              )
            };
          }
        } else {
          const nextName = label ?? fallbackLabel;
          if (updated.person2UserId === userId && updated.person2?.name === nextName) {
            return;
          }
          updated.person2UserId = userId;
          const previousName = updated.person2?.name;
          updated.person2 = { ...updated.person2, name: nextName };
          if (previousName && previousName !== nextName) {
            updated.jointAccount = {
              ...updated.jointAccount,
              transactions: updated.jointAccount.transactions.map(transaction =>
                transaction.person === previousName ? { ...transaction, person: nextName } : transaction
              )
            };
          }
        }
        next[monthKey] = updated;
        changed = true;
      });
      return changed ? next : prev;
    });
  };

  useEffect(() => {
    if (!authProfile || authProfile.role !== 'admin' || !isHydrated) {
      return;
    }
    const label = resolveUserLabel(authProfile) || t('person1Label');
    setMonthlyBudgets(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(monthKey => {
        const month = next[monthKey];
        if (!month || month.person1UserId) {
          return;
        }
        const previousName = month.person1?.name;
        next[monthKey] = {
          ...month,
          person1UserId: authProfile.id,
          person1: { ...month.person1, name: label },
          jointAccount: previousName && previousName !== label
            ? {
                ...month.jointAccount,
                transactions: month.jointAccount.transactions.map(transaction =>
                  transaction.person === previousName ? { ...transaction, person: label } : transaction
                )
              }
            : month.jointAccount
        };
        changed = true;
      });
      return changed ? next : prev;
    });
  }, [authProfile, isHydrated, t]);

  const addIncomeSource = (personKey: 'person1' | 'person2') => {
    const newSource: IncomeSource = {
      id: Date.now().toString(),
      name: t('newIncomeSourceLabel'),
      amount: 0
    };
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        incomeSources: [...prev[personKey].incomeSources, newSource]
      }
    }));
  };

  const deleteIncomeSource = (personKey: 'person1' | 'person2', id: string) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        incomeSources: prev[personKey].incomeSources.filter(source => source.id !== id)
      }
    }));
  };

  const updateIncomeSource = (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount', value: string | number) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        incomeSources: prev[personKey].incomeSources.map(source =>
          source.id === id ? { ...source, [field]: value } : source
        )
      }
    }));
  };

  const addFixedExpense = (personKey: 'person1' | 'person2') => {
    const newExpense: FixedExpense = {
      id: Date.now().toString(),
      name: t('newFixedExpenseLabel'),
      amount: 0,
      isChecked: false
    };
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        fixedExpenses: [...prev[personKey].fixedExpenses, newExpense]
      }
    }));
  };

  const deleteFixedExpense = (personKey: 'person1' | 'person2', id: string) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        fixedExpenses: prev[personKey].fixedExpenses.filter(exp => exp.id !== id)
      }
    }));
  };

  const updateFixedExpense = (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount' | 'isChecked', value: string | number | boolean) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        fixedExpenses: prev[personKey].fixedExpenses.map(exp =>
          exp.id === id ? { ...exp, [field]: value } : exp
        )
      }
    }));
  };

  const moveFixedExpense = (personKey: 'person1' | 'person2', id: string, direction: 'up' | 'down') => {
    setData(prev => {
      const expenses = prev[personKey].fixedExpenses;
      const index = expenses.findIndex(expense => expense.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= expenses.length) {
        return prev;
      }
      const nextExpenses = [...expenses];
      [nextExpenses[index], nextExpenses[targetIndex]] = [nextExpenses[targetIndex], nextExpenses[index]];
      return {
        ...prev,
        [personKey]: {
          ...prev[personKey],
          fixedExpenses: nextExpenses
        }
      };
    });
  };

  const addCategory = (personKey: 'person1' | 'person2') => {
    const newCategory: Category = {
      id: Date.now().toString(),
      name: t('newCategoryLabel'),
      amount: 0,
      icon: '📌',
      isChecked: false
    };
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        categories: [...prev[personKey].categories, newCategory]
      }
    }));
  };

  const deleteCategory = (personKey: 'person1' | 'person2', id: string) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        categories: prev[personKey].categories.filter(cat => cat.id !== id)
      }
    }));
  };

  const updateCategory = (personKey: 'person1' | 'person2', id: string, field: keyof Category, value: string | number | boolean) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        categories: prev[personKey].categories.map(cat => {
          if (cat.id === id) {
            const updated = { ...cat, [field]: value };
            if (field === 'isRecurring' && value === true) {
              updated.recurringMonths = updated.recurringMonths || 3;
              updated.startMonth = updated.startMonth || currentMonthKey;
            }
            return updated;
          }
          return cat;
        })
      }
    }));
  };

  const moveCategory = (personKey: 'person1' | 'person2', id: string, direction: 'up' | 'down') => {
    setData(prev => {
      const categories = prev[personKey].categories;
      const index = categories.findIndex(category => category.id === id);
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (index === -1 || targetIndex < 0 || targetIndex >= categories.length) {
        return prev;
      }
      const nextCategories = [...categories];
      [nextCategories[index], nextCategories[targetIndex]] = [nextCategories[targetIndex], nextCategories[index]];
      return {
        ...prev,
        [personKey]: {
          ...prev[personKey],
          categories: nextCategories
        }
      };
    });
  };

  const calculateJointBalance = () => {
    return calculateJointBalanceForData(data);
  };

  const addJointTransaction = (type: 'deposit' | 'expense') => {
    const newTransaction: JointTransaction = {
      id: Date.now().toString(),
      date: new Date().toISOString().split('T')[0],
      description: type === 'deposit' ? t('newDepositDescription') : t('newExpenseDescription'),
      amount: 0,
      type: type,
      person: data.person1.name
    };
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        transactions: [...prev.jointAccount.transactions, newTransaction]
      }
    }));
  };

  const deleteJointTransaction = (id: string) => {
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        transactions: prev.jointAccount.transactions.filter(t => t.id !== id)
      }
    }));
  };

  const updateJointTransaction = (id: string, field: keyof JointTransaction, value: string | number) => {
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        transactions: prev.jointAccount.transactions.map(t =>
          t.id === id ? { ...t, [field]: value } : t
        )
      }
    }));
  };

  const updateInitialBalance = (value: number) => {
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        initialBalance: value
      }
    }));
  };

  const startEditingName = (personKey: 'person1' | 'person2') => {
    setEditingName(personKey);
    setTempName(data[personKey].name);
  };

  const saveName = (personKey: 'person1' | 'person2') => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        name: tempName
      }
    }));
    setEditingName(null);
  };

  const cancelEditingName = () => {
    setEditingName(null);
    setTempName('');
  };

  if (!authToken) {
    return (
      <TranslationContext.Provider value={{ t, language: languagePreference }}>
        <LoginScreen
          onLogin={handleLogin}
          error={authError}
          loading={authLoading}
          darkMode={darkMode}
          pageStyle={pageStyle}
        />
      </TranslationContext.Provider>
    );
  }

  return (
    <TranslationContext.Provider value={{ t, language: languagePreference }}>
      <div
        className={`min-h-screen p-4 sm:p-6 app-fade ${darkMode ? 'bg-slate-950' : 'bg-slate-50'}`}
        style={pageStyle}
      >
        <div className="flex flex-col gap-4 mb-6">
        <div className="flex items-center gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {isSettingsView ? (
              <>
                <button
                  onClick={() => setActivePage('budget')}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100'
                  } transition-all`}
                >
                  {t('backLabel')}
                </button>
                <h1 className={`text-2xl sm:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  {t('settingsLabel')}
                </h1>
              </>
            ) : (
              <>
                <button
                  onClick={goToPreviousMonth}
                  disabled={!canGoToPreviousMonth}
                  className={`p-2 rounded-lg transition-all ${
                    canGoToPreviousMonth
                      ? (darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100')
                      : (darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400')
                  }`}
                >
                  <ChevronLeft size={24} />
                </button>
                <h1 className={`text-2xl sm:text-3xl font-bold flex items-center gap-2 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
                  <span>{t('budgetLabel')} -</span>
                <div
                  className={`relative inline-flex items-center rounded-md pl-1.5 pr-1.5 py-0.5 text-2xl sm:text-3xl font-bold leading-none transition-colors focus-within:outline-none focus-within:border ${
                    darkMode
                      ? 'text-white hover:bg-white/5 border-white/20 focus-within:border-white/30'
                      : 'text-gray-800 hover:bg-gray-900/5 border-gray-300/30 focus-within:border-gray-400/50'
                  }`}
                >
                  <span className="whitespace-nowrap">{formatMonthKey(currentMonthKey)}</span>
                  <select
                    id="month-year-select"
                    value={currentMonthKey}
                    disabled={!isHydrated}
                    onChange={(e) => trySelectMonthKey(e.target.value)}
                    aria-label={t('monthSelectLabel')}
                    className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  >
                    {(availableMonthKeys.length > 0 ? availableMonthKeys : [currentMonthKey]).map(monthKey => (
                      <option key={monthKey} value={monthKey}>
                        {formatMonthKey(monthKey)}
                      </option>
                    ))}
                  </select>
                </div>
                </h1>
                <button
                  onClick={goToNextMonth}
                  disabled={!canGoToNextMonth}
                  className={`p-2 rounded-lg transition-all ${
                    canGoToNextMonth
                      ? (darkMode ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-100')
                      : (darkMode ? 'bg-gray-800 text-gray-500' : 'bg-gray-100 text-gray-400')
                  }`}
                >
                  <ChevronRight size={24} />
                </button>
                <button
                  onClick={addNextMonth}
                  className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold ${darkMode ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-green-600 text-white hover:bg-green-700'} transition-all`}
                >
                  {t('addNextMonth')}
                </button>
                <button
                  onClick={deleteCurrentMonth}
                  className={`hidden sm:inline-flex px-3 py-1.5 rounded-lg text-sm font-semibold ${darkMode ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-red-600 text-white hover:bg-red-700'} transition-all`}
                >
                  {t('deleteMonth')}
                </button>
              </>
            )}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden sm:flex">
              <PaletteSelector
                palettes={PALETTES}
                value={palette.id}
                onChange={setPaletteId}
                darkMode={darkMode}
              />
            </div>
            <button
              onClick={toggleDarkMode}
              className={`p-2 rounded-lg ${darkMode ? 'bg-gray-700 text-yellow-400' : 'bg-gray-200 text-gray-700'} hover:opacity-80 transition-all`}
            >
              {darkMode ? <Sun size={24} /> : <Moon size={24} />}
            </button>
            <div ref={menuRef} className="relative">
              <button
                onClick={() => setMenuOpen(prev => !prev)}
                className={`h-9 w-9 rounded-full flex items-center justify-center font-semibold ${
                  darkMode ? 'bg-gray-700 text-white' : 'bg-gray-200 text-gray-700'
                }`}
                aria-label={t('accountMenuLabel')}
              >
                {userInitial}
              </button>
              {menuOpen && (
                <div
                  className={`absolute right-0 mt-2 w-56 rounded-lg border shadow-lg overflow-hidden ${
                    darkMode ? 'bg-gray-900 border-gray-800 text-white' : 'bg-white border-gray-200 text-gray-800'
                  }`}
                >
                  <div className="px-3 py-2 text-xs uppercase tracking-wide text-gray-500">
                    {userDisplayName}
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setActivePage('settings');
                      setMenuOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-800' : ''}`}
                  >
                    {t('settingsLabel')}
                  </button>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 ${darkMode ? 'hover:bg-gray-800' : ''}`}
                  >
                    {t('logoutLabel')}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        {!isSettingsView && (
          <div className="flex flex-row items-center gap-2 sm:hidden">
            <button
              onClick={addNextMonth}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap ${darkMode ? 'bg-green-700 text-white hover:bg-green-600' : 'bg-green-600 text-white hover:bg-green-700'} transition-all`}
            >
              {t('addNextMonth')}
            </button>
            <button
              onClick={deleteCurrentMonth}
              className={`flex-1 px-2 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap ${darkMode ? 'bg-red-700 text-white hover:bg-red-600' : 'bg-red-600 text-white hover:bg-red-700'} transition-all`}
            >
              {t('deleteMonth')}
            </button>
          </div>
        )}
      </div>

      {!isSettingsView && selectorError && (
        <div className={`mb-4 text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
          {selectorError}
        </div>
      )}

      {isSettingsView ? (
        <SettingsView
          user={authProfile}
          fallbackUsername={authUser}
          darkMode={darkMode}
          onLogout={handleLogout}
          onAuthFailure={handleAuthFailure}
          sortByCost={sortByCost}
          onToggleSortByCost={setSortByCost}
          themePreference={themePreference}
          onThemePreferenceChange={handleThemePreferenceChange}
          languagePreference={languagePreference}
          onLanguagePreferenceChange={setLanguagePreference}
          jointAccountEnabled={jointAccountEnabled}
          onToggleJointAccountEnabled={setJointAccountEnabled}
          soloModeEnabled={soloModeEnabled}
          onToggleSoloModeEnabled={setSoloModeEnabled}
          person1UserId={person1UserId}
          person2UserId={person2UserId}
          onPersonLinkChange={updatePersonMapping}
        />
      ) : (
        <>
          {!soloModeEnabled && (
            <div className="mb-4 flex flex-wrap items-center gap-2 sm:hidden">
              <label className={`text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-700'}`} htmlFor="person-select">
                {t('tableLabel')}
              </label>
              <select
                id="person-select"
                value={activePersonKey}
                onChange={(event) => setActivePersonKey(event.target.value === 'person2' ? 'person2' : 'person1')}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${darkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-300'}`}
              >
                <option value="person1">{data.person1.name || t('person1Label')}</option>
                <option value="person2">{data.person2.name || t('person2Label')}</option>
              </select>
            </div>
          )}

          <div className="mb-6 sm:hidden">
            <div className="mb-2">
              <PersonColumnHeader
                person={soloModeEnabled || activePersonKey === 'person1' ? data.person1 : data.person2}
                personKey={soloModeEnabled ? 'person1' : activePersonKey}
                darkMode={darkMode}
                editingName={editingName}
                tempName={tempName}
                setTempName={setTempName}
                startEditingName={startEditingName}
                saveName={saveName}
                cancelEditingName={cancelEditingName}
                isLinked={soloModeEnabled || activePersonKey === 'person1' ? isPerson1Linked : isPerson2Linked}
              />
            </div>
            <BudgetColumn
              person={soloModeEnabled || activePersonKey === 'person1' ? data.person1 : data.person2}
              personKey={soloModeEnabled ? 'person1' : activePersonKey}
              darkMode={darkMode}
              sortByCost={sortByCost}
              palette={palette}
              editingName={editingName}
              tempName={tempName}
              currentMonthKey={currentMonthKey}
              setTempName={setTempName}
              startEditingName={startEditingName}
              saveName={saveName}
              cancelEditingName={cancelEditingName}
              addIncomeSource={addIncomeSource}
              deleteIncomeSource={deleteIncomeSource}
              updateIncomeSource={updateIncomeSource}
              addFixedExpense={addFixedExpense}
              deleteFixedExpense={deleteFixedExpense}
              updateFixedExpense={updateFixedExpense}
              moveFixedExpense={moveFixedExpense}
              addCategory={addCategory}
              deleteCategory={deleteCategory}
              updateCategory={updateCategory}
              moveCategory={moveCategory}
            />
          </div>

          {soloModeEnabled ? (
            <div className="hidden sm:block sm:mb-6">
              <div className="max-w-2xl mx-auto">
                <PersonColumnHeader
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  editingName={editingName}
                  tempName={tempName}
                  setTempName={setTempName}
                  startEditingName={startEditingName}
                  saveName={saveName}
                  cancelEditingName={cancelEditingName}
                  isLinked={isPerson1Linked}
                />
                <BudgetHeaderSection
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  palette={palette}
                  addIncomeSource={addIncomeSource}
                  deleteIncomeSource={deleteIncomeSource}
                  updateIncomeSource={updateIncomeSource}
                />
                <BudgetFixedSection
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  sortByCost={sortByCost}
                  palette={palette}
                  addFixedExpense={addFixedExpense}
                  deleteFixedExpense={deleteFixedExpense}
                  updateFixedExpense={updateFixedExpense}
                  moveFixedExpense={moveFixedExpense}
                />
                <BudgetFreeSection
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  sortByCost={sortByCost}
                  palette={palette}
                  currentMonthKey={currentMonthKey}
                  addCategory={addCategory}
                  deleteCategory={deleteCategory}
                  updateCategory={updateCategory}
                  moveCategory={moveCategory}
                />
              </div>
            </div>
          ) : (
            <div className="hidden sm:grid sm:grid-cols-2 sm:gap-6 sm:mb-6">
              <PersonColumnHeader
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                editingName={editingName}
                tempName={tempName}
                setTempName={setTempName}
                startEditingName={startEditingName}
                saveName={saveName}
                cancelEditingName={cancelEditingName}
                isLinked={isPerson1Linked}
              />
              <PersonColumnHeader
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                editingName={editingName}
                tempName={tempName}
                setTempName={setTempName}
                startEditingName={startEditingName}
                saveName={saveName}
                cancelEditingName={cancelEditingName}
                isLinked={isPerson2Linked}
              />
              <BudgetHeaderSection
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                palette={palette}
                addIncomeSource={addIncomeSource}
                deleteIncomeSource={deleteIncomeSource}
                updateIncomeSource={updateIncomeSource}
              />
              <BudgetHeaderSection
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                palette={palette}
                addIncomeSource={addIncomeSource}
                deleteIncomeSource={deleteIncomeSource}
                updateIncomeSource={updateIncomeSource}
              />
              <BudgetFixedSection
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                sortByCost={sortByCost}
                palette={palette}
                addFixedExpense={addFixedExpense}
                deleteFixedExpense={deleteFixedExpense}
                updateFixedExpense={updateFixedExpense}
                moveFixedExpense={moveFixedExpense}
              />
              <BudgetFixedSection
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                sortByCost={sortByCost}
                palette={palette}
                addFixedExpense={addFixedExpense}
                deleteFixedExpense={deleteFixedExpense}
                updateFixedExpense={updateFixedExpense}
                moveFixedExpense={moveFixedExpense}
              />
              <BudgetFreeSection
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                sortByCost={sortByCost}
                palette={palette}
                currentMonthKey={currentMonthKey}
                addCategory={addCategory}
                deleteCategory={deleteCategory}
                updateCategory={updateCategory}
                moveCategory={moveCategory}
              />
              <BudgetFreeSection
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                sortByCost={sortByCost}
                palette={palette}
                currentMonthKey={currentMonthKey}
                addCategory={addCategory}
                deleteCategory={deleteCategory}
                updateCategory={updateCategory}
                moveCategory={moveCategory}
              />
            </div>
          )}

          {jointAccountEnabled && (
            <div className="flex justify-center">
              <div
                className={`w-full max-w-4xl rounded-xl border p-4 shadow-sm ${
                  darkMode ? 'bg-red-950/40 border-red-900/60' : 'bg-red-50 border-red-200'
                }`}
              >
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className={`font-bold ${darkMode ? 'text-red-400' : 'text-red-800'}`}>{t('jointAccountTitle')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <button onClick={() => addJointTransaction('deposit')} className="bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 flex items-center gap-1 text-xs sm:text-sm">
                      <Plus size={16} />
                      <span>{t('depositLabel')}</span>
                    </button>
                    <button onClick={() => addJointTransaction('expense')} className="bg-red-600 text-white px-3 py-1 rounded hover:bg-red-700 flex items-center gap-1 text-xs sm:text-sm">
                      <Plus size={16} />
                      <span>{t('expenseLabel')}</span>
                    </button>
                  </div>
                </div>

                <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg p-3 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('initialBalanceLabel')}:</span>
                    <input
                      type="number"
                      value={coerceNumber(data.jointAccount.initialBalance)}
                      onChange={(e) => updateInitialBalance(parseNumberInput(e.target.value))}
                      className={`w-full sm:w-32 px-3 py-1 border rounded text-right ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                    />
                    <span className={darkMode ? 'text-gray-300' : ''}>€</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-bold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>{t('currentBalanceLabel')}:</span>
                    <span className={`text-xl sm:text-2xl font-bold ${calculateJointBalance() < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {calculateJointBalance().toFixed(2)} €
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className={`w-full ${darkMode ? 'bg-gray-800' : 'bg-white'} rounded text-sm`}>
                    <thead className={darkMode ? 'bg-red-900/60' : 'bg-red-200'}>
                      <tr>
                        <th className={`p-2 text-left ${darkMode ? 'text-gray-300' : ''}`}>{t('dateLabel')}</th>
                        <th className={`p-2 text-left ${darkMode ? 'text-gray-300' : ''}`}>{t('typeLabel')}</th>
                        <th className={`p-2 text-left ${darkMode ? 'text-gray-300' : ''}`}>{t('descriptionLabel')}</th>
                        <th className={`p-2 text-right ${darkMode ? 'text-gray-300' : ''}`}>{t('amountLabel')}</th>
                        <th className={`p-2 text-left ${darkMode ? 'text-gray-300' : ''}`}>{t('personLabel')}</th>
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.jointAccount.transactions.map(transaction => (
                        <tr key={transaction.id} className={`border-t ${darkMode ? 'border-gray-700' : ''}`}>
                          <td className="p-2">
                            <input
                              type="date"
                              value={transaction.date}
                              onChange={(e) => updateJointTransaction(transaction.id, 'date', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={transaction.type}
                              onChange={(e) => updateJointTransaction(transaction.id, 'type', e.target.value)}
                              className={`w-full px-2 py-1 border rounded font-semibold ${
                                transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                              } ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}
                            >
                              <option value="deposit">{t('depositOptionLabel')}</option>
                              <option value="expense">{t('expenseOptionLabel')}</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <input
                              type="text"
                              value={transaction.description}
                              onChange={(e) => updateJointTransaction(transaction.id, 'description', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                            />
                          </td>
                          <td className="p-2">
                            <input
                              type="number"
                              value={coerceNumber(transaction.amount)}
                              onChange={(e) => updateJointTransaction(transaction.id, 'amount', parseNumberInput(e.target.value))}
                              className={`w-full px-2 py-1 border rounded text-right font-semibold ${
                                transaction.type === 'deposit' ? 'text-green-600' : 'text-red-600'
                              } ${darkMode ? 'bg-gray-700 border-gray-600' : ''}`}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              value={transaction.person}
                              onChange={(e) => updateJointTransaction(transaction.id, 'person', e.target.value)}
                              className={`w-full px-2 py-1 border rounded ${darkMode ? 'bg-gray-700 text-white border-gray-600' : ''}`}
                            >
                              <option value={data.person1.name}>{data.person1.name}</option>
                              <option value={data.person2.name}>{data.person2.name}</option>
                            </select>
                          </td>
                          <td className="p-2">
                            <button onClick={() => deleteJointTransaction(transaction.id)} className="text-red-500 hover:text-red-700">
                              <Trash2 size={16} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 flex sm:hidden">
            <PaletteSelector
              palettes={PALETTES}
              value={palette.id}
              onChange={setPaletteId}
              darkMode={darkMode}
            />
          </div>
        </>
      )}
      </div>
    </TranslationContext.Provider>
  );
};

export default App;
