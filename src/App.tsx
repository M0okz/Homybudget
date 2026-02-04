import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, LayoutDashboard, Wallet, BarChart3, Settings, ArrowUpDown, Users, User, KeyRound, Globe2, Coins, GripVertical, Eye, EyeOff, Link2, Link2Off, CalendarDays, Clock } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
  type DraggableProvided,
  type DraggableStateSnapshot,
  type DroppableProvided
} from '@hello-pangea/dnd';
import { Dialog, DialogContent } from './components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { LanguageCode, MONTH_LABELS, TRANSLATIONS, TranslationContext, createTranslator, useTranslation } from './i18n';
import Sidebar from './components/layout/Sidebar';
import HeaderBar from './components/layout/HeaderBar';
import packageJson from '../package.json';

const DashboardView = lazy(() => import('./views/DashboardView'));
const ReportsView = lazy(() => import('./views/ReportsView'));

export interface Category {
  id: string;
  name: string;
  amount: number;
  icon?: string;
  templateId?: string;
  categoryOverrideId?: string;
  isChecked?: boolean;
  isRecurring?: boolean;
  recurringMonths?: number;
  startMonth?: string; // format: "YYYY-MM"
  date?: string;
  propagate?: boolean;
  accountId?: string;
}

export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  templateId?: string;
  categoryOverrideId?: string;
  isChecked?: boolean;
  date?: string;
  accountId?: string;
}

export interface IncomeSource {
  id: string;
  name: string;
  amount: number | string;
  templateId?: string;
  categoryOverrideId?: string;
  propagate?: boolean;
}

export interface PersonBudget {
  name: string;
  incomeSources: IncomeSource[];
  fixedExpenses: FixedExpense[];
  categories: Category[];
}

export interface JointTransaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  type: 'deposit' | 'expense';
  person: string;
}

export interface JointAccount {
  initialBalance: number;
  transactions: JointTransaction[];
}

export interface BudgetData {
  person1: PersonBudget;
  person2: PersonBudget;
  jointAccount: JointAccount;
  person1UserId?: string | null;
  person2UserId?: string | null;
}

export type MonthlyBudget = Record<string, BudgetData>;

type ApiMonth = {
  monthKey: string;
  data: BudgetData;
  updatedAt?: string | null;
};

export type AppSettings = {
  languagePreference: LanguageCode;
  soloModeEnabled: boolean;
  jointAccountEnabled: boolean;
  sortByCost: boolean;
  showSidebarMonths: boolean;
  budgetWidgetsEnabled: boolean;
  currencyPreference: 'EUR' | 'USD';
  sessionDurationHours: number;
  oidcEnabled: boolean;
  oidcProviderName: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  bankAccountsEnabled: boolean;
  bankAccounts: BankAccountSettings;
};

type SyncQueue = {
  months: Record<string, { payload: string; updatedAt: number }>;
  deletes: Record<string, { updatedAt: number }>;
  settings?: { payload: string; updatedAt: number };
};

export type BankAccount = {
  id: string;
  name: string;
  color: string;
};

export type BankAccountSettings = {
  person1: BankAccount[];
  person2: BankAccount[];
};

type ExpenseWizardState = {
  mode: 'create' | 'edit';
  step: 1 | 2;
  type: 'fixed' | 'free';
  personKey: 'person1' | 'person2';
  targetId?: string;
  name: string;
  amount: string;
  date: string;
  categoryOverrideId: string;
  isRecurring: boolean;
  recurringMonths: number;
  startMonth: string;
  propagate: boolean;
  accountId: string;
};

type JointWizardState = {
  mode: 'create' | 'edit';
  targetId?: string;
  type: 'deposit' | 'expense';
  date: string;
  description: string;
  amount: string;
  person: string;
};

const APP_VERSION = packageJson.version;

const API_BASE_URL = import.meta.env.VITE_API_URL?.replace(/\/$/, '') ?? '';

const apiUrl = (path: string) => `${API_BASE_URL}${path.startsWith('/') ? '' : '/'}${path}`;

const resolveAssetUrl = (value: string | null) => {
  if (!value) {
    return null;
  }
  if (/^(https?:|data:|blob:)/i.test(value)) {
    return value;
  }
  if (!API_BASE_URL) {
    return value;
  }
  return `${API_BASE_URL}${value.startsWith('/') ? '' : '/'}${value}`;
};

export type AuthUser = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  themePreference: 'light' | 'dark';
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

type BootstrapStatusResponse = {
  hasUsers: boolean;
};

type ResetTokenResponse = {
  resetToken: string;
  expiresAt: string;
};

type SettingsResponse = {
  settings: AppSettings;
};

type LatestVersionResponse = {
  repo: string;
  version: string | null;
  tag: string | null;
  updatedAt: string | null;
};

type BackupSettingsPayload = {
  data: AppSettings;
  updatedAt: string | null;
};

type BackupMonthPayload = {
  monthKey: string;
  data: BudgetData;
  updatedAt: string | null;
};

type BackupUserPayload = {
  id: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  themePreference: 'light' | 'dark';
  passwordHash: string;
  role: 'admin' | 'user';
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
};

type BackupOauthAccountPayload = {
  id: string;
  provider: string;
  issuer: string;
  subject: string;
  userId: string;
  createdAt: string;
};

type BackupPayload = {
  version: number;
  exportedAt: string;
  settings: BackupSettingsPayload | null;
  months: BackupMonthPayload[];
  users?: BackupUserPayload[];
  oauthAccounts?: BackupOauthAccountPayload[];
  mode?: 'replace';
};

type OidcConfigResponse = {
  enabled: boolean;
  providerName: string;
};

type OidcLinkResponse = {
  url: string;
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

const getInitialSidebarMonths = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return localStorage.getItem('showSidebarMonths') !== 'false';
};

const getInitialBudgetWidgetsEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  const stored = localStorage.getItem('budgetWidgetsEnabled');
  if (stored !== null) {
    return stored !== 'false';
  }
  return localStorage.getItem('dashboardWidgetsEnabled') !== 'false';
};

const getInitialLanguagePreference = (): LanguageCode => {
  if (typeof window === 'undefined') {
    return 'fr';
  }
  return localStorage.getItem('languagePreference') === 'en' ? 'en' : 'fr';
};

const getInitialCurrencyPreference = (): 'EUR' | 'USD' => {
  if (typeof window === 'undefined') {
    return 'EUR';
  }
  return localStorage.getItem('currencyPreference') === 'USD' ? 'USD' : 'EUR';
};

const getInitialBankAccountsEnabled = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return localStorage.getItem('bankAccountsEnabled') !== 'false';
};

const LAST_VIEWED_MONTH_KEY = 'lastViewedMonthKey';
const SYNC_QUEUE_STORAGE_KEY = 'syncQueue';
const OFFLINE_BUDGET_CACHE_KEY = 'offlineBudgetCache';

const getLastViewedMonthStorageKey = (userHandle?: string | null) => (
  userHandle ? `${LAST_VIEWED_MONTH_KEY}:${userHandle}` : LAST_VIEWED_MONTH_KEY
);

const getInitialCurrentDate = (): Date => {
  if (typeof window === 'undefined') {
    return new Date();
  }
  const stored = localStorage.getItem(getLastViewedMonthStorageKey());
  if (stored && /^\d{4}-\d{2}$/.test(stored)) {
    const parsed = new Date(`${stored}-01`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
};

const getInitialOnlineStatus = (): boolean => {
  if (typeof window === 'undefined') {
    return true;
  }
  return navigator.onLine;
};

const loadSyncQueue = (): SyncQueue => {
  if (typeof window === 'undefined') {
    return { months: {}, deletes: {} };
  }
  const raw = localStorage.getItem(SYNC_QUEUE_STORAGE_KEY);
  if (!raw) {
    return { months: {}, deletes: {} };
  }
  try {
    const parsed = JSON.parse(raw) as SyncQueue;
    const months = parsed?.months && typeof parsed.months === 'object' ? parsed.months : {};
    const deletes = parsed?.deletes && typeof parsed.deletes === 'object' ? parsed.deletes : {};
    const settings = parsed?.settings && typeof parsed.settings === 'object' ? parsed.settings : undefined;
    return { months, deletes, settings };
  } catch (error) {
    return { months: {}, deletes: {} };
  }
};

const loadBudgetCache = (): MonthlyBudget | null => {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = localStorage.getItem(OFFLINE_BUDGET_CACHE_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as MonthlyBudget;
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
};
type AuthStorageSnapshot = {
  token: string | null;
  user: string;
  profile: AuthUser | null;
  storage: 'local' | 'session';
};

const getStoredAuthSnapshot = (): AuthStorageSnapshot => {
  if (typeof window === 'undefined') {
    return {
      token: null,
      user: '',
      profile: null,
      storage: 'local'
    };
  }
  const parseProfile = (raw: string | null) => {
    if (!raw) {
      return null;
    }
    try {
      return JSON.parse(raw) as AuthUser;
    } catch (error) {
      return null;
    }
  };
  const localToken = localStorage.getItem('authToken');
  if (localToken) {
    return {
      token: localToken,
      user: localStorage.getItem('authUser') ?? '',
      profile: parseProfile(localStorage.getItem('authProfile')),
      storage: 'local'
    };
  }
  const sessionToken = sessionStorage.getItem('authToken');
  if (sessionToken) {
    return {
      token: sessionToken,
      user: sessionStorage.getItem('authUser') ?? '',
      profile: parseProfile(sessionStorage.getItem('authProfile')),
      storage: 'session'
    };
  }
  return {
    token: null,
    user: '',
    profile: null,
    storage: 'local'
  };
};

const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('authToken') ?? sessionStorage.getItem('authToken');
};

const persistAuthStorage = (
  storage: 'local' | 'session',
  token: string | null,
  user: string,
  profile: AuthUser | null
) => {
  if (typeof window === 'undefined') {
    return;
  }
  const primary = storage === 'local' ? localStorage : sessionStorage;
  const secondary = storage === 'local' ? sessionStorage : localStorage;
  if (token) {
    primary.setItem('authToken', token);
  } else {
    primary.removeItem('authToken');
  }
  if (user) {
    primary.setItem('authUser', user);
  } else {
    primary.removeItem('authUser');
  }
  if (profile) {
    primary.setItem('authProfile', JSON.stringify(profile));
  } else {
    primary.removeItem('authProfile');
  }
  secondary.removeItem('authToken');
  secondary.removeItem('authUser');
  secondary.removeItem('authProfile');
};

const clearAuthStorage = () => {
  if (typeof window === 'undefined') {
    return;
  }
  localStorage.removeItem('authToken');
  localStorage.removeItem('authUser');
  localStorage.removeItem('authProfile');
  sessionStorage.removeItem('authToken');
  sessionStorage.removeItem('authUser');
  sessionStorage.removeItem('authProfile');
};

const getAuthHeaders = (): Record<string, string> => {
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

export type PaletteSlot = {
  lightBg: string;
  darkBg: string;
  lightText: string;
  darkText: string;
  swatch: string;
};

export type Palette = {
  id: string;
  name: string;
  dominant: string;
  slots: [PaletteSlot, PaletteSlot, PaletteSlot, PaletteSlot];
};

const PALETTES: Palette[] = [
  {
    id: 'default',
    name: 'Cloud',
    dominant: '#94A3B8',
    slots: [
      {
        lightBg: 'rgba(255, 255, 255, 0.9)',
        darkBg: 'rgba(15, 23, 42, 0.72)',
        lightText: '#64748B',
        darkText: '#CBD5F5',
        swatch: '#94A3B8'
      },
      {
        lightBg: 'rgba(255, 255, 255, 0.9)',
        darkBg: 'rgba(15, 23, 42, 0.72)',
        lightText: '#64748B',
        darkText: '#CBD5F5',
        swatch: '#94A3B8'
      },
      {
        lightBg: 'rgba(255, 255, 255, 0.9)',
        darkBg: 'rgba(15, 23, 42, 0.72)',
        lightText: '#64748B',
        darkText: '#CBD5F5',
        swatch: '#94A3B8'
      },
      {
        lightBg: 'rgba(255, 255, 255, 0.9)',
        darkBg: 'rgba(15, 23, 42, 0.72)',
        lightText: '#64748B',
        darkText: '#CBD5F5',
        swatch: '#94A3B8'
      }
    ]
  },
  {
    id: 'emerald-coral-sand-violet',
    name: 'Citrus',
    dominant: '#1F9D6A',
    slots: [
      {
        lightBg: '#E9F8F0',
        darkBg: '#0E2A1E',
        lightText: '#1F7A4C',
        darkText: '#7EE8B0',
        swatch: '#1F9D6A'
      },
      {
        lightBg: '#FFF1EC',
        darkBg: '#331513',
        lightText: '#C2553E',
        darkText: '#F7B0A1',
        swatch: '#E56B5B'
      },
      {
        lightBg: '#FFF5E5',
        darkBg: '#35240E',
        lightText: '#C57B2A',
        darkText: '#F6C27A',
        swatch: '#F4A259'
      },
      {
        lightBg: '#F1ECFF',
        darkBg: '#1C1436',
        lightText: '#6D4BD9',
        darkText: '#B6A1FF',
        swatch: '#7D5CE8'
      }
    ]
  },
  {
    id: 'teal-citrus-clay',
    name: 'Berry',
    dominant: '#18A89E',
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
      },
      {
        lightBg: '#FCE7F3',
        darkBg: '#3A1126',
        lightText: '#BE185D',
        darkText: '#F9A8D4',
        swatch: '#E0488F'
      }
    ]
  },
  {
    id: 'navy-mint-apricot',
    name: 'Berry',
    dominant: '#3454C5',
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
      },
      {
        lightBg: '#F2EEFF',
        darkBg: '#1B1736',
        lightText: '#6B4FD6',
        darkText: '#C4B5FD',
        swatch: '#8B5CF6'
      }
    ]
  }
];

const getInitialPaletteId = (mode: 'light' | 'dark') => {
  if (typeof window === 'undefined') {
    return PALETTES[0].id;
  }
  const key = mode === 'dark' ? 'paletteIdDark' : 'paletteIdLight';
  return localStorage.getItem(key) ?? localStorage.getItem('paletteId') ?? PALETTES[0].id;
};

const getCurrentMonthKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};

const getDefaultDateForMonthKey = (monthKey: string, baseDate = new Date()) => {
  const [yearValue, monthValue] = monthKey.split('-');
  const year = Number(yearValue);
  const month = Number(monthValue);
  if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
    return '';
  }
  const day = baseDate.getDate();
  const daysInMonth = new Date(year, month, 0).getDate();
  const safeDay = Math.min(Math.max(day, 1), daysInMonth);
  return `${year}-${String(month).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
};

const calculateTotalIncome = (incomeSources: IncomeSource[]) => {
  return incomeSources.reduce((sum, source) => sum + coerceNumber(source.amount), 0);
};

const calculateTotalFixed = (expenses: FixedExpense[]) => {
  return expenses.reduce((sum, exp) => sum + exp.amount, 0);
};

const calculateTotalCategories = (categories: Category[]) => {
  return categories.reduce((sum, cat) => sum + cat.amount, 0);
};

const calculateActualFixed = (expenses: FixedExpense[]) => (
  expenses.reduce((sum, exp) => (exp.isChecked ? sum + coerceNumber(exp.amount) : sum), 0)
);

const calculateActualCategories = (categories: Category[]) => (
  categories.reduce((sum, cat) => (cat.isChecked ? sum + coerceNumber(cat.amount) : sum), 0)
);

const calculatePlannedExpensesForData = (budget: BudgetData) => (
  calculateTotalFixed(budget.person1.fixedExpenses)
  + calculateTotalFixed(budget.person2.fixedExpenses)
  + calculateTotalCategories(budget.person1.categories)
  + calculateTotalCategories(budget.person2.categories)
);

const calculateActualExpensesForData = (budget: BudgetData) => (
  calculateActualFixed(budget.person1.fixedExpenses)
  + calculateActualFixed(budget.person2.fixedExpenses)
  + calculateActualCategories(budget.person1.categories)
  + calculateActualCategories(budget.person2.categories)
);

const calculateTotalIncomeForData = (budget: BudgetData) => (
  calculateTotalIncome(budget.person1.incomeSources)
  + calculateTotalIncome(budget.person2.incomeSources)
);

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

const reorderList = <T,>(list: T[], startIndex: number, endIndex: number) => {
  const result = [...list];
  const [removed] = result.splice(startIndex, 1);
  if (removed === undefined) {
    return result;
  }
  result.splice(endIndex, 0, removed);
  return result;
};

const normalizeIconLabel = (value: string) => (
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
);

const getOrderKey = (item: { templateId?: string; name: string }) => (
  item.templateId || normalizeIconLabel(item.name)
);

const buildOrderKeys = <T extends { templateId?: string; name: string }>(items: T[]) => (
  items.map(getOrderKey).filter(Boolean)
);

const reorderListByKeys = <T extends { templateId?: string; name: string }>(items: T[], orderKeys: string[]) => {
  if (orderKeys.length === 0) {
    return items;
  }
  const orderMap = new Map(orderKeys.map((key, index) => [key, index]));
  const withRank: Array<{ item: T; rank: number }> = [];
  const withoutRank: T[] = [];
  items.forEach(item => {
    const key = getOrderKey(item);
    if (key && orderMap.has(key)) {
      withRank.push({ item, rank: orderMap.get(key)! });
    } else {
      withoutRank.push(item);
    }
  });
  withRank.sort((a, b) => a.rank - b.rank);
  return [...withRank.map(entry => entry.item), ...withoutRank];
};

const hasSameOrder = <T extends { id: string }>(a: T[], b: T[]) => (
  a.length === b.length && a.every((item, index) => item.id === b[index]?.id)
);

const titleizeLabel = (value: string) => (
  value
    .trim()
    .split(/\s+/)
    .map(word => (
      word
        .split('-')
        .map(part => (part ? part[0].toUpperCase() + part.slice(1).toLowerCase() : ''))
        .join('-')
    ))
    .join(' ')
);

const formatExpenseDate = (value: string, language: LanguageCode) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(language === 'en' ? 'en-US' : 'fr-FR', {
    day: '2-digit',
    month: 'short'
  });
};

const DEFAULT_FIXED_EXPENSE_LABELS = [
  normalizeIconLabel(TRANSLATIONS.fr.newFixedExpenseLabel),
  normalizeIconLabel(TRANSLATIONS.en.newFixedExpenseLabel)
];

const shouldPropagateFixedExpense = (name: string) => {
  const normalized = normalizeIconLabel(name);
  return Boolean(normalized) && !DEFAULT_FIXED_EXPENSE_LABELS.includes(normalized);
};

const DEFAULT_INCOME_SOURCE_LABELS = [
  normalizeIconLabel(TRANSLATIONS.fr.newIncomeSourceLabel),
  normalizeIconLabel(TRANSLATIONS.en.newIncomeSourceLabel)
];

const shouldPropagateIncomeSource = (name: string) => {
  const normalized = normalizeIconLabel(name);
  return Boolean(normalized) && !DEFAULT_INCOME_SOURCE_LABELS.includes(normalized);
};

const DEFAULT_CATEGORY_LABELS = [
  normalizeIconLabel(TRANSLATIONS.fr.newCategoryLabel),
  normalizeIconLabel(TRANSLATIONS.en.newCategoryLabel)
];

const shouldPropagateCategory = (name: string) => {
  const normalized = normalizeIconLabel(name);
  return Boolean(normalized) && !DEFAULT_CATEGORY_LABELS.includes(normalized);
};

const createTemplateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

const BANK_ACCOUNT_LIMIT = 3;
const UNASSIGNED_ACCOUNT_ID = 'unassigned';
const BANK_ACCOUNT_COLORS = ['#6366F1', '#10B981', '#F97316'];

const isValidHexColor = (value: unknown) => typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim());

const getBankAccountBaseLabel = (language: LanguageCode) => (
  TRANSLATIONS[language]?.bankAccountBaseLabel ?? 'Compte'
);

const getDefaultAccountColor = (index: number) => (
  BANK_ACCOUNT_COLORS[index % BANK_ACCOUNT_COLORS.length]
);

const createBankAccount = (name: string, color: string): BankAccount => ({
  id: createTemplateId(),
  name,
  color
});

const normalizeBankAccountList = (input: unknown, language: LanguageCode): BankAccount[] => {
  const baseLabel = getBankAccountBaseLabel(language);
  const next: BankAccount[] = [];
  const usedIds = new Set<string>();
  if (Array.isArray(input)) {
    input.forEach((raw, index) => {
      if (next.length >= BANK_ACCOUNT_LIMIT) {
        return;
      }
      const name = typeof raw?.name === 'string' ? raw.name.trim() : '';
      if (!name) {
        return;
      }
      let id = typeof raw?.id === 'string' && raw.id.trim() ? raw.id.trim() : createTemplateId();
      if (usedIds.has(id)) {
        id = createTemplateId();
      }
      usedIds.add(id);
      const color = isValidHexColor(raw?.color)
        ? raw.color.trim()
        : getDefaultAccountColor(index);
      next.push({ id, name, color });
    });
  }
  if (next.length === 0) {
    next.push(createBankAccount(`${baseLabel} 1`, getDefaultAccountColor(0)));
  }
  return next;
};

const normalizeBankAccounts = (input: unknown, language: LanguageCode): BankAccountSettings => {
  const source = typeof input === 'object' && input ? input as { person1?: unknown; person2?: unknown } : {};
  return {
    person1: normalizeBankAccountList(source.person1, language),
    person2: normalizeBankAccountList(source.person2, language)
  };
};

const getReadableTextColor = (hexColor: string) => {
  const value = hexColor.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b);
  return luminance > 160 ? '#0F172A' : '#FFFFFF';
};

const getAccountChipStyle = (color: string) => ({
  backgroundColor: color,
  color: getReadableTextColor(color),
  border: `1px solid ${color}`
}) as React.CSSProperties;

type AutoCategory = {
  id: string;
  emoji: string;
  labels: { fr: string; en: string };
  keywords: string[];
};

const AUTO_CATEGORIES: AutoCategory[] = [
  {
    id: 'groceries',
    emoji: '🛒',
    labels: { fr: 'Courses', en: 'Groceries' },
    keywords: [
      'course', 'courses', 'supermarche', 'supermarché', 'hypermarché', 'hypermarche',
      'alimentation', 'epicerie', 'épicerie', 'primeur', 'boucherie', 'boulangerie',
      'drive', 'livraison courses',
      'grocery', 'groceries', 'supermarket', 'food',
      'carrefour', 'leclerc', 'e.leclerc', 'intermarche', 'intermarché', 'auchan',
      'lidl', 'aldi', 'monoprix', 'casino', 'picard', 'franprix', 'u express', 'super u'
    ]
  },
  {
    id: 'health',
    emoji: '❤️',
    labels: { fr: 'Santé', en: 'Health' },
    keywords: [
      'sante', 'santé', 'medecin', 'médecin', 'docteur', 'consultation', 'hopital', 'hôpital',
      'pharmacie', 'mutuelle', 'prevoyance', 'prévoyance', 'kine', 'kiné', 'dent', 'dentaire',
      'dentiste', 'optique', 'ophtalmo', 'lunettes', 'radiologie', 'analyse', 'laboratoire',
      'health', 'doctor', 'clinic', 'hospital', 'pharmacy', 'insurance', 'dental', 'dentist', 'optical',
      'doctolib', 'cpam', 'ameli'
    ]
  },
  {
    id: 'transport',
    emoji: '🚗',
    labels: { fr: 'Transport', en: 'Transport' },
    keywords: [
      'transport', 'voiture', 'auto', 'vehicule', 'véhicule', 'essence', 'carburant', 'diesel',
      'peage', 'péage', 'parking', 'stationnement', 'taxis', 'uber', 'bolt', 'vtc',
      'metro', 'métro', 'bus', 'tram', 'train', 'sncf', 'rer',
      'entretien', 'revision', 'révision', 'garage', 'pneu', 'peinture', 'carte grise',
      'fuel', 'gas', 'petrol', 'toll', 'parking', 'subway', 'bus', 'tram', 'train',
      'total', 'totalenergies', 'total energies', 'shell', 'esso', 'bp'
    ]
  },
  {
    id: 'housing',
    emoji: '🏠',
    labels: { fr: 'Logement', en: 'Housing' },
    keywords: [
      'loyer', 'logement', 'habitation', 'immobilier', 'credit immo', 'crédit immo',
      'credit immobilier', 'crédit immobilier', 'copropriete', 'copropriété',
      'charges', 'syndic', 'agence', 'caution',
      'eau', 'plombier', 'electricien', 'électricien', 'serrurier',
      'rent', 'housing', 'mortgage', 'property', 'hoa', 'condo fee'
    ]
  },
  {
    id: 'bills',
    emoji: '💡',
    labels: { fr: 'Factures', en: 'Bills' },
    keywords: [
      'facture', 'factures', 'electricite', 'électricité', 'edf', 'enedis',
      'gaz', 'grdf', 'eau', 'assainissement',
      'internet', 'fibre', 'box', 'wifi', 'téléphone', 'telephone', 'mobile', 'forfait',
      'bill', 'bills', 'electricity', 'gas', 'water', 'internet', 'phone', 'mobile plan',
      'sfr', 'orange', 'bouygues', 'free', 'free mobile', 'red', 'sosh', 'prixtel',
      'veolia', 'suez'
    ]
  },
  {
    id: 'subscriptions',
    emoji: '📺',
    labels: { fr: 'Abonnements', en: 'Subscriptions' },
    keywords: [
      'abonnement', 'abonnements', 'streaming', 'musique', 'cloud', 'stockage', 'logiciel', 'saas',
      'subscription', 'subscriptions', 'streaming', 'music', 'cloud', 'software', 'saas',
      'netflix', 'spotify', 'deezer', 'apple music', 'youtube premium', 'prime video', 'amazon prime',
      'disney', 'disney+', 'canal', 'canal+', 'mycanal',
      'icloud', 'i cloud', 'google one', 'dropbox', 'onedrive', 'one drive',
      'chatgpt', 'openai', 'github', 'gitlab'
    ]
  },
  {
    id: 'everyday',
    emoji: '👕',
    labels: { fr: 'Quotidien', en: 'Everyday' },
    keywords: [
      'quotidien', 'shopping', 'vetement', 'vêtement', 'vetements', 'vêtements', 'chaussure', 'chaussures',
      'coiffeur', 'beaute', 'beauté', 'esthetique', 'esthétique', 'ongle', 'ongles', 'manucure',
      'pressing', 'lingerie', 'parfum', 'cosmetique', 'cosmétique',
      'clothes', 'shoes', 'hairdresser', 'beauty', 'nails', 'dry cleaning'
    ]
  },
  {
    id: 'fitness',
    emoji: '🏋️',
    labels: { fr: 'Sport', en: 'Fitness' },
    keywords: [
      'sport', 'salle', 'gym', 'fitness', 'abonnement salle', 'coach', 'crossfit', 'yoga',
      'workout', 'training', 'membership',
      'basic fit', 'basic-fit', 'basicfit'
    ]
  },
  {
    id: 'leisure',
    emoji: '🎮',
    labels: { fr: 'Loisirs', en: 'Leisure' },
    keywords: [
      'loisir', 'loisirs', 'cinema', 'cinéma', 'jeux', 'jeu', 'gaming',
      'concert', 'evenement', 'évènement', 'sortie', 'bar', 'cafe', 'café',
      'voyage', 'vacances', 'hotel', 'hôtel', 'airbnb', 'restaurant',
      'leisure', 'cinema', 'movie', 'games', 'concert', 'event', 'trip', 'travel', 'hotel'
    ]
  },
  {
    id: 'family',
    emoji: '👶',
    labels: { fr: 'Famille', en: 'Family' },
    keywords: [
      'famille', 'enfant', 'enfants', 'bebe', 'bébé', 'garde', 'nounou', 'creche', 'crèche',
      'ecole', 'école', 'cantine', 'activite', 'activité',
      'family', 'kid', 'kids', 'baby', 'school', 'daycare'
    ]
  },
  {
    id: 'pets',
    emoji: '🐾',
    labels: { fr: 'Animaux', en: 'Pets' },
    keywords: [
      'animal', 'animaux', 'chien', 'chat', 'croquettes', 'litiere', 'litière', 'veterinaire', 'vétérinaire',
      'pet', 'pets', 'dog', 'cat', 'vet', 'veterinary'
    ]
  },
  {
    id: 'finance',
    emoji: '💳',
    labels: { fr: 'Finances', en: 'Finance' },
    keywords: [
      'finance', 'banque', 'frais bancaire', 'frais bancaires', 'commission', 'agios',
      'impot', 'impôts', 'taxe', 'amende', 'remboursement', 'credit', 'crédit',
      'compte joint',
      'bank', 'bank fee', 'fees', 'tax', 'fine', 'loan', 'repayment', 'joint account',
      'revolut', 'visa', 'mastercard'
    ]
  },
  {
    id: 'savings',
    emoji: '💰',
    labels: { fr: 'Épargne', en: 'Savings' },
    keywords: [
      'epargne', 'épargne', 'livret', 'livret a', 'livret A', 'ldds', 'pea', 'assurance vie',
      'placement', 'investissement',
      'savings', 'deposit', 'investment'
    ]
  },
  {
    id: 'gifts',
    emoji: '🎁',
    labels: { fr: 'Cadeaux', en: 'Gifts' },
    keywords: [
      'cadeau', 'cadeaux', 'don', 'dons', 'anniversaire', 'noel', 'noël',
      'gift', 'gifts', 'donation', 'donations'
    ]
  },
  {
    id: 'other',
    emoji: '📦',
    labels: { fr: 'Autres', en: 'Other' },
    keywords: [
      'autre', 'autres', 'divers', 'imprevu', 'imprévu', 'exceptionnel', 'inconnu',
      'other', 'misc', 'miscellaneous', 'unexpected'
    ]
  }
];

const AUTO_CATEGORY_KEYWORDS = AUTO_CATEGORIES.map(entry => ({
  entry,
  keywords: entry.keywords.map(normalizeIconLabel).filter(Boolean)
}));
const AUTO_CATEGORY_BY_ID = new Map(AUTO_CATEGORIES.map(entry => [entry.id, entry]));
const autoCategoryCache = new Map<string, AutoCategory | null>();

type IncomeCategory = {
  id: string;
  emoji: string;
  labels: { fr: string; en: string };
  keywords: string[];
};

const INCOME_CATEGORIES: IncomeCategory[] = [
  {
    id: 'salary',
    emoji: '💼',
    labels: { fr: 'Salaire', en: 'Salary' },
    keywords: ['salaire', 'paie', 'paye', 'payroll', 'salary', 'wage']
  },
  {
    id: 'bonus',
    emoji: '✨',
    labels: { fr: 'Prime', en: 'Bonus' },
    keywords: ['prime', 'bonus', 'gratification', 'reward']
  },
  {
    id: 'freelance',
    emoji: '🧑‍💻',
    labels: { fr: 'Freelance', en: 'Freelance' },
    keywords: ['freelance', 'mission', 'prestation', 'facture', 'invoice', 'contract']
  },
  {
    id: 'rent',
    emoji: '🏠',
    labels: { fr: 'Loyer', en: 'Rent' },
    keywords: ['loyer', 'rent', 'rental', 'locatif']
  },
  {
    id: 'investment',
    emoji: '📈',
    labels: { fr: 'Investissements', en: 'Investments' },
    keywords: ['dividende', 'dividendes', 'interest', 'interet', 'intérêts', 'invest', 'placement']
  },
  {
    id: 'benefit',
    emoji: '🤝',
    labels: { fr: 'Aides', en: 'Benefits' },
    keywords: ['caf', 'aide', 'aides', 'allocation', 'allocations', 'benefit', 'benefits']
  },
  {
    id: 'other',
    emoji: '📦',
    labels: { fr: 'Autres', en: 'Other' },
    keywords: ['autre', 'autres', 'divers', 'other', 'misc']
  }
];

const INCOME_CATEGORY_KEYWORDS = INCOME_CATEGORIES.map(entry => ({
  entry,
  keywords: entry.keywords.map(normalizeIconLabel).filter(Boolean)
}));
const INCOME_CATEGORY_BY_ID = new Map(INCOME_CATEGORIES.map(entry => [entry.id, entry]));
const autoIncomeCategoryCache = new Map<string, IncomeCategory | null>();

const getAutoCategory = (label: string) => {
  const normalized = normalizeIconLabel(label);
  if (!normalized || normalized === 'nouvelle categorie' || normalized === 'new category' || normalized === 'nouvelle depense') {
    return null;
  }
  if (autoCategoryCache.has(normalized)) {
    return autoCategoryCache.get(normalized) ?? null;
  }
  for (const entry of AUTO_CATEGORY_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (keyword && normalized.includes(keyword)) {
        autoCategoryCache.set(normalized, entry.entry);
        return entry.entry;
      }
    }
  }
  const fallback = AUTO_CATEGORIES[AUTO_CATEGORIES.length - 1] ?? null;
  autoCategoryCache.set(normalized, fallback);
  return fallback;
};

const getAutoIncomeCategory = (label: string) => {
  const normalized = normalizeIconLabel(label);
  if (!normalized || normalized === 'nouvelle source' || normalized === 'new source') {
    return null;
  }
  if (autoIncomeCategoryCache.has(normalized)) {
    return autoIncomeCategoryCache.get(normalized) ?? null;
  }
  for (const entry of INCOME_CATEGORY_KEYWORDS) {
    for (const keyword of entry.keywords) {
      if (keyword && normalized.includes(keyword)) {
        autoIncomeCategoryCache.set(normalized, entry.entry);
        return entry.entry;
      }
    }
  }
  const fallback = INCOME_CATEGORIES[INCOME_CATEGORIES.length - 1] ?? null;
  autoIncomeCategoryCache.set(normalized, fallback);
  return fallback;
};

const getCategoryById = (id?: string | null) => {
  if (!id) {
    return null;
  }
  return AUTO_CATEGORY_BY_ID.get(id) ?? null;
};

const getIncomeCategoryById = (id?: string | null) => {
  if (!id) {
    return null;
  }
  return INCOME_CATEGORY_BY_ID.get(id) ?? null;
};

const CATEGORY_BADGE_CLASSES: Record<string, string> = {
  groceries: 'chip-groceries',
  health: 'chip-health',
  transport: 'chip-transport',
  housing: 'chip-housing',
  bills: 'chip-bills',
  subscriptions: 'chip-subscriptions',
  everyday: 'chip-everyday',
  sport: 'chip-sport',
  leisure: 'chip-leisure',
  family: 'chip-family',
  pets: 'chip-pets',
  finance: 'chip-finance',
  savings: 'chip-savings',
  gifts: 'chip-gifts',
  other: 'chip-other'
};

const getCategoryBadgeClass = (categoryId: string, darkMode: boolean) => {
  if (darkMode) {
    return 'category-chip bg-white/10 text-slate-200';
  }
  return `category-chip ${CATEGORY_BADGE_CLASSES[categoryId] ?? 'chip-other'}`;
};

const INCOME_CATEGORY_BADGE_CLASSES: Record<string, string> = {
  salary: 'chip-income-salary',
  bonus: 'chip-income-bonus',
  freelance: 'chip-income-freelance',
  rent: 'chip-income-rent',
  investment: 'chip-income-investment',
  benefit: 'chip-income-benefit',
  other: 'chip-income-other'
};

const getIncomeCategoryBadgeClass = (categoryId: string, darkMode: boolean) => {
  if (darkMode) {
    return 'category-chip bg-white/10 text-slate-200';
  }
  return `category-chip ${INCOME_CATEGORY_BADGE_CLASSES[categoryId] ?? 'chip-income-other'}`;
};

const formatAmount = (value: number) => {
  const numeric = Number.isFinite(value) ? value : 0;
  return String(Math.round(numeric));
};

const formatCurrency = (value: number, currency: 'EUR' | 'USD') => {
  const amount = formatAmount(value);
  return currency === 'USD' ? `$${amount}` : `${amount} €`;
};

const compareVersions = (current: string, latest: string) => {
  const partsA = current.split('.').map(Number);
  const partsB = latest.split('.').map(Number);
  const length = Math.max(partsA.length, partsB.length);
  for (let i = 0; i < length; i += 1) {
    const valueA = partsA[i] ?? 0;
    const valueB = partsB[i] ?? 0;
    if (valueA > valueB) {
      return 1;
    }
    if (valueA < valueB) {
      return -1;
    }
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

const useMediaQuery = (query: string) => {
  const getMatch = () => {
    if (typeof window === 'undefined') {
      return false;
    }
    return window.matchMedia(query).matches;
  };
  const [matches, setMatches] = useState(getMatch);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const media = window.matchMedia(query);
    const update = () => setMatches(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener('change', update);
    } else {
      media.addListener(update);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update);
      } else {
        media.removeListener(update);
      }
    };
  }, [query]);

  return matches;
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
      amount: coerceNumber(source.amount),
      propagate: source.propagate !== false
    })),
    fixedExpenses: (data.person1?.fixedExpenses ?? []).map(expense => ({
      ...expense,
      amount: coerceNumber(expense.amount),
      isChecked: Boolean(expense.isChecked)
    })),
    categories: (data.person1?.categories ?? []).map(category => ({
      ...category,
      amount: coerceNumber(category.amount),
      isChecked: Boolean(category.isChecked),
      propagate: category.propagate !== false
    }))
  },
  person2: {
    ...data.person2,
    incomeSources: (data.person2?.incomeSources ?? []).map(source => ({
      ...source,
      amount: coerceNumber(source.amount),
      propagate: source.propagate !== false
    })),
    fixedExpenses: (data.person2?.fixedExpenses ?? []).map(expense => ({
      ...expense,
      amount: coerceNumber(expense.amount),
      isChecked: Boolean(expense.isChecked)
    })),
    categories: (data.person2?.categories ?? []).map(category => ({
      ...category,
      amount: coerceNumber(category.amount),
      isChecked: Boolean(category.isChecked),
      propagate: category.propagate !== false
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

const getPaletteTone = (palette: Palette, slotIndex: number, darkMode: boolean) => {
  const slot = palette.slots[slotIndex] ?? palette.slots[0];
  return {
    background: darkMode ? slot.darkBg : slot.lightBg,
    text: darkMode ? slot.darkText : slot.lightText,
    border: darkMode ? slot.darkText : slot.lightText
  };
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

const fetchMonth = async (monthKey: string): Promise<{ data: BudgetData; updatedAt: string | null } | null> => {
  const response = await fetch(apiUrl(`/api/months/${monthKey}`), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw createApiError(`Failed to load month (${response.status})`, response.status);
  }
  const payload = await response.json() as { data?: BudgetData; updatedAt?: string | null };
  if (!payload?.data) {
    return null;
  }
  return { data: payload.data, updatedAt: payload.updatedAt ?? null };
};

const upsertMonth = async (monthKey: string, data: BudgetData): Promise<string | null> => {
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
  const payload = await response.json() as { updatedAt?: string | null };
  return payload?.updatedAt ?? null;
};

const isRetriableSyncError = (error: unknown) => {
  if (isAuthError(error)) {
    return false;
  }
  const status = typeof error === 'object' && error ? (error as ApiError).status : undefined;
  if (status && status < 500) {
    return false;
  }
  return true;
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
  if (response.status === 404) {
    return;
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

const bootstrapAdminRequest = async (payload: {
  username: string;
  password: string;
  displayName?: string | null;
}): Promise<AuthUser> => {
  const response = await fetch(apiUrl('/api/auth/bootstrap'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to bootstrap (${response.status})`);
    throw createApiError(message, response.status);
  }
  const data = await response.json() as UserResponse;
  return data.user;
};

const fetchBootstrapStatus = async (): Promise<BootstrapStatusResponse> => {
  const response = await fetch(apiUrl('/api/auth/bootstrap-status'));
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to check bootstrap (${response.status})`);
    throw createApiError(message, response.status);
  }
  return response.json() as Promise<BootstrapStatusResponse>;
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

const fetchAppSettings = async (): Promise<AppSettings> => {
  const response = await fetch(apiUrl('/api/settings'), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to load settings (${response.status})`);
    throw createApiError(message, response.status);
  }
  const payload = await response.json() as SettingsResponse;
  return payload.settings;
};

const fetchLatestVersion = async (): Promise<LatestVersionResponse | null> => {
  const response = await fetch(apiUrl('/api/version/latest'));
  if (!response.ok) {
    return null;
  }
  return await response.json() as LatestVersionResponse;
};

const fetchOidcConfig = async (): Promise<OidcConfigResponse | null> => {
  const response = await fetch(apiUrl('/api/auth/oidc/config'));
  if (!response.ok) {
    return null;
  }
  return await response.json() as OidcConfigResponse;
};

const startOidcLinkRequest = async (): Promise<OidcLinkResponse> => {
  const response = await fetch(apiUrl('/api/auth/oidc/link'), {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to start OIDC link (${response.status})`);
    throw createApiError(message, response.status);
  }
  return await response.json() as OidcLinkResponse;
};

const updateAppSettingsRequest = async (payload: Partial<AppSettings>): Promise<AppSettings> => {
  const response = await fetch(apiUrl('/api/settings'), {
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
    const message = await parseApiErrorMessage(response, `Failed to update settings (${response.status})`);
    throw createApiError(message, response.status);
  }
  const payloadResponse = await response.json() as SettingsResponse;
  return payloadResponse.settings;
};

const exportBackupRequest = async (includeUsers: boolean): Promise<BackupPayload> => {
  const response = await fetch(apiUrl(`/api/backup/export?includeUsers=${includeUsers ? 'true' : 'false'}`), {
    headers: {
      ...getAuthHeaders()
    }
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to export backup (${response.status})`);
    throw createApiError(message, response.status);
  }
  return response.json() as Promise<BackupPayload>;
};

const importBackupRequest = async (payload: BackupPayload, includeUsers: boolean) => {
  const response = await fetch(apiUrl('/api/backup/import'), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...getAuthHeaders()
    },
    body: JSON.stringify({ ...payload, mode: 'replace', includeUsers })
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to import backup (${response.status})`);
    throw createApiError(message, response.status);
  }
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

const updateProfileRequest = async (payload: {
  displayName?: string | null;
  avatarUrl?: string | null;
  themePreference?: 'light' | 'dark';
}): Promise<AuthUser> => {
  const response = await fetch(apiUrl('/api/users/me'), {
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
    const message = await parseApiErrorMessage(response, `Failed to update profile (${response.status})`);
    throw createApiError(message, response.status);
  }
  const data = await response.json() as UserResponse;
  return data.user;
};

const uploadProfileImageRequest = async (file: File): Promise<AuthUser> => {
  const formData = new FormData();
  formData.append('avatar', file);
  const response = await fetch(apiUrl('/api/users/me/avatar'), {
    method: 'POST',
    headers: {
      ...getAuthHeaders()
    },
    body: formData
  });
  if (response.status === 401) {
    throw createApiError('Unauthorized', 401);
  }
  if (!response.ok) {
    const message = await parseApiErrorMessage(response, `Failed to upload avatar (${response.status})`);
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
  readOnly: boolean;
  darkMode: boolean;
  sortByCost: boolean;
  enableDrag: boolean;
  palette: Palette;
  currencyPreference: 'EUR' | 'USD';
  bankAccountsEnabled: boolean;
  bankAccounts: BankAccountSettings;
  editingName: string | null;
  tempName: string;
  setTempName: (value: string) => void;
  startEditingName: (personKey: 'person1' | 'person2') => void;
  saveName: (personKey: 'person1' | 'person2') => void;
  cancelEditingName: () => void;
  addIncomeSource: (personKey: 'person1' | 'person2') => void;
  deleteIncomeSource: (personKey: 'person1' | 'person2', id: string) => void;
  updateIncomeSource: (
    personKey: 'person1' | 'person2',
    id: string,
    field: 'name' | 'amount' | 'categoryOverrideId' | 'propagate',
    value: string | number | boolean
  ) => void;
  reorderIncomeSources: (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => void;
  openExpenseWizard: (personKey: 'person1' | 'person2', type: 'fixed' | 'free') => void;
  openExpenseWizardForEdit: (personKey: 'person1' | 'person2', type: 'fixed' | 'free', payload: FixedExpense | Category) => void;
  updateFixedExpense: (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount' | 'isChecked' | 'categoryOverrideId', value: string | number | boolean) => void;
  reorderFixedExpenses: (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => void;
  updateCategory: (personKey: 'person1' | 'person2', id: string, field: keyof Category, value: string | number | boolean) => void;
  reorderCategories: (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => void;
};

type BudgetHeaderSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'readOnly'
  | 'darkMode'
  | 'enableDrag'
  | 'palette'
  | 'currencyPreference'
  | 'addIncomeSource'
  | 'deleteIncomeSource'
  | 'updateIncomeSource'
  | 'reorderIncomeSources'
>;

type BudgetFixedSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'readOnly'
  | 'darkMode'
  | 'sortByCost'
  | 'enableDrag'
  | 'palette'
  | 'currencyPreference'
  | 'bankAccountsEnabled'
  | 'bankAccounts'
  | 'openExpenseWizard'
  | 'openExpenseWizardForEdit'
  | 'updateFixedExpense'
  | 'reorderFixedExpenses'
> & {
  useSharedDragContext?: boolean;
};

type BudgetFreeSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'readOnly'
  | 'darkMode'
  | 'sortByCost'
  | 'enableDrag'
  | 'palette'
  | 'currencyPreference'
  | 'bankAccountsEnabled'
  | 'bankAccounts'
  | 'openExpenseWizard'
  | 'openExpenseWizardForEdit'
  | 'updateCategory'
  | 'reorderCategories'
> & {
  useSharedDragContext?: boolean;
};

type PersonColumnHeaderProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'readOnly'
  | 'darkMode'
  | 'editingName'
  | 'tempName'
  | 'setTempName'
  | 'startEditingName'
  | 'saveName'
  | 'cancelEditingName'
>;

const PersonColumnHeader = React.memo(({
  person,
  personKey,
  readOnly,
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
    {editingName === personKey && !isLinked && !readOnly ? (
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={tempName}
          onChange={(e) => setTempName(e.target.value)}
          className={`px-3 py-1.5 border rounded-lg text-sm ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
        />
        <button onClick={() => saveName(personKey)} className={darkMode ? 'text-emerald-300' : 'text-emerald-600'}>
          <Check size={16} />
        </button>
        <button onClick={cancelEditingName} className="text-red-600">
          <X size={16} />
        </button>
      </div>
    ) : (
      <div className="flex items-center gap-2">
        <h2 className={`text-2xl sm:text-3xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
          {person.name}
        </h2>
        {!isLinked && !readOnly && (
          <button onClick={() => startEditingName(personKey)} className={darkMode ? 'text-slate-300' : 'text-slate-500'}>
            <Edit2 size={16} />
          </button>
        )}
      </div>
    )}
  </div>
));
PersonColumnHeader.displayName = 'PersonColumnHeader';

const BudgetHeaderSection = React.memo(({
  person,
  personKey,
  readOnly,
  darkMode,
  enableDrag,
  palette,
  currencyPreference,
  addIncomeSource,
  deleteIncomeSource,
  updateIncomeSource,
  reorderIncomeSources
}: BudgetHeaderSectionProps) => {
  const { t, language } = useTranslation();
  const { totalFixed, totalCategories, totalIncome, totalExpenses, available } = useMemo(() => {
    const totalFixedValue = calculateTotalFixed(person.fixedExpenses);
    const totalCategoriesValue = calculateTotalCategories(person.categories);
    const totalIncomeValue = calculateTotalIncome(person.incomeSources);
    const totalExpensesValue = totalFixedValue + totalCategoriesValue;
    const availableValue = totalIncomeValue - totalExpensesValue;
    return {
      totalFixed: totalFixedValue,
      totalCategories: totalCategoriesValue,
      totalIncome: totalIncomeValue,
      totalExpenses: totalExpensesValue,
      available: availableValue
    };
  }, [person.fixedExpenses, person.categories, person.incomeSources]);
  const animatedIncome = useAnimatedNumber(totalIncome);
  const animatedExpenses = useAnimatedNumber(totalExpenses);
  const animatedAvailable = useAnimatedNumber(available);
  const revenueTone = useMemo(() => getPaletteTone(palette, 0, darkMode), [palette, darkMode]);
  const isDefaultPalette = palette.id === 'default';
  const revenueHeaderStyle = useMemo(
    () => (isDefaultPalette ? { color: darkMode ? '#E2E8F0' : '#334155' } : { color: revenueTone.text }),
    [darkMode, isDefaultPalette, revenueTone.text]
  );
  const revenueButtonStyle = useMemo(
    () => ({
      borderColor: revenueTone.border,
      color: revenueTone.text,
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.7)'
    }),
    [darkMode, revenueTone.border, revenueTone.text]
  );
  const summaryLabelClass = darkMode ? 'text-slate-400' : 'text-slate-500';
  const summaryValueClass = darkMode ? 'text-slate-100' : 'text-slate-700';
  const canDrag = enableDrag && !readOnly;
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderIncomeSources(personKey, result.source.index, result.destination.index);
  }, [personKey, reorderIncomeSources]);

  return (
    <div
      className={`min-w-0 p-5 mb-4 flex flex-col sm:h-full rounded-2xl border border-l-4 ${
        darkMode ? 'border-slate-800' : 'card-float'
      }`}
      style={{
        backgroundColor: revenueTone.background,
        borderColor: revenueTone.border,
        border: isDefaultPalette ? 'none' : undefined
      }}
    >
      <div className="mb-3">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold" style={revenueHeaderStyle}>{t('incomeLabel')}:</span>
          <button
            type="button"
            onClick={() => addIncomeSource(personKey)}
            disabled={readOnly}
            className={`h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105 ${
              readOnly ? 'opacity-60 cursor-not-allowed' : ''
            }`}
            style={revenueButtonStyle}
            aria-label={t('addLabel')}
          >
            <Plus size={16} />
          </button>
        </div>
        {canDrag ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`income-${personKey}`}>
              {(provided: DroppableProvided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {person.incomeSources.map((source, index) => {
                    const resolvedCategory = source.categoryOverrideId
                      ? getIncomeCategoryById(source.categoryOverrideId)
                      : getAutoIncomeCategory(source.name);
                    const categoryLabel = resolvedCategory
                      ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en)
                      : t('incomeCategoryLabel');
                    const badgeClass = resolvedCategory
                      ? getIncomeCategoryBadgeClass(resolvedCategory.id, darkMode)
                      : null;
                    const chipClass = badgeClass ?? (darkMode ? 'category-chip bg-white/10 text-slate-200' : 'category-chip chip-income-other');
                    const categoryValue = source.categoryOverrideId || 'auto';
                    const autoLabel = resolvedCategory
                      ? `${t('autoLabel')} · ${resolvedCategory.emoji} ${categoryLabel}`
                      : `${t('autoLabel')} · ${t('incomeCategoryLabel')}`;
                    const triggerLabel = resolvedCategory
                      ? `${resolvedCategory.emoji} ${categoryLabel}`
                      : t('incomeCategoryLabel');
                    const isLinked = source.propagate !== false;

                    return (
                      <Draggable key={source.id} draggableId={`income-${personKey}-${source.id}`} index={index}>
                        {(dragProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border ${
                              darkMode ? 'border-slate-800' : 'border-slate-100'
                            } ${darkMode ? 'bg-slate-900/60' : 'bg-white/90'} ${
                              snapshot.isDragging ? (darkMode ? 'ring-1 ring-white/20' : 'ring-1 ring-slate-200') : ''
                            }`}
                            style={dragProvided.draggableProps.style}
                          >
                            <span
                              {...dragProvided.dragHandleProps}
                              className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                              aria-label={t('dragHandleLabel')}
                            >
                              <GripVertical size={14} />
                            </span>
                            <input
                              type="text"
                              value={source.name}
                              onChange={(e) => {
                                if (readOnly) {
                                  return;
                                }
                                updateIncomeSource(personKey, source.id, 'name', e.target.value);
                              }}
                              readOnly={readOnly}
                              className={`flex-1 min-w-0 sm:min-w-[10rem] px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                              placeholder={t('incomePlaceholder')}
                            />
                            <Select
                              value={categoryValue}
                              onValueChange={(value) => {
                                if (readOnly) {
                                  return;
                                }
                                updateIncomeSource(personKey, source.id, 'categoryOverrideId', value === 'auto' ? '' : value);
                              }}
                            >
                              <SelectTrigger
                                disabled={readOnly}
                                aria-label={t('incomeCategoryLabel')}
                                className={`${chipClass} h-auto w-auto border-none shadow-none [&_svg]:hidden ${
                                  readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                                }`}
                              >
                                <span className="inline-flex items-center gap-1">{triggerLabel}</span>
                              </SelectTrigger>
                              <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                                <SelectItem value="auto">{autoLabel}</SelectItem>
                                {INCOME_CATEGORIES.map(category => (
                                  <SelectItem key={category.id} value={category.id}>
                                    {category.emoji} {language === 'fr' ? category.labels.fr : category.labels.en}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <input
                              type="number"
                              value={source.amount}
                              onChange={(e) => {
                                if (readOnly) {
                                  return;
                                }
                                const nextValue = e.target.value;
                                updateIncomeSource(
                                  personKey,
                                  source.id,
                                  'amount',
                                  nextValue === '' ? '' : parseNumberInput(nextValue)
                                );
                              }}
                              readOnly={readOnly}
                              className={`w-24 flex-none px-3 py-2 border rounded-lg text-right text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                            />
                            <button
                              type="button"
                              onClick={() => updateIncomeSource(personKey, source.id, 'propagate', !isLinked)}
                              disabled={readOnly}
                              className={`p-1 rounded-full border ${
                                darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                              } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                              aria-label={isLinked ? t('incomeSyncOnLabel') : t('incomeSyncOffLabel')}
                              title={isLinked ? t('incomeSyncOnLabel') : t('incomeSyncOffLabel')}
                            >
                              {isLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
                            </button>
                            <button
                              onClick={() => deleteIncomeSource(personKey, source.id)}
                              disabled={readOnly}
                              className={`text-red-500 hover:text-red-600 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        )}
                      </Draggable>
                    );
                  })}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <div className="space-y-2">
            {person.incomeSources.map(source => {
              const resolvedCategory = source.categoryOverrideId
                ? getIncomeCategoryById(source.categoryOverrideId)
                : getAutoIncomeCategory(source.name);
              const categoryLabel = resolvedCategory
                ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en)
                : t('incomeCategoryLabel');
              const badgeClass = resolvedCategory
                ? getIncomeCategoryBadgeClass(resolvedCategory.id, darkMode)
                : null;
              const chipClass = badgeClass ?? (darkMode ? 'category-chip bg-white/10 text-slate-200' : 'category-chip chip-income-other');
              const categoryValue = source.categoryOverrideId || 'auto';
              const autoLabel = resolvedCategory
                ? `${t('autoLabel')} · ${resolvedCategory.emoji} ${categoryLabel}`
                : `${t('autoLabel')} · ${t('incomeCategoryLabel')}`;
              const triggerLabel = resolvedCategory
                ? `${resolvedCategory.emoji} ${categoryLabel}`
                : t('incomeCategoryLabel');
              const isLinked = source.propagate !== false;

              return (
                <div key={source.id} className={`flex flex-wrap items-center gap-2 ${darkMode ? 'bg-slate-900/60' : 'bg-white/90'} p-2 rounded-lg border ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                  <input
                    type="text"
                    value={source.name}
                    onChange={(e) => {
                      if (readOnly) {
                        return;
                      }
                      updateIncomeSource(personKey, source.id, 'name', e.target.value);
                    }}
                    readOnly={readOnly}
                    className={`flex-1 min-w-0 sm:min-w-[10rem] px-3 py-2 rounded-lg text-sm transition ${
                      darkMode
                        ? 'bg-transparent text-white placeholder:text-slate-500 focus:bg-slate-900/60 focus:outline-none'
                        : 'bg-transparent text-slate-800 placeholder:text-slate-400 focus:bg-white/80 focus:outline-none'
                    }`}
                    placeholder={t('incomePlaceholder')}
                  />
                  <Select
                    value={categoryValue}
                    onValueChange={(value) => {
                      if (readOnly) {
                        return;
                      }
                      updateIncomeSource(personKey, source.id, 'categoryOverrideId', value === 'auto' ? '' : value);
                    }}
                  >
                    <SelectTrigger
                      disabled={readOnly}
                      aria-label={t('incomeCategoryLabel')}
                      className={`${chipClass} h-auto w-auto border-none shadow-none [&_svg]:hidden ${
                        readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer hover:opacity-80'
                      }`}
                    >
                      <span className="inline-flex items-center gap-1">{triggerLabel}</span>
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value="auto">{autoLabel}</SelectItem>
                      {INCOME_CATEGORIES.map(category => (
                        <SelectItem key={category.id} value={category.id}>
                          {category.emoji} {language === 'fr' ? category.labels.fr : category.labels.en}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <input
                    type="number"
                    value={source.amount}
                    onChange={(e) => {
                      if (readOnly) {
                        return;
                      }
                      const nextValue = e.target.value;
                      updateIncomeSource(
                        personKey,
                        source.id,
                        'amount',
                        nextValue === '' ? '' : parseNumberInput(nextValue)
                      );
                    }}
                    readOnly={readOnly}
                    className={`w-24 flex-none px-3 py-2 rounded-lg text-right text-sm transition ${
                      darkMode
                        ? 'bg-transparent text-white placeholder:text-slate-500 focus:bg-slate-900/60 focus:outline-none'
                        : 'bg-transparent text-slate-800 placeholder:text-slate-400 focus:bg-white/80 focus:outline-none'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => updateIncomeSource(personKey, source.id, 'propagate', !isLinked)}
                    disabled={readOnly}
                    className={`p-1 rounded-full border ${
                      darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                    } ${readOnly ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                    aria-label={isLinked ? t('incomeSyncOnLabel') : t('incomeSyncOffLabel')}
                    title={isLinked ? t('incomeSyncOnLabel') : t('incomeSyncOffLabel')}
                  >
                    {isLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
                  </button>
                  <button
                    onClick={() => deleteIncomeSource(personKey, source.id)}
                    disabled={readOnly}
                    className={`text-red-500 hover:text-red-600 ${readOnly ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className={`mt-auto space-y-1 text-sm border-t pt-3 ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
        <div className={`flex justify-between ${summaryLabelClass}`}>
          <span>{t('totalIncomeLabel')}:</span>
          <span className={`font-semibold ${summaryValueClass}`}>{formatCurrency(animatedIncome, currencyPreference)}</span>
        </div>
        <div className={`flex justify-between ${summaryLabelClass}`}>
          <span>{t('totalExpensesLabel')}:</span>
          <span className={`font-semibold ${summaryValueClass}`}>{formatCurrency(animatedExpenses, currencyPreference)}</span>
        </div>
        <div
          className="flex justify-between font-semibold"
          style={{
            color: available < 0
              ? (darkMode ? '#F59AA8' : '#E85D5D')
              : (darkMode ? '#8BE3C0' : '#6BB88E')
          }}
        >
          <span>{t('availableLabel')}:</span>
          <span>{formatCurrency(animatedAvailable, currencyPreference)}</span>
        </div>
      </div>
    </div>
  );
});
BudgetHeaderSection.displayName = 'BudgetHeaderSection';

const BudgetFixedSection = React.memo(({
  person,
  personKey,
  readOnly,
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
  bankAccountsEnabled,
  bankAccounts,
  openExpenseWizard,
  openExpenseWizardForEdit,
  updateFixedExpense,
  reorderFixedExpenses,
  useSharedDragContext
}: BudgetFixedSectionProps) => {
  const { t, language } = useTranslation();
  const totalFixed = useMemo(() => calculateTotalFixed(person.fixedExpenses), [person.fixedExpenses]);
  const animatedTotalFixed = useAnimatedNumber(totalFixed);
  const orderedExpenses = useMemo(() => {
    if (!sortByCost) {
      return person.fixedExpenses;
    }
    return [...person.fixedExpenses].sort((a, b) => {
      const amountDiff = coerceNumber(b.amount) - coerceNumber(a.amount);
      if (amountDiff !== 0) {
        return amountDiff;
      }
      const nameDiff = a.name.localeCompare(b.name);
      return nameDiff !== 0 ? nameDiff : a.id.localeCompare(b.id);
    });
  }, [person.fixedExpenses, sortByCost]);
  const paidFixedTotal = useMemo(() => (
    orderedExpenses.reduce((sum, expense) => (
      expense.isChecked ? sum + coerceNumber(expense.amount) : sum
    ), 0)
  ), [orderedExpenses]);
  const remainingFixedTotal = useMemo(
    () => Math.max(0, totalFixed - paidFixedTotal),
    [totalFixed, paidFixedTotal]
  );
  const hasPaidFixed = paidFixedTotal > 0;
  const fixedTone = useMemo(() => getPaletteTone(palette, 1, darkMode), [palette, darkMode]);
  const isDefaultPalette = palette.id === 'default';
  const fixedHeaderStyle = useMemo(
    () => (isDefaultPalette ? { color: darkMode ? '#E2E8F0' : '#334155' } : { color: fixedTone.text }),
    [darkMode, fixedTone.text, isDefaultPalette]
  );
  const fixedButtonStyle = useMemo(
    () => ({
      borderColor: fixedTone.border,
      color: fixedTone.text,
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.7)'
    }),
    [darkMode, fixedTone.border, fixedTone.text]
  );
  const fixedBadgeStyle = useMemo(
    () => ({
      color: darkMode ? '#D7E8FF' : '#3B4A6B',
      backgroundColor: darkMode ? 'rgba(148, 197, 255, 0.18)' : 'rgba(199, 210, 254, 0.6)',
      border: darkMode ? '1px solid rgba(148, 197, 255, 0.3)' : '1px solid rgba(129, 140, 248, 0.35)',
      boxShadow: darkMode ? '0 0 12px rgba(148, 197, 255, 0.18)' : '0 0 10px rgba(165, 180, 252, 0.35)'
    }),
    [darkMode]
  );
  const accountsForPerson = useMemo(() => bankAccounts[personKey] ?? [], [bankAccounts, personKey]);
  const isCompactAccountLabel = useMediaQuery('(display-mode: standalone)');
  const enableTapToEdit = isCompactAccountLabel && !readOnly;
  const resolveAccount = useCallback((accountId?: string) => {
    if (!accountId || accountsForPerson.length === 0) {
      return null;
    }
    const account = accountsForPerson.find(item => item.id === accountId);
    if (!account) {
      return null;
    }
    return { account };
  }, [accountsForPerson]);
  const canDrag = enableDrag && !sortByCost && !readOnly;
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderFixedExpenses(personKey, result.source.index, result.destination.index);
  }, [personKey, reorderFixedExpenses]);
  const isDragEmpty = orderedExpenses.length === 0;
  const dragContent = (
    <Droppable droppableId={`fixed-${personKey}`}>
      {(provided: DroppableProvided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'} ${isDragEmpty ? 'py-6' : ''}`}
        >
          {orderedExpenses.map((expense, index) => {
            const amountValue = coerceNumber(expense.amount);
            const resolvedCategory = expense.categoryOverrideId
              ? getCategoryById(expense.categoryOverrideId)
              : getAutoCategory(expense.name);
            const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
            const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
            const accountMeta = resolveAccount(expense.accountId);
            return (
              <Draggable key={expense.id} draggableId={`fixed-${personKey}-${expense.id}`} index={index}>
                {(dragProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={`px-2 py-2 ${snapshot.isDragging ? (darkMode ? 'bg-slate-900/80' : 'bg-slate-50') : ''}`}
                    style={dragProvided.draggableProps.style}
                  >
                    <div
                      className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                        darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'
                      } ${enableTapToEdit ? 'cursor-pointer' : ''}`}
                      onClick={enableTapToEdit ? () => openExpenseWizardForEdit(personKey, 'fixed', expense) : undefined}
                      role={enableTapToEdit ? 'button' : undefined}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        onClick={(event) => event.stopPropagation()}
                        className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                        aria-label={t('dragHandleLabel')}
                      >
                        <GripVertical size={14} />
                      </span>
                      <input
                        type="checkbox"
                        checked={expense.isChecked || false}
                        onChange={(e) => {
                          if (readOnly) {
                            return;
                          }
                          updateFixedExpense(personKey, expense.id, 'isChecked', e.target.checked);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        disabled={readOnly}
                        className="h-4 w-4"
                        style={{ accentColor: fixedTone.border }}
                        aria-label={t('validateExpenseLabel')}
                      />
                      <span className={`flex-1 min-w-0 text-sm truncate ${expense.isChecked ? 'line-through opacity-70' : ''}`}>
                        {expense.name || t('newFixedExpenseLabel')}
                      </span>
                      {expense.date && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {formatExpenseDate(expense.date, language)}
                        </span>
                      )}
                      {bankAccountsEnabled && accountMeta && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={getAccountChipStyle(accountMeta.account.color)}
                        >
                          {isCompactAccountLabel
                            ? (accountMeta.account.name.trim()[0]?.toUpperCase() || '?')
                            : accountMeta.account.name}
                        </span>
                      )}
                      {resolvedCategory && badgeClass && (
                        <span
                          className={`${badgeClass} ${isCompactAccountLabel ? 'min-w-0 max-w-[6.5rem]' : ''}`}
                          title={categoryLabel || undefined}
                        >
                          <span>{resolvedCategory.emoji}</span>
                          <span className={isCompactAccountLabel ? 'truncate' : undefined}>{categoryLabel}</span>
                        </span>
                      )}
                      <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                        {formatCurrency(amountValue, currencyPreference)}
                      </span>
                      {!isCompactAccountLabel && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openExpenseWizardForEdit(personKey, 'fixed', expense);
                          }}
                          disabled={readOnly}
                          className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80 ${
                            readOnly ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          aria-label={t('editLabel')}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <div
      className={`min-w-0 p-5 mb-4 flex flex-col sm:h-full rounded-2xl border border-l-4 ${
        darkMode ? 'border-slate-800' : 'card-float'
      }`}
      style={{
        backgroundColor: fixedTone.background,
        borderColor: fixedTone.border,
        border: isDefaultPalette ? 'none' : undefined
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold" style={fixedHeaderStyle}>{t('fixedMoneyLabel')}</h3>
        <button
          type="button"
          onClick={() => openExpenseWizard(personKey, 'fixed')}
          disabled={readOnly}
          className={`h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105 ${
            readOnly ? 'opacity-60 cursor-not-allowed' : ''
          }`}
          style={fixedButtonStyle}
          aria-label={t('addRowLabel')}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className={`rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-100 bg-white/90 text-slate-800'}`}>
        {canDrag ? (
          useSharedDragContext ? dragContent : (
            <DragDropContext onDragEnd={handleDragEnd}>
              {dragContent}
            </DragDropContext>
          )
        ) : orderedExpenses.length === 0 ? (
          <div className="py-6" />
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
            {orderedExpenses.map((expense) => {
              const amountValue = coerceNumber(expense.amount);
              const resolvedCategory = expense.categoryOverrideId
                ? getCategoryById(expense.categoryOverrideId)
                : getAutoCategory(expense.name);
              const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
              const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
              const accountMeta = resolveAccount(expense.accountId);
              return (
                <div key={expense.id} className="px-2 py-2">
                  <div
                    className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                      darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'
                    } ${enableTapToEdit ? 'cursor-pointer' : ''}`}
                    onClick={enableTapToEdit ? () => openExpenseWizardForEdit(personKey, 'fixed', expense) : undefined}
                    role={enableTapToEdit ? 'button' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={expense.isChecked || false}
                      onChange={(e) => {
                        if (readOnly) {
                          return;
                        }
                        updateFixedExpense(personKey, expense.id, 'isChecked', e.target.checked);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      disabled={readOnly}
                      className="h-4 w-4"
                      style={{ accentColor: fixedTone.border }}
                      aria-label={t('validateExpenseLabel')}
                    />
                    <span className={`flex-1 min-w-0 text-sm truncate ${expense.isChecked ? 'line-through opacity-70' : ''}`}>
                      {expense.name || t('newFixedExpenseLabel')}
                    </span>
                    {expense.date && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                        }`}
                      >
                        {formatExpenseDate(expense.date, language)}
                      </span>
                    )}
                    {bankAccountsEnabled && accountMeta && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={getAccountChipStyle(accountMeta.account.color)}
                      >
                        {isCompactAccountLabel
                          ? (accountMeta.account.name.trim()[0]?.toUpperCase() || '?')
                          : accountMeta.account.name}
                      </span>
                    )}
                    {resolvedCategory && badgeClass && (
                      <span
                        className={`${badgeClass} ${isCompactAccountLabel ? 'min-w-0 max-w-[6.5rem]' : ''}`}
                        title={categoryLabel || undefined}
                      >
                        <span>{resolvedCategory.emoji}</span>
                        <span className={isCompactAccountLabel ? 'truncate' : undefined}>{categoryLabel}</span>
                      </span>
                    )}
                    <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {formatCurrency(amountValue, currencyPreference)}
                    </span>
                    {!isCompactAccountLabel && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openExpenseWizardForEdit(personKey, 'fixed', expense);
                        }}
                        disabled={readOnly}
                        className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80 ${
                          readOnly ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        aria-label={t('editLabel')}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className={`mt-3 pt-3 flex items-center justify-between border-t text-base font-semibold ${darkMode ? 'border-slate-800 text-white' : 'border-slate-100 text-slate-800'} sm:mt-auto`}>
        <span>{t('totalExpensesShortLabel')}:</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{formatCurrency(animatedTotalFixed, currencyPreference)}</span>
          {hasPaidFixed && (
            <span
              className="remaining-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={fixedBadgeStyle}
              title={t('remainingToPayLabel')}
            >
              {formatCurrency(remainingFixedTotal, currencyPreference)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
BudgetFixedSection.displayName = 'BudgetFixedSection';

const BudgetFreeSection = React.memo(({
  person,
  personKey,
  readOnly,
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
  bankAccountsEnabled,
  bankAccounts,
  openExpenseWizard,
  openExpenseWizardForEdit,
  updateCategory,
  reorderCategories,
  useSharedDragContext
}: BudgetFreeSectionProps) => {
  const { t, language } = useTranslation();
  const totalCategories = useMemo(() => calculateTotalCategories(person.categories), [person.categories]);
  const animatedTotalCategories = useAnimatedNumber(totalCategories);
  const orderedCategories = useMemo(() => {
    if (!sortByCost) {
      return person.categories;
    }
    return [...person.categories].sort((a, b) => {
      const amountDiff = coerceNumber(b.amount) - coerceNumber(a.amount);
      if (amountDiff !== 0) {
        return amountDiff;
      }
      const nameDiff = a.name.localeCompare(b.name);
      return nameDiff !== 0 ? nameDiff : a.id.localeCompare(b.id);
    });
  }, [person.categories, sortByCost]);
  const paidCategoriesTotal = useMemo(() => (
    orderedCategories.reduce((sum, category) => (
      category.isChecked ? sum + coerceNumber(category.amount) : sum
    ), 0)
  ), [orderedCategories]);
  const remainingCategoriesTotal = useMemo(
    () => Math.max(0, totalCategories - paidCategoriesTotal),
    [totalCategories, paidCategoriesTotal]
  );
  const hasPaidCategories = paidCategoriesTotal > 0;
  const freeTone = useMemo(() => getPaletteTone(palette, 2, darkMode), [palette, darkMode]);
  const isDefaultPalette = palette.id === 'default';
  const freeHeaderStyle = useMemo(
    () => (isDefaultPalette ? { color: darkMode ? '#E2E8F0' : '#334155' } : { color: freeTone.text }),
    [darkMode, freeTone.text, isDefaultPalette]
  );
  const freeButtonStyle = useMemo(
    () => ({
      borderColor: freeTone.border,
      color: freeTone.text,
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.08)' : 'rgba(255, 255, 255, 0.7)'
    }),
    [darkMode, freeTone.border, freeTone.text]
  );
  const freeBadgeStyle = useMemo(
    () => ({
      color: darkMode ? '#D7E8FF' : '#3B4A6B',
      backgroundColor: darkMode ? 'rgba(148, 197, 255, 0.18)' : 'rgba(199, 210, 254, 0.6)',
      border: darkMode ? '1px solid rgba(148, 197, 255, 0.3)' : '1px solid rgba(129, 140, 248, 0.35)',
      boxShadow: darkMode ? '0 0 12px rgba(148, 197, 255, 0.18)' : '0 0 10px rgba(165, 180, 252, 0.35)'
    }),
    [darkMode]
  );
  const accountsForPerson = useMemo(() => bankAccounts[personKey] ?? [], [bankAccounts, personKey]);
  const isCompactAccountLabel = useMediaQuery('(display-mode: standalone)');
  const enableTapToEdit = isCompactAccountLabel && !readOnly;
  const resolveAccount = useCallback((accountId?: string) => {
    if (!accountId || accountsForPerson.length === 0) {
      return null;
    }
    const account = accountsForPerson.find(item => item.id === accountId);
    if (!account) {
      return null;
    }
    return { account };
  }, [accountsForPerson]);
  const canDrag = enableDrag && !sortByCost && !readOnly;
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderCategories(personKey, result.source.index, result.destination.index);
  }, [personKey, reorderCategories]);
  const isDragEmpty = orderedCategories.length === 0;
  const dragContent = (
    <Droppable droppableId={`free-${personKey}`}>
      {(provided: DroppableProvided) => (
        <div
          ref={provided.innerRef}
          {...provided.droppableProps}
          className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'} ${isDragEmpty ? 'py-6' : ''}`}
        >
          {orderedCategories.map((category, index) => {
            const amountValue = coerceNumber(category.amount);
            const resolvedCategory = category.categoryOverrideId
              ? getCategoryById(category.categoryOverrideId)
              : getAutoCategory(category.name);
            const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
            const recurringLabel = category.isRecurring ? `${category.recurringMonths || 3}x` : null;
            const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
            const isLinked = category.propagate !== false;
            const accountMeta = resolveAccount(category.accountId);
            return (
              <Draggable key={category.id} draggableId={`free-${personKey}-${category.id}`} index={index}>
                {(dragProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className={`px-2 py-2 ${snapshot.isDragging ? (darkMode ? 'bg-slate-900/80' : 'bg-slate-50') : ''}`}
                    style={dragProvided.draggableProps.style}
                  >
                    <div
                      className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                        darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'
                      } ${enableTapToEdit ? 'cursor-pointer' : ''}`}
                      onClick={enableTapToEdit ? () => openExpenseWizardForEdit(personKey, 'free', category) : undefined}
                      role={enableTapToEdit ? 'button' : undefined}
                    >
                      <span
                        {...dragProvided.dragHandleProps}
                        onClick={(event) => event.stopPropagation()}
                        className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                        aria-label={t('dragHandleLabel')}
                      >
                        <GripVertical size={14} />
                      </span>
                      <input
                        type="checkbox"
                        checked={category.isChecked || false}
                        onChange={(e) => {
                          if (readOnly) {
                            return;
                          }
                          updateCategory(personKey, category.id, 'isChecked', e.target.checked);
                        }}
                        onClick={(event) => event.stopPropagation()}
                        disabled={readOnly}
                        className="h-4 w-4"
                        style={{ accentColor: freeTone.border }}
                        aria-label={t('validateExpenseLabel')}
                      />
                      <span className={`flex-1 min-w-0 text-sm truncate ${category.isChecked ? 'line-through opacity-70' : ''}`}>
                        {category.name || t('newCategoryLabel')}
                      </span>
                      {category.date && (
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                            darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {formatExpenseDate(category.date, language)}
                        </span>
                      )}
                      {bankAccountsEnabled && accountMeta && (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={getAccountChipStyle(accountMeta.account.color)}
                        >
                          {isCompactAccountLabel
                            ? (accountMeta.account.name.trim()[0]?.toUpperCase() || '?')
                            : accountMeta.account.name}
                        </span>
                      )}
                      {resolvedCategory && badgeClass && (
                        <span
                          className={`${badgeClass} ${isCompactAccountLabel ? 'min-w-0 max-w-[6.5rem]' : ''}`}
                          title={categoryLabel || undefined}
                        >
                          <span>{resolvedCategory.emoji}</span>
                          <span className={isCompactAccountLabel ? 'truncate' : undefined}>{categoryLabel}</span>
                        </span>
                      )}
                      {recurringLabel && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                          {recurringLabel}
                        </span>
                      )}
                      <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                        {formatCurrency(amountValue, currencyPreference)}
                      </span>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          updateCategory(personKey, category.id, 'propagate', !isLinked);
                        }}
                        disabled={readOnly || category.isRecurring}
                        className={`p-1 rounded-full border ${
                          darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                        } ${readOnly || category.isRecurring ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                        aria-label={isLinked ? t('expenseSyncOnLabel') : t('expenseSyncOffLabel')}
                        title={isLinked ? t('expenseSyncOnLabel') : t('expenseSyncOffLabel')}
                      >
                        {isLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
                      </button>
                      {!isCompactAccountLabel && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openExpenseWizardForEdit(personKey, 'free', category);
                          }}
                          disabled={readOnly}
                          className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80 ${
                            readOnly ? 'opacity-50 cursor-not-allowed' : ''
                          }`}
                          aria-label={t('editLabel')}
                        >
                          <Edit2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </Draggable>
            );
          })}
          {provided.placeholder}
        </div>
      )}
    </Droppable>
  );

  return (
    <div
      className={`min-w-0 p-5 mb-4 flex flex-col sm:h-full rounded-2xl border border-l-4 ${
        darkMode ? 'border-slate-800' : 'card-float'
      }`}
      style={{
        backgroundColor: freeTone.background,
        borderColor: freeTone.border,
        border: isDefaultPalette ? 'none' : undefined
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold" style={freeHeaderStyle}>{t('freeMoneyLabel')}</h3>
        <button
          type="button"
          onClick={() => openExpenseWizard(personKey, 'free')}
          disabled={readOnly}
          className={`h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105 ${
            readOnly ? 'opacity-60 cursor-not-allowed' : ''
          }`}
          style={freeButtonStyle}
          aria-label={t('addRowLabel')}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className={`rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-100 bg-white/90 text-slate-800'}`}>
        {canDrag ? (
          useSharedDragContext ? dragContent : (
            <DragDropContext onDragEnd={handleDragEnd}>
              {dragContent}
            </DragDropContext>
          )
        ) : orderedCategories.length === 0 ? (
          <div className="py-6" />
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
            {orderedCategories.map((category) => {
              const amountValue = coerceNumber(category.amount);
              const resolvedCategory = category.categoryOverrideId
                ? getCategoryById(category.categoryOverrideId)
                : getAutoCategory(category.name);
              const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
              const recurringLabel = category.isRecurring ? `${category.recurringMonths || 3}x` : null;
              const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
              const isLinked = category.propagate !== false;
              const accountMeta = resolveAccount(category.accountId);
              return (
                <div key={category.id} className="px-2 py-2">
                  <div
                    className={`flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition ${
                      darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'
                    } ${enableTapToEdit ? 'cursor-pointer' : ''}`}
                    onClick={enableTapToEdit ? () => openExpenseWizardForEdit(personKey, 'free', category) : undefined}
                    role={enableTapToEdit ? 'button' : undefined}
                  >
                    <input
                      type="checkbox"
                      checked={category.isChecked || false}
                      onChange={(e) => {
                        if (readOnly) {
                          return;
                        }
                        updateCategory(personKey, category.id, 'isChecked', e.target.checked);
                      }}
                      onClick={(event) => event.stopPropagation()}
                      disabled={readOnly}
                      className="h-4 w-4"
                      style={{ accentColor: freeTone.border }}
                      aria-label={t('validateExpenseLabel')}
                    />
                    <span className={`flex-1 min-w-0 text-sm truncate ${category.isChecked ? 'line-through opacity-70' : ''}`}>
                      {category.name || t('newCategoryLabel')}
                    </span>
                    {category.date && (
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
                          darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                        }`}
                      >
                        {formatExpenseDate(category.date, language)}
                      </span>
                    )}
                    {bankAccountsEnabled && accountMeta && (
                      <span
                        className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={getAccountChipStyle(accountMeta.account.color)}
                      >
                        {isCompactAccountLabel
                          ? (accountMeta.account.name.trim()[0]?.toUpperCase() || '?')
                          : accountMeta.account.name}
                      </span>
                    )}
                    {resolvedCategory && badgeClass && (
                      <span
                        className={`${badgeClass} ${isCompactAccountLabel ? 'min-w-0 max-w-[6.5rem]' : ''}`}
                        title={categoryLabel || undefined}
                      >
                        <span>{resolvedCategory.emoji}</span>
                        <span className={isCompactAccountLabel ? 'truncate' : undefined}>{categoryLabel}</span>
                      </span>
                    )}
                    {recurringLabel && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                        {recurringLabel}
                      </span>
                    )}
                    <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {formatCurrency(amountValue, currencyPreference)}
                    </span>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        updateCategory(personKey, category.id, 'propagate', !isLinked);
                      }}
                      disabled={readOnly || category.isRecurring}
                      className={`p-1 rounded-full border ${
                        darkMode ? 'border-slate-700 text-slate-300' : 'border-slate-200 text-slate-500'
                      } ${readOnly || category.isRecurring ? 'opacity-50 cursor-not-allowed' : 'hover:opacity-80'}`}
                      aria-label={isLinked ? t('expenseSyncOnLabel') : t('expenseSyncOffLabel')}
                      title={isLinked ? t('expenseSyncOnLabel') : t('expenseSyncOffLabel')}
                    >
                      {isLinked ? <Link2 size={14} /> : <Link2Off size={14} />}
                    </button>
                    {!isCompactAccountLabel && (
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          openExpenseWizardForEdit(personKey, 'free', category);
                        }}
                        disabled={readOnly}
                        className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80 ${
                          readOnly ? 'opacity-50 cursor-not-allowed' : ''
                        }`}
                        aria-label={t('editLabel')}
                      >
                        <Edit2 size={14} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className={`mt-3 pt-3 flex items-center justify-between border-t text-base font-semibold ${darkMode ? 'border-slate-800 text-white' : 'border-slate-100 text-slate-800'} sm:mt-auto`}>
        <span>{t('totalExpensesShortLabel')}:</span>
        <div className="flex items-center gap-2">
          <span className="tabular-nums">{formatCurrency(animatedTotalCategories, currencyPreference)}</span>
          {hasPaidCategories && (
            <span
              className="remaining-pill inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold"
              style={freeBadgeStyle}
              title={t('remainingToPayLabel')}
            >
              {formatCurrency(remainingCategoriesTotal, currencyPreference)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
});
BudgetFreeSection.displayName = 'BudgetFreeSection';

type BudgetCalendarWidgetProps = {
  monthKey: string;
  darkMode: boolean;
  formatMonthKey: (value: string) => string;
  selectedDate?: string | null;
};

type BudgetAccountCalendarWidgetProps = {
  monthKey: string;
  darkMode: boolean;
  currencyPreference: 'EUR' | 'USD';
  formatMonthKey: (value: string) => string;
  data: BudgetData;
  bankAccountsEnabled: boolean;
  bankAccounts: BankAccountSettings;
  soloModeEnabled: boolean;
  activePersonKey: 'person1' | 'person2';
};

type ExpenseSeriesPoint = {
  key: string;
  label: string;
  planned: number;
  actual: number | null;
};

const BudgetCalendarWidget = React.memo(({
  monthKey,
  darkMode,
  formatMonthKey,
  selectedDate
}: BudgetCalendarWidgetProps) => {
  const { language } = useTranslation();
  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const weekStart = language === 'en' ? 0 : 1;
  const [yearValue, monthValue] = monthKey.split('-');
  const year = Number(yearValue);
  const monthIndex = Number(monthValue) - 1;

  const selectedDay = useMemo(() => {
    if (!selectedDate || !/^\d{4}-\d{2}-\d{2}$/.test(selectedDate)) {
      return null;
    }
    const [selectedYear, selectedMonth, selectedDayValue] = selectedDate.split('-').map(Number);
    if (selectedYear === year && selectedMonth - 1 === monthIndex) {
      return selectedDayValue;
    }
    return null;
  }, [monthIndex, selectedDate, year]);

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

  const calendar = useMemo(() => {
    if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || monthIndex < 0 || monthIndex > 11) {
      return null;
    }
    const firstOfMonth = new Date(year, monthIndex, 1);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    const offset = (firstOfMonth.getDay() - weekStart + 7) % 7;
    const totalSlots = Math.ceil((offset + daysInMonth) / 7) * 7;
    const slots = Array.from({ length: totalSlots }, (_, index) => {
      const day = index - offset + 1;
      return day >= 1 && day <= daysInMonth ? day : null;
    });
    const today = new Date();
    const isCurrentMonth = today.getFullYear() === year && today.getMonth() === monthIndex;
    return {
      slots,
      today: isCurrentMonth ? today.getDate() : null
    };
  }, [monthIndex, weekStart, year]);

  if (!calendar) {
    return null;
  }

  return (
    <div className="w-60 shrink-0 self-start mt-6 sm:sticky sm:top-14 sm:ml-4">
      <div
        className={`rounded-2xl border p-4 shadow-sm backdrop-blur ${
          darkMode ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-white/80 border-slate-200 text-slate-700'
        }`}
      >
        <div className="text-sm font-semibold">{formatMonthKey(monthKey)}</div>
        <div className={`mt-2 grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide ${
          darkMode ? 'text-slate-500' : 'text-slate-400'
        }`}
        >
          {weekdayLabels.map(label => (
            <span key={label}>{label}</span>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-7 gap-1 text-center">
          {calendar.slots.map((day, index) => {
            if (!day) {
              return <span key={`empty-${index}`} className="h-8 rounded-lg" />;
            }
            const isToday = calendar.today === day;
            const isSelected = selectedDay === day;
            return (
              <span
                key={`day-${day}`}
                className={`flex h-8 items-center justify-center rounded-lg text-xs font-semibold transition-colors ${
                  isSelected
                    ? (darkMode
                      ? 'bg-sky-500/20 text-sky-100 border border-sky-400/40'
                      : 'bg-sky-50 text-sky-700 border border-sky-200')
                    : isToday
                      ? (darkMode
                        ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-400/40'
                        : 'bg-emerald-50 text-emerald-600 border border-emerald-200')
                      : (darkMode
                        ? 'text-slate-300 hover:bg-slate-900/60'
                        : 'text-slate-600 hover:bg-slate-100')
                }`}
              >
                {day}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
});
BudgetCalendarWidget.displayName = 'BudgetCalendarWidget';

const BudgetAccountCalendarWidget = React.memo(({
  monthKey,
  darkMode,
  currencyPreference,
  formatMonthKey,
  data,
  bankAccountsEnabled,
  bankAccounts,
  soloModeEnabled,
  activePersonKey
}: BudgetAccountCalendarWidgetProps) => {
  const { t } = useTranslation();
  const [personKey, setPersonKey] = useState<'person1' | 'person2'>(
    soloModeEnabled ? 'person1' : activePersonKey
  );

  useEffect(() => {
    if (soloModeEnabled) {
      setPersonKey('person1');
    } else {
      setPersonKey(activePersonKey);
    }
  }, [activePersonKey, soloModeEnabled]);

  if (!bankAccountsEnabled) {
    return null;
  }

  const accounts = bankAccounts[personKey] ?? [];
  if (accounts.length === 0) {
    return null;
  }

  const accountIdSet = useMemo(() => new Set(accounts.map(account => account.id)), [accounts]);

  const { accountTotals, total } = useMemo(() => {
    const totals = new Map<string, number>();
    accounts.forEach(account => totals.set(account.id, 0));
    totals.set(UNASSIGNED_ACCOUNT_ID, 0);
    let sum = 0;
    const addExpense = (amountValue: number, accountId?: string) => {
      const resolvedAccountId = accountId && accountIdSet.has(accountId)
        ? accountId
        : UNASSIGNED_ACCOUNT_ID;
      const nextAmount = coerceNumber(amountValue);
      totals.set(resolvedAccountId, (totals.get(resolvedAccountId) ?? 0) + nextAmount);
      sum += nextAmount;
    };
    const person = data[personKey];
    person.fixedExpenses.forEach(exp => addExpense(exp.amount, exp.accountId));
    person.categories.forEach(cat => addExpense(cat.amount, cat.accountId));
    return { accountTotals: totals, total: sum };
  }, [accountIdSet, accounts, data, personKey]);

  const hasUnassigned = (accountTotals.get(UNASSIGNED_ACCOUNT_ID) ?? 0) > 0;
  const accountList = useMemo(() => {
    const list = [...accounts];
    if (hasUnassigned) {
      list.push({
        id: UNASSIGNED_ACCOUNT_ID,
        name: t('bankAccountUnassignedLabel'),
        color: darkMode ? '#64748B' : '#94A3B8'
      });
    }
    return list
      .map(account => ({
        ...account,
        total: accountTotals.get(account.id) ?? 0
      }))
      .sort((a, b) => b.total - a.total);
  }, [accounts, accountTotals, darkMode, hasUnassigned, t]);

  return (
    <div className="w-60 shrink-0 self-start mt-4 sm:ml-4">
      <div
        className={`rounded-2xl border p-4 shadow-sm backdrop-blur ${
          darkMode ? 'bg-slate-950/70 border-slate-800 text-slate-200' : 'bg-white/80 border-slate-200 text-slate-700'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold">{t('accountsBreakdownTitle')}</div>
            <div className="text-xs text-slate-400">{formatMonthKey(monthKey)}</div>
          </div>
        </div>
        {!soloModeEnabled && (
          <div className="mt-3 flex items-center gap-2 rounded-full border p-1 text-[11px] font-semibold">
            <button
              type="button"
              onClick={() => setPersonKey('person1')}
              className={`flex-1 rounded-full px-2 py-1 transition ${
                personKey === 'person1'
                  ? (darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white')
                  : (darkMode ? 'text-slate-200 hover:bg-slate-900/60' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              {data.person1.name || t('person1Label')}
            </button>
            <button
              type="button"
              onClick={() => setPersonKey('person2')}
              className={`flex-1 rounded-full px-2 py-1 transition ${
                personKey === 'person2'
                  ? (darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white')
                  : (darkMode ? 'text-slate-200 hover:bg-slate-900/60' : 'text-slate-600 hover:bg-slate-100')
              }`}
            >
              {data.person2.name || t('person2Label')}
            </button>
          </div>
        )}
        <div className="mt-3 space-y-2 text-sm">
          {accountList.map(account => (
            <div key={account.id} className="flex items-center justify-between gap-2">
              <span
                className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={getAccountChipStyle(account.color)}
              >
                {account.name}
              </span>
              <span className="font-semibold tabular-nums">{formatCurrency(account.total, currencyPreference)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

BudgetAccountCalendarWidget.displayName = 'BudgetAccountCalendarWidget';

const BudgetColumn = React.memo(({
  person,
  personKey,
  readOnly,
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
  bankAccountsEnabled,
  bankAccounts,
  editingName,
  tempName,
  setTempName,
  startEditingName,
  saveName,
  cancelEditingName,
  addIncomeSource,
  deleteIncomeSource,
  updateIncomeSource,
  reorderIncomeSources,
  openExpenseWizard,
  openExpenseWizardForEdit,
  updateFixedExpense,
  reorderFixedExpenses,
  updateCategory,
  reorderCategories
}: BudgetColumnProps) => (
  <div className="flex-1 min-w-0">
    <BudgetHeaderSection
      person={person}
      personKey={personKey}
      readOnly={readOnly}
      darkMode={darkMode}
      enableDrag={enableDrag}
      palette={palette}
      currencyPreference={currencyPreference}
      addIncomeSource={addIncomeSource}
      deleteIncomeSource={deleteIncomeSource}
      updateIncomeSource={updateIncomeSource}
      reorderIncomeSources={reorderIncomeSources}
    />
    <BudgetFixedSection
      person={person}
      personKey={personKey}
      readOnly={readOnly}
      darkMode={darkMode}
      sortByCost={sortByCost}
      enableDrag={enableDrag}
      palette={palette}
      currencyPreference={currencyPreference}
      bankAccountsEnabled={bankAccountsEnabled}
      bankAccounts={bankAccounts}
      openExpenseWizard={openExpenseWizard}
      openExpenseWizardForEdit={openExpenseWizardForEdit}
      updateFixedExpense={updateFixedExpense}
      reorderFixedExpenses={reorderFixedExpenses}
    />
    <BudgetFreeSection
      person={person}
      personKey={personKey}
      readOnly={readOnly}
      darkMode={darkMode}
      sortByCost={sortByCost}
      enableDrag={enableDrag}
      palette={palette}
      currencyPreference={currencyPreference}
      bankAccountsEnabled={bankAccountsEnabled}
      bankAccounts={bankAccounts}
      openExpenseWizard={openExpenseWizard}
      openExpenseWizardForEdit={openExpenseWizardForEdit}
      updateCategory={updateCategory}
      reorderCategories={reorderCategories}
    />
  </div>
));
BudgetColumn.displayName = 'BudgetColumn';

type PaletteSelectorProps = {
  palettes: Palette[];
  value: string;
  onChange: (paletteId: string) => void;
  darkMode: boolean;
};

const PaletteSelector = React.memo(({ palettes, value, onChange, darkMode }: PaletteSelectorProps) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const selectedPalette = useMemo(
    () => palettes.find(palette => palette.id === value) ?? palettes[0],
    [palettes, value]
  );
  const otherPalettes = useMemo(
    () => palettes.filter(palette => palette.id !== selectedPalette?.id),
    [palettes, selectedPalette?.id]
  );

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

  const handleSelect = useCallback((paletteId: string) => {
    onChange(paletteId);
    setIsOpen(false);
  }, [onChange]);

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
        className={`flex items-center gap-2 px-2 py-1.5 rounded-xl border shadow-sm backdrop-blur-sm transition ${
          darkMode ? 'bg-slate-900/70 border-slate-700/60 text-slate-100' : 'bg-white/80 border-slate-200 text-slate-700'
        }`}
      >
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: selectedPalette.dominant }}
        />
        <span className={`text-xs font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{selectedPalette.name}</span>
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
              <div className="flex flex-col gap-2">
                {otherPalettes.map(palette => (
                  <button
                    key={palette.id}
                    type="button"
                    onClick={() => handleSelect(palette.id)}
                    title={palette.name}
                    aria-label={palette.name}
                    className={`flex items-center gap-2 px-2 py-1 rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 ${
                      darkMode
                        ? 'bg-slate-900 border-slate-700/70 hover:border-slate-500/80 focus-visible:ring-slate-200/70 focus-visible:ring-offset-slate-900'
                        : 'bg-white border-slate-200 hover:border-slate-300 focus-visible:ring-slate-300 focus-visible:ring-offset-white'
                    }`}
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: palette.dominant }}
                    />
                    <span className="text-xs font-semibold">{palette.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
});
PaletteSelector.displayName = 'PaletteSelector';

type LoginScreenProps = {
  onLogin: (username: string, password: string, remember: boolean) => Promise<void> | void;
  error: string | null;
  loading: boolean;
  darkMode: boolean;
  pageStyle: React.CSSProperties;
  oidcEnabled: boolean;
  oidcProviderName: string;
  onOidcLogin: () => void;
};

const LoginScreen = React.memo(({
  onLogin,
  error,
  loading,
  darkMode,
  pageStyle,
  oidcEnabled,
  oidcProviderName,
  onOidcLogin
}: LoginScreenProps) => {
  const { t } = useTranslation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [waveKey, setWaveKey] = useState(0);
  const resolvedProviderName = oidcProviderName.trim() || 'OIDC';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onLogin(username.trim(), password, rememberMe);
  };

  return (
    <div
      className={`min-h-screen p-6 flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-[#fbf7f2]'}`}
      style={pageStyle}
    >
      <form
        onSubmit={handleSubmit}
        className={`w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-lg ${
          darkMode ? 'bg-slate-950/80 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
        }`}
      >
        <div className="space-y-2 text-center">
          <div className="flex justify-center">
            <img
              src="/logo.svg"
              alt={t('appName')}
              className="h-12 w-12 rounded-xl object-contain"
            />
          </div>
          <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
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
              className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              placeholder="admin"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium" htmlFor="login-password">{t('loginPasswordLabel')}</label>
            <div className="relative overflow-hidden rounded-lg">
              <input
                id="login-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={`relative z-10 w-full px-3 py-2 pr-11 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                placeholder="********"
              />
              <AnimatePresence>
                {waveKey > 0 && (
                  <motion.span
                    key={waveKey}
                    className="pointer-events-none absolute inset-0 z-20"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <motion.span
                      className={`absolute inset-y-0 w-1/2 ${
                        darkMode
                          ? 'bg-gradient-to-r from-transparent via-white/15 to-transparent'
                          : 'bg-gradient-to-r from-transparent via-slate-200/60 to-transparent'
                      }`}
                      initial={{ x: '-60%', opacity: 0 }}
                      animate={{ x: '160%', opacity: 0.6 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.45, ease: 'easeOut' }}
                    />
                  </motion.span>
                )}
              </AnimatePresence>
              <motion.button
                type="button"
                onClick={() => {
                  setShowPassword((prev) => !prev);
                  setWaveKey((prev) => prev + 1);
                }}
                className={`absolute right-2 inset-y-0 z-30 flex items-center justify-center h-full w-9 rounded-full ${
                  darkMode ? 'text-slate-300 hover:text-white' : 'text-slate-500 hover:text-slate-700'
                }`}
                whileTap={{ scale: 0.9 }}
                aria-label={showPassword ? t('hidePasswordLabel') : t('showPasswordLabel')}
              >
                <AnimatePresence mode="wait" initial={false}>
                  <motion.span
                    key={showPassword ? 'hide' : 'show'}
                    initial={{ opacity: 0, scale: 0.7 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.7 }}
                    transition={{ duration: 0.15 }}
                    className="flex items-center justify-center"
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </motion.span>
                </AnimatePresence>
              </motion.button>
            </div>
          </div>
        </div>

        {error && (
          <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
            {error}
          </div>
        )}

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(event) => setRememberMe(event.target.checked)}
            className="h-4 w-4"
          />
          {t('rememberMeLabel')}
        </label>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2 rounded-md font-semibold btn-gradient ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
        >
          {loading ? t('loginLoading') : t('loginButton')}
        </button>
        {oidcEnabled && (
          <button
            type="button"
            onClick={onOidcLogin}
            className={`w-full py-2 rounded-md text-sm font-semibold border transition-colors ${
              darkMode ? 'border-slate-700 text-slate-100 hover:bg-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {t('loginWithProviderLabel')} {resolvedProviderName}
          </button>
        )}
      </form>
    </div>
  );
});
LoginScreen.displayName = 'LoginScreen';

type OnboardingWizardProps = {
  darkMode: boolean;
  pageStyle: React.CSSProperties;
  languagePreference: LanguageCode;
  themePreference: 'light' | 'dark';
  soloModeEnabled: boolean;
  onLanguageChange: (value: LanguageCode) => void;
  onThemeChange: (value: 'light' | 'dark') => void;
  onModeChange: (value: 'solo' | 'duo') => void;
  onComplete: (options: { person1Name: string; person2Name: string; mode: 'solo' | 'duo' }) => void;
  onCreateAdmin: (username: string, password: string) => Promise<void>;
  onCreateSecondUser: (payload: { username: string; password: string; displayName?: string | null }) => Promise<void>;
};

const OnboardingWizard = ({
  darkMode,
  pageStyle,
  languagePreference,
  themePreference,
  soloModeEnabled,
  onLanguageChange,
  onThemeChange,
  onModeChange,
  onComplete,
  onCreateAdmin,
  onCreateSecondUser
}: OnboardingWizardProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finishLoading, setFinishLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: 'admin', password: '', confirm: '' });
  const [modeChoice, setModeChoice] = useState<'solo' | 'duo'>(soloModeEnabled ? 'solo' : 'duo');
  const [person1Name, setPerson1Name] = useState('');
  const [person2Name, setPerson2Name] = useState('');
  const [secondUserForm, setSecondUserForm] = useState({ username: '', password: '', confirm: '', displayName: '' });
  const totalSteps = modeChoice === 'duo' ? 5 : 4;

  const handleAdminSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const username = adminForm.username.trim();
    if (!username || !adminForm.password) {
      setError(t('userCreateRequiredError'));
      return;
    }
    if (adminForm.password !== adminForm.confirm) {
      setError(t('userCreateMismatchError'));
      return;
    }
    setLoading(true);
    try {
      await onCreateAdmin(username, adminForm.password);
      setStep(1);
    } catch (err) {
      if (err instanceof Error && err.message) {
        setError(err.message);
      } else {
        setError(t('onboardingBootstrapError'));
      }
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    setError(null);
    setStep(prev => Math.min(prev + 1, totalSteps - 1));
  };

  const handleBack = () => {
    setError(null);
    setStep(prev => Math.max(prev - 1, 0));
  };

  const handleFinish = async () => {
    setError(null);
    if (modeChoice === 'duo') {
      if (!person2Name.trim()) {
        setError(t('onboardingPerson2Required'));
        return;
      }
      const username = secondUserForm.username.trim();
      if (!username || !secondUserForm.password) {
        setError(t('userCreateRequiredError'));
        return;
      }
      if (secondUserForm.password !== secondUserForm.confirm) {
        setError(t('userCreateMismatchError'));
        return;
      }
      setFinishLoading(true);
      try {
        await onCreateSecondUser({
          username,
          password: secondUserForm.password,
          displayName: secondUserForm.displayName.trim() || person2Name.trim() || null
        });
      } catch (err) {
        if (err instanceof Error && err.message) {
          setError(err.message);
        } else {
          setError(t('userCreateError'));
        }
        setFinishLoading(false);
        return;
      }
      setFinishLoading(false);
    }
    onComplete({ person1Name, person2Name, mode: modeChoice });
  };

  return (
    <div
      className={`min-h-screen p-6 flex items-center justify-center ${darkMode ? 'bg-slate-950' : 'bg-[#fbf7f2]'}`}
      style={pageStyle}
    >
      <div
        className={`w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-lg ${
          darkMode ? 'bg-slate-950/80 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
        }`}
      >
        <div className="space-y-1">
          <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
          <h1 className="text-2xl font-semibold">{t('onboardingTitle')}</h1>
          <div className="text-xs text-slate-500">{t('onboardingStepLabel')} {step + 1}/{totalSteps}</div>
        </div>

        {step === 0 && (
          <form onSubmit={handleAdminSubmit} className="space-y-3">
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="onboard-username">{t('onboardingAdminUsernameLabel')}</label>
              <input
                id="onboard-username"
                type="text"
                autoComplete="username"
                value={adminForm.username}
                onChange={(event) => setAdminForm(prev => ({ ...prev, username: event.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="onboard-password">{t('onboardingAdminPasswordLabel')}</label>
              <input
                id="onboard-password"
                type="password"
                autoComplete="new-password"
                value={adminForm.password}
                onChange={(event) => setAdminForm(prev => ({ ...prev, password: event.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              />
            </div>
            <div className="space-y-1">
              <label className="text-sm font-medium" htmlFor="onboard-confirm">{t('onboardingAdminConfirmLabel')}</label>
              <input
                id="onboard-confirm"
                type="password"
                autoComplete="new-password"
                value={adminForm.confirm}
                onChange={(event) => setAdminForm(prev => ({ ...prev, confirm: event.target.value }))}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              />
            </div>
            {error && (
              <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{error}</div>
            )}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2 rounded-md font-semibold btn-gradient ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              {loading ? t('onboardingCreatingAdmin') : t('onboardingCreateAdmin')}
            </button>
          </form>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('onboardingLanguageTitle')}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onLanguageChange('fr')}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  languagePreference === 'fr'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('frenchLabel')}
              </button>
              <button
                type="button"
                onClick={() => onLanguageChange('en')}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  languagePreference === 'en'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('englishLabel')}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-sm font-semibold text-slate-500">
                {t('onboardingBack')}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-md font-semibold btn-gradient"
              >
                {t('onboardingNext')}
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('onboardingThemeTitle')}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onThemeChange('light')}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  themePreference === 'light'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('lightLabel')}
              </button>
              <button
                type="button"
                onClick={() => onThemeChange('dark')}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  themePreference === 'dark'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('darkLabel')}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-sm font-semibold text-slate-500">
                {t('onboardingBack')}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="px-4 py-2 rounded-md font-semibold btn-gradient"
              >
                {t('onboardingNext')}
              </button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('onboardingModeTitle')}</div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setModeChoice('solo');
                  onModeChange('solo');
                }}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  modeChoice === 'solo'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('onboardingSoloLabel')}
              </button>
              <button
                type="button"
                onClick={() => {
                  setModeChoice('duo');
                  onModeChange('duo');
                }}
                className={`px-3 py-2 rounded-md border text-sm font-semibold ${
                  modeChoice === 'duo'
                    ? (darkMode ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-emerald-600 text-white border-emerald-600')
                    : (darkMode ? 'border-slate-700 text-slate-200' : 'border-slate-200 text-slate-600')
                }`}
              >
                {t('onboardingDuoLabel')}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-sm font-semibold text-slate-500">
                {t('onboardingBack')}
              </button>
              <button
                type="button"
                onClick={modeChoice === 'duo' ? handleNext : handleFinish}
                className="px-4 py-2 rounded-md font-semibold btn-gradient"
              >
                {modeChoice === 'duo' ? t('onboardingNext') : t('onboardingFinish')}
              </button>
            </div>
          </div>
        )}

        {step === 4 && modeChoice === 'duo' && (
          <div className="space-y-3">
            <div className="text-sm font-semibold">{t('onboardingNamesTitle')}</div>
            <div className="space-y-2">
              <input
                type="text"
                value={person1Name}
                onChange={(event) => setPerson1Name(event.target.value)}
                placeholder={t('onboardingPerson1Placeholder')}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              />
              <input
                type="text"
                value={person2Name}
                onChange={(event) => setPerson2Name(event.target.value)}
                placeholder={t('onboardingPerson2Placeholder')}
                className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
              />
            </div>
            <div className="space-y-2">
              <div className="text-sm font-semibold">{t('onboardingSecondUserTitle')}</div>
              <div className="text-xs text-slate-500">{t('onboardingSecondUserHint')}</div>
              <div className="space-y-2">
                <input
                  type="text"
                  autoComplete="username"
                  value={secondUserForm.username}
                  onChange={(event) => setSecondUserForm(prev => ({ ...prev, username: event.target.value }))}
                  placeholder={t('createUserUsernamePlaceholder')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                />
                <input
                  type="text"
                  value={secondUserForm.displayName}
                  onChange={(event) => setSecondUserForm(prev => ({ ...prev, displayName: event.target.value }))}
                  placeholder={t('createUserDisplayNamePlaceholder')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secondUserForm.password}
                  onChange={(event) => setSecondUserForm(prev => ({ ...prev, password: event.target.value }))}
                  placeholder={t('createUserPasswordPlaceholder')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={secondUserForm.confirm}
                  onChange={(event) => setSecondUserForm(prev => ({ ...prev, confirm: event.target.value }))}
                  placeholder={t('createUserConfirmPlaceholder')}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-sm font-semibold text-slate-500">
                {t('onboardingBack')}
              </button>
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishLoading}
                className={`px-4 py-2 rounded-md font-semibold btn-gradient ${finishLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {finishLoading ? t('creatingUserButton') : t('onboardingFinish')}
              </button>
            </div>
          </div>
        )}

        {error && step !== 0 && (
          <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{error}</div>
        )}
      </div>
    </div>
  );
};

type AnimatedSwitchProps = {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  id?: string;
  darkMode: boolean;
};

const AnimatedSwitch = React.memo(({
  checked,
  onChange,
  disabled = false,
  id,
  darkMode
}: AnimatedSwitchProps) => {
  const backgroundColor = checked
    ? 'var(--brand-primary)'
    : (darkMode ? '#334155' : '#E2E8F0');

  return (
    <motion.button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'
      }`}
      style={{ backgroundColor }}
      whileTap={disabled ? undefined : { scale: 0.96 }}
    >
      <motion.span
        className="inline-block h-5 w-5 rounded-full bg-white shadow"
        animate={{ x: checked ? 20 : 4 }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
      />
    </motion.button>
  );
});
AnimatedSwitch.displayName = 'AnimatedSwitch';

type ToggleRowProps = {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  darkMode: boolean;
};

const ToggleRow = React.memo(({
  icon: Icon,
  label,
  hint,
  checked,
  onChange,
  disabled = false,
  darkMode
}: ToggleRowProps) => (
  <div
    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
      darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
    } ${disabled ? 'opacity-60' : ''}`}
  >
    <div className="flex items-center gap-3">
      <span className={`h-9 w-9 rounded-full flex items-center justify-center ${
        darkMode ? 'bg-slate-800 text-slate-100' : 'brand-icon'
      }`}>
        <Icon size={18} />
      </span>
      <div>
        <div className="font-semibold">{label}</div>
        {hint && (
          <div className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
            {hint}
          </div>
        )}
      </div>
    </div>
    <AnimatedSwitch checked={checked} onChange={onChange} disabled={disabled} darkMode={darkMode} />
  </div>
));
ToggleRow.displayName = 'ToggleRow';

type SelectRowProps = {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  value: string;
  onChange: (next: string) => void;
  options: Array<{ value: string; label: string }>;
  darkMode: boolean;
};

const SelectRow = React.memo(({
  icon: Icon,
  label,
  value,
  onChange,
  options,
  darkMode
}: SelectRowProps) => (
  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
    <div className="flex items-center gap-3">
      <span className={`h-9 w-9 rounded-full flex items-center justify-center ${
        darkMode ? 'bg-slate-800 text-slate-100' : 'brand-icon'
      }`}>
        <Icon size={18} />
      </span>
      <div className="font-semibold">{label}</div>
    </div>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        className={`min-w-[10rem] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent
        className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}
      >
        {options.map((option) => (
          <SelectItem
            key={option.value}
            value={option.value}
            className={darkMode ? 'focus:bg-slate-800 focus:text-slate-100' : 'brand-focus'}
          >
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  </div>
));
SelectRow.displayName = 'SelectRow';

type RangeRowProps = {
  icon: React.ComponentType<{ size?: number | string }>;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (next: number) => void;
  darkMode: boolean;
};

const RangeRow = React.memo(({
  icon: Icon,
  label,
  hint,
  value,
  min,
  max,
  step = 1,
  onChange,
  darkMode
}: RangeRowProps) => (
  <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
    <div className="flex items-center gap-3">
      <span className={`h-9 w-9 rounded-full flex items-center justify-center ${
        darkMode ? 'bg-slate-800 text-slate-100' : 'brand-icon'
      }`}>
        <Icon size={18} />
      </span>
      <div>
        <div className="font-semibold">{label}</div>
        {hint && (
          <div className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
            {hint}
          </div>
        )}
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className="text-xs font-semibold">{value}h</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          const nextValue = parseInt(event.target.value, 10);
          if (Number.isFinite(nextValue)) {
            onChange(nextValue);
          }
        }}
        className={`h-2 w-32 cursor-pointer accent-emerald-500 ${darkMode ? 'bg-slate-800' : 'bg-slate-200'}`}
      />
    </div>
  </div>
));
RangeRow.displayName = 'RangeRow';

type SettingsViewProps = {
  user: AuthUser | null;
  fallbackUsername: string;
  darkMode: boolean;
  onAuthFailure: (error: unknown) => boolean;
  onProfileUpdated: (user: AuthUser) => void;
  onUserLabelUpdate: (userId: string, label: string) => void;
  sortByCost: boolean;
  onToggleSortByCost: (value: boolean) => void;
  showSidebarMonths: boolean;
  onToggleShowSidebarMonths: (value: boolean) => void;
  budgetWidgetsEnabled: boolean;
  onToggleBudgetWidgetsEnabled: (value: boolean) => void;
  languagePreference: LanguageCode;
  onLanguagePreferenceChange: (value: LanguageCode) => void;
  jointAccountEnabled: boolean;
  onToggleJointAccountEnabled: (value: boolean) => void;
  soloModeEnabled: boolean;
  onToggleSoloModeEnabled: (value: boolean) => void;
  currencyPreference: 'EUR' | 'USD';
  onCurrencyPreferenceChange: (value: 'EUR' | 'USD') => void;
  sessionDurationHours: number;
  onSessionDurationHoursChange: (value: number) => void;
  bankAccountsEnabled: boolean;
  onToggleBankAccountsEnabled: (value: boolean) => void;
  bankAccounts: BankAccountSettings;
  onBankAccountsChange: (value: BankAccountSettings) => void;
  oidcEnabled: boolean;
  oidcProviderName: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
  onOidcEnabledChange: (value: boolean) => void;
  onOidcProviderNameChange: (value: string) => void;
  onOidcIssuerChange: (value: string) => void;
  onOidcClientIdChange: (value: string) => void;
  onOidcClientSecretChange: (value: string) => void;
  onOidcRedirectUriChange: (value: string) => void;
  oidcLinkEnabled: boolean;
  oidcLinkProviderName: string;
  person1UserId: string | null;
  person2UserId: string | null;
  onPersonLinkChange: (personKey: 'person1' | 'person2', user: AuthUser | null) => void;
};

const SettingsView = ({
  user,
  fallbackUsername,
  darkMode,
  onAuthFailure,
  onProfileUpdated,
  onUserLabelUpdate,
  sortByCost,
  onToggleSortByCost,
  showSidebarMonths,
  onToggleShowSidebarMonths,
  budgetWidgetsEnabled,
  onToggleBudgetWidgetsEnabled,
  languagePreference,
  onLanguagePreferenceChange,
  jointAccountEnabled,
  onToggleJointAccountEnabled,
  soloModeEnabled,
  onToggleSoloModeEnabled,
  currencyPreference,
  onCurrencyPreferenceChange,
  sessionDurationHours,
  onSessionDurationHoursChange,
  bankAccountsEnabled,
  onToggleBankAccountsEnabled,
  bankAccounts,
  onBankAccountsChange,
  oidcEnabled,
  oidcProviderName,
  oidcIssuer,
  oidcClientId,
  oidcClientSecret,
  oidcRedirectUri,
  onOidcEnabledChange,
  onOidcProviderNameChange,
  onOidcIssuerChange,
  onOidcClientIdChange,
  onOidcClientSecretChange,
  onOidcRedirectUriChange,
  oidcLinkEnabled,
  oidcLinkProviderName,
  person1UserId,
  person2UserId,
  onPersonLinkChange
}: SettingsViewProps) => {
  const { t, language } = useTranslation();
  const displayName = user?.displayName || user?.username || fallbackUsername || 'admin';
  const roleDisplay = user?.role === 'admin' ? t('roleAdminLabel') : t('roleUserLabel');
  const isAdmin = user?.role === 'admin';
  const currentUserId = user?.id;
  const profileInitial = (displayName.trim()[0] || 'U').toUpperCase();
  const resolvedOidcLinkName = oidcLinkProviderName.trim() || 'OIDC';
  const usernameLabel = user?.username || fallbackUsername || '';
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [avatarInput, setAvatarInput] = useState(user?.avatarUrl ?? '');
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const [oidcLinkLoading, setOidcLinkLoading] = useState(false);
  const [oidcLinkError, setOidcLinkError] = useState<string | null>(null);
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const [backupIncludeUsers, setBackupIncludeUsers] = useState(true);
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [userActionId, setUserActionId] = useState<string | null>(null);
  const [editDisplayNameId, setEditDisplayNameId] = useState<string | null>(null);
  const [displayNameDraft, setDisplayNameDraft] = useState('');
  const [displayNameError, setDisplayNameError] = useState<string | null>(null);
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
  const accountBaseLabel = getBankAccountBaseLabel(language);

  const updateBankAccountsForPerson = useCallback((personKey: 'person1' | 'person2', nextList: BankAccount[]) => {
    const trimmedList = nextList.slice(0, BANK_ACCOUNT_LIMIT);
    const ensured = trimmedList.length > 0
      ? trimmedList
      : [createBankAccount(`${accountBaseLabel} 1`, getDefaultAccountColor(0))];
    onBankAccountsChange({
      ...bankAccounts,
      [personKey]: ensured
    });
  }, [accountBaseLabel, bankAccounts, onBankAccountsChange]);

  const handleAccountNameChange = useCallback((personKey: 'person1' | 'person2', accountId: string, value: string) => {
    const nextList = (bankAccounts[personKey] ?? []).map(account => (
      account.id === accountId ? { ...account, name: value } : account
    ));
    updateBankAccountsForPerson(personKey, nextList);
  }, [bankAccounts, updateBankAccountsForPerson]);

  const handleAccountNameBlur = useCallback((personKey: 'person1' | 'person2', accountId: string, index: number, value: string) => {
    const nextName = value.trim() || `${accountBaseLabel} ${index + 1}`;
    const nextList = (bankAccounts[personKey] ?? []).map(account => (
      account.id === accountId ? { ...account, name: nextName } : account
    ));
    updateBankAccountsForPerson(personKey, nextList);
  }, [accountBaseLabel, bankAccounts, updateBankAccountsForPerson]);

  const handleAccountColorChange = useCallback((personKey: 'person1' | 'person2', accountId: string, value: string) => {
    const nextColor = isValidHexColor(value) ? value.trim() : getDefaultAccountColor(0);
    const nextList = (bankAccounts[personKey] ?? []).map(account => (
      account.id === accountId ? { ...account, color: nextColor } : account
    ));
    updateBankAccountsForPerson(personKey, nextList);
  }, [bankAccounts, updateBankAccountsForPerson]);

  const handleAddAccount = useCallback((personKey: 'person1' | 'person2') => {
    const currentList = bankAccounts[personKey] ?? [];
    if (currentList.length >= BANK_ACCOUNT_LIMIT) {
      return;
    }
    const nextIndex = currentList.length + 1;
    const nextAccount = createBankAccount(`${accountBaseLabel} ${nextIndex}`, getDefaultAccountColor(currentList.length));
    updateBankAccountsForPerson(personKey, [...currentList, nextAccount]);
  }, [accountBaseLabel, bankAccounts, updateBankAccountsForPerson]);

  const handleRemoveAccount = useCallback((personKey: 'person1' | 'person2', accountId: string) => {
    const currentList = bankAccounts[personKey] ?? [];
    const nextList = currentList.filter(account => account.id !== accountId);
    updateBankAccountsForPerson(personKey, nextList);
  }, [bankAccounts, updateBankAccountsForPerson]);

  useEffect(() => {
    setAvatarInput(user?.avatarUrl ?? '');
  }, [user?.avatarUrl]);

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

  const handleAvatarUpload = async (file?: File) => {
    const fileToUpload = file;
    if (!fileToUpload) {
      setAvatarError(t('profileImageUploadError'));
      return;
    }
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarUploadLoading(true);
    try {
      const updated = await uploadProfileImageRequest(fileToUpload);
      onProfileUpdated(updated);
      setAvatarInput(updated.avatarUrl ?? '');
      if (avatarFileInputRef.current) {
        avatarFileInputRef.current.value = '';
      }
      setAvatarSuccess(t('profileImageUploadSuccess'));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setAvatarError(resolveErrorMessage(error, t('profileImageUploadError')));
      }
    } finally {
      setAvatarUploadLoading(false);
    }
  };

  const handleAvatarFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    void handleAvatarUpload(file);
  };

  const openAvatarFilePicker = () => {
    if (avatarUploadLoading) {
      return;
    }
    avatarFileInputRef.current?.click();
  };

  const handleOidcLink = async () => {
    setOidcLinkError(null);
    setOidcLinkLoading(true);
    try {
      const result = await startOidcLinkRequest();
      window.location.assign(result.url);
    } catch (error) {
      if (!onAuthFailure(error)) {
        setOidcLinkError(resolveErrorMessage(error, t('oidcLinkError')));
      }
    } finally {
      setOidcLinkLoading(false);
    }
  };

  const handleBackupExport = async () => {
    if (backupExporting) {
      return;
    }
    setBackupStatus(null);
    setBackupExporting(true);
    try {
      const payload = await exportBackupRequest(backupIncludeUsers);
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      const dateLabel = new Date().toISOString().slice(0, 10);
      const scopeLabel = backupIncludeUsers ? 'full' : 'data';
      const filename = `homybudget-backup-${scopeLabel}-${dateLabel}.json`;
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => window.URL.revokeObjectURL(url), 1000);
      setBackupStatus({ type: 'success', message: t('backupExportSuccess') });
    } catch (error) {
      if (!onAuthFailure(error)) {
        setBackupStatus({ type: 'error', message: resolveErrorMessage(error, t('backupExportError')) });
      }
    } finally {
      setBackupExporting(false);
    }
  };

  const handleBackupImport = async (file: File) => {
    if (backupImporting) {
      return;
    }
    setBackupStatus(null);
    const confirmLabel = backupIncludeUsers ? t('backupImportConfirmFull') : t('backupImportConfirmData');
    const confirmed = window.confirm(confirmLabel);
    if (!confirmed) {
      return;
    }
    setBackupImporting(true);
    try {
      const content = await file.text();
      let parsed: BackupPayload;
      try {
        parsed = JSON.parse(content) as BackupPayload;
      } catch (error) {
        throw new Error(t('backupImportInvalid'));
      }
      if (!parsed || !Array.isArray(parsed.months)) {
        throw new Error(t('backupImportInvalid'));
      }
      await importBackupRequest(parsed, backupIncludeUsers);
      setBackupStatus({ type: 'success', message: t('backupImportSuccess') });
      window.setTimeout(() => window.location.reload(), 800);
    } catch (error) {
      if (!onAuthFailure(error)) {
        setBackupStatus({ type: 'error', message: resolveErrorMessage(error, t('backupImportError')) });
      }
    } finally {
      setBackupImporting(false);
    }
  };

  const handleBackupFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    event.target.value = '';
    void handleBackupImport(file);
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

  const startDisplayNameEdit = (target: AuthUser) => {
    if (userActionId) {
      return;
    }
    setEditDisplayNameId(target.id);
    setDisplayNameDraft(target.displayName ?? '');
    setDisplayNameError(null);
  };

  const cancelDisplayNameEdit = () => {
    setEditDisplayNameId(null);
    setDisplayNameDraft('');
    setDisplayNameError(null);
  };

  const saveDisplayNameEdit = async (target: AuthUser) => {
    if (userActionId) {
      return;
    }
    setUserActionId(target.id);
    setDisplayNameError(null);
    const trimmed = displayNameDraft.trim();
    try {
      const updated = await updateUserRequest(target.id, {
        displayName: trimmed ? trimmed : null
      });
      setUsers(prev => prev.map(item => (item.id === target.id ? updated : item)));
      if (target.id === currentUserId) {
        onProfileUpdated(updated);
      }
      const nextLabel = updated.displayName || updated.username;
      if (nextLabel) {
        onUserLabelUpdate(updated.id, nextLabel);
      }
      cancelDisplayNameEdit();
    } catch (error) {
      if (!onAuthFailure(error)) {
        setDisplayNameError(resolveErrorMessage(error, t('displayNameUpdateError')));
      }
    } finally {
      setUserActionId(null);
    }
  };

  const cardClassName = `rounded-2xl p-6 ${
    darkMode ? 'bg-slate-900/70 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
  }`;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-8">
      <div className={cardClassName}>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">{t('profileTitle')}</h3>
            <div className="space-y-3">
            <div className={`flex flex-wrap items-center gap-4 rounded-xl border px-4 py-3 ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-100 bg-white/90 text-slate-800'}`}>
              <button
                type="button"
                onClick={openAvatarFilePicker}
                disabled={avatarUploadLoading}
                className={`group relative h-12 w-12 rounded-full flex items-center justify-center overflow-hidden ${
                  darkMode ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-700'
                } ${avatarUploadLoading ? 'opacity-70 cursor-not-allowed' : ''}`}
                aria-label={t('profileImageUploadButton')}
                title={t('profileImageUploadButton')}
              >
                {avatarInput.trim() ? (
                  <img src={resolveAssetUrl(avatarInput.trim()) ?? ''} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{profileInitial}</span>
                )}
                <span className={`absolute inset-0 flex items-center justify-center text-xs font-semibold opacity-0 transition-opacity ${
                  darkMode ? 'bg-slate-900/60 text-white' : 'bg-white/70 text-slate-700'
                } ${avatarUploadLoading ? '' : 'group-hover:opacity-100'}`}>
                  <Edit2 size={14} />
                </span>
              </button>
              <div className="flex-1 min-w-[10rem]">
                <div className="text-lg font-semibold">{displayName}</div>
                {usernameLabel && (
                  <div className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
                    @{usernameLabel}
                  </div>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-semibold ${darkMode ? 'bg-slate-800 text-slate-200' : 'bg-emerald-50 text-emerald-700'}`}>
                {roleDisplay}
              </span>
            </div>
              {oidcLinkEnabled && (
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
                }`}>
                  <div>
                    <div className="font-semibold">{t('oidcLinkTitle')}</div>
                    <div className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
                      {t('oidcLinkHint')}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleOidcLink}
                    disabled={oidcLinkLoading}
                    className={`px-4 py-2 rounded-full text-xs font-semibold pill-emerald ${oidcLinkLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {oidcLinkLoading ? t('oidcLinking') : `${t('oidcLinkButton')} ${resolvedOidcLinkName}`}
                  </button>
                </div>
              )}
              {oidcLinkError && (
                <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                  {oidcLinkError}
                </div>
              )}
              <input
                ref={avatarFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleAvatarFileChange}
                className="hidden"
              />
              {(avatarSuccess || avatarError) && (
                <div className="mt-2 space-y-1">
                  {avatarSuccess && (
                    <div className={`text-sm ${darkMode ? 'text-emerald-300' : 'text-emerald-600'}`}>
                      {avatarSuccess}
                    </div>
                  )}
                  {avatarError && (
                    <div className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                      {avatarError}
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          <section className="space-y-3">
            <h3 className="text-lg font-semibold">{t('changePasswordTitle')}</h3>
            <form onSubmit={handleChangePassword} className="space-y-3">
              <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                <input
                  type="password"
                  autoComplete="current-password"
                  value={passwordForm.current}
                  onChange={(event) => setPasswordForm(prev => ({ ...prev, current: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                  placeholder={t('currentPasswordPlaceholder')}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.next}
                  onChange={(event) => setPasswordForm(prev => ({ ...prev, next: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                  placeholder={t('newPasswordPlaceholder')}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  value={passwordForm.confirm}
                  onChange={(event) => setPasswordForm(prev => ({ ...prev, confirm: event.target.value }))}
                  className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
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
                className={`px-4 py-2 rounded-full font-semibold pill-emerald ${passwordLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {passwordLoading ? t('updatingButton') : t('updateButton')}
              </button>
            </form>
          </section>

        </div>
      </div>

      <div className={cardClassName}>
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-lg font-semibold">{t('settingsExtrasTitle')}</h3>
            <div className="space-y-3">
              <ToggleRow
                icon={ArrowUpDown}
                label={t('sortExpensesLabel')}
                hint={t('fixedFreeLabel')}
                checked={sortByCost}
                onChange={onToggleSortByCost}
                darkMode={darkMode}
              />
              <ToggleRow
                icon={CalendarDays}
                label={t('sidebarMonthsSettingLabel')}
                hint={t('sidebarMonthsSettingHint')}
                checked={showSidebarMonths}
                onChange={onToggleShowSidebarMonths}
                darkMode={darkMode}
              />
              <ToggleRow
                icon={LayoutDashboard}
                label={t('budgetWidgetsSettingLabel')}
                hint={t('budgetWidgetsSettingHint')}
                checked={budgetWidgetsEnabled}
                onChange={onToggleBudgetWidgetsEnabled}
                darkMode={darkMode}
              />
              <ToggleRow
                icon={Users}
                label={t('jointAccountSettingLabel')}
                hint={t('jointAccountSettingHint')}
                checked={jointAccountEnabled}
                onChange={onToggleJointAccountEnabled}
                darkMode={darkMode}
              />
              <ToggleRow
                icon={User}
                label={t('soloModeSettingLabel')}
                hint={t('soloModeSettingHint')}
                checked={soloModeEnabled}
                onChange={onToggleSoloModeEnabled}
                darkMode={darkMode}
              />
              <SelectRow
                icon={Globe2}
                label={t('languageLabel')}
                value={languagePreference}
                onChange={(value) => onLanguagePreferenceChange(value === 'en' ? 'en' : 'fr')}
                options={[
                  { value: 'fr', label: t('frenchLabel') },
                  { value: 'en', label: t('englishLabel') }
                ]}
                darkMode={darkMode}
              />
              <SelectRow
                icon={Coins}
                label={t('currencyLabel')}
                value={currencyPreference}
                onChange={(value) => onCurrencyPreferenceChange(value === 'USD' ? 'USD' : 'EUR')}
                options={[
                  { value: 'EUR', label: t('currencyEuroLabel') },
                  { value: 'USD', label: t('currencyDollarLabel') }
                ]}
                darkMode={darkMode}
              />
              <ToggleRow
                icon={Wallet}
                label={t('bankAccountsSettingLabel')}
                hint={t('bankAccountsSettingHint')}
                checked={bankAccountsEnabled}
                onChange={onToggleBankAccountsEnabled}
                darkMode={darkMode}
              />
              {bankAccountsEnabled && (
              <div className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{t('bankAccountsTitle')}</div>
                    <div className={darkMode ? 'text-xs text-slate-400' : 'text-xs text-slate-500'}>
                      {t('bankAccountsHint')}
                    </div>
                  </div>
                  <div className="text-xs text-slate-400">{t('accountLimitHint')}</div>
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  {(['person1', 'person2'] as const).map(personKey => {
                    const accounts = bankAccounts[personKey] ?? [];
                    return (
                      <div key={personKey} className={`rounded-lg border px-3 py-3 ${
                        darkMode ? 'border-slate-800 bg-slate-900/60' : 'border-slate-100 bg-white/80'
                      }`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold">
                            {personKey === 'person1' ? t('person1Label') : t('person2Label')}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleAddAccount(personKey)}
                            disabled={accounts.length >= BANK_ACCOUNT_LIMIT}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-semibold ${
                              accounts.length >= BANK_ACCOUNT_LIMIT
                                ? 'opacity-50 cursor-not-allowed'
                                : (darkMode ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-600')
                            }`}
                          >
                            <Plus size={12} />
                            {t('addAccountLabel')}
                          </button>
                        </div>
                        <div className="mt-3 space-y-2">
                          {accounts.map((account, index) => (
                            <div key={account.id} className="flex items-center gap-2">
                              <input
                                type="color"
                                value={account.color || getDefaultAccountColor(index)}
                                onChange={(event) => handleAccountColorChange(personKey, account.id, event.target.value)}
                                className={`h-10 w-10 cursor-pointer rounded-lg border ${
                                  darkMode ? 'border-slate-700 bg-slate-900' : 'border-slate-200 bg-white'
                                }`}
                                aria-label={t('bankAccountColorLabel')}
                              />
                              <input
                                type="text"
                                value={account.name}
                                onChange={(event) => handleAccountNameChange(personKey, account.id, event.target.value)}
                                onBlur={(event) => handleAccountNameBlur(personKey, account.id, index, event.target.value)}
                                className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
                                  darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                                }`}
                                aria-label={t('bankAccountLabel')}
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveAccount(personKey, account.id)}
                                className={`p-2 rounded-lg ${
                                  darkMode ? 'text-slate-300 hover:text-red-300' : 'text-slate-500 hover:text-red-500'
                                }`}
                                aria-label={t('removeAccountLabel')}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              )}
            </div>
          </section>
        </div>
      </div>
      {isAdmin && (
        <div className={cardClassName}>
          <div className="space-y-6">
            <section className="space-y-3">
              <h3 className="text-lg font-semibold">{t('adminSectionTitle')}</h3>
              <div className="space-y-3">
                <RangeRow
                  icon={Clock}
                  label={t('sessionDurationLabel')}
                  hint={t('sessionDurationHint')}
                  value={sessionDurationHours}
                  min={1}
                  max={24}
                  step={1}
                  onChange={onSessionDurationHoursChange}
                  darkMode={darkMode}
                />
                <ToggleRow
                  icon={KeyRound}
                  label={t('oidcSectionTitle')}
                  checked={oidcEnabled}
                  onChange={onOidcEnabledChange}
                  darkMode={darkMode}
                />
                {oidcEnabled && (
                  <div className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="text-xs font-semibold">
                        {t('oidcProviderLabel')}
                        <input
                          type="text"
                          value={oidcProviderName}
                          onChange={(event) => onOidcProviderNameChange(event.target.value)}
                          placeholder="Keycloak / Authentik"
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-semibold ${
                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                          }`}
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        {t('oidcIssuerLabel')}
                        <input
                          type="text"
                          value={oidcIssuer}
                          onChange={(event) => onOidcIssuerChange(event.target.value)}
                          placeholder="https://auth.example.com/realms/homybudget"
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-semibold ${
                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                          }`}
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        {t('oidcClientIdLabel')}
                        <input
                          type="text"
                          value={oidcClientId}
                          onChange={(event) => onOidcClientIdChange(event.target.value)}
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-semibold ${
                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                          }`}
                        />
                      </label>
                      <label className="text-xs font-semibold">
                        {t('oidcClientSecretLabel')}
                        <input
                          type="password"
                          value={oidcClientSecret}
                          onChange={(event) => onOidcClientSecretChange(event.target.value)}
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-semibold ${
                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                          }`}
                        />
                      </label>
                      <label className="text-xs font-semibold sm:col-span-2">
                        {t('oidcRedirectUriLabel')}
                        <input
                          type="text"
                          value={oidcRedirectUri}
                          onChange={(event) => onOidcRedirectUriChange(event.target.value)}
                          placeholder="https://app.example.com/api/auth/oidc/callback"
                          className={`mt-1 w-full px-3 py-2 rounded-lg border text-sm font-semibold ${
                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                          }`}
                        />
                      </label>
                    </div>
                  </div>
                )}
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">{t('personLinkSectionTitle')}</h3>
              <div className="space-y-3">
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
                }`}>
                  <div className="font-semibold">{t('person1Label')}</div>
                  <Select
                    value={person1UserId ?? 'unassigned'}
                    onValueChange={(value) => {
                      const selected = value === 'unassigned'
                        ? null
                        : (users.find(item => item.id === value) ?? null);
                      onPersonLinkChange('person1', selected);
                    }}
                    disabled={usersLoading}
                  >
                    <SelectTrigger
                      className={`min-w-[12rem] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value="unassigned">{t('unassignedLabel')}</SelectItem>
                      {users.map(item => {
                        const isDisabled = (!item.isActive) || (item.id === person2UserId && item.id !== person1UserId);
                        const label = makeUserLabel(item);
                        return (
                          <SelectItem key={item.id} value={item.id} disabled={isDisabled}>
                            {item.isActive ? label : `${label} (${t('inactiveLabel')})`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
                  darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
                }`}>
                  <div className="font-semibold">{t('person2Label')}</div>
                  <Select
                    value={person2UserId ?? 'unassigned'}
                    onValueChange={(value) => {
                      const selected = value === 'unassigned'
                        ? null
                        : (users.find(item => item.id === value) ?? null);
                      onPersonLinkChange('person2', selected);
                    }}
                    disabled={usersLoading}
                  >
                    <SelectTrigger
                      className={`min-w-[12rem] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value="unassigned">{t('unassignedLabel')}</SelectItem>
                      {users.map(item => {
                        const isDisabled = (!item.isActive) || (item.id === person1UserId && item.id !== person2UserId);
                        const label = makeUserLabel(item);
                        return (
                          <SelectItem key={item.id} value={item.id} disabled={isDisabled}>
                            {item.isActive ? label : `${label} (${t('inactiveLabel')})`}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>
                <div className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 text-slate-400' : 'border-slate-100 text-slate-500'}`}>
                  {usersLoading ? t('loadingUsers') : t('personLinkSectionHint')}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              <h3 className="text-lg font-semibold">{t('backupSectionTitle')}</h3>
              <div className={`rounded-xl border px-4 py-3 text-sm ${
                darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
              }`}>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold">{t('backupSectionSubtitle')}</div>
                    <div className={darkMode ? 'text-xs text-slate-400' : 'text-xs text-slate-500'}>
                      {t('backupSectionHint')}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={handleBackupExport}
                      disabled={backupExporting || backupImporting}
                      className={`px-4 py-2 rounded-full text-xs font-semibold ${
                        darkMode ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      } ${(backupExporting || backupImporting) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {backupExporting ? t('backupExportingLabel') : t('backupExportButton')}
                    </button>
                    <button
                      type="button"
                      onClick={() => backupFileInputRef.current?.click()}
                      disabled={backupImporting || backupExporting}
                      className={`px-4 py-2 rounded-full text-xs font-semibold ${
                        darkMode ? 'bg-rose-500/90 text-white hover:bg-rose-500' : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
                      } ${(backupImporting || backupExporting) ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                      {backupImporting ? t('backupImportingLabel') : t('backupImportButton')}
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold">{t('backupIncludeUsersLabel')}</div>
                    <div className={darkMode ? 'text-[11px] text-slate-400' : 'text-[11px] text-slate-500'}>
                      {t('backupIncludeUsersHint')}
                    </div>
                  </div>
                  <AnimatedSwitch
                    checked={backupIncludeUsers}
                    onChange={setBackupIncludeUsers}
                    darkMode={darkMode}
                  />
                </div>
                <div className={`mt-3 text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  {backupIncludeUsers ? t('backupImportWarningFull') : t('backupImportWarningData')}
                </div>
                {backupStatus && (
                  <div className={`mt-3 text-sm ${
                    backupStatus.type === 'success'
                      ? (darkMode ? 'text-emerald-300' : 'text-emerald-600')
                      : (darkMode ? 'text-red-300' : 'text-red-600')
                  }`}>
                    {backupStatus.message}
                  </div>
                )}
                <input
                  ref={backupFileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleBackupFileChange}
                  className="hidden"
                />
              </div>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">{t('userManagementTitle')}</h3>
                <button
                  type="button"
                  onClick={() => void loadUsers()}
                  disabled={usersLoading}
                  className={`px-3 py-1.5 rounded-full text-sm font-semibold border ${
                    darkMode ? 'border-slate-700 text-slate-100 hover:bg-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  } ${usersLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {t('refreshButton')}
                </button>
              </div>

              <form onSubmit={handleCreateUser} className={`rounded-xl border p-4 space-y-3 ${darkMode ? 'border-slate-800 bg-slate-950/40' : 'border-slate-100 bg-white/90'}`}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  <input
                    type="text"
                    value={createForm.username}
                    onChange={(event) => setCreateForm(prev => ({ ...prev, username: event.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                    placeholder={t('createUserUsernamePlaceholder')}
                  />
                  <input
                    type="text"
                    value={createForm.displayName}
                    onChange={(event) => setCreateForm(prev => ({ ...prev, displayName: event.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                    placeholder={t('createUserDisplayNamePlaceholder')}
                  />
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(event) => setCreateForm(prev => ({ ...prev, password: event.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                    placeholder={t('createUserPasswordPlaceholder')}
                  />
                  <input
                    type="password"
                    value={createForm.confirmPassword}
                    onChange={(event) => setCreateForm(prev => ({ ...prev, confirmPassword: event.target.value }))}
                    className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                    placeholder={t('createUserConfirmPlaceholder')}
                  />
                  <Select
                    value={createForm.role}
                    onValueChange={(value) => setCreateForm(prev => ({ ...prev, role: value === 'admin' ? 'admin' : 'user' }))}
                  >
                    <SelectTrigger
                      className={`w-full ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value="user">{t('roleUserLabel')}</SelectItem>
                      <SelectItem value="admin">{t('roleAdminLabel')}</SelectItem>
                    </SelectContent>
                  </Select>
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
                  className={`px-4 py-2 rounded-full font-semibold pill-emerald ${createLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {createLoading ? t('creatingUserButton') : t('createUserButton')}
                </button>
              </form>

              {resetInfo && (
                <div className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 text-slate-200' : 'border-slate-100 text-slate-700'}`}>
                  <div className="font-semibold mb-1">{t('resetTokenTitle')}</div>
                  <div className="break-all">{resetInfo.token}</div>
                  <div className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    {t('expiresOnLabel')} {formatTimestamp(resetInfo.expiresAt)}
                  </div>
                </div>
              )}

              <div className={`rounded-xl border ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <div className="p-4">
                  {usersLoading ? (
                    <div className="text-sm">{t('loadingUsers')}</div>
                  ) : users.length === 0 ? (
                    <div className="text-sm">{t('noUsers')}</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className={darkMode ? 'text-slate-400' : 'text-slate-500'}>
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
                              <tr key={item.id} className={darkMode ? 'border-t border-slate-800' : 'border-t border-slate-100'}>
                                <td className="py-2 pr-4">
                                  {editDisplayNameId === item.id ? (
                                    <div className="space-y-1">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <input
                                          type="text"
                                          value={displayNameDraft}
                                          onChange={(event) => setDisplayNameDraft(event.target.value)}
                                          onKeyDown={(event) => {
                                            if (event.key === 'Enter') {
                                              event.preventDefault();
                                              void saveDisplayNameEdit(item);
                                            }
                                            if (event.key === 'Escape') {
                                              event.preventDefault();
                                              cancelDisplayNameEdit();
                                            }
                                          }}
                                          placeholder={item.username}
                                          className={`w-full max-w-[14rem] px-2 py-1 rounded-lg border text-sm ${
                                            darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'
                                          }`}
                                          autoFocus
                                        />
                                        <button
                                          type="button"
                                          onClick={() => void saveDisplayNameEdit(item)}
                                          className={`p-1.5 rounded-full ${
                                            darkMode ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                          }`}
                                          title={t('updateButton')}
                                        >
                                          <Check size={14} />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={cancelDisplayNameEdit}
                                          className={`p-1.5 rounded-full ${
                                            darkMode ? 'bg-slate-800 text-slate-100 hover:bg-slate-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                          }`}
                                          title={t('cancelLabel')}
                                        >
                                          <X size={14} />
                                        </button>
                                      </div>
                                      <div className={darkMode ? 'text-slate-500 text-xs' : 'text-slate-500 text-xs'}>
                                        @{item.username}
                                      </div>
                                      {displayNameError && (
                                        <div className={`text-xs ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
                                          {displayNameError}
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => startDisplayNameEdit(item)}
                                      disabled={Boolean(userActionId)}
                                      className={`text-left ${darkMode ? 'text-slate-100' : 'text-slate-800'} ${
                                        userActionId ? 'opacity-60 cursor-not-allowed' : 'hover:underline'
                                      }`}
                                    >
                                      <div className="font-semibold">{item.displayName || item.username}</div>
                                      <div className={darkMode ? 'text-slate-500 text-xs' : 'text-slate-500 text-xs'}>
                                        @{item.username}
                                      </div>
                                    </button>
                                  )}
                                </td>
                                <td className="py-2 pr-4">
                                  <Select
                                    value={item.role}
                                    onValueChange={(value) => handleRoleChange(item.id, value === 'admin' ? 'admin' : 'user')}
                                    disabled={Boolean(userActionId) || isSelf}
                                  >
                                    <SelectTrigger
                                      className={`w-[9rem] ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'} ${isSelf ? 'opacity-60' : ''}`}
                                    >
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                                      <SelectItem value="user">{t('roleUserLabel')}</SelectItem>
                                      <SelectItem value="admin">{t('roleAdminLabel')}</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </td>
                                <td className="py-2 pr-4">
                                  <div className="inline-flex items-center gap-2">
                                    <AnimatedSwitch
                                      checked={item.isActive}
                                      onChange={(next) => handleActiveChange(item.id, next)}
                                      disabled={Boolean(userActionId) || isSelf}
                                      darkMode={darkMode}
                                    />
                                    <span className={darkMode ? 'text-slate-200' : 'text-slate-600'}>
                                      {item.isActive ? t('activeLabel') : t('blockedLabel')}
                                    </span>
                                  </div>
                                </td>
                                <td className="py-2 pr-4">{formatTimestamp(item.lastLoginAt)}</td>
                                <td className="py-2">
                                  <button
                                    type="button"
                                    disabled={Boolean(userActionId)}
                                    onClick={() => handleResetPassword(item.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
                                      darkMode ? 'border-slate-700 text-slate-100 hover:bg-slate-900' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
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
          </div>
        </div>
      )}
    </div>
  );
};

const App: React.FC = () => {
  const [themePreference, setThemePreference] = useState<'light' | 'dark'>(() => getInitialThemePreference());
  const [darkMode, setDarkMode] = useState(() => getInitialThemePreference() === 'dark');
  const [currentDate, setCurrentDate] = useState<Date>(() => getInitialCurrentDate());
  const authSnapshotRef = useRef<AuthStorageSnapshot>(getStoredAuthSnapshot());
  const [authToken, setAuthToken] = useState<string | null>(() => authSnapshotRef.current.token);
  const [authUser, setAuthUser] = useState(() => authSnapshotRef.current.user);
  const [authProfile, setAuthProfile] = useState<AuthUser | null>(() => authSnapshotRef.current.profile);
  const [authStorage, setAuthStorage] = useState<'local' | 'session'>(() => authSnapshotRef.current.storage);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState(false);
  const [activePage, setActivePage] = useState<'dashboard' | 'budget' | 'reports' | 'settings'>('budget');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectorError, setSelectorError] = useState<string | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [pendingOnboarding, setPendingOnboarding] = useState<{ person1Name: string; person2Name: string; mode: 'solo' | 'duo' } | null>(null);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [sortByCost, setSortByCost] = useState<boolean>(() => getInitialSortByCost());
  const [languagePreference, setLanguagePreference] = useState<LanguageCode>(() => getInitialLanguagePreference());
  const [jointAccountEnabled, setJointAccountEnabled] = useState<boolean>(() => getInitialJointAccountEnabled());
  const [soloModeEnabled, setSoloModeEnabled] = useState<boolean>(() => getInitialSoloModeEnabled());
  const [showSidebarMonths, setShowSidebarMonths] = useState<boolean>(() => getInitialSidebarMonths());
  const [budgetWidgetsEnabled, setBudgetWidgetsEnabled] = useState<boolean>(() => getInitialBudgetWidgetsEnabled());
  const [currencyPreference, setCurrencyPreference] = useState<'EUR' | 'USD'>(() => getInitialCurrencyPreference());
  const [bankAccountsEnabled, setBankAccountsEnabled] = useState<boolean>(() => getInitialBankAccountsEnabled());
  const [bankAccounts, setBankAccounts] = useState<BankAccountSettings>(() => (
    normalizeBankAccounts(null, getInitialLanguagePreference())
  ));
  const [sessionDurationHours, setSessionDurationHours] = useState<number>(12);
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcProviderName, setOidcProviderName] = useState('');
  const [oidcIssuer, setOidcIssuer] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcRedirectUri, setOidcRedirectUri] = useState('');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [oidcLoginConfig, setOidcLoginConfig] = useState<OidcConfigResponse | null>(null);
  const [paletteIdLight, setPaletteIdLight] = useState(() => getInitialPaletteId('light'));
  const [paletteIdDark, setPaletteIdDark] = useState(() => getInitialPaletteId('dark'));
  const [expenseWizard, setExpenseWizard] = useState<ExpenseWizardState | null>(null);
  const [jointWizard, setJointWizard] = useState<JointWizardState | null>(null);
  const [jointDeleteArmed, setJointDeleteArmed] = useState(false);
  const [toast, setToast] = useState<{
    message: string;
    tone?: 'success' | 'error';
    action?: {
      label: string;
      onClick: () => void;
    };
  } | null>(null);
  const [deleteMonthOpen, setDeleteMonthOpen] = useState(false);
  const [deleteMonthInput, setDeleteMonthInput] = useState('');
  const [showNextMonth, setShowNextMonth] = useState(false);
  const [isOnline, setIsOnline] = useState<boolean>(() => getInitialOnlineStatus());
  const [syncQueue, setSyncQueue] = useState<SyncQueue>(() => loadSyncQueue());
  const [syncNotice, setSyncNotice] = useState<{ label: string; tone: 'info' | 'warning' } | null>(null);

  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<Record<string, string>>({});
  const lastSavedSettingsRef = useRef<string | null>(null);
  const oidcHandledRef = useRef(false);
  const jointDeleteTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);
  const syncNoticeTimeoutRef = useRef<number | null>(null);
  const syncQueueRef = useRef<SyncQueue>(syncQueue);
  const syncInFlightRef = useRef(false);
  const lastViewedMonthUserRef = useRef<string | null>(null);

  const activePaletteId = darkMode ? paletteIdDark : paletteIdLight;
  const palette = useMemo(() => getPaletteById(activePaletteId), [activePaletteId]);
  const jointTone = useMemo(() => getPaletteTone(palette, 3, darkMode), [palette, darkMode]);
  const isDefaultPalette = palette.id === 'default';
  const t = useMemo(() => createTranslator(languagePreference), [languagePreference]);
  const isBudgetView = activePage === 'budget';
  const isSettingsView = activePage === 'settings';
  const isDashboardView = activePage === 'dashboard';
  const isReportsView = activePage === 'reports';
  const deleteConfirmToken = t('deleteMonthConfirmToken');
  const isDeleteConfirmValid = deleteMonthInput.trim().toLowerCase() === deleteConfirmToken.toLowerCase();
  const pageLabel = useMemo(() => (
    activePage === 'dashboard'
      ? t('dashboardLabel')
      : activePage === 'reports'
        ? t('reportsLabel')
        : t('settingsLabel')
  ), [activePage, t]);
  const userDisplayName = useMemo(
    () => authProfile?.displayName || authProfile?.username || authUser || t('accountLabel'),
    [authProfile?.displayName, authProfile?.username, authUser, t]
  );
  const userInitial = useMemo(
    () => (userDisplayName.trim()[0] || 'U').toUpperCase(),
    [userDisplayName]
  );
  const userHandle = useMemo(() => authProfile?.username || authUser || '', [authProfile?.username, authUser]);
  const userAvatarUrl = authProfile?.avatarUrl || null;
  const resolvedUserAvatarUrl = useMemo(() => resolveAssetUrl(userAvatarUrl), [userAvatarUrl]);
  const currentMonthKey = useMemo(() => getCurrentMonthKey(currentDate), [currentDate]);
  const nextMonthKey = useMemo(() => {
    const nextDate = new Date(currentDate);
    nextDate.setMonth(nextDate.getMonth() + 1);
    return getCurrentMonthKey(nextDate);
  }, [currentDate]);
  const data = useMemo(
    () => monthlyBudgets[currentMonthKey] || getDefaultBudgetData(),
    [currentMonthKey, monthlyBudgets]
  );
  const nextMonthData = useMemo(
    () => monthlyBudgets[nextMonthKey] || null,
    [monthlyBudgets, nextMonthKey]
  );
  const nextMonthAvailable = Boolean(nextMonthData);
  const showNextMonthPanel = showNextMonth && nextMonthAvailable;
  const person1UserId = data.person1UserId ?? null;
  const person2UserId = data.person2UserId ?? null;
  const isPerson1Linked = Boolean(person1UserId);
  const isPerson2Linked = Boolean(person2UserId);
  const nextPerson1Linked = Boolean(nextMonthData?.person1UserId);
  const nextPerson2Linked = Boolean(nextMonthData?.person2UserId);
  const availableMonthKeys = useMemo(() => Object.keys(monthlyBudgets).sort(), [monthlyBudgets]);
  const monthOptions = useMemo(() => MONTH_LABELS[languagePreference], [languagePreference]);
  const formatMonthKey = useCallback((monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    const monthLabel = monthOptions[monthIndex] ?? monthKey;
    return `${monthLabel} ${year}`;
  }, [monthOptions]);
  const sidebarMonthItems = useMemo(() => {
    const [yearValue] = currentMonthKey.split('-');
    const year = Number(yearValue);
    if (!Number.isFinite(year) || year <= 0) {
      return [];
    }
    return Array.from({ length: 12 }, (_, index) => {
      const monthKey = `${year}-${String(index + 1).padStart(2, '0')}`;
      return {
        key: monthKey,
        label: formatMonthKey(monthKey),
        isAvailable: Boolean(monthlyBudgets[monthKey])
      };
    });
  }, [currentMonthKey, formatMonthKey, monthlyBudgets]);
  const breadcrumbItems = useMemo(() => (
    isBudgetView
      ? [t('appName'), t('budgetLabel'), formatMonthKey(currentMonthKey)]
      : isSettingsView
        ? [t('appName'), t('settingsLabel'), t('profileTitle')]
        : [t('appName'), pageLabel]
  ), [currentMonthKey, formatMonthKey, isBudgetView, isSettingsView, pageLabel, t]);
  const pendingSyncCount = useMemo(() => (
    Object.keys(syncQueue.months).length
    + Object.keys(syncQueue.deletes).length
    + (syncQueue.settings ? 1 : 0)
  ), [syncQueue.deletes, syncQueue.months, syncQueue.settings]);
  const syncBadgeLabel = useMemo(() => {
    if (syncNotice) {
      return syncNotice.label;
    }
    if (!isOnline) {
      return pendingSyncCount > 0
        ? `${t('offlineLabel')} · ${pendingSyncCount}`
        : t('offlineLabel');
    }
    if (pendingSyncCount > 0) {
      return `${t('syncPendingLabel')} ${pendingSyncCount}`;
    }
    return null;
  }, [isOnline, pendingSyncCount, syncNotice, t]);
  const syncBadgeTone = useMemo(() => {
    if (syncNotice) {
      return syncNotice.tone;
    }
    if (!isOnline) {
      return 'warning' as const;
    }
    return 'info' as const;
  }, [isOnline, syncNotice]);
  const selectedCalendarDate = expenseWizard?.date || null;
  const expenseWizardAccounts = expenseWizard ? (bankAccounts[expenseWizard.personKey] ?? []) : [];
  const expenseWizardAccountId = expenseWizard?.accountId ? expenseWizard.accountId : 'none';
  const compactWizardHeight = useMediaQuery('(max-height: 720px)');
  const compactWizardWidth = useMediaQuery('(max-width: 640px)');
  const isCompactWizard = compactWizardWidth;
  const isTightWizard = compactWizardWidth || compactWizardHeight;
  const wizardDialogSpacing = isTightWizard ? 'p-4 space-y-3' : 'p-6 space-y-4';
  const wizardDialogScroll = isTightWizard ? 'max-h-[85dvh] overflow-y-auto' : '';
  const wizardLabelClass = isTightWizard ? 'text-xs font-medium' : 'text-sm font-medium';
  const wizardInputPadding = isTightWizard ? 'py-1.5' : 'py-2';
  const wizardButtonPadding = isTightWizard ? 'px-3 py-1.5' : 'px-3 py-2';
  const pageStyle = useMemo(() => ({
    backgroundColor: darkMode ? '#0b1220' : '#fbf7f2',
    backgroundImage: darkMode
      ? 'radial-gradient(1100px circle at 0% 0%, rgba(58,63,143,0.22), transparent 45%), radial-gradient(1100px circle at 100% 0%, rgba(122,76,159,0.2), transparent 45%), radial-gradient(1100px circle at 0% 100%, rgba(210,74,106,0.16), transparent 48%), radial-gradient(1100px circle at 100% 100%, rgba(58,63,143,0.18), transparent 50%)'
      : 'radial-gradient(1200px circle at 12% -18%, rgba(58,63,143,0.14), transparent 45%), radial-gradient(900px circle at 90% 5%, rgba(210,74,106,0.12), transparent 50%), radial-gradient(700px circle at 45% 115%, rgba(242,140,56,0.10), transparent 55%), radial-gradient(900px circle at 0% 100%, rgba(122,76,159,0.12), transparent 55%)'
  }) as React.CSSProperties, [darkMode]);
  const enableDrag = useMediaQuery('(min-width: 768px)');

  const oidcLoginEnabled = Boolean(oidcLoginConfig?.enabled);
  const oidcLoginProviderName = (oidcLoginConfig?.providerName || 'OIDC').trim() || 'OIDC';
  const oidcLinkEnabled = Boolean(
    (oidcEnabled && oidcIssuer && oidcClientId && oidcRedirectUri) || oidcLoginConfig?.enabled
  );
  const oidcLinkProviderName = (oidcProviderName || oidcLoginConfig?.providerName || 'OIDC').trim() || 'OIDC';

  const buildSettingsPayload = (overrides: Partial<AppSettings> = {}): AppSettings => ({
    languagePreference,
    soloModeEnabled,
    jointAccountEnabled,
    sortByCost,
    showSidebarMonths,
    budgetWidgetsEnabled,
    currencyPreference,
    bankAccountsEnabled,
    bankAccounts,
    sessionDurationHours,
    oidcEnabled,
    oidcProviderName,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcRedirectUri,
    ...overrides
  });

  const applyLoginResult = (result: LoginResponse, remember = true) => {
    const nextStorage: 'local' | 'session' = remember ? 'local' : 'session';
    setAuthStorage(nextStorage);
    setAuthToken(result.token);
    setAuthUser(result.user.username);
    setAuthProfile(result.user);
    setThemePreference(result.user.themePreference);
    setDarkMode(result.user.themePreference === 'dark');
    setActivePage('budget');
  };

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
    clearAuthStorage();
    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    setAuthToken(null);
    setAuthUser('');
    setAuthProfile(null);
    setAuthStorage('local');
    setAuthError(t('sessionExpiredError'));
    setAuthLoading(false);
    setShowOnboarding(false);
    setSidebarOpen(false);
    setActivePage('budget');
    setMonthlyBudgets({});
    setIsHydrated(false);
    return true;
  };

  useEffect(() => {
    return () => {
      if (jointDeleteTimerRef.current) {
        window.clearTimeout(jointDeleteTimerRef.current);
      }
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
      if (syncNoticeTimeoutRef.current) {
        window.clearTimeout(syncNoticeTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    syncQueueRef.current = syncQueue;
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(SYNC_QUEUE_STORAGE_KEY, JSON.stringify(syncQueue));
  }, [syncQueue]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const handleLogin = async (username: string, password: string, remember: boolean) => {
    if (!username || !password) {
      setAuthError(t('authRequiredError'));
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await loginRequest(username, password);
      applyLoginResult(result, remember);
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

  const handleOidcLogin = () => {
    if (typeof window === 'undefined') {
      return;
    }
    window.location.assign(apiUrl('/api/auth/oidc/start'));
  };

  const resolveOidcStatusMessage = (status: string) => {
    switch (status) {
      case 'unlinked':
        return t('oidcUnlinkedError');
      case 'inactive':
        return t('oidcInactiveError');
      case 'failed':
        return t('oidcFailedError');
      case 'expired':
        return t('oidcExpiredError');
      case 'invalid':
        return t('oidcInvalidError');
      case 'linked':
        return t('oidcLinkSuccess');
      case 'linked_conflict':
        return t('oidcLinkConflictError');
      default:
        return null;
    }
  };

  useEffect(() => {
    if (typeof window === 'undefined' || oidcHandledRef.current) {
      return;
    }
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token');
    const oidcStatus = params.get('oidc');
    if (!token && !oidcStatus) {
      return;
    }
    oidcHandledRef.current = true;
    if (token) {
      setAuthError(null);
      setAuthLoading(false);
      setAuthStorage('local');
      setAuthToken(token);
      setAuthUser('');
      setAuthProfile(null);
      setActivePage('budget');
    }
    if (oidcStatus) {
      const message = resolveOidcStatusMessage(oidcStatus);
      if (message) {
        const isSuccess = oidcStatus === 'linked';
        if (authToken || token || isSuccess) {
          alert(message);
        } else {
          setAuthError(message);
        }
      }
    }
    params.delete('token');
    params.delete('oidc');
    const nextSearch = params.toString();
    const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash || ''}`;
    window.history.replaceState({}, '', nextUrl);
  }, [authToken, t]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('paletteIdLight', paletteIdLight);
  }, [paletteIdLight]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('paletteIdDark', paletteIdDark);
  }, [paletteIdDark]);

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
    localStorage.setItem('showSidebarMonths', showSidebarMonths ? 'true' : 'false');
  }, [showSidebarMonths]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('budgetWidgetsEnabled', budgetWidgetsEnabled ? 'true' : 'false');
  }, [budgetWidgetsEnabled]);

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
    localStorage.setItem('currencyPreference', currencyPreference);
  }, [currencyPreference]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem('bankAccountsEnabled', bankAccountsEnabled ? 'true' : 'false');
  }, [bankAccountsEnabled]);

  useEffect(() => {
    if (typeof window === 'undefined' || !isHydrated) {
      return;
    }
    localStorage.setItem(OFFLINE_BUDGET_CACHE_KEY, JSON.stringify(monthlyBudgets));
  }, [isHydrated, monthlyBudgets]);

  useEffect(() => {
    if (!authToken || !settingsLoaded || showOnboarding) {
      return;
    }
    const payload = buildSettingsPayload();
    const serialized = JSON.stringify(payload);
    if (lastSavedSettingsRef.current === serialized) {
      return;
    }
    const previous = lastSavedSettingsRef.current;
    lastSavedSettingsRef.current = serialized;
    if (!isOnline) {
      enqueueSettingsSync(serialized);
      return;
    }
    void updateAppSettingsRequest(payload)
      .then((settings) => {
        lastSavedSettingsRef.current = JSON.stringify(settings);
      })
      .catch((error) => {
        if (!handleAuthFailure(error)) {
          if (isRetriableSyncError(error)) {
            enqueueSettingsSync(serialized);
          } else {
            lastSavedSettingsRef.current = previous;
            console.error('Failed to update settings', error);
          }
        }
      });
  }, [
    authToken,
    settingsLoaded,
    showOnboarding,
    languagePreference,
    soloModeEnabled,
    jointAccountEnabled,
    sortByCost,
    showSidebarMonths,
    budgetWidgetsEnabled,
    currencyPreference,
    bankAccountsEnabled,
    bankAccounts,
    sessionDurationHours,
    oidcEnabled,
    oidcProviderName,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcRedirectUri
  ]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const root = document.body;
    const html = document.documentElement;
    html.style.setProperty('--app-bg', darkMode ? '#0b1220' : '#fbf7f2');
    html.style.setProperty('--ink', darkMode ? '#e2e8f0' : '#1f2937');
    html.style.setProperty('--card-border', darkMode ? 'rgba(148, 163, 184, 0.2)' : 'rgba(15, 23, 42, 0.08)');
    html.style.setProperty('--brand-primary', darkMode ? '#F28C38' : '#3A3F8F');
    html.style.setProperty('--brand-primary-soft', darkMode ? 'rgba(242, 140, 56, 0.2)' : '#EEF0FB');
    const updateMeta = (name: string, content: string) => {
      let tag = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null;
      if (!tag) {
        tag = document.createElement('meta');
        tag.setAttribute('name', name);
        document.head.appendChild(tag);
      }
      tag.setAttribute('content', content);
    };
    updateMeta('theme-color', darkMode ? '#0b1220' : '#fbf7f2');
    updateMeta('apple-mobile-web-app-status-bar-style', darkMode ? 'black-translucent' : 'default');
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
      persistAuthStorage(authStorage, authToken, authUser, authProfile);
    } else {
      clearAuthStorage();
    }
  }, [authToken, authUser, authProfile, authStorage]);

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
        const storedTheme = typeof window !== 'undefined' ? localStorage.getItem('themePreference') : null;
        const storedValue = storedTheme === 'dark' ? 'dark' : storedTheme === 'light' ? 'light' : null;
        const resolvedTheme = storedValue ?? profile.themePreference ?? 'light';
        if (storedValue && storedValue !== profile.themePreference) {
          void updateProfileRequest({ themePreference: storedValue })
            .then((updated) => {
              setAuthProfile(updated);
              setAuthUser(updated.username);
            })
            .catch((error) => {
              if (!handleAuthFailure(error)) {
                console.error('Failed to sync theme preference', error);
              }
            });
        }
        setThemePreference(resolvedTheme);
        setDarkMode(resolvedTheme === 'dark');
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
    let isActive = true;
    const loadLatest = async () => {
      try {
        const latest = await fetchLatestVersion();
        if (!isActive || !latest?.version) {
          return;
        }
        setLatestVersion(latest.version);
        setUpdateAvailable(compareVersions(APP_VERSION, latest.version) < 0);
      } catch (error) {
        if (isActive) {
          setLatestVersion(null);
          setUpdateAvailable(false);
        }
      }
    };
    void loadLatest();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    let isActive = true;
    const loadOidcConfig = async () => {
      try {
        const config = await fetchOidcConfig();
        if (isActive) {
          setOidcLoginConfig(config);
        }
      } catch (error) {
        if (isActive) {
          setOidcLoginConfig(null);
        }
      }
    };
    void loadOidcConfig();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!authToken) {
      setSettingsLoaded(false);
      lastSavedSettingsRef.current = null;
      return;
    }
    if (showOnboarding || settingsLoaded) {
      return;
    }
    let isActive = true;
    const loadSettings = async () => {
      try {
        const settings = await fetchAppSettings();
        if (!isActive) {
          return;
        }
        setSortByCost(settings.sortByCost);
        setJointAccountEnabled(settings.jointAccountEnabled);
        setSoloModeEnabled(settings.soloModeEnabled);
        setShowSidebarMonths(settings.showSidebarMonths ?? true);
        setBudgetWidgetsEnabled(settings.budgetWidgetsEnabled ?? settings.dashboardWidgetsEnabled ?? true);
        setLanguagePreference(settings.languagePreference);
        setCurrencyPreference(settings.currencyPreference ?? 'EUR');
        setBankAccountsEnabled(settings.bankAccountsEnabled ?? true);
        setSessionDurationHours(settings.sessionDurationHours ?? 12);
        setBankAccounts(normalizeBankAccounts(settings.bankAccounts, settings.languagePreference ?? languagePreference));
        setOidcEnabled(settings.oidcEnabled ?? false);
        setOidcProviderName(settings.oidcProviderName ?? '');
        setOidcIssuer(settings.oidcIssuer ?? '');
        setOidcClientId(settings.oidcClientId ?? '');
        setOidcClientSecret(settings.oidcClientSecret ?? '');
        setOidcRedirectUri(settings.oidcRedirectUri ?? '');
        lastSavedSettingsRef.current = JSON.stringify(settings);
        setSettingsLoaded(true);
      } catch (error) {
        if (!isActive) {
          return;
        }
        console.error('Failed to load settings', error);
        setSettingsLoaded(true);
      }
    };
    void loadSettings();
    return () => {
      isActive = false;
    };
  }, [authToken, showOnboarding, settingsLoaded]);

  useEffect(() => {
    if (authToken) {
      return;
    }
    let isActive = true;
    const checkBootstrap = async () => {
      try {
        const status = await fetchBootstrapStatus();
        if (!isActive) {
          return;
        }
        setShowOnboarding(!status.hasUsers);
      } catch (error) {
        if (!isActive) {
          return;
        }
        setShowOnboarding(false);
      }
    };
    void checkBootstrap();
    return () => {
      isActive = false;
    };
  }, [authToken]);

  useEffect(() => {
    setSelectorError(null);
  }, [currentMonthKey]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    localStorage.setItem(getLastViewedMonthStorageKey(), currentMonthKey);
    if (userHandle) {
      localStorage.setItem(getLastViewedMonthStorageKey(userHandle), currentMonthKey);
    }
  }, [currentMonthKey, userHandle]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    if (!userHandle) {
      lastViewedMonthUserRef.current = null;
      return;
    }
    if (lastViewedMonthUserRef.current === userHandle) {
      return;
    }
    lastViewedMonthUserRef.current = userHandle;
    const stored = localStorage.getItem(getLastViewedMonthStorageKey(userHandle));
    if (!stored || !/^\d{4}-\d{2}$/.test(stored) || stored === currentMonthKey) {
      return;
    }
    const parsed = new Date(`${stored}-01`);
    if (!Number.isNaN(parsed.getTime())) {
      setCurrentDate(parsed);
    }
  }, [currentMonthKey, userHandle]);

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
      let usedCache = false;
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

        const currentYear = new Date().getFullYear();
        const seedData = nextBudgets[initialKey] ?? getDefaultBudgetData();
        const yearlyBudgets = ensureYearMonths(nextBudgets, currentYear, seedData);
        const sortedKeys = Object.keys(yearlyBudgets).sort();
        const anchorKey = sortedKeys[0];
        const carriedBudgets = anchorKey ? applyJointBalanceCarryover(yearlyBudgets, anchorKey) : yearlyBudgets;
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
        if (isRetriableSyncError(error)) {
          const cached = loadBudgetCache();
          if (cached && Object.keys(cached).length > 0) {
            const normalized: MonthlyBudget = {};
            Object.keys(cached).forEach(monthKey => {
              normalized[monthKey] = normalizeBudgetData(cached[monthKey]);
            });
            lastSavedPayloadRef.current = {};
            Object.keys(normalized).forEach(monthKey => {
              lastSavedPayloadRef.current[monthKey] = JSON.stringify(normalized[monthKey]);
            });
            setMonthlyBudgets(normalized);
            usedCache = true;
          }
        }
        if (!usedCache) {
          console.error('Failed to load months', error);
          const initialKey = getCurrentMonthKey(new Date());
          setMonthlyBudgets({ [initialKey]: getDefaultBudgetData() });
        }
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
        if (!isOnline) {
          if (syncQueueRef.current.months[monthKey]?.payload !== payload) {
            enqueueMonthSync(monthKey, payload);
          }
          return;
        }
        void upsertMonth(monthKey, monthData)
          .then(() => {
            lastSavedPayloadRef.current[monthKey] = payload;
            clearSyncQueueEntry(monthKey);
          })
          .catch(error => {
            if (!handleAuthFailure(error)) {
              if (isRetriableSyncError(error)) {
                enqueueMonthSync(monthKey, payload);
              } else {
                console.error('Failed to save month', error);
              }
            }
          });
      });
    }, 400);

    return () => {
      if (saveTimeoutRef.current !== null) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [authToken, isHydrated, isOnline, monthlyBudgets]);

  useEffect(() => {
    if (!pendingOnboarding || !isHydrated) {
      return;
    }
    const { person1Name, person2Name, mode } = pendingOnboarding;
    const nextPerson1 = person1Name.trim();
    const nextPerson2 = person2Name.trim();
    setMonthlyBudgets(prev => {
      const updated: MonthlyBudget = {};
      Object.keys(prev).forEach(monthKey => {
        const month = prev[monthKey];
        if (!month) {
          return;
        }
        updated[monthKey] = {
          ...month,
          person1: {
            ...month.person1,
            name: nextPerson1 || month.person1.name
          },
          person2: mode === 'duo'
            ? {
                ...month.person2,
                name: nextPerson2 || month.person2.name
              }
            : month.person2
        };
      });
      return updated;
    });
    setPendingOnboarding(null);
  }, [pendingOnboarding, isHydrated]);

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
      if (!isOnline) {
        if (syncQueueRef.current.months[monthKey]?.payload !== payload) {
          enqueueMonthSync(monthKey, payload);
        }
        return;
      }
      void upsertMonth(monthKey, monthData)
        .then(() => {
          lastSavedPayloadRef.current[monthKey] = payload;
          clearSyncQueueEntry(monthKey);
        })
        .catch(error => {
          if (!handleAuthFailure(error)) {
            if (isRetriableSyncError(error)) {
              enqueueMonthSync(monthKey, payload);
            } else {
              console.error('Failed to save month', error);
            }
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
    clearAuthStorage();
    setAuthToken(null);
    setAuthUser('');
    setAuthProfile(null);
    setAuthStorage('local');
    setActivePage('budget');
    setMonthlyBudgets({});
    setIsHydrated(false);
  };

  const isCategoryActiveInMonth = (category: Category, targetMonth: string) => {
    if (!category.isRecurring) {
      return true;
    }
    if (!category.startMonth || !category.recurringMonths) {
      return false;
    }
    const startDate = new Date(category.startMonth + '-01');
    const targetDate = new Date(targetMonth + '-01');
    const monthsDiff = (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
      (targetDate.getMonth() - startDate.getMonth());
    return monthsDiff >= 0 && monthsDiff < category.recurringMonths;
  };

  const copyRecurringCategories = (categories: Category[], targetMonth: string): Category[] => {
    const recurringCategories: Category[] = [];

    const nonRecurringCategories = categories.filter(cat => !cat.isRecurring && cat.propagate !== false).map(cat => ({
      ...cat,
      id: Date.now().toString() + Math.random(),
      templateId: cat.templateId ?? createTemplateId()
    }));

    categories.forEach(cat => {
      if (cat.propagate === false) {
        return;
      }
      if (cat.isRecurring && cat.startMonth && cat.recurringMonths) {
        const startDate = new Date(cat.startMonth + '-01');
        const targetDate = new Date(targetMonth + '-01');
        const monthsDiff = (targetDate.getFullYear() - startDate.getFullYear()) * 12 +
          (targetDate.getMonth() - startDate.getMonth());

        if (monthsDiff >= 0 && monthsDiff < cat.recurringMonths) {
          recurringCategories.push({
            ...cat,
            id: Date.now().toString() + Math.random(),
            templateId: cat.templateId ?? createTemplateId()
          });
        }
      }
    });

    return [...nonRecurringCategories, ...recurringCategories];
  };

  const buildMonthDataFromPrevious = (previousData: BudgetData | null | undefined, monthKey: string, includeTemplate: boolean) => {
    const newData = getDefaultBudgetData();
    if (!previousData) {
      return newData;
    }

    newData.person1.name = previousData.person1.name;
    newData.person2.name = previousData.person2.name;
    newData.person1UserId = previousData.person1UserId ?? null;
    newData.person2UserId = previousData.person2UserId ?? null;

    if (!includeTemplate) {
      return newData;
    }

    newData.person1.fixedExpenses = previousData.person1.fixedExpenses.map(exp => ({
      ...exp,
      id: Date.now().toString() + Math.random(),
      templateId: exp.templateId ?? createTemplateId()
    }));
    newData.person2.fixedExpenses = previousData.person2.fixedExpenses.map(exp => ({
      ...exp,
      id: Date.now().toString() + Math.random(),
      templateId: exp.templateId ?? createTemplateId()
    }));

    newData.person1.categories = copyRecurringCategories(previousData.person1.categories, monthKey);
    newData.person2.categories = copyRecurringCategories(previousData.person2.categories, monthKey);

    newData.person1.incomeSources = previousData.person1.incomeSources.map(src => ({
      ...src,
      id: Date.now().toString() + Math.random(),
      templateId: src.templateId ?? createTemplateId(),
      propagate: src.propagate !== false
    }));
    newData.person2.incomeSources = previousData.person2.incomeSources.map(src => ({
      ...src,
      id: Date.now().toString() + Math.random(),
      templateId: src.templateId ?? createTemplateId(),
      propagate: src.propagate !== false
    }));

    return newData;
  };

  const ensureYearMonths = (budgets: MonthlyBudget, year: number, seedData: BudgetData) => {
    const monthKeys = Array.from({ length: 12 }, (_, index) => (
      `${year}-${String(index + 1).padStart(2, '0')}`
    ));
    const updated: MonthlyBudget = { ...budgets };
    let changed = false;
    let previousData: BudgetData | null = null;

    monthKeys.forEach(monthKey => {
      if (updated[monthKey]) {
        previousData = updated[monthKey];
        return;
      }
      const source = previousData ?? seedData;
      const includeTemplate = Boolean(previousData);
      updated[monthKey] = buildMonthDataFromPrevious(source, monthKey, includeTemplate);
      previousData = updated[monthKey];
      changed = true;
    });

    return changed ? updated : budgets;
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

  const deleteCurrentMonth = async () => {
    const monthKey = currentMonthKey;
    if (!monthlyBudgets[monthKey]) {
      return;
    }

    if (saveTimeoutRef.current !== null) {
      window.clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    if (!isOnline) {
      enqueueMonthDelete(monthKey);
    } else {
      try {
        await deleteMonth(monthKey);
        delete lastSavedPayloadRef.current[monthKey];
      } catch (error) {
        if (!handleAuthFailure(error)) {
          if (isRetriableSyncError(error)) {
            enqueueMonthDelete(monthKey);
          } else {
            console.error('Failed to delete month', error);
            alert(t('deleteMonthError'));
            return;
          }
        } else {
          return;
        }
      }
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

  const requestDeleteCurrentMonth = () => {
    setDeleteMonthInput('');
    setDeleteMonthOpen(true);
  };

  const confirmDeleteCurrentMonth = async () => {
    if (!isDeleteConfirmValid) {
      return;
    }
    setDeleteMonthOpen(false);
    setDeleteMonthInput('');
    await deleteCurrentMonth();
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
    if (showNextMonth && !nextMonthAvailable) {
      setShowNextMonth(false);
    }
  }, [nextMonthAvailable, showNextMonth]);

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

  const showBudgetWidgets = budgetWidgetsEnabled;
  const budgetGridClass = `hidden sm:grid sm:gap-6 sm:mb-6 ${
    showBudgetWidgets ? 'sm:grid-cols-[15rem_minmax(0,1fr)_15rem]' : 'sm:grid-cols-[minmax(0,1fr)]'
  }`;
  const calendarWidgets = showBudgetWidgets ? (
    <div className="flex flex-col items-start">
      <BudgetCalendarWidget
        monthKey={currentMonthKey}
        darkMode={darkMode}
        formatMonthKey={formatMonthKey}
        selectedDate={selectedCalendarDate}
      />
      <BudgetAccountCalendarWidget
        monthKey={currentMonthKey}
        darkMode={darkMode}
        currencyPreference={currencyPreference}
        formatMonthKey={formatMonthKey}
        data={data}
        bankAccountsEnabled={bankAccountsEnabled}
        bankAccounts={bankAccounts}
        soloModeEnabled={soloModeEnabled}
        activePersonKey={activePersonKey}
      />
    </div>
  ) : null;

  const toggleDarkMode = () => {
    const next = !darkMode;
    handleThemePreferenceChange(next ? 'dark' : 'light');
  };

  const handleThemePreferenceChange = (value: 'light' | 'dark') => {
    setThemePreference(value);
    setDarkMode(value === 'dark');
    if (!authToken || showOnboarding) {
      return;
    }
    void updateProfileRequest({ themePreference: value })
      .then((profile) => {
        setAuthProfile(profile);
        setAuthUser(profile.username);
      })
      .catch((error) => {
        if (!handleAuthFailure(error)) {
          console.error('Failed to update theme preference', error);
        }
      });
  };

  const resolveUserLabel = (profile: AuthUser | null) => {
    if (!profile) {
      return null;
    }
    return profile.displayName || profile.username || null;
  };

  const updateLinkedUserLabel = (userId: string, label: string) => {
    setMonthlyBudgets(prev => {
      const next = { ...prev };
      let changed = false;
      Object.keys(next).forEach(monthKey => {
        const month = next[monthKey];
        if (!month) {
          return;
        }
        let updated = month;
        let monthChanged = false;

        const updatePerson = (personKey: 'person1' | 'person2') => {
          const linkedUserId = personKey === 'person1' ? updated.person1UserId : updated.person2UserId;
          if (linkedUserId !== userId) {
            return;
          }
          const currentPerson = personKey === 'person1' ? updated.person1 : updated.person2;
          if (currentPerson.name === label) {
            return;
          }
          const previousName = currentPerson.name;
          const nextJoint = previousName
            ? {
                ...updated.jointAccount,
                transactions: updated.jointAccount.transactions.map(transaction =>
                  transaction.person === previousName ? { ...transaction, person: label } : transaction
                )
              }
            : updated.jointAccount;
          if (personKey === 'person1') {
            updated = { ...updated, person1: { ...updated.person1, name: label }, jointAccount: nextJoint };
          } else {
            updated = { ...updated, person2: { ...updated.person2, name: label }, jointAccount: nextJoint };
          }
          monthChanged = true;
        };

        updatePerson('person1');
        updatePerson('person2');

        if (monthChanged) {
          next[monthKey] = updated;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
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

  useEffect(() => {
    if (!authProfile || authProfile.role !== 'admin' || !authToken || !isHydrated) {
      return;
    }
    let isActive = true;
    const syncLinkedNames = async () => {
      try {
        const list = await fetchUsers();
        if (!isActive) {
          return;
        }
        list.forEach(item => {
          const label = item.displayName || item.username;
          if (label) {
            updateLinkedUserLabel(item.id, label);
          }
        });
      } catch (error) {
        if (isActive) {
          console.error('Failed to sync user labels', error);
        }
      }
    };
    void syncLinkedNames();
    return () => {
      isActive = false;
    };
  }, [authProfile, authToken, isHydrated]);

  const addIncomeSource = (personKey: 'person1' | 'person2') => {
    const newSource: IncomeSource = {
      id: Date.now().toString(),
      name: t('newIncomeSourceLabel'),
      amount: '',
      templateId: createTemplateId(),
      categoryOverrideId: '',
      propagate: true
    };
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const normalizedName = normalizeIconLabel(newSource.name);
      const templateId = newSource.templateId ?? createTemplateId();
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            incomeSources: [...currentData[personKey].incomeSources, { ...newSource, templateId }]
          }
        }
      };

      if (newSource.propagate !== false && normalizedName && shouldPropagateIncomeSource(newSource.name)) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const alreadyExists = monthData[personKey].incomeSources.some(source => (
              source.templateId === templateId
              || (!source.templateId && normalizeIconLabel(source.name) === normalizedName)
            ));
            if (alreadyExists) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                incomeSources: [
                  ...monthData[personKey].incomeSources,
                  { ...newSource, id: `${Date.now()}-${Math.random()}`, templateId }
                ]
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const deleteIncomeSource = (personKey: 'person1' | 'person2', id: string) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const targetSource = currentData[personKey].incomeSources.find(source => source.id === id);
      if (!targetSource) {
        return prev;
      }
      showUndoToast(t('undoDeleteLabel'), () => setMonthlyBudgets(prev));
      const normalizedName = normalizeIconLabel(targetSource.name);
      const templateId = targetSource.templateId;
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            incomeSources: currentData[personKey].incomeSources.filter(source => source.id !== id)
          }
        }
      };

      if (targetSource.propagate !== false && normalizedName && shouldPropagateIncomeSource(targetSource.name)) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const nextSources = monthData[personKey].incomeSources.filter(source => (
              source.propagate === false
                ? true
                : (templateId ? source.templateId !== templateId : normalizeIconLabel(source.name) !== normalizedName)
            ));
            if (nextSources.length === monthData[personKey].incomeSources.length) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                incomeSources: nextSources
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const updateIncomeSource = (
    personKey: 'person1' | 'person2',
    id: string,
    field: 'name' | 'amount' | 'categoryOverrideId' | 'propagate',
    value: string | number | boolean
  ) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const currentSources = currentData[personKey].incomeSources;
      const targetSource = currentSources.find(source => source.id === id);
      if (!targetSource) {
        return prev;
      }
      const nextName = field === 'name' ? String(value) : targetSource.name;
      const nextPropagate = field === 'propagate'
        ? Boolean(value)
        : targetSource.propagate !== false;
      const shouldPropagate = nextPropagate && shouldPropagateIncomeSource(nextName);
      const templateId = targetSource.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
      const updatedSources = currentSources.map(source =>
        source.id === id
          ? {
              ...source,
              [field]: value,
              ...(templateId ? { templateId } : {}),
              ...(field === 'propagate' ? { propagate: nextPropagate } : {})
            }
          : source
      );
      const updatedSource = updatedSources.find(source => source.id === id) ?? targetSource;
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            incomeSources: updatedSources
          }
        }
      };

      const normalizedName = normalizeIconLabel(targetSource.name);
      if (!normalizedName) {
        return applyJointBalanceCarryover(updated, currentMonthKey);
      }

      if (field === 'propagate') {
        const shouldSeed = nextPropagate && shouldPropagateIncomeSource(updatedSource.name);
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            let matched = false;
            let changed = false;
            const nextSources = monthData[personKey].incomeSources.map(source => {
              const matchesTemplate = templateId && source.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(source.name) === normalizedName;
              if (!matchesTemplate && !matchesName) {
                return source;
              }
              matched = true;
              changed = true;
              const base = templateId ? { ...source, templateId } : { ...source };
              return {
                ...base,
                propagate: nextPropagate
              };
            });
            let finalSources = nextSources;
            if (!matched && shouldSeed) {
              const propagatedSource: IncomeSource = {
                ...updatedSource,
                id: `${Date.now()}-${Math.random()}`,
                ...(templateId ? { templateId } : {})
              };
              finalSources = [...nextSources, propagatedSource];
              changed = true;
            }
            if (!changed) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                incomeSources: finalSources
              }
            };
          });
      } else if (shouldPropagate) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            let matched = false;
            let changed = false;
            const nextSources = monthData[personKey].incomeSources.map(source => {
              const matchesTemplate = templateId && source.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(source.name) === normalizedName;
              if (!matchesTemplate && !matchesName) {
                return source;
              }
              matched = true;
              if (source.propagate === false) {
                return source;
              }
              changed = true;
              const base = templateId ? { ...source, templateId } : { ...source };
              return field === 'name'
                ? { ...base, name: nextName }
                : { ...base, [field]: value };
            });
            let finalSources = nextSources;
            if (!matched) {
              const propagatedSource: IncomeSource = {
                ...updatedSource,
                id: `${Date.now()}-${Math.random()}`,
                ...(templateId ? { templateId } : {})
              };
              finalSources = [...nextSources, propagatedSource];
              changed = true;
            }
            if (!changed) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                incomeSources: finalSources
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const reorderIncomeSources = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        incomeSources: reorderList(prev[personKey].incomeSources, sourceIndex, destinationIndex)
      }
    }));
  };

  const addFixedExpense = (personKey: 'person1' | 'person2', overrides: Partial<FixedExpense> = {}) => {
    const newExpense: FixedExpense = {
      id: Date.now().toString(),
      name: overrides.name ?? t('newFixedExpenseLabel'),
      amount: overrides.amount ?? 0,
      templateId: overrides.templateId ?? createTemplateId(),
      categoryOverrideId: overrides.categoryOverrideId ?? '',
      isChecked: overrides.isChecked ?? false,
      date: overrides.date,
      accountId: overrides.accountId || undefined
    };
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const normalizedName = normalizeIconLabel(newExpense.name);
      const templateId = newExpense.templateId ?? createTemplateId();
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: [...currentData[personKey].fixedExpenses, { ...newExpense, templateId }]
          }
        }
      };

      if (normalizedName && shouldPropagateFixedExpense(newExpense.name)) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const alreadyExists = monthData[personKey].fixedExpenses.some(expense => (
              expense.templateId === templateId
              || (!expense.templateId && normalizeIconLabel(expense.name) === normalizedName)
            ));
            if (alreadyExists) {
              return;
            }
            const propagatedExpense: FixedExpense = {
              ...newExpense,
              id: `${Date.now()}-${Math.random()}`,
              templateId,
              isChecked: false
            };
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                fixedExpenses: [...monthData[personKey].fixedExpenses, propagatedExpense]
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const deleteFixedExpense = (personKey: 'person1' | 'person2', id: string) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const targetExpense = currentData[personKey].fixedExpenses.find(exp => exp.id === id);
      if (!targetExpense) {
        return prev;
      }
      showUndoToast(t('undoDeleteLabel'), () => setMonthlyBudgets(prev));
      const normalizedName = normalizeIconLabel(targetExpense.name);
      const templateId = targetExpense.templateId;
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: currentData[personKey].fixedExpenses.filter(exp => exp.id !== id)
          }
        }
      };

      if (normalizedName && shouldPropagateFixedExpense(targetExpense.name)) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const nextExpenses = monthData[personKey].fixedExpenses.filter(exp => (
              templateId ? exp.templateId !== templateId : normalizeIconLabel(exp.name) !== normalizedName
            ));
            if (nextExpenses.length === monthData[personKey].fixedExpenses.length) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                fixedExpenses: nextExpenses
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const updateFixedExpense = (
    personKey: 'person1' | 'person2',
    id: string,
    field: 'name' | 'amount' | 'isChecked' | 'categoryOverrideId',
    value: string | number | boolean
  ) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const currentExpenses = currentData[personKey].fixedExpenses;
      const targetExpense = currentExpenses.find(exp => exp.id === id);
      if (!targetExpense) {
        return prev;
      }
      const nextName = field === 'name' ? String(value) : targetExpense.name;
      const shouldPropagate = field !== 'isChecked' && shouldPropagateFixedExpense(nextName);
      const templateId = targetExpense.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
      const updatedExpenses = currentExpenses.map(exp =>
        exp.id === id ? { ...exp, [field]: value, ...(templateId ? { templateId } : {}) } : exp
      );
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: updatedExpenses
          }
        }
      };

      if (shouldPropagate) {
        const normalizedName = normalizeIconLabel(targetExpense.name);
        if (normalizedName) {
          Object.keys(updated)
            .filter(monthKey => monthKey > currentMonthKey)
            .forEach(monthKey => {
              const monthData = updated[monthKey];
              if (!monthData) {
                return;
              }
              let changed = false;
              const nextExpenses = monthData[personKey].fixedExpenses.map(exp => {
                const matchesTemplate = templateId && exp.templateId === templateId;
                const matchesName = !matchesTemplate && normalizeIconLabel(exp.name) === normalizedName;
                if (!matchesTemplate && !matchesName) {
                  return exp;
                }
                changed = true;
                const base = templateId ? { ...exp, templateId } : { ...exp };
                return field === 'name'
                  ? { ...base, name: nextName }
                  : { ...base, [field]: value };
              });
              if (!changed) {
                return;
              }
              updated[monthKey] = {
                ...monthData,
                [personKey]: {
                  ...monthData[personKey],
                  fixedExpenses: nextExpenses
                }
              };
            });
        }
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const updateFixedExpenseDetails = (
    personKey: 'person1' | 'person2',
    id: string,
    updates: { name: string; amount: number; categoryOverrideId: string; date?: string; accountId: string }
  ) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const currentExpenses = currentData[personKey].fixedExpenses;
      const targetExpense = currentExpenses.find(exp => exp.id === id);
      if (!targetExpense) {
        return prev;
      }
      showUndoToast(t('undoEditLabel'), () => setMonthlyBudgets(prev));
      const nextName = updates.name;
      const nextAmount = updates.amount;
      const nextCategoryOverrideId = updates.categoryOverrideId;
      const nextDate = updates.date;
      const nextAccountId = updates.accountId || '';
      const shouldPropagate = shouldPropagateFixedExpense(nextName);
      const templateId = targetExpense.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
      const updatedExpense = {
        ...targetExpense,
        name: nextName,
        amount: nextAmount,
        categoryOverrideId: nextCategoryOverrideId,
        date: nextDate,
        accountId: nextAccountId || undefined,
        ...(templateId ? { templateId } : {})
      };
      const updatedExpenses = currentExpenses.map(exp =>
        exp.id === id ? updatedExpense : exp
      );
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: updatedExpenses
          }
        }
      };

      if (!shouldPropagate) {
        return applyJointBalanceCarryover(updated, currentMonthKey);
      }

      const normalizedName = normalizeIconLabel(targetExpense.name);
      const hasDifferences = Object.keys(updated)
        .filter(monthKey => monthKey > currentMonthKey)
        .some(monthKey => {
          const monthData = updated[monthKey];
          if (!monthData) {
            return false;
          }
          const matches = monthData[personKey].fixedExpenses.filter(exp => {
            const matchesTemplate = templateId && exp.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(exp.name) === normalizedName;
            return matchesTemplate || matchesName;
          });
          if (matches.length === 0) {
            return true;
          }
          return matches.some(exp => (
            exp.name !== nextName
            || coerceNumber(exp.amount) !== coerceNumber(nextAmount)
            || (exp.categoryOverrideId || '') !== (nextCategoryOverrideId || '')
            || (exp.date || '') !== (nextDate || '')
            || (exp.accountId || '') !== nextAccountId
          ));
        });

      const shouldSync = !hasDifferences || (
        typeof window !== 'undefined' && window.confirm(t('syncFutureConfirmLabel'))
      );
      if (!shouldSync) {
        return applyJointBalanceCarryover(updated, currentMonthKey);
      }

      Object.keys(updated)
        .filter(monthKey => monthKey > currentMonthKey)
        .forEach(monthKey => {
          const monthData = updated[monthKey];
          if (!monthData) {
            return;
          }
          const matches = monthData[personKey].fixedExpenses.filter(exp => {
            const matchesTemplate = templateId && exp.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(exp.name) === normalizedName;
            return matchesTemplate || matchesName;
          });
          if (matches.length === 0) {
            const propagatedExpense: FixedExpense = {
              ...updatedExpense,
              id: `${Date.now()}-${Math.random()}`,
              isChecked: false,
              ...(templateId ? { templateId } : {})
            };
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                fixedExpenses: [...monthData[personKey].fixedExpenses, propagatedExpense]
              }
            };
            return;
          }
          const nextExpenses = monthData[personKey].fixedExpenses.map(exp => {
            const matchesTemplate = templateId && exp.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(exp.name) === normalizedName;
            if (!matchesTemplate && !matchesName) {
              return exp;
            }
            return {
              ...exp,
              name: nextName,
              amount: nextAmount,
              categoryOverrideId: nextCategoryOverrideId,
              date: nextDate,
              accountId: nextAccountId || undefined,
              ...(templateId ? { templateId } : {})
            };
          });
          updated[monthKey] = {
            ...monthData,
            [personKey]: {
              ...monthData[personKey],
              fixedExpenses: nextExpenses
            }
          };
        });

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const syncFutureOrder = (
    budgets: MonthlyBudget,
    personKey: 'person1' | 'person2',
    order: { fixed?: string[]; categories?: string[] }
  ) => {
    const fixedOrder = order.fixed ?? [];
    const categoryOrder = order.categories ?? [];
    if (fixedOrder.length === 0 && categoryOrder.length === 0) {
      return budgets;
    }
    let updated = budgets;
    Object.keys(updated)
      .filter(monthKey => monthKey > currentMonthKey)
      .forEach(monthKey => {
        const monthData = updated[monthKey];
        if (!monthData) {
          return;
        }
        let nextFixed = monthData[personKey].fixedExpenses;
        let nextCategories = monthData[personKey].categories;
        let changed = false;

        if (fixedOrder.length > 0) {
          const reordered = reorderListByKeys(nextFixed, fixedOrder);
          if (!hasSameOrder(nextFixed, reordered)) {
            nextFixed = reordered;
            changed = true;
          }
        }

        if (categoryOrder.length > 0) {
          const reordered = reorderListByKeys(nextCategories, categoryOrder);
          if (!hasSameOrder(nextCategories, reordered)) {
            nextCategories = reordered;
            changed = true;
          }
        }

        if (!changed) {
          return;
        }
        updated = {
          ...updated,
          [monthKey]: {
            ...monthData,
            [personKey]: {
              ...monthData[personKey],
              fixedExpenses: nextFixed,
              categories: nextCategories
            }
          }
        };
      });
    return updated;
  };

  const reorderFixedExpenses = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const nextFixedExpenses = reorderList(
        currentData[personKey].fixedExpenses,
        sourceIndex,
        destinationIndex
      );
      let updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: nextFixedExpenses
          }
        }
      };
      if (!sortByCost) {
        updated = syncFutureOrder(updated, personKey, { fixed: buildOrderKeys(nextFixedExpenses) });
      }
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const addCategory = (personKey: 'person1' | 'person2', overrides: Partial<Category> = {}) => {
    const isRecurring = overrides.isRecurring ?? false;
    const newCategory: Category = {
      id: Date.now().toString(),
      name: overrides.name ?? t('newCategoryLabel'),
      amount: overrides.amount ?? 0,
      templateId: overrides.templateId,
      categoryOverrideId: overrides.categoryOverrideId ?? '',
      isChecked: overrides.isChecked ?? false,
      isRecurring,
      recurringMonths: isRecurring ? (overrides.recurringMonths ?? 3) : overrides.recurringMonths,
      startMonth: isRecurring ? (overrides.startMonth ?? currentMonthKey) : overrides.startMonth,
      date: overrides.date,
      accountId: overrides.accountId || undefined,
      propagate: overrides.propagate ?? true
    };
    const normalizedName = normalizeIconLabel(newCategory.name);
    const shouldPropagate = newCategory.propagate !== false && (Boolean(newCategory.templateId) || shouldPropagateCategory(newCategory.name));
    const templateId = newCategory.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
    const seededCategory = templateId ? { ...newCategory, templateId } : newCategory;
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            categories: [...currentData[personKey].categories, seededCategory]
          }
        }
      };

      if (shouldPropagate) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            if (!isCategoryActiveInMonth(seededCategory, monthKey)) {
              return;
            }
            const alreadyExists = monthData[personKey].categories.some(cat => {
              const matchesTemplate = templateId && cat.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(cat.name) === normalizedName;
              return matchesTemplate || matchesName;
            });
            if (alreadyExists) {
              return;
            }
            const propagatedCategory: Category = {
              ...seededCategory,
              id: `${Date.now()}-${Math.random()}`,
              isChecked: false,
              ...(templateId ? { templateId } : {})
            };
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                categories: [...monthData[personKey].categories, propagatedCategory]
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const deleteCategory = (personKey: 'person1' | 'person2', id: string) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const targetCategory = currentData[personKey].categories.find(cat => cat.id === id);
      if (!targetCategory) {
        return prev;
      }
      showUndoToast(t('undoDeleteLabel'), () => setMonthlyBudgets(prev));
      const normalizedName = normalizeIconLabel(targetCategory.name);
      const templateId = targetCategory.templateId;
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            categories: currentData[personKey].categories.filter(cat => cat.id !== id)
          }
        }
      };

      const shouldPropagate = targetCategory.propagate !== false
        && (Boolean(templateId) || shouldPropagateCategory(targetCategory.name));
      if (shouldPropagate) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const nextCategories = monthData[personKey].categories.filter(cat => (
              templateId ? cat.templateId !== templateId : normalizeIconLabel(cat.name) !== normalizedName
            ));
            if (nextCategories.length === monthData[personKey].categories.length) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                categories: nextCategories
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const updateCategory = (personKey: 'person1' | 'person2', id: string, field: keyof Category, value: string | number | boolean) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const currentCategories = currentData[personKey].categories;
      const targetCategory = currentCategories.find(cat => cat.id === id);
      if (!targetCategory) {
        return prev;
      }
      const nextName = field === 'name' ? String(value) : targetCategory.name;
      const nextCategory = { ...targetCategory, [field]: value };
      if (field === 'isRecurring' && value === true) {
        nextCategory.recurringMonths = nextCategory.recurringMonths || 3;
        nextCategory.startMonth = nextCategory.startMonth || currentMonthKey;
      }
      const nextPropagate = field === 'propagate' ? Boolean(value) : targetCategory.propagate !== false;
      const shouldPropagate = field !== 'isChecked'
        && nextPropagate
        && (Boolean(targetCategory.templateId) || shouldPropagateCategory(nextName));
      const templateId = targetCategory.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
      const updatedCategory = templateId
        ? { ...nextCategory, templateId, propagate: nextPropagate }
        : { ...nextCategory, propagate: nextPropagate };
      const updatedCategories = currentCategories.map(cat =>
        cat.id === id ? updatedCategory : cat
      );
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            categories: updatedCategories
          }
        }
      };

      if (shouldPropagate || field === 'propagate') {
        const normalizedName = normalizeIconLabel(targetCategory.name);
        if (!normalizedName) {
          return applyJointBalanceCarryover(updated, currentMonthKey);
        }
        if (field === 'propagate') {
          Object.keys(updated)
            .filter(monthKey => monthKey > currentMonthKey)
            .forEach(monthKey => {
              const monthData = updated[monthKey];
              if (!monthData) {
                return;
              }
              let changed = false;
              const nextCategories: Category[] = monthData[personKey].categories.map(cat => {
                const matchesTemplate = templateId && cat.templateId === templateId;
                const matchesName = !matchesTemplate && normalizeIconLabel(cat.name) === normalizedName;
                if (!matchesTemplate && !matchesName) {
                  return cat;
                }
                changed = true;
                const base = templateId ? { ...cat, templateId } : { ...cat };
                return { ...base, propagate: nextPropagate };
              });
              if (!changed) {
                return;
              }
              updated[monthKey] = {
                ...monthData,
                [personKey]: {
                  ...monthData[personKey],
                  categories: nextCategories
                }
              };
            });
          return applyJointBalanceCarryover(updated, currentMonthKey);
        }

        const updateFields = field === 'isRecurring' && value === true
          ? {
              isRecurring: true,
              recurringMonths: updatedCategory.recurringMonths,
              startMonth: updatedCategory.startMonth
            }
          : ({ [field]: field === 'name' ? nextName : value } as Partial<Category>);
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const shouldExist = isCategoryActiveInMonth(updatedCategory, monthKey);
            let changed = false;
            let hasMatch = false;
            const nextCategories: Category[] = [];
            monthData[personKey].categories.forEach(cat => {
              if (cat.propagate === false) {
                nextCategories.push(cat);
                return;
              }
              const matchesTemplate = templateId && cat.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(cat.name) === normalizedName;
              if (!matchesTemplate && !matchesName) {
                nextCategories.push(cat);
                return;
              }
              hasMatch = true;
              if (!shouldExist) {
                changed = true;
                return;
              }
              changed = true;
              const base = templateId ? { ...cat, templateId } : { ...cat };
              nextCategories.push({ ...base, ...updateFields });
            });
            if (shouldExist && !hasMatch) {
              nextCategories.push({
                ...updatedCategory,
                id: `${Date.now()}-${Math.random()}`,
                isChecked: false,
                ...(templateId ? { templateId } : {})
              });
              changed = true;
            }
            if (!changed) {
              return;
            }
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                categories: nextCategories
              }
            };
          });
      }

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const updateCategoryDetails = (
    personKey: 'person1' | 'person2',
    id: string,
    updates: {
      name: string;
      amount: number;
      categoryOverrideId: string;
      date?: string;
      isRecurring: boolean;
      recurringMonths?: number;
      startMonth?: string;
      propagate: boolean;
      accountId: string;
    }
  ) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const currentCategories = currentData[personKey].categories;
      const targetCategory = currentCategories.find(cat => cat.id === id);
      if (!targetCategory) {
        return prev;
      }
      showUndoToast(t('undoEditLabel'), () => setMonthlyBudgets(prev));
      const nextName = updates.name;
      const nextIsRecurring = updates.isRecurring;
      const nextRecurringMonths = nextIsRecurring
        ? (updates.recurringMonths ?? targetCategory.recurringMonths ?? 3)
        : undefined;
      const nextStartMonth = nextIsRecurring
        ? (updates.startMonth ?? targetCategory.startMonth ?? currentMonthKey)
        : undefined;
      const nextPropagate = updates.propagate !== false;
      const shouldPropagate = nextPropagate
        && (Boolean(targetCategory.templateId) || shouldPropagateCategory(nextName));
      const templateId = targetCategory.templateId ?? (shouldPropagate ? createTemplateId() : undefined);
      const updatedCategory: Category = {
        ...targetCategory,
        name: nextName,
        amount: updates.amount,
        categoryOverrideId: updates.categoryOverrideId,
        date: updates.date,
        accountId: updates.accountId || undefined,
        isRecurring: nextIsRecurring,
        recurringMonths: nextRecurringMonths,
        startMonth: nextStartMonth,
        propagate: nextPropagate,
        ...(templateId ? { templateId } : {})
      };
      const updatedCategories = currentCategories.map(cat =>
        cat.id === id ? updatedCategory : cat
      );
      const updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            categories: updatedCategories
          }
        }
      };

      if (!shouldPropagate) {
        return applyJointBalanceCarryover(updated, currentMonthKey);
      }

      const normalizedName = normalizeIconLabel(targetCategory.name);
      const hasDifferences = Object.keys(updated)
        .filter(monthKey => monthKey > currentMonthKey)
        .some(monthKey => {
          const monthData = updated[monthKey];
          if (!monthData) {
            return false;
          }
          const shouldExist = isCategoryActiveInMonth(updatedCategory, monthKey);
          const matches = monthData[personKey].categories.filter(cat => {
            const matchesTemplate = templateId && cat.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(cat.name) === normalizedName;
            return matchesTemplate || matchesName;
          });
          if (matches.length === 0) {
            return shouldExist;
          }
          if (!shouldExist) {
            return true;
          }
          return matches.some(cat => (
            cat.name !== nextName
            || coerceNumber(cat.amount) !== coerceNumber(updatedCategory.amount)
            || (cat.categoryOverrideId || '') !== (updatedCategory.categoryOverrideId || '')
            || (cat.date || '') !== (updatedCategory.date || '')
            || (cat.accountId || '') !== (updatedCategory.accountId || '')
            || Boolean(cat.isRecurring) !== Boolean(updatedCategory.isRecurring)
            || (cat.recurringMonths || 0) !== (updatedCategory.recurringMonths || 0)
            || (cat.startMonth || '') !== (updatedCategory.startMonth || '')
            || Boolean(cat.propagate !== false) !== Boolean(updatedCategory.propagate !== false)
          ));
        });

      const shouldSync = !hasDifferences || (
        typeof window !== 'undefined' && window.confirm(t('syncFutureConfirmLabel'))
      );
      if (!shouldSync) {
        return applyJointBalanceCarryover(updated, currentMonthKey);
      }

      Object.keys(updated)
        .filter(monthKey => monthKey > currentMonthKey)
        .forEach(monthKey => {
          const monthData = updated[monthKey];
          if (!monthData) {
            return;
          }
          const shouldExist = isCategoryActiveInMonth(updatedCategory, monthKey);
          const isMatch = (cat: Category) => {
            const matchesTemplate = templateId && cat.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(cat.name) === normalizedName;
            return matchesTemplate || matchesName;
          };
          const matches = monthData[personKey].categories.filter(isMatch);
          if (!shouldExist && matches.length === 0) {
            return;
          }
          if (!shouldExist) {
            const nextCategories = monthData[personKey].categories.filter(cat => !isMatch(cat));
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                categories: nextCategories
              }
            };
            return;
          }
          if (matches.length === 0) {
            const propagatedCategory: Category = {
              ...updatedCategory,
              id: `${Date.now()}-${Math.random()}`,
              isChecked: false,
              ...(templateId ? { templateId } : {})
            };
            updated[monthKey] = {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                categories: [...monthData[personKey].categories, propagatedCategory]
              }
            };
            return;
          }
          const nextCategories = monthData[personKey].categories.map(cat => {
            if (!isMatch(cat)) {
              return cat;
            }
            if (cat.propagate === false) {
              return cat;
            }
            return {
              ...cat,
              name: updatedCategory.name,
              amount: updatedCategory.amount,
              categoryOverrideId: updatedCategory.categoryOverrideId,
              date: updatedCategory.date,
              accountId: updatedCategory.accountId,
              isRecurring: updatedCategory.isRecurring,
              recurringMonths: updatedCategory.recurringMonths,
              startMonth: updatedCategory.startMonth,
              propagate: updatedCategory.propagate,
              ...(templateId ? { templateId } : {})
            };
          });
          updated[monthKey] = {
            ...monthData,
            [personKey]: {
              ...monthData[personKey],
              categories: nextCategories
            }
          };
        });

      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const reorderCategories = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const nextCategories = reorderList(
        currentData[personKey].categories,
        sourceIndex,
        destinationIndex
      );
      let updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            categories: nextCategories
          }
        }
      };
      if (!sortByCost) {
        updated = syncFutureOrder(updated, personKey, { categories: buildOrderKeys(nextCategories) });
      }
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const moveFixedExpenseToCategory = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const fixedExpenses = currentData[personKey].fixedExpenses;
      const categories = currentData[personKey].categories;
      const movedExpense = fixedExpenses[sourceIndex];
      if (!movedExpense) {
        return prev;
      }
      const nextFixedExpenses = fixedExpenses.filter((_, index) => index !== sourceIndex);
      const templateId = movedExpense.templateId ?? createTemplateId();
      const normalizedName = normalizeIconLabel(movedExpense.name);
      const newCategory: Category = {
        id: Date.now().toString(),
        name: movedExpense.name,
        amount: coerceNumber(movedExpense.amount),
        templateId,
        categoryOverrideId: movedExpense.categoryOverrideId ?? '',
        isChecked: Boolean(movedExpense.isChecked),
        isRecurring: false,
        date: movedExpense.date,
        accountId: movedExpense.accountId,
        propagate: true
      };
      const nextCategories = [...categories];
      const insertIndex = Math.min(Math.max(destinationIndex, 0), nextCategories.length);
      nextCategories.splice(insertIndex, 0, newCategory);
      let updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: nextFixedExpenses,
            categories: nextCategories
          }
        }
      };
      Object.keys(updated)
        .filter(monthKey => monthKey > currentMonthKey)
        .forEach(monthKey => {
          const monthData = updated[monthKey];
          if (!monthData) {
            return;
          }
          const monthFixed = monthData[personKey].fixedExpenses;
          const monthCategories = monthData[personKey].categories;
          const matchesFixed = (expense: FixedExpense) => {
            const matchesTemplate = templateId && expense.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(expense.name) === normalizedName;
            return matchesTemplate || matchesName;
          };
          const matchesCategory = (category: Category) => {
            const matchesTemplate = templateId && category.templateId === templateId;
            const matchesName = !matchesTemplate && normalizeIconLabel(category.name) === normalizedName;
            return matchesTemplate || matchesName;
          };
          const fixedIndex = monthFixed.findIndex(matchesFixed);
          const categoryIndex = monthCategories.findIndex(matchesCategory);
          if (fixedIndex === -1 && categoryIndex === -1) {
            return;
          }
          const matchedFixed = fixedIndex !== -1 ? monthFixed[fixedIndex] : null;
          let nextMonthFixed = monthFixed;
          let nextMonthCategories = monthCategories;
          let changed = false;

          if (fixedIndex !== -1) {
            nextMonthFixed = monthFixed.filter((_, index) => index !== fixedIndex);
            changed = true;
          }

          if (categoryIndex !== -1) {
            const existingCategory = monthCategories[categoryIndex];
            const updatedCategory: Category = {
              ...existingCategory,
              name: movedExpense.name,
              amount: coerceNumber(movedExpense.amount),
              categoryOverrideId: movedExpense.categoryOverrideId ?? '',
              templateId,
              date: movedExpense.date,
              accountId: movedExpense.accountId,
              isChecked: matchedFixed?.isChecked ?? existingCategory.isChecked,
              propagate: existingCategory.propagate !== false
            };
            nextMonthCategories = monthCategories.map((category, index) => (
              index === categoryIndex ? updatedCategory : category
            ));
            changed = true;
          } else {
            const insertedCategory: Category = {
              id: `${Date.now()}-${Math.random()}`,
              name: movedExpense.name,
              amount: coerceNumber(movedExpense.amount),
              templateId,
              categoryOverrideId: movedExpense.categoryOverrideId ?? '',
              isChecked: Boolean(matchedFixed?.isChecked),
              isRecurring: false,
              date: movedExpense.date,
              accountId: movedExpense.accountId,
              propagate: true
            };
            nextMonthCategories = [...monthCategories];
            const targetIndex = Math.min(Math.max(destinationIndex, 0), nextMonthCategories.length);
            nextMonthCategories.splice(targetIndex, 0, insertedCategory);
            changed = true;
          }

          if (!changed) {
            return;
          }
          updated = {
            ...updated,
            [monthKey]: {
              ...monthData,
              [personKey]: {
                ...monthData[personKey],
                fixedExpenses: nextMonthFixed,
                categories: nextMonthCategories
              }
            }
          };
        });

      if (!sortByCost) {
        updated = syncFutureOrder(updated, personKey, {
          fixed: buildOrderKeys(nextFixedExpenses),
          categories: buildOrderKeys(nextCategories)
        });
      }
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const moveCategoryToFixedExpense = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setMonthlyBudgets(prev => {
      const currentData = prev[currentMonthKey] ?? getDefaultBudgetData();
      const fixedExpenses = currentData[personKey].fixedExpenses;
      const categories = currentData[personKey].categories;
      const movedCategory = categories[sourceIndex];
      if (!movedCategory) {
        return prev;
      }
      const nextCategories = categories.filter((_, index) => index !== sourceIndex);
      const templateId = movedCategory.templateId ?? createTemplateId();
      const normalizedName = normalizeIconLabel(movedCategory.name);
      const newExpense: FixedExpense = {
        id: Date.now().toString(),
        name: movedCategory.name,
        amount: coerceNumber(movedCategory.amount),
        templateId,
        categoryOverrideId: movedCategory.categoryOverrideId ?? '',
        isChecked: Boolean(movedCategory.isChecked),
        date: movedCategory.date,
        accountId: movedCategory.accountId
      };
      const nextFixedExpenses = [...fixedExpenses];
      const insertIndex = Math.min(Math.max(destinationIndex, 0), nextFixedExpenses.length);
      nextFixedExpenses.splice(insertIndex, 0, newExpense);
      let updated: MonthlyBudget = {
        ...prev,
        [currentMonthKey]: {
          ...currentData,
          [personKey]: {
            ...currentData[personKey],
            fixedExpenses: nextFixedExpenses,
            categories: nextCategories
          }
        }
      };
      const shouldSyncFuture = movedCategory.propagate !== false;
      if (shouldSyncFuture) {
        Object.keys(updated)
          .filter(monthKey => monthKey > currentMonthKey)
          .forEach(monthKey => {
            const monthData = updated[monthKey];
            if (!monthData) {
              return;
            }
            const monthFixed = monthData[personKey].fixedExpenses;
            const monthCategories = monthData[personKey].categories;
            const matchesFixed = (expense: FixedExpense) => {
              const matchesTemplate = templateId && expense.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(expense.name) === normalizedName;
              return matchesTemplate || matchesName;
            };
            const matchesCategory = (category: Category) => {
              const matchesTemplate = templateId && category.templateId === templateId;
              const matchesName = !matchesTemplate && normalizeIconLabel(category.name) === normalizedName;
              return matchesTemplate || matchesName;
            };
            const fixedIndex = monthFixed.findIndex(matchesFixed);
            const categoryIndex = monthCategories.findIndex(matchesCategory);
            if (fixedIndex === -1 && categoryIndex === -1) {
              return;
            }
            const matchedCategory = categoryIndex !== -1 ? monthCategories[categoryIndex] : null;
            let nextMonthFixed = monthFixed;
            let nextMonthCategories = monthCategories;
            let changed = false;

            if (categoryIndex !== -1) {
              nextMonthCategories = monthCategories.filter((_, index) => index !== categoryIndex);
              changed = true;
            }

            if (fixedIndex !== -1) {
              const existingExpense = monthFixed[fixedIndex];
            const updatedExpense: FixedExpense = {
              ...existingExpense,
              name: movedCategory.name,
              amount: coerceNumber(movedCategory.amount),
              categoryOverrideId: movedCategory.categoryOverrideId ?? '',
              date: movedCategory.date,
              accountId: movedCategory.accountId ?? existingExpense.accountId,
              templateId
            };
              nextMonthFixed = monthFixed.map((expense, index) => (
                index === fixedIndex ? updatedExpense : expense
              ));
              changed = true;
            } else {
            const insertedExpense: FixedExpense = {
              id: `${Date.now()}-${Math.random()}`,
              name: movedCategory.name,
              amount: coerceNumber(movedCategory.amount),
              templateId,
              categoryOverrideId: movedCategory.categoryOverrideId ?? '',
              isChecked: Boolean(matchedCategory?.isChecked),
              date: movedCategory.date,
              accountId: movedCategory.accountId
            };
              nextMonthFixed = [...monthFixed];
              const targetIndex = Math.min(Math.max(destinationIndex, 0), nextMonthFixed.length);
              nextMonthFixed.splice(targetIndex, 0, insertedExpense);
              changed = true;
            }

            if (!changed) {
              return;
            }
            updated = {
              ...updated,
              [monthKey]: {
                ...monthData,
                [personKey]: {
                  ...monthData[personKey],
                  fixedExpenses: nextMonthFixed,
                  categories: nextMonthCategories
                }
              }
            };
          });
      }

      if (!sortByCost) {
        updated = syncFutureOrder(updated, personKey, {
          fixed: buildOrderKeys(nextFixedExpenses),
          categories: buildOrderKeys(nextCategories)
        });
      }
      return applyJointBalanceCarryover(updated, currentMonthKey);
    });
  };

  const handleExpenseDragEnd = (result: DropResult) => {
    if (!result.destination) {
      return;
    }
    const { source, destination } = result;
    if (source.droppableId === destination.droppableId && source.index === destination.index) {
      return;
    }
    const parseDroppable = (droppableId: string) => {
      const [listType, personKey] = droppableId.split('-');
      if ((listType !== 'fixed' && listType !== 'free') || (personKey !== 'person1' && personKey !== 'person2')) {
        return null;
      }
      return { listType, personKey } as { listType: 'fixed' | 'free'; personKey: 'person1' | 'person2' };
    };
    const sourceMeta = parseDroppable(source.droppableId);
    const destinationMeta = parseDroppable(destination.droppableId);
    if (!sourceMeta || !destinationMeta) {
      return;
    }
    if (sourceMeta.personKey !== destinationMeta.personKey) {
      return;
    }
    if (sourceMeta.listType === destinationMeta.listType) {
      if (sourceMeta.listType === 'fixed') {
        reorderFixedExpenses(sourceMeta.personKey, source.index, destination.index);
      } else {
        reorderCategories(sourceMeta.personKey, source.index, destination.index);
      }
      return;
    }
    if (sourceMeta.listType === 'fixed') {
      moveFixedExpenseToCategory(sourceMeta.personKey, source.index, destination.index);
      return;
    }
    moveCategoryToFixedExpense(sourceMeta.personKey, source.index, destination.index);
  };

  const openExpenseWizard = (personKey: 'person1' | 'person2', type: 'fixed' | 'free') => {
    setExpenseWizard({
      mode: 'create',
      step: 1,
      type,
      personKey,
      name: '',
      amount: '',
      date: getDefaultDateForMonthKey(currentMonthKey),
      categoryOverrideId: '',
      isRecurring: false,
      recurringMonths: 3,
      startMonth: currentMonthKey,
      propagate: true,
      accountId: ''
    });
  };

  const openExpenseWizardForEdit = (personKey: 'person1' | 'person2', type: 'fixed' | 'free', payload: FixedExpense | Category) => {
    const amountValue = coerceNumber(payload.amount);
    const isRecurring = type === 'free' && 'isRecurring' in payload ? Boolean(payload.isRecurring) : false;
    const recurringMonths = type === 'free' && 'recurringMonths' in payload && payload.recurringMonths
      ? payload.recurringMonths
      : 3;
    const startMonth = type === 'free' && 'startMonth' in payload && payload.startMonth
      ? payload.startMonth
      : currentMonthKey;
    const propagate = isRecurring
      ? true
      : (type === 'free' && 'propagate' in payload ? payload.propagate !== false : true);
    setExpenseWizard({
      mode: 'edit',
      step: 1,
      type,
      personKey,
      targetId: payload.id,
      name: payload.name ?? '',
      amount: String(amountValue),
      date: payload.date ?? '',
      categoryOverrideId: payload.categoryOverrideId ?? '',
      isRecurring,
      recurringMonths,
      startMonth,
      propagate,
      accountId: ('accountId' in payload && payload.accountId) ? payload.accountId : ''
    });
  };

  const closeExpenseWizard = () => {
    setExpenseWizard(null);
  };

  const updateExpenseWizard = (updates: Partial<ExpenseWizardState>) => {
    setExpenseWizard(prev => (prev ? { ...prev, ...updates } : prev));
  };

  const handleExpenseWizardNext = () => {
    updateExpenseWizard({ step: 2 });
  };

  const handleExpenseWizardBack = () => {
    updateExpenseWizard({ step: 1 });
  };

  const handleExpenseWizardDelete = () => {
    if (!expenseWizard || expenseWizard.mode !== 'edit' || !expenseWizard.targetId) {
      return;
    }
    if (expenseWizard.type === 'fixed') {
      deleteFixedExpense(expenseWizard.personKey, expenseWizard.targetId);
    } else {
      deleteCategory(expenseWizard.personKey, expenseWizard.targetId);
    }
    setExpenseWizard(null);
  };

  const handleExpenseWizardSubmit = () => {
    if (!expenseWizard) {
      return;
    }
    const name = titleizeLabel(
      expenseWizard.name.trim()
        || (expenseWizard.type === 'fixed' ? t('newFixedExpenseLabel') : t('newCategoryLabel'))
    );
    const amount = parseNumberInput(expenseWizard.amount);
    const dateValue = expenseWizard.date.trim() || undefined;
    const accountIdValue = expenseWizard.accountId.trim();
    if (expenseWizard.mode === 'edit' && expenseWizard.targetId) {
      if (expenseWizard.type === 'fixed') {
        updateFixedExpenseDetails(expenseWizard.personKey, expenseWizard.targetId, {
          name,
          amount,
          categoryOverrideId: expenseWizard.categoryOverrideId,
          date: dateValue,
          accountId: accountIdValue
        });
      } else {
        updateCategoryDetails(expenseWizard.personKey, expenseWizard.targetId, {
          name,
          amount,
          categoryOverrideId: expenseWizard.categoryOverrideId,
          date: dateValue,
          isRecurring: expenseWizard.isRecurring,
          recurringMonths: expenseWizard.recurringMonths,
          startMonth: expenseWizard.startMonth,
          propagate: expenseWizard.propagate,
          accountId: accountIdValue
        });
      }
    } else if (expenseWizard.type === 'fixed') {
      addFixedExpense(expenseWizard.personKey, {
        name,
        amount,
        categoryOverrideId: expenseWizard.categoryOverrideId,
        date: dateValue,
        accountId: accountIdValue
      });
    } else {
      addCategory(expenseWizard.personKey, {
        name,
        amount,
        categoryOverrideId: expenseWizard.categoryOverrideId,
        date: dateValue,
        isRecurring: expenseWizard.isRecurring,
        recurringMonths: expenseWizard.isRecurring ? expenseWizard.recurringMonths : undefined,
        startMonth: expenseWizard.isRecurring ? expenseWizard.startMonth : undefined,
        propagate: expenseWizard.propagate,
        accountId: accountIdValue
      });
    }
    setExpenseWizard(null);
  };

  const calculateJointBalance = () => {
    return calculateJointBalanceForData(data);
  };

  const resetJointDeleteConfirm = () => {
    setJointDeleteArmed(false);
    if (jointDeleteTimerRef.current) {
      window.clearTimeout(jointDeleteTimerRef.current);
      jointDeleteTimerRef.current = null;
    }
  };

  const closeJointWizard = () => {
    setJointWizard(null);
    resetJointDeleteConfirm();
  };

  const showToast = (
    message: string,
    tone: 'success' | 'error' = 'success',
    action?: { label: string; onClick: () => void },
    durationMs = 2600
  ) => {
    setToast({ message, tone, action });
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, durationMs);
  };

  const showUndoToast = (message: string, onUndo: () => void) => {
    showToast(message, 'success', { label: t('undoLabel'), onClick: onUndo }, 6000);
  };

  const showSyncNotice = (label: string, tone: 'info' | 'warning' = 'info') => {
    setSyncNotice({ label, tone });
    if (syncNoticeTimeoutRef.current) {
      window.clearTimeout(syncNoticeTimeoutRef.current);
    }
    syncNoticeTimeoutRef.current = window.setTimeout(() => {
      setSyncNotice(null);
      syncNoticeTimeoutRef.current = null;
    }, 5000);
  };

  const enqueueMonthSync = (monthKey: string, payload: string) => {
    setSyncQueue(prev => ({
      ...prev,
      months: {
        ...prev.months,
        [monthKey]: { payload, updatedAt: Date.now() }
      },
      deletes: Object.keys(prev.deletes).includes(monthKey)
        ? Object.fromEntries(Object.entries(prev.deletes).filter(([key]) => key !== monthKey))
        : prev.deletes
    }));
  };

  const enqueueMonthDelete = (monthKey: string) => {
    setSyncQueue(prev => ({
      ...prev,
      months: Object.keys(prev.months).includes(monthKey)
        ? Object.fromEntries(Object.entries(prev.months).filter(([key]) => key !== monthKey))
        : prev.months,
      deletes: {
        ...prev.deletes,
        [monthKey]: { updatedAt: Date.now() }
      }
    }));
  };

  const enqueueSettingsSync = (payload: string) => {
    setSyncQueue(prev => ({
      ...prev,
      settings: { payload, updatedAt: Date.now() }
    }));
  };

  const clearSyncQueueEntry = (monthKey: string) => {
    setSyncQueue(prev => {
      if (!prev.months[monthKey] && !prev.deletes[monthKey]) {
        return prev;
      }
      const nextMonths = { ...prev.months };
      const nextDeletes = { ...prev.deletes };
      delete nextMonths[monthKey];
      delete nextDeletes[monthKey];
      return { ...prev, months: nextMonths, deletes: nextDeletes };
    });
  };

  const resolveServerPayloadString = (data: BudgetData | null) => (
    data ? JSON.stringify(normalizeBudgetData(data)) : null
  );

  const flushSyncQueue = useCallback(async () => {
    if (!authToken || !isOnline || syncInFlightRef.current) {
      return;
    }
    const queueSnapshot = syncQueueRef.current;
    const monthEntries = Object.entries(queueSnapshot.months);
    const deleteEntries = Object.entries(queueSnapshot.deletes);
    const hasSettings = Boolean(queueSnapshot.settings);
    if (monthEntries.length === 0 && deleteEntries.length === 0 && !hasSettings) {
      return;
    }
    syncInFlightRef.current = true;
    try {
      for (const [monthKey, entry] of deleteEntries) {
        let serverPayload: string | null = null;
        let serverUpdatedAt: string | null = null;
        try {
          const server = await fetchMonth(monthKey);
          serverPayload = resolveServerPayloadString(server?.data ?? null);
          serverUpdatedAt = server?.updatedAt ?? null;
        } catch (error) {
          if (isAuthError(error)) {
            return;
          }
          if (!isRetriableSyncError(error)) {
            clearSyncQueueEntry(monthKey);
          }
          continue;
        }
        const serverTimestamp = Date.parse(serverUpdatedAt ?? '') || 0;
        if (serverPayload && serverTimestamp > entry.updatedAt) {
          const normalized = JSON.parse(serverPayload) as BudgetData;
          setMonthlyBudgets(prev => {
            const next = { ...prev, [monthKey]: normalizeBudgetData(normalized) };
            return applyJointBalanceCarryover(next, monthKey);
          });
          lastSavedPayloadRef.current[monthKey] = serverPayload;
          clearSyncQueueEntry(monthKey);
          showSyncNotice(t('syncAutoServerLabel'), 'warning');
          continue;
        }
        try {
          await deleteMonth(monthKey);
          clearSyncQueueEntry(monthKey);
          delete lastSavedPayloadRef.current[monthKey];
          showSyncNotice(t('syncAutoLocalLabel'), 'info');
        } catch (error) {
          if (!isAuthError(error) && !isRetriableSyncError(error)) {
            clearSyncQueueEntry(monthKey);
          }
        }
      }

      for (const [monthKey, entry] of monthEntries) {
        const localPayload = entry.payload;
        let serverPayload: string | null = null;
        let serverUpdatedAt: string | null = null;
        try {
          const server = await fetchMonth(monthKey);
          serverPayload = resolveServerPayloadString(server?.data ?? null);
          serverUpdatedAt = server?.updatedAt ?? null;
        } catch (error) {
          if (isAuthError(error)) {
            return;
          }
          if (!isRetriableSyncError(error)) {
            clearSyncQueueEntry(monthKey);
          }
          continue;
        }
        const serverTimestamp = Date.parse(serverUpdatedAt ?? '') || 0;
        if (serverPayload && serverTimestamp > entry.updatedAt) {
          const normalized = JSON.parse(serverPayload) as BudgetData;
          setMonthlyBudgets(prev => {
            const next = { ...prev, [monthKey]: normalizeBudgetData(normalized) };
            return applyJointBalanceCarryover(next, monthKey);
          });
          lastSavedPayloadRef.current[monthKey] = serverPayload;
          clearSyncQueueEntry(monthKey);
          showSyncNotice(t('syncAutoServerLabel'), 'warning');
          continue;
        }
        try {
          const payload = JSON.parse(localPayload) as BudgetData;
          await upsertMonth(monthKey, payload);
          lastSavedPayloadRef.current[monthKey] = localPayload;
          clearSyncQueueEntry(monthKey);
          showSyncNotice(t('syncAutoLocalLabel'), 'info');
        } catch (error) {
          if (!isAuthError(error) && !isRetriableSyncError(error)) {
            clearSyncQueueEntry(monthKey);
          }
        }
      }

      if (queueSnapshot.settings) {
        try {
          const settingsPayload = JSON.parse(queueSnapshot.settings.payload) as Partial<AppSettings>;
          const settings = await updateAppSettingsRequest(settingsPayload);
          lastSavedSettingsRef.current = JSON.stringify(settings);
          setSyncQueue(prev => ({ ...prev, settings: undefined }));
          showSyncNotice(t('syncAutoLocalLabel'), 'info');
        } catch (error) {
          if (!isAuthError(error) && !isRetriableSyncError(error)) {
            setSyncQueue(prev => ({ ...prev, settings: undefined }));
          }
        }
      }
    } finally {
      syncInFlightRef.current = false;
    }
  }, [authToken, clearSyncQueueEntry, isOnline, resolveServerPayloadString, showSyncNotice, t]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    void flushSyncQueue();
  }, [flushSyncQueue, isOnline, pendingSyncCount]);

  const openJointWizardForCreate = (type: 'deposit' | 'expense') => {
    resetJointDeleteConfirm();
    setJointWizard({
      mode: 'create',
      type,
      date: new Date().toISOString().split('T')[0],
      description: type === 'deposit' ? t('newDepositDescription') : t('newExpenseDescription'),
      amount: '',
      person: data.person1.name
    });
  };

  const openJointWizardForEdit = (transaction: JointTransaction) => {
    resetJointDeleteConfirm();
    setJointWizard({
      mode: 'edit',
      targetId: transaction.id,
      type: transaction.type,
      date: transaction.date,
      description: transaction.description,
      amount: String(transaction.amount ?? ''),
      person: transaction.person
    });
  };

  const handleJointWizardSubmit = () => {
    if (!jointWizard) {
      return;
    }
    const description = jointWizard.description.trim()
      || (jointWizard.type === 'deposit' ? t('newDepositDescription') : t('newExpenseDescription'));
    const amount = parseNumberInput(jointWizard.amount);
    const person = jointWizard.person || data.person1.name;
    if (jointWizard.mode === 'edit' && jointWizard.targetId) {
      updateJointTransaction(jointWizard.targetId, 'date', jointWizard.date);
      updateJointTransaction(jointWizard.targetId, 'type', jointWizard.type);
      updateJointTransaction(jointWizard.targetId, 'description', description);
      updateJointTransaction(jointWizard.targetId, 'amount', amount);
      updateJointTransaction(jointWizard.targetId, 'person', person);
      closeJointWizard();
      return;
    }
    const newTransaction: JointTransaction = {
      id: Date.now().toString(),
      date: jointWizard.date,
      description,
      amount,
      type: jointWizard.type,
      person
    };
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        transactions: [...prev.jointAccount.transactions, newTransaction]
      }
    }));
    closeJointWizard();
  };

  const handleJointWizardDelete = () => {
    if (!jointWizard || jointWizard.mode !== 'edit' || !jointWizard.targetId) {
      return;
    }
    if (!jointDeleteArmed) {
      setJointDeleteArmed(true);
      if (jointDeleteTimerRef.current) {
        window.clearTimeout(jointDeleteTimerRef.current);
      }
      jointDeleteTimerRef.current = window.setTimeout(() => {
        setJointDeleteArmed(false);
        jointDeleteTimerRef.current = null;
      }, 3500);
      return;
    }
    deleteJointTransaction(jointWizard.targetId);
    showToast(t('jointDeleteSuccess'));
    closeJointWizard();
  };

  const updateJointWizardField = (field: keyof JointWizardState, value: string) => {
    setJointWizard(prev => (prev ? { ...prev, [field]: value } : prev));
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

  const reorderJointTransactions = (sourceIndex: number, destinationIndex: number) => {
    setData(prev => ({
      ...prev,
      jointAccount: {
        ...prev.jointAccount,
        transactions: reorderList(prev.jointAccount.transactions, sourceIndex, destinationIndex)
      }
    }));
  };

  const handleJointDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderJointTransactions(result.source.index, result.destination.index);
  }, [reorderJointTransactions]);

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

  const navItems = useMemo(() => ([
    { key: 'dashboard' as const, label: t('dashboardLabel'), icon: LayoutDashboard },
    { key: 'budget' as const, label: t('budgetLabel'), icon: Wallet },
    { key: 'reports' as const, label: t('reportsLabel'), icon: BarChart3 },
    { key: 'settings' as const, label: t('settingsLabel'), icon: Settings }
  ]), [t]);

  const handleNavigate = useCallback((page: typeof activePage) => {
    setActivePage(page);
    setSidebarOpen(false);
  }, []);

  const authViewKey = authToken ? 'auth' : showOnboarding ? 'onboarding' : 'guest';

  if (showOnboarding) {
    return (
      <TranslationContext.Provider key={authViewKey} value={{ t, language: languagePreference }}>
        <OnboardingWizard
          darkMode={darkMode}
          pageStyle={pageStyle}
          languagePreference={languagePreference}
          themePreference={themePreference}
          soloModeEnabled={soloModeEnabled}
          onLanguageChange={(value) => setLanguagePreference(value)}
          onThemeChange={handleThemePreferenceChange}
          onModeChange={(value) => setSoloModeEnabled(value === 'solo')}
          onComplete={({ person1Name, person2Name, mode }) => {
            setSoloModeEnabled(mode === 'solo');
            const settingsPayload = buildSettingsPayload({ soloModeEnabled: mode === 'solo' });
            lastSavedSettingsRef.current = JSON.stringify(settingsPayload);
            setSettingsLoaded(true);
            void updateAppSettingsRequest(settingsPayload)
              .then((settings) => {
                lastSavedSettingsRef.current = JSON.stringify(settings);
                setSortByCost(settings.sortByCost);
                setJointAccountEnabled(settings.jointAccountEnabled);
                setSoloModeEnabled(settings.soloModeEnabled);
                setShowSidebarMonths(settings.showSidebarMonths ?? true);
                setBudgetWidgetsEnabled(settings.budgetWidgetsEnabled ?? settings.dashboardWidgetsEnabled ?? true);
                setLanguagePreference(settings.languagePreference);
                setBankAccountsEnabled(settings.bankAccountsEnabled ?? true);
              })
              .catch((error) => {
                console.error('Failed to save onboarding settings', error);
              });
            void updateProfileRequest({ themePreference })
              .then((profile) => {
                setAuthProfile(profile);
                setAuthUser(profile.username);
                setThemePreference(profile.themePreference);
                setDarkMode(profile.themePreference === 'dark');
              })
              .catch((error) => {
                console.error('Failed to save onboarding theme', error);
              });
            if (mode === 'duo') {
              setPendingOnboarding({ person1Name, person2Name, mode });
            } else if (person1Name.trim()) {
              setPendingOnboarding({ person1Name, person2Name: '', mode });
            } else {
              setPendingOnboarding(null);
            }
            setShowOnboarding(false);
          }}
          onCreateAdmin={async (username, password) => {
            await bootstrapAdminRequest({ username, password });
            const result = await loginRequest(username, password);
            applyLoginResult(result);
          }}
          onCreateSecondUser={async ({ username, password, displayName }) => {
            await createUserRequest({
              username,
              password,
              displayName: displayName?.trim() || null,
              role: 'user'
            });
          }}
        />
      </TranslationContext.Provider>
    );
  }

  if (!authToken) {
    return (
      <TranslationContext.Provider key={authViewKey} value={{ t, language: languagePreference }}>
        <LoginScreen
          onLogin={handleLogin}
          error={authError}
          loading={authLoading}
          darkMode={darkMode}
          pageStyle={pageStyle}
          oidcEnabled={oidcLoginEnabled}
          oidcProviderName={oidcLoginProviderName}
          onOidcLogin={handleOidcLogin}
        />
      </TranslationContext.Provider>
    );
  }

  return (
    <TranslationContext.Provider key={authViewKey} value={{ t, language: languagePreference }}>
      <div
        className={`min-h-screen app-fade safe-area ${darkMode ? 'bg-slate-950' : 'bg-transparent'}`}
        style={pageStyle}
      >
        <div className="flex min-h-screen">
          <Sidebar
            darkMode={darkMode}
            navItems={navItems}
            activePage={activePage}
            sidebarOpen={sidebarOpen}
            onNavigate={handleNavigate}
            onCloseMobile={() => setSidebarOpen(false)}
            onToggleTheme={toggleDarkMode}
            onLogout={handleLogout}
            appName={t('appName')}
            userDisplayName={userDisplayName}
            userHandle={userHandle}
            userInitial={userInitial}
            userAvatarUrl={resolvedUserAvatarUrl}
            themeLabel={t('themeToggleLabel')}
            darkLabel={t('darkLabel')}
            lightLabel={t('lightLabel')}
            logoutLabel={t('logoutLabel')}
            appVersion={APP_VERSION}
            updateAvailable={updateAvailable}
            latestVersion={latestVersion}
            showMonthList={showSidebarMonths}
            monthItems={sidebarMonthItems}
            activeMonthKey={currentMonthKey}
            monthListLabel={t('monthSelectLabel')}
            onSelectMonth={(monthKey) => {
              if (activePage !== 'dashboard') {
                setActivePage('budget');
              }
              trySelectMonthKey(monthKey);
            }}
          />

          <main className="flex-1 p-4 sm:p-6 sm:pl-72 overflow-x-hidden">
            <HeaderBar
              darkMode={darkMode}
              isSettingsView={isSettingsView}
              isBudgetView={isBudgetView}
              pageLabel={pageLabel}
              currentMonthKey={currentMonthKey}
              availableMonthKeys={availableMonthKeys}
              formatMonthKey={formatMonthKey}
              onSelectMonth={trySelectMonthKey}
              isHydrated={isHydrated}
              onBackToBudget={() => setActivePage('budget')}
              backLabel={t('backLabel')}
              settingsLabel={t('settingsLabel')}
              monthSelectLabel={t('monthSelectLabel')}
              showNextMonth={showNextMonth}
              nextMonthAvailable={nextMonthAvailable}
              onToggleNextMonth={() => setShowNextMonth(prev => !prev)}
              renderPaletteSelector={() => (
                <PaletteSelector
                  palettes={PALETTES}
                  value={palette.id}
                  onChange={(nextId) => {
                    if (darkMode) {
                      setPaletteIdDark(nextId);
                    } else {
                      setPaletteIdLight(nextId);
                    }
                  }}
                  darkMode={darkMode}
                />
              )}
              onOpenSidebar={() => setSidebarOpen(true)}
              onToggleTheme={toggleDarkMode}
              themeLabel={t('themeToggleLabel')}
              userInitial={userInitial}
              userDisplayName={userDisplayName}
              userAvatarUrl={resolvedUserAvatarUrl}
              breadcrumbItems={breadcrumbItems}
              syncBadgeLabel={syncBadgeLabel}
              syncBadgeTone={syncBadgeTone}
            />

      {isBudgetView && selectorError && (
        <div className={`mb-4 text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
          {selectorError}
        </div>
      )}

      <Suspense
        fallback={(
          <div className={`rounded-2xl border p-6 text-sm ${darkMode ? 'bg-slate-900/40 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
            ...
          </div>
        )}
      >
      {isSettingsView ? (
        <SettingsView
          user={authProfile}
          fallbackUsername={authUser}
          darkMode={darkMode}
          onAuthFailure={handleAuthFailure}
          onProfileUpdated={(profile) => {
            setAuthProfile(profile);
            setAuthUser(profile.username);
          }}
          onUserLabelUpdate={updateLinkedUserLabel}
          sortByCost={sortByCost}
          onToggleSortByCost={setSortByCost}
          showSidebarMonths={showSidebarMonths}
          onToggleShowSidebarMonths={setShowSidebarMonths}
          budgetWidgetsEnabled={budgetWidgetsEnabled}
          onToggleBudgetWidgetsEnabled={setBudgetWidgetsEnabled}
          languagePreference={languagePreference}
          onLanguagePreferenceChange={setLanguagePreference}
          currencyPreference={currencyPreference}
          onCurrencyPreferenceChange={setCurrencyPreference}
          sessionDurationHours={sessionDurationHours}
          onSessionDurationHoursChange={setSessionDurationHours}
          bankAccountsEnabled={bankAccountsEnabled}
          onToggleBankAccountsEnabled={setBankAccountsEnabled}
          bankAccounts={bankAccounts}
          onBankAccountsChange={setBankAccounts}
          oidcEnabled={oidcEnabled}
          oidcProviderName={oidcProviderName}
          oidcIssuer={oidcIssuer}
          oidcClientId={oidcClientId}
          oidcClientSecret={oidcClientSecret}
          oidcRedirectUri={oidcRedirectUri}
          onOidcEnabledChange={setOidcEnabled}
          onOidcProviderNameChange={setOidcProviderName}
          onOidcIssuerChange={setOidcIssuer}
          onOidcClientIdChange={setOidcClientId}
          onOidcClientSecretChange={setOidcClientSecret}
          onOidcRedirectUriChange={setOidcRedirectUri}
          oidcLinkEnabled={oidcLinkEnabled}
          oidcLinkProviderName={oidcLinkProviderName}
          jointAccountEnabled={jointAccountEnabled}
          onToggleJointAccountEnabled={setJointAccountEnabled}
          soloModeEnabled={soloModeEnabled}
          onToggleSoloModeEnabled={setSoloModeEnabled}
          person1UserId={person1UserId}
          person2UserId={person2UserId}
          onPersonLinkChange={updatePersonMapping}
        />
      ) : isDashboardView ? (
        <DashboardView
          monthlyBudgets={monthlyBudgets}
          currentMonthKey={currentMonthKey}
          darkMode={darkMode}
          currencyPreference={currencyPreference}
          palette={palette}
          monthOptions={monthOptions}
          formatMonthKey={formatMonthKey}
          data={data}
          jointAccountEnabled={jointAccountEnabled}
          onOpenTransactions={() => setActivePage('reports')}
          bankAccountsEnabled={bankAccountsEnabled}
          bankAccounts={bankAccounts}
          soloModeEnabled={soloModeEnabled}
          calculatePlannedExpensesForData={calculatePlannedExpensesForData}
          calculateActualExpensesForData={calculateActualExpensesForData}
          calculateTotalIncomeForData={calculateTotalIncomeForData}
          calculateJointBalanceForData={calculateJointBalanceForData}
          formatCurrency={formatCurrency}
          formatExpenseDate={formatExpenseDate}
          coerceNumber={coerceNumber}
          getAccountChipStyle={getAccountChipStyle}
          getPaletteTone={getPaletteTone}
        />
      ) : isReportsView ? (
        <ReportsView
          monthlyBudgets={monthlyBudgets}
          currentMonthKey={currentMonthKey}
          darkMode={darkMode}
          currencyPreference={currencyPreference}
          data={data}
          soloModeEnabled={soloModeEnabled}
          authProfile={authProfile}
          formatMonthKey={formatMonthKey}
          calculateTotalIncome={calculateTotalIncome}
          calculateTotalFixed={calculateTotalFixed}
          calculateTotalCategories={calculateTotalCategories}
          coerceNumber={coerceNumber}
          formatCurrency={formatCurrency}
        />
      ) : isBudgetView ? (
        <>
          {!soloModeEnabled && (
            <div className="mb-4 flex flex-wrap items-center justify-center gap-2 sm:hidden">
              <div
                id="person-select"
                role="group"
                aria-label={t('tableLabel')}
                className={`inline-flex items-center rounded-full border p-1 ${
                  darkMode ? 'border-slate-700 bg-slate-900/60' : 'border-slate-200 bg-white/80'
                }`}
              >
                <button
                  type="button"
                  onClick={() => setActivePersonKey('person1')}
                  className={`px-3 py-1 rounded-full text-sm font-semibold transition ${
                    activePersonKey === 'person1'
                      ? (darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white')
                      : (darkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
                  }`}
                >
                  {data.person1.name || t('person1Label')}
                </button>
                <button
                  type="button"
                  onClick={() => setActivePersonKey('person2')}
                  className={`px-3 py-1 rounded-full text-sm font-semibold transition ${
                    activePersonKey === 'person2'
                      ? (darkMode ? 'bg-emerald-500 text-white' : 'bg-emerald-500 text-white')
                      : (darkMode ? 'text-slate-200 hover:bg-slate-800' : 'text-slate-600 hover:bg-slate-100')
                  }`}
                >
                  {data.person2.name || t('person2Label')}
                </button>
              </div>
            </div>
          )}

          <div className="mb-6 sm:hidden">
            <div className="mb-2">
              <PersonColumnHeader
                person={soloModeEnabled || activePersonKey === 'person1' ? data.person1 : data.person2}
                personKey={soloModeEnabled ? 'person1' : activePersonKey}
                readOnly={false}
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
              readOnly={false}
              darkMode={darkMode}
              sortByCost={sortByCost}
              enableDrag={enableDrag}
              palette={palette}
              currencyPreference={currencyPreference}
              bankAccountsEnabled={bankAccountsEnabled}
              bankAccounts={bankAccounts}
              editingName={editingName}
              tempName={tempName}
              setTempName={setTempName}
              startEditingName={startEditingName}
              saveName={saveName}
              cancelEditingName={cancelEditingName}
              addIncomeSource={addIncomeSource}
              deleteIncomeSource={deleteIncomeSource}
              updateIncomeSource={updateIncomeSource}
              reorderIncomeSources={reorderIncomeSources}
              openExpenseWizard={openExpenseWizard}
              openExpenseWizardForEdit={openExpenseWizardForEdit}
              updateFixedExpense={updateFixedExpense}
              reorderFixedExpenses={reorderFixedExpenses}
              updateCategory={updateCategory}
              reorderCategories={reorderCategories}
            />
          </div>

          {soloModeEnabled ? (
            <AnimatePresence mode="wait" initial={false}>
              {showNextMonthPanel && nextMonthData ? (
                <motion.div
                  key="solo-compare"
                  className={budgetGridClass}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {calendarWidgets}
                  <div className="flex-1 min-w-0">
                    <div className="w-full max-w-screen-2xl mx-auto">
                      <div className="relative grid grid-cols-2 gap-8">
                    <div
                      className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-[4px] rounded-full"
                      style={{
                        backgroundImage: darkMode
                          ? 'linear-gradient(180deg, rgba(148, 163, 184, 0) 0%, rgba(148, 163, 184, 0.65) 50%, rgba(148, 163, 184, 0) 100%)'
                          : 'linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(94, 113, 148, 0.35) 50%, rgba(15, 23, 42, 0) 100%)',
                        boxShadow: darkMode
                          ? '0 0 12px rgba(148, 163, 184, 0.35)'
                          : '0 0 14px rgba(94, 113, 148, 0.25)'
                      }}
                    />
                    <div className={`text-center text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatMonthKey(currentMonthKey)}
                    </div>
                    <div className={`text-center text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {formatMonthKey(nextMonthKey)}
                    </div>
                    <PersonColumnHeader
                      person={data.person1}
                      personKey="person1"
                      readOnly={false}
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
                      person={nextMonthData.person1}
                      personKey="person1"
                      readOnly
                      darkMode={darkMode}
                      editingName={editingName}
                      tempName={tempName}
                      setTempName={setTempName}
                      startEditingName={startEditingName}
                      saveName={saveName}
                      cancelEditingName={cancelEditingName}
                      isLinked={nextPerson1Linked}
                    />
                    <BudgetHeaderSection
                      person={data.person1}
                      personKey="person1"
                      readOnly={false}
                      darkMode={darkMode}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      addIncomeSource={addIncomeSource}
                      deleteIncomeSource={deleteIncomeSource}
                      updateIncomeSource={updateIncomeSource}
                      reorderIncomeSources={reorderIncomeSources}
                    />
                    <BudgetHeaderSection
                      person={nextMonthData.person1}
                      personKey="person1"
                      readOnly
                      darkMode={darkMode}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      addIncomeSource={addIncomeSource}
                      deleteIncomeSource={deleteIncomeSource}
                      updateIncomeSource={updateIncomeSource}
                      reorderIncomeSources={reorderIncomeSources}
                    />
                    <DragDropContext onDragEnd={handleExpenseDragEnd}>
                      <BudgetFixedSection
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateFixedExpense={updateFixedExpense}
                        reorderFixedExpenses={reorderFixedExpenses}
                        useSharedDragContext
                      />
                      <BudgetFixedSection
                        person={nextMonthData.person1}
                        personKey="person1"
                        readOnly
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateFixedExpense={updateFixedExpense}
                        reorderFixedExpenses={reorderFixedExpenses}
                        useSharedDragContext
                      />
                      <BudgetFreeSection
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateCategory={updateCategory}
                        reorderCategories={reorderCategories}
                        useSharedDragContext
                      />
                      <BudgetFreeSection
                        person={nextMonthData.person1}
                        personKey="person1"
                        readOnly
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateCategory={updateCategory}
                        reorderCategories={reorderCategories}
                        useSharedDragContext
                      />
                    </DragDropContext>
                      </div>
                    </div>
                  </div>
                </motion.div>
            ) : (
              <motion.div
                key="solo-single"
                className={budgetGridClass}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {calendarWidgets}
                <div className="flex-1 min-w-0">
                  <div className="max-w-2xl mx-auto">
                  <PersonColumnHeader
                    person={data.person1}
                    personKey="person1"
                    readOnly={false}
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
                    readOnly={false}
                    darkMode={darkMode}
                    enableDrag={enableDrag}
                    palette={palette}
                    currencyPreference={currencyPreference}
                    addIncomeSource={addIncomeSource}
                    deleteIncomeSource={deleteIncomeSource}
                    updateIncomeSource={updateIncomeSource}
                    reorderIncomeSources={reorderIncomeSources}
                  />
                  <DragDropContext onDragEnd={handleExpenseDragEnd}>
                    <BudgetFixedSection
                      person={data.person1}
                      personKey="person1"
                      readOnly={false}
                      darkMode={darkMode}
                      sortByCost={sortByCost}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      bankAccountsEnabled={bankAccountsEnabled}
                      bankAccounts={bankAccounts}
                      openExpenseWizard={openExpenseWizard}
                      openExpenseWizardForEdit={openExpenseWizardForEdit}
                      updateFixedExpense={updateFixedExpense}
                      reorderFixedExpenses={reorderFixedExpenses}
                      useSharedDragContext
                    />
                    <BudgetFreeSection
                      person={data.person1}
                      personKey="person1"
                      readOnly={false}
                      darkMode={darkMode}
                      sortByCost={sortByCost}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      bankAccountsEnabled={bankAccountsEnabled}
                      bankAccounts={bankAccounts}
                      openExpenseWizard={openExpenseWizard}
                      openExpenseWizardForEdit={openExpenseWizardForEdit}
                      updateCategory={updateCategory}
                      reorderCategories={reorderCategories}
                      useSharedDragContext
                    />
                  </DragDropContext>
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          ) : (
            <AnimatePresence mode="wait" initial={false}>
              {showNextMonthPanel && nextMonthData ? (
                <motion.div
                  key="duo-compare"
                  className={budgetGridClass}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 8 }}
                  transition={{ duration: 0.25, ease: 'easeOut' }}
                >
                  {calendarWidgets}
                  <div className="flex-1 min-w-0">
                    <div className="relative grid grid-cols-4 gap-8 w-full max-w-screen-2xl mx-auto">
                      <div
                        className="pointer-events-none absolute left-1/2 top-6 bottom-6 w-[4px] rounded-full"
                        style={{
                          backgroundImage: darkMode
                            ? 'linear-gradient(180deg, rgba(148, 163, 184, 0) 0%, rgba(148, 163, 184, 0.65) 50%, rgba(148, 163, 184, 0) 100%)'
                            : 'linear-gradient(180deg, rgba(15, 23, 42, 0) 0%, rgba(94, 113, 148, 0.35) 50%, rgba(15, 23, 42, 0) 100%)',
                          boxShadow: darkMode
                            ? '0 0 12px rgba(148, 163, 184, 0.35)'
                            : '0 0 14px rgba(94, 113, 148, 0.25)'
                        }}
                      />
                      <div className={`col-span-2 text-center text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatMonthKey(currentMonthKey)}
                      </div>
                      <div className={`col-span-2 text-center text-xs font-semibold uppercase tracking-wide ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        {formatMonthKey(nextMonthKey)}
                      </div>
                      <PersonColumnHeader
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
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
                        readOnly={false}
                        darkMode={darkMode}
                        editingName={editingName}
                        tempName={tempName}
                        setTempName={setTempName}
                        startEditingName={startEditingName}
                        saveName={saveName}
                        cancelEditingName={cancelEditingName}
                        isLinked={isPerson2Linked}
                      />
                      <PersonColumnHeader
                        person={nextMonthData.person1}
                        personKey="person1"
                        readOnly
                        darkMode={darkMode}
                        editingName={editingName}
                        tempName={tempName}
                        setTempName={setTempName}
                        startEditingName={startEditingName}
                        saveName={saveName}
                        cancelEditingName={cancelEditingName}
                        isLinked={nextPerson1Linked}
                      />
                      <PersonColumnHeader
                        person={nextMonthData.person2}
                        personKey="person2"
                        readOnly
                        darkMode={darkMode}
                        editingName={editingName}
                        tempName={tempName}
                        setTempName={setTempName}
                        startEditingName={startEditingName}
                        saveName={saveName}
                        cancelEditingName={cancelEditingName}
                        isLinked={nextPerson2Linked}
                      />
                      <BudgetHeaderSection
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
                        darkMode={darkMode}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        addIncomeSource={addIncomeSource}
                        deleteIncomeSource={deleteIncomeSource}
                        updateIncomeSource={updateIncomeSource}
                        reorderIncomeSources={reorderIncomeSources}
                      />
                      <BudgetHeaderSection
                        person={data.person2}
                        personKey="person2"
                        readOnly={false}
                        darkMode={darkMode}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        addIncomeSource={addIncomeSource}
                        deleteIncomeSource={deleteIncomeSource}
                        updateIncomeSource={updateIncomeSource}
                        reorderIncomeSources={reorderIncomeSources}
                      />
                      <BudgetHeaderSection
                        person={nextMonthData.person1}
                        personKey="person1"
                        readOnly
                        darkMode={darkMode}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        addIncomeSource={addIncomeSource}
                        deleteIncomeSource={deleteIncomeSource}
                        updateIncomeSource={updateIncomeSource}
                        reorderIncomeSources={reorderIncomeSources}
                      />
                      <BudgetHeaderSection
                        person={nextMonthData.person2}
                        personKey="person2"
                        readOnly
                        darkMode={darkMode}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        addIncomeSource={addIncomeSource}
                        deleteIncomeSource={deleteIncomeSource}
                        updateIncomeSource={updateIncomeSource}
                        reorderIncomeSources={reorderIncomeSources}
                      />
                      <DragDropContext onDragEnd={handleExpenseDragEnd}>
                        <BudgetFixedSection
                          person={data.person1}
                          personKey="person1"
                          readOnly={false}
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateFixedExpense={updateFixedExpense}
                          reorderFixedExpenses={reorderFixedExpenses}
                          useSharedDragContext
                        />
                        <BudgetFixedSection
                          person={data.person2}
                          personKey="person2"
                          readOnly={false}
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateFixedExpense={updateFixedExpense}
                          reorderFixedExpenses={reorderFixedExpenses}
                          useSharedDragContext
                        />
                        <BudgetFixedSection
                          person={nextMonthData.person1}
                          personKey="person1"
                          readOnly
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateFixedExpense={updateFixedExpense}
                          reorderFixedExpenses={reorderFixedExpenses}
                          useSharedDragContext
                        />
                        <BudgetFixedSection
                          person={nextMonthData.person2}
                          personKey="person2"
                          readOnly
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateFixedExpense={updateFixedExpense}
                          reorderFixedExpenses={reorderFixedExpenses}
                          useSharedDragContext
                        />
                        <BudgetFreeSection
                          person={data.person1}
                          personKey="person1"
                          readOnly={false}
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateCategory={updateCategory}
                          reorderCategories={reorderCategories}
                          useSharedDragContext
                        />
                        <BudgetFreeSection
                          person={data.person2}
                          personKey="person2"
                          readOnly={false}
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateCategory={updateCategory}
                          reorderCategories={reorderCategories}
                          useSharedDragContext
                        />
                        <BudgetFreeSection
                          person={nextMonthData.person1}
                          personKey="person1"
                          readOnly
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateCategory={updateCategory}
                          reorderCategories={reorderCategories}
                          useSharedDragContext
                        />
                        <BudgetFreeSection
                          person={nextMonthData.person2}
                          personKey="person2"
                          readOnly
                          darkMode={darkMode}
                          sortByCost={sortByCost}
                          enableDrag={enableDrag}
                          palette={palette}
                          currencyPreference={currencyPreference}
                          bankAccountsEnabled={bankAccountsEnabled}
                          bankAccounts={bankAccounts}
                          openExpenseWizard={openExpenseWizard}
                          openExpenseWizardForEdit={openExpenseWizardForEdit}
                          updateCategory={updateCategory}
                          reorderCategories={reorderCategories}
                          useSharedDragContext
                        />
                      </DragDropContext>
                    </div>
                  </div>
                </motion.div>
            ) : (
              <motion.div
                key="duo-single"
                className={budgetGridClass}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                {calendarWidgets}
                <div className="flex-1 min-w-0">
                  <div className="grid grid-cols-2 gap-6 w-full max-w-6xl mx-auto">
                    <PersonColumnHeader
                      person={data.person1}
                      personKey="person1"
                      readOnly={false}
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
                      readOnly={false}
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
                      readOnly={false}
                      darkMode={darkMode}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      addIncomeSource={addIncomeSource}
                      deleteIncomeSource={deleteIncomeSource}
                      updateIncomeSource={updateIncomeSource}
                      reorderIncomeSources={reorderIncomeSources}
                    />
                    <BudgetHeaderSection
                      person={data.person2}
                      personKey="person2"
                      readOnly={false}
                      darkMode={darkMode}
                      enableDrag={enableDrag}
                      palette={palette}
                      currencyPreference={currencyPreference}
                      addIncomeSource={addIncomeSource}
                      deleteIncomeSource={deleteIncomeSource}
                      updateIncomeSource={updateIncomeSource}
                      reorderIncomeSources={reorderIncomeSources}
                    />
                    <DragDropContext onDragEnd={handleExpenseDragEnd}>
                      <BudgetFixedSection
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateFixedExpense={updateFixedExpense}
                        reorderFixedExpenses={reorderFixedExpenses}
                        useSharedDragContext
                      />
                      <BudgetFixedSection
                        person={data.person2}
                        personKey="person2"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateFixedExpense={updateFixedExpense}
                        reorderFixedExpenses={reorderFixedExpenses}
                        useSharedDragContext
                      />
                      <BudgetFreeSection
                        person={data.person1}
                        personKey="person1"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateCategory={updateCategory}
                        reorderCategories={reorderCategories}
                        useSharedDragContext
                      />
                      <BudgetFreeSection
                        person={data.person2}
                        personKey="person2"
                        readOnly={false}
                        darkMode={darkMode}
                        sortByCost={sortByCost}
                        enableDrag={enableDrag}
                        palette={palette}
                        currencyPreference={currencyPreference}
                        bankAccountsEnabled={bankAccountsEnabled}
                        bankAccounts={bankAccounts}
                        openExpenseWizard={openExpenseWizard}
                        openExpenseWizardForEdit={openExpenseWizardForEdit}
                        updateCategory={updateCategory}
                        reorderCategories={reorderCategories}
                        useSharedDragContext
                      />
                    </DragDropContext>
                  </div>
                </div>
              </motion.div>
            )}
            </AnimatePresence>
          )}

          {jointAccountEnabled && (
            <div className="flex justify-center">
              <div
                className={`w-full max-w-4xl p-5 rounded-2xl border border-l-4 ${
                  darkMode ? 'border-slate-800' : 'card-float'
                }`}
                style={{
                  backgroundColor: jointTone.background,
                  borderColor: jointTone.border,
                  border: isDefaultPalette ? 'none' : undefined
                }}
              >
                <div className="flex flex-col gap-3 mb-4 sm:flex-row sm:items-center sm:justify-between">
                  <h3 className="font-semibold" style={{ color: jointTone.text }}>{t('jointAccountTitle')}</h3>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => openJointWizardForCreate('deposit')}
                      className="px-3 py-1.5 rounded-full flex items-center gap-1 text-xs sm:text-sm font-semibold pill-emerald"
                    >
                      <Plus size={16} />
                      <span>{t('depositLabel')}</span>
                    </button>
                    <button
                      onClick={() => openJointWizardForCreate('expense')}
                      className="px-3 py-1.5 rounded-full flex items-center gap-1 text-xs sm:text-sm font-semibold pill-coral"
                    >
                      <Plus size={16} />
                      <span>{t('expenseLabel')}</span>
                    </button>
                  </div>
                </div>

                <div className={`${darkMode ? 'bg-slate-950/40 border-slate-800' : 'bg-white/90 border-slate-100'} rounded-xl border p-4 mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{t('initialBalanceLabel')}:</span>
                    <input
                      type="number"
                      value={coerceNumber(data.jointAccount.initialBalance)}
                      onChange={(e) => updateInitialBalance(parseNumberInput(e.target.value))}
                      className={`w-full sm:w-32 px-3 py-2 border rounded-lg text-right ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                    />
                    <span className={darkMode ? 'text-slate-300' : 'text-slate-500'}>
                      {currencyPreference === 'USD' ? '$' : '€'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{t('currentBalanceLabel')}:</span>
                    <span className={`text-xl sm:text-2xl font-bold ${calculateJointBalance() < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                      {formatCurrency(calculateJointBalance(), currencyPreference)}
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  {enableDrag ? (
                    <DragDropContext onDragEnd={handleJointDragEnd}>
                      <table className={`w-full ${darkMode ? 'bg-slate-900/70' : 'bg-white/90'} rounded-xl text-sm border ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                        <thead className={darkMode ? 'bg-slate-900/80' : 'bg-slate-50'}>
                          <tr>
                            <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('dateLabel')}</th>
                            <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('typeLabel')}</th>
                            <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('descriptionLabel')}</th>
                            <th className={`p-2 text-right ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('amountLabel')}</th>
                            <th className={`p-2 text-left hidden sm:table-cell ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('personLabel')}</th>
                            <th className="p-2"></th>
                          </tr>
                        </thead>
                        <Droppable droppableId="joint-transactions">
                          {(provided: DroppableProvided) => (
                            <tbody ref={provided.innerRef} {...provided.droppableProps}>
                              {data.jointAccount.transactions.map((transaction, index) => (
                                <Draggable key={transaction.id} draggableId={`joint-${transaction.id}`} index={index}>
                                  {(dragProvided: DraggableProvided, snapshot: DraggableStateSnapshot) => (
                                    <tr
                                      ref={dragProvided.innerRef}
                                      {...dragProvided.draggableProps}
                                      className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'} ${
                                        snapshot.isDragging ? (darkMode ? 'bg-slate-900/90' : 'bg-slate-50') : ''
                                      }`}
                                      style={dragProvided.draggableProps.style}
                                    >
                                      <td className="p-2">
                                        <div className="flex items-center gap-2">
                                          <span
                                            {...dragProvided.dragHandleProps}
                                            className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                                            aria-label={t('dragHandleLabel')}
                                          >
                                            <GripVertical size={14} />
                                          </span>
                                          <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                            {transaction.date}
                                          </span>
                                        </div>
                                      </td>
                                      <td className="p-2">
                                        <span
                                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                            transaction.type === 'deposit'
                                              ? (darkMode ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-600')
                                              : (darkMode ? 'bg-rose-500/20 text-rose-200' : 'bg-rose-50 text-rose-600')
                                          }`}
                                        >
                                          {transaction.type === 'deposit' ? t('depositOptionLabel') : t('expenseOptionLabel')}
                                        </span>
                                      </td>
                                      <td className="p-2">
                                        <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                          {transaction.description || (transaction.type === 'deposit' ? t('newDepositDescription') : t('newExpenseDescription'))}
                                        </span>
                                      </td>
                                      <td className="p-2 text-right">
                                        <span className={`font-semibold tabular-nums ${transaction.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                          {formatCurrency(transaction.amount, currencyPreference)}
                                        </span>
                                      </td>
                                      <td className="p-2 hidden sm:table-cell">
                                        <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                          {transaction.person}
                                        </span>
                                      </td>
                                      <td className="p-2">
                                        <div className="flex items-center justify-end gap-2">
                                          <button
                                            onClick={() => openJointWizardForEdit(transaction)}
                                            className={darkMode ? 'text-slate-200 hover:text-slate-50' : 'text-slate-500 hover:text-slate-700'}
                                            aria-label={t('editLabel')}
                                          >
                                            <Edit2 size={16} />
                                          </button>
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </Draggable>
                              ))}
                              {provided.placeholder}
                            </tbody>
                          )}
                        </Droppable>
                      </table>
                    </DragDropContext>
                  ) : (
                    <table className={`w-full ${darkMode ? 'bg-slate-900/70' : 'bg-white/90'} rounded-xl text-sm border ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                      <thead className={darkMode ? 'bg-slate-900/80' : 'bg-slate-50'}>
                        <tr>
                          <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('dateLabel')}</th>
                          <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('typeLabel')}</th>
                          <th className={`p-2 text-left ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('descriptionLabel')}</th>
                          <th className={`p-2 text-right ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('amountLabel')}</th>
                          <th className={`p-2 text-left hidden sm:table-cell ${darkMode ? 'text-slate-300' : 'text-slate-500'}`}>{t('personLabel')}</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.jointAccount.transactions.map(transaction => (
                          <tr key={transaction.id} className={`border-t ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                            <td className="p-2">
                              <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                {transaction.date}
                              </span>
                            </td>
                            <td className="p-2">
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                                  transaction.type === 'deposit'
                                    ? (darkMode ? 'bg-emerald-500/20 text-emerald-200' : 'bg-emerald-50 text-emerald-600')
                                    : (darkMode ? 'bg-rose-500/20 text-rose-200' : 'bg-rose-50 text-rose-600')
                                }`}
                              >
                                {transaction.type === 'deposit' ? t('depositOptionLabel') : t('expenseOptionLabel')}
                              </span>
                            </td>
                            <td className="p-2">
                              <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                {transaction.description || (transaction.type === 'deposit' ? t('newDepositDescription') : t('newExpenseDescription'))}
                              </span>
                            </td>
                            <td className="p-2 text-right">
                              <span className={`font-semibold tabular-nums ${transaction.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                {formatCurrency(transaction.amount, currencyPreference)}
                              </span>
                            </td>
                            <td className="p-2 hidden sm:table-cell">
                              <span className={darkMode ? 'text-slate-100' : 'text-slate-700'}>
                                {transaction.person}
                              </span>
                            </td>
                            <td className="p-2">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => openJointWizardForEdit(transaction)}
                                  className={darkMode ? 'text-slate-200 hover:text-slate-50' : 'text-slate-500 hover:text-slate-700'}
                                  aria-label={t('editLabel')}
                                >
                                  <Edit2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="mt-6 hidden sm:flex" />
        </>
      ) : (
        <div className={`rounded-2xl border p-6 ${darkMode ? 'bg-slate-900/40 border-slate-800 text-slate-200' : 'bg-white border-slate-200 text-slate-700'}`}>
          <div className="text-sm uppercase tracking-wide text-slate-400">{t('appName')}</div>
          <div className={`mt-2 text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>{pageLabel}</div>
          <div className="mt-2 text-sm text-slate-500">
            {t('comingSoonLabel')}
          </div>
        </div>
      )}
      </Suspense>
        {expenseWizard && (
          <Dialog
            open={Boolean(expenseWizard)}
            onOpenChange={(open) => {
              if (!open) {
                closeExpenseWizard();
              }
            }}
          >
            <DialogContent
              className={`w-full max-w-md rounded-2xl shadow-lg ${wizardDialogSpacing} ${wizardDialogScroll} ${
                darkMode ? 'bg-slate-950/90 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
              } ${isCompactWizard ? 'left-0 top-0 translate-x-0 translate-y-0 max-w-none w-full h-[100dvh] max-h-none rounded-none' : ''}`}
            >
              <div className="space-y-1">
                {!isCompactWizard && (
                  <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
                )}
                <h2 className="text-xl font-semibold">
                  {expenseWizard.mode === 'edit' ? t('expenseWizardEditTitle') : t('expenseWizardTitle')}
                </h2>
                <div className="text-xs text-slate-500">{t('onboardingStepLabel')} {expenseWizard.step}/2</div>
                <div className="text-xs font-semibold text-slate-500">
                  {expenseWizard.type === 'fixed' ? t('fixedMoneyLabel') : t('freeMoneyLabel')}
                </div>
              </div>

              {expenseWizard.step === 1 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className={wizardLabelClass} htmlFor="expense-name">{t('expenseNameLabel')}</label>
                    <input
                      id="expense-name"
                      type="text"
                      value={expenseWizard.name}
                      onChange={(e) => updateExpenseWizard({ name: e.target.value })}
                      placeholder={expenseWizard.type === 'fixed' ? t('newFixedExpenseLabel') : t('newCategoryLabel')}
                      className={`w-full px-3 ${wizardInputPadding} border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={wizardLabelClass} htmlFor="expense-amount">{t('amountLabel')}</label>
                    <input
                      id="expense-amount"
                      type="number"
                      value={expenseWizard.amount}
                      onChange={(e) => updateExpenseWizard({ amount: e.target.value })}
                      className={`w-full px-3 ${wizardInputPadding} border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className={wizardLabelClass} htmlFor="expense-date">{t('dateLabel')}</label>
                    <div className="relative">
                      <input
                        id="expense-date"
                        type="date"
                        value={expenseWizard.date}
                        onChange={(e) => updateExpenseWizard({ date: e.target.value })}
                        className={`w-full px-3 ${wizardInputPadding} pr-10 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                      />
                      {expenseWizard.date && (
                        <button
                          type="button"
                          onClick={() => updateExpenseWizard({ date: '' })}
                          className={`absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 transition ${
                            darkMode ? 'text-slate-400 hover:text-slate-200' : 'text-slate-400 hover:text-slate-600'
                          }`}
                          aria-label={t('clearDateLabel')}
                          title={t('clearDateLabel')}
                        >
                          <X size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  {bankAccountsEnabled && expenseWizardAccounts.length > 0 && (
                    <div className="space-y-1">
                      <label className={wizardLabelClass} htmlFor="expense-account">{t('bankAccountLabel')}</label>
                      <Select
                        value={expenseWizardAccountId}
                        onValueChange={(value) => updateExpenseWizard({ accountId: value === 'none' ? '' : value })}
                      >
                        <SelectTrigger
                          id="expense-account"
                          className={`w-full ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-800'}`}
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                          <SelectItem value="none">{t('bankAccountNoneLabel')}</SelectItem>
                          {expenseWizardAccounts.map((account) => (
                            <SelectItem key={account.id} value={account.id}>
                              {account.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {expenseWizard.step === 2 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className={wizardLabelClass} htmlFor="expense-category">{t('categoryLabel')}</label>
                    <Select
                      value={expenseWizard.categoryOverrideId || 'auto'}
                      onValueChange={(value) => updateExpenseWizard({ categoryOverrideId: value === 'auto' ? '' : value })}
                    >
                      <SelectTrigger
                        id="expense-category"
                        className={`w-full ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200 text-slate-800'}`}
                      >
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                        <SelectItem value="auto">{t('categoryAutoLabel')}</SelectItem>
                        {AUTO_CATEGORIES.map(category => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.emoji} {languagePreference === 'fr' ? category.labels.fr : category.labels.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {expenseWizard.type === 'free' && (
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={expenseWizard.isRecurring}
                          onChange={(e) => {
                            const nextValue = e.target.checked;
                            updateExpenseWizard({
                              isRecurring: nextValue,
                              propagate: nextValue ? true : expenseWizard.propagate
                            });
                          }}
                          className="h-4 w-4 accent-emerald-500"
                        />
                        {t('installmentLabel')}
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={expenseWizard.propagate}
                          onChange={(e) => updateExpenseWizard({ propagate: e.target.checked })}
                          disabled={expenseWizard.isRecurring}
                          className="h-4 w-4 accent-emerald-500"
                        />
                        {t('expenseLinkLabel')}
                      </label>
                      {expenseWizard.isRecurring && (
                        <div className="flex items-center gap-2">
                          <input
                            type="number"
                            min={1}
                            value={expenseWizard.recurringMonths}
                            onChange={(e) => {
                              const nextValue = parseInt(e.target.value, 10);
                              updateExpenseWizard({
                                recurringMonths: Number.isFinite(nextValue) && nextValue > 0 ? nextValue : 1
                              });
                            }}
                            className={`w-20 px-2 py-1 border rounded text-right ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                          />
                          <span className="text-xs text-slate-500">
                            {t('startLabel')}: {expenseWizard.startMonth}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  {expenseWizard.mode === 'edit' && (
                    <button
                      type="button"
                      onClick={handleExpenseWizardDelete}
                      className={`${wizardButtonPadding} rounded-lg text-sm font-semibold ${
                        darkMode ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                      }`}
                    >
                      {t('deleteLabel')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeExpenseWizard}
                    className={`${wizardButtonPadding} rounded-lg text-sm font-semibold ${
                      darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t('cancelLabel')}
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  {expenseWizard.step === 2 && (
                    <button
                      type="button"
                      onClick={handleExpenseWizardBack}
                      className={`${wizardButtonPadding} rounded-lg text-sm font-semibold ${
                        darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t('onboardingBack')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={expenseWizard.step === 1 ? handleExpenseWizardNext : handleExpenseWizardSubmit}
                    className={`${wizardButtonPadding} rounded-lg text-sm font-semibold btn-gradient`}
                  >
                    {expenseWizard.step === 1
                      ? t('onboardingNext')
                      : (expenseWizard.mode === 'edit' ? t('updateButton') : t('addLabel'))}
                  </button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {jointWizard && (
          <Dialog
            open={Boolean(jointWizard)}
            onOpenChange={(open) => {
              if (!open) {
                closeJointWizard();
              }
            }}
          >
            <DialogContent
              className={`w-full max-w-md rounded-2xl shadow-lg ${wizardDialogSpacing} ${wizardDialogScroll} ${
                darkMode ? 'bg-slate-950/90 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
              } ${isCompactWizard ? 'left-0 top-0 translate-x-0 translate-y-0 max-w-none w-full h-[100dvh] max-h-none rounded-none' : ''}`}
            >
              <div className="space-y-1">
                {!isCompactWizard && (
                  <p className="text-sm uppercase tracking-wide text-slate-500">{t('jointAccountTitle')}</p>
                )}
                <h2 className="text-xl font-semibold">
                  {jointWizard.mode === 'edit' ? t('jointWizardEditTitle') : t('jointWizardTitle')}
                </h2>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className={wizardLabelClass} htmlFor="joint-date">{t('dateLabel')}</label>
                  <input
                    id="joint-date"
                    type="date"
                    value={jointWizard.date}
                    onChange={(e) => updateJointWizardField('date', e.target.value)}
                    className={`w-full px-3 ${wizardInputPadding} border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={wizardLabelClass}>{t('typeLabel')}</label>
                  <Select
                    value={jointWizard.type}
                    onValueChange={(value) => updateJointWizardField('type', value)}
                  >
                    <SelectTrigger
                      className={`w-full ${jointWizard.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'} ${
                        darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'
                      }`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value="deposit">{t('depositOptionLabel')}</SelectItem>
                      <SelectItem value="expense">{t('expenseOptionLabel')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className={wizardLabelClass} htmlFor="joint-description">{t('descriptionLabel')}</label>
                  <input
                    id="joint-description"
                    type="text"
                    value={jointWizard.description}
                    onChange={(e) => updateJointWizardField('description', e.target.value)}
                    className={`w-full px-3 ${wizardInputPadding} border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={wizardLabelClass} htmlFor="joint-amount">{t('amountLabel')}</label>
                  <input
                    id="joint-amount"
                    type="number"
                    value={jointWizard.amount}
                    onChange={(e) => updateJointWizardField('amount', e.target.value)}
                    className={`w-full px-3 ${wizardInputPadding} border rounded-lg text-right ${
                      jointWizard.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'
                    } ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className={wizardLabelClass}>{t('personLabel')}</label>
                  <Select
                    value={jointWizard.person}
                    onValueChange={(value) => updateJointWizardField('person', value)}
                  >
                    <SelectTrigger
                      className={`w-full ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200 text-slate-800'}`}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className={darkMode ? 'bg-slate-950 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-800'}>
                      <SelectItem value={data.person1.name}>{data.person1.name}</SelectItem>
                      <SelectItem value={data.person2.name}>{data.person2.name}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2">
                <div className="flex items-center gap-2">
                  {jointWizard.mode === 'edit' && (
                    <button
                      type="button"
                      onClick={handleJointWizardDelete}
                      className={`${wizardButtonPadding} rounded-lg text-sm font-semibold ${
                        jointDeleteArmed
                          ? (darkMode ? 'bg-rose-500 text-white hover:bg-rose-400' : 'bg-rose-500 text-white hover:bg-rose-600')
                          : (darkMode ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' : 'bg-rose-100 text-rose-600 hover:bg-rose-200')
                      }`}
                    >
                      {jointDeleteArmed ? t('confirmDeleteLabel') : t('deleteLabel')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeJointWizard}
                    className={`${wizardButtonPadding} rounded-lg text-sm font-semibold ${
                      darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t('cancelLabel')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleJointWizardSubmit}
                  className={`${wizardButtonPadding} rounded-lg text-sm font-semibold btn-gradient`}
                >
                  {jointWizard.mode === 'edit' ? t('updateButton') : t('addLabel')}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {deleteMonthOpen && (
          <Dialog
            open={deleteMonthOpen}
            onOpenChange={(open) => {
              if (!open) {
                setDeleteMonthOpen(false);
                setDeleteMonthInput('');
              }
            }}
          >
            <DialogContent
              className={`w-full max-w-sm rounded-2xl p-6 space-y-4 shadow-lg ${
                darkMode ? 'bg-slate-950/90 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
              }`}
            >
              <div className="space-y-2">
                <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
                <h2 className="text-lg font-semibold">{t('deleteMonth')}</h2>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{t('deleteMonthConfirm')}</p>
                <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{t('deleteMonthPrompt')}</p>
              </div>
              <input
                type="text"
                value={deleteMonthInput}
                onChange={(e) => setDeleteMonthInput(e.target.value)}
                placeholder={deleteConfirmToken}
                className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
              />
              <div className="flex items-center justify-between gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeleteMonthOpen(false);
                    setDeleteMonthInput('');
                  }}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                    darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {t('cancelLabel')}
                </button>
                <button
                  type="button"
                  onClick={confirmDeleteCurrentMonth}
                  disabled={!isDeleteConfirmValid}
                  className={`px-3 py-2 rounded-lg text-sm font-semibold transition-all ${
                    isDeleteConfirmValid
                      ? (darkMode ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-red-600 text-white hover:bg-red-500')
                      : (darkMode ? 'bg-red-900/50 text-red-200/60' : 'bg-red-200 text-red-400')
                  }`}
                >
                  {t('confirmDeleteLabel')}
                </button>
              </div>
            </DialogContent>
          </Dialog>
        )}
        {toast && (
          <div
            className="fixed bottom-4 left-4 right-4 z-[70] sm:left-auto sm:right-6 sm:bottom-6 pointer-events-none"
            style={{ paddingBottom: 'var(--safe-bottom)' }}
            aria-live="polite"
          >
            <div
              className={`w-full sm:w-auto sm:min-w-[220px] rounded-xl px-4 py-2 text-sm font-semibold shadow-lg pointer-events-auto flex items-center gap-3 ${
                toast.tone === 'error'
                  ? (darkMode ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white')
                  : (darkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white')
              }`}
            >
              <span className="flex-1">{toast.message}</span>
              {toast.action && (
                <button
                  type="button"
                  onClick={() => {
                    toast.action?.onClick();
                    if (toastTimeoutRef.current) {
                      window.clearTimeout(toastTimeoutRef.current);
                      toastTimeoutRef.current = null;
                    }
                    setToast(null);
                  }}
                  className="px-2 py-1 text-xs font-semibold rounded-full border border-white/50 text-white hover:bg-white/15 transition whitespace-nowrap"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
          </div>
        )}
          </main>
        </div>
      </div>
    </TranslationContext.Provider>
  );
};

export default App;
