import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, Trash2, Edit2, Check, X, LayoutDashboard, Wallet, BarChart3, Settings, ArrowUpDown, Users, User, KeyRound, Globe2, Coins, GripVertical } from 'lucide-react';
import { DragDropContext, Droppable, Draggable, type DropResult } from 'react-beautiful-dnd';
import { Dialog, DialogContent } from './components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './components/ui/select';
import { LanguageCode, MONTH_LABELS, TRANSLATIONS, TranslationContext, createTranslator, useTranslation } from './i18n';
import Sidebar from './components/layout/Sidebar';
import HeaderBar from './components/layout/HeaderBar';
import packageJson from '../package.json';

interface Category {
  id: string;
  name: string;
  amount: number;
  icon?: string;
  categoryOverrideId?: string;
  isChecked?: boolean;
  isRecurring?: boolean;
  recurringMonths?: number;
  startMonth?: string; // format: "YYYY-MM"
}

interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  templateId?: string;
  categoryOverrideId?: string;
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

type AppSettings = {
  languagePreference: LanguageCode;
  soloModeEnabled: boolean;
  jointAccountEnabled: boolean;
  sortByCost: boolean;
  currencyPreference: 'EUR' | 'USD';
  oidcEnabled: boolean;
  oidcProviderName: string;
  oidcIssuer: string;
  oidcClientId: string;
  oidcClientSecret: string;
  oidcRedirectUri: string;
};

type ExpenseWizardState = {
  mode: 'create' | 'edit';
  step: 1 | 2;
  type: 'fixed' | 'free';
  personKey: 'person1' | 'person2';
  targetId?: string;
  name: string;
  amount: string;
  categoryOverrideId: string;
  isRecurring: boolean;
  recurringMonths: number;
  startMonth: string;
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

type AuthUser = {
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

const getAuthToken = () => {
  if (typeof window === 'undefined') {
    return null;
  }
  return localStorage.getItem('authToken');
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

const DEFAULT_FIXED_EXPENSE_LABELS = [
  normalizeIconLabel(TRANSLATIONS.fr.newFixedExpenseLabel),
  normalizeIconLabel(TRANSLATIONS.en.newFixedExpenseLabel)
];

const shouldPropagateFixedExpense = (name: string) => {
  const normalized = normalizeIconLabel(name);
  return Boolean(normalized) && !DEFAULT_FIXED_EXPENSE_LABELS.includes(normalized);
};

const createTemplateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
};

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

const getCategoryById = (id?: string | null) => {
  if (!id) {
    return null;
  }
  return AUTO_CATEGORY_BY_ID.get(id) ?? null;
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
  const [matches, setMatches] = useState(false);

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
  darkMode: boolean;
  sortByCost: boolean;
  enableDrag: boolean;
  palette: Palette;
  currencyPreference: 'EUR' | 'USD';
  editingName: string | null;
  tempName: string;
  setTempName: (value: string) => void;
  startEditingName: (personKey: 'person1' | 'person2') => void;
  saveName: (personKey: 'person1' | 'person2') => void;
  cancelEditingName: () => void;
  addIncomeSource: (personKey: 'person1' | 'person2') => void;
  deleteIncomeSource: (personKey: 'person1' | 'person2', id: string) => void;
  updateIncomeSource: (personKey: 'person1' | 'person2', id: string, field: 'name' | 'amount', value: string | number) => void;
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
  | 'darkMode'
  | 'sortByCost'
  | 'enableDrag'
  | 'palette'
  | 'currencyPreference'
  | 'openExpenseWizard'
  | 'openExpenseWizardForEdit'
  | 'updateFixedExpense'
  | 'reorderFixedExpenses'
>;

type BudgetFreeSectionProps = Pick<
  BudgetColumnProps,
  | 'person'
  | 'personKey'
  | 'darkMode'
  | 'sortByCost'
  | 'enableDrag'
  | 'palette'
  | 'currencyPreference'
  | 'openExpenseWizard'
  | 'openExpenseWizardForEdit'
  | 'updateCategory'
  | 'reorderCategories'
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

const PersonColumnHeader = React.memo(({
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
        {!isLinked && (
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
  darkMode,
  enableDrag,
  palette,
  currencyPreference,
  addIncomeSource,
  deleteIncomeSource,
  updateIncomeSource,
  reorderIncomeSources
}: BudgetHeaderSectionProps) => {
  const { t } = useTranslation();
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
  const canDrag = enableDrag;
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
            className="h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105"
            style={revenueButtonStyle}
            aria-label={t('addLabel')}
          >
            <Plus size={16} />
          </button>
        </div>
        {canDrag ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`income-${personKey}`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
                  {person.incomeSources.map((source, index) => (
                    <Draggable key={source.id} draggableId={`income-${personKey}-${source.id}`} index={index}>
                      {(dragProvided, snapshot) => (
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
                            onChange={(e) => updateIncomeSource(personKey, source.id, 'name', e.target.value)}
                            className={`flex-1 min-w-[10rem] px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                            placeholder={t('incomePlaceholder')}
                          />
                          <input
                            type="number"
                            value={coerceNumber(source.amount)}
                            onChange={(e) => updateIncomeSource(personKey, source.id, 'amount', parseNumberInput(e.target.value))}
                            className={`w-24 flex-none px-3 py-2 border rounded-lg text-right text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                          />
                          <button onClick={() => deleteIncomeSource(personKey, source.id)} className="text-red-500 hover:text-red-600">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        ) : (
          <div className="space-y-2">
            {person.incomeSources.map(source => (
              <div key={source.id} className={`flex flex-wrap items-center gap-2 ${darkMode ? 'bg-slate-900/60' : 'bg-white/90'} p-2 rounded-lg border ${darkMode ? 'border-slate-800' : 'border-slate-100'}`}>
                <input
                  type="text"
                  value={source.name}
                  onChange={(e) => updateIncomeSource(personKey, source.id, 'name', e.target.value)}
                  className={`flex-1 min-w-[10rem] px-3 py-2 border rounded-lg text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                  placeholder={t('incomePlaceholder')}
                />
                <input
                  type="number"
                  value={coerceNumber(source.amount)}
                  onChange={(e) => updateIncomeSource(personKey, source.id, 'amount', parseNumberInput(e.target.value))}
                  className={`w-24 flex-none px-3 py-2 border rounded-lg text-right text-sm ${darkMode ? 'bg-slate-950 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                />
                <button onClick={() => deleteIncomeSource(personKey, source.id)} className="text-red-500 hover:text-red-600">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
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
          className={`flex justify-between font-semibold ${available < 0 ? 'text-red-600' : ''}`}
          style={available < 0 ? undefined : { color: revenueTone.text }}
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
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
  openExpenseWizard,
  openExpenseWizardForEdit,
  updateFixedExpense,
  reorderFixedExpenses
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
      color: fixedTone.text,
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)'
    }),
    [darkMode, fixedTone.text]
  );
  const canDrag = enableDrag && !sortByCost;
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderFixedExpenses(personKey, result.source.index, result.destination.index);
  }, [personKey, reorderFixedExpenses]);

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
          className="h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105"
          style={fixedButtonStyle}
          aria-label={t('addRowLabel')}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className={`rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-100 bg-white/90 text-slate-800'}`}>
        {orderedExpenses.length === 0 ? (
          <div className="py-6" />
        ) : canDrag ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`fixed-${personKey}`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {orderedExpenses.map((expense, index) => {
                    const amountValue = coerceNumber(expense.amount);
                    const resolvedCategory = expense.categoryOverrideId
                      ? getCategoryById(expense.categoryOverrideId)
                      : getAutoCategory(expense.name);
                    const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
                    const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
                    return (
                      <Draggable key={expense.id} draggableId={`fixed-${personKey}-${expense.id}`} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`px-2 py-2 ${snapshot.isDragging ? (darkMode ? 'bg-slate-900/80' : 'bg-slate-50') : ''}`}
                            style={dragProvided.draggableProps.style}
                          >
                            <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'}`}>
                              <span
                                {...dragProvided.dragHandleProps}
                                className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                                aria-label={t('dragHandleLabel')}
                              >
                                <GripVertical size={14} />
                              </span>
                              <input
                                type="checkbox"
                                checked={expense.isChecked || false}
                                onChange={(e) => updateFixedExpense(personKey, expense.id, 'isChecked', e.target.checked)}
                                className="h-4 w-4"
                                style={{ accentColor: fixedTone.border }}
                                aria-label={t('validateExpenseLabel')}
                              />
                              <span className={`flex-1 text-sm truncate ${expense.isChecked ? 'line-through opacity-70' : ''}`}>
                                {expense.name || t('newFixedExpenseLabel')}
                              </span>
                              {resolvedCategory && badgeClass && (
                                <span className={badgeClass}>
                                  <span>{resolvedCategory.emoji}</span>
                                  <span>{categoryLabel}</span>
                                </span>
                              )}
                              <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                                {formatCurrency(amountValue, currencyPreference)}
                              </span>
                              <button
                                type="button"
                                onClick={() => openExpenseWizardForEdit(personKey, 'fixed', expense)}
                                className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80`}
                                aria-label={t('editLabel')}
                              >
                                <Edit2 size={14} />
                              </button>
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
          </DragDropContext>
        ) : (
          <div className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
            {orderedExpenses.map((expense) => {
              const amountValue = coerceNumber(expense.amount);
              const resolvedCategory = expense.categoryOverrideId
                ? getCategoryById(expense.categoryOverrideId)
                : getAutoCategory(expense.name);
              const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
              const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
              return (
                <div key={expense.id} className="px-2 py-2">
                  <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={expense.isChecked || false}
                      onChange={(e) => updateFixedExpense(personKey, expense.id, 'isChecked', e.target.checked)}
                      className="h-4 w-4"
                      style={{ accentColor: fixedTone.border }}
                      aria-label={t('validateExpenseLabel')}
                    />
                    <span className={`flex-1 text-sm truncate ${expense.isChecked ? 'line-through opacity-70' : ''}`}>
                      {expense.name || t('newFixedExpenseLabel')}
                    </span>
                    {resolvedCategory && badgeClass && (
                      <span className={badgeClass}>
                        <span>{resolvedCategory.emoji}</span>
                        <span>{categoryLabel}</span>
                      </span>
                    )}
                    <span className={`ml-1.5 text-sm font-semibold tabular-nums ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
                      {formatCurrency(amountValue, currencyPreference)}
                    </span>
                    <button
                      type="button"
                      onClick={() => openExpenseWizardForEdit(personKey, 'fixed', expense)}
                      className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80`}
                      aria-label={t('editLabel')}
                    >
                      <Edit2 size={14} />
                    </button>
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
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
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
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
  openExpenseWizard,
  openExpenseWizardForEdit,
  updateCategory,
  reorderCategories
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
      color: freeTone.text,
      backgroundColor: darkMode ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.7)'
    }),
    [darkMode, freeTone.text]
  );
  const canDrag = enableDrag && !sortByCost;
  const handleDragEnd = useCallback((result: DropResult) => {
    if (!result.destination) {
      return;
    }
    if (result.destination.index === result.source.index) {
      return;
    }
    reorderCategories(personKey, result.source.index, result.destination.index);
  }, [personKey, reorderCategories]);

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
          className="h-8 w-8 rounded-full border flex items-center justify-center transition hover:scale-105"
          style={freeButtonStyle}
          aria-label={t('addRowLabel')}
        >
          <Plus size={16} />
        </button>
      </div>
      <div className={`rounded-xl border ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-100' : 'border-slate-100 bg-white/90 text-slate-800'}`}>
        {orderedCategories.length === 0 ? (
          <div className="py-6" />
        ) : canDrag ? (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId={`free-${personKey}`}>
              {(provided) => (
                <div ref={provided.innerRef} {...provided.droppableProps} className={`divide-y ${darkMode ? 'divide-slate-800' : 'divide-slate-100'}`}>
                  {orderedCategories.map((category, index) => {
                    const amountValue = coerceNumber(category.amount);
                    const resolvedCategory = category.categoryOverrideId
                      ? getCategoryById(category.categoryOverrideId)
                      : getAutoCategory(category.name);
                    const categoryLabel = resolvedCategory ? (language === 'fr' ? resolvedCategory.labels.fr : resolvedCategory.labels.en) : null;
                    const recurringLabel = category.isRecurring ? `${category.recurringMonths || 3}x` : null;
                    const badgeClass = resolvedCategory ? getCategoryBadgeClass(resolvedCategory.id, darkMode) : null;
                    return (
                      <Draggable key={category.id} draggableId={`free-${personKey}-${category.id}`} index={index}>
                        {(dragProvided, snapshot) => (
                          <div
                            ref={dragProvided.innerRef}
                            {...dragProvided.draggableProps}
                            className={`px-2 py-2 ${snapshot.isDragging ? (darkMode ? 'bg-slate-900/80' : 'bg-slate-50') : ''}`}
                            style={dragProvided.draggableProps.style}
                          >
                            <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'}`}>
                              <span
                                {...dragProvided.dragHandleProps}
                                className={`cursor-grab select-none ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}
                                aria-label={t('dragHandleLabel')}
                              >
                                <GripVertical size={14} />
                              </span>
                              <input
                                type="checkbox"
                                checked={category.isChecked || false}
                                onChange={(e) => updateCategory(personKey, category.id, 'isChecked', e.target.checked)}
                                className="h-4 w-4"
                                style={{ accentColor: freeTone.border }}
                                aria-label={t('validateExpenseLabel')}
                              />
                              <span className={`flex-1 text-sm truncate ${category.isChecked ? 'line-through opacity-70' : ''}`}>
                                {category.name || t('newCategoryLabel')}
                              </span>
                              {resolvedCategory && badgeClass && (
                                <span className={badgeClass}>
                                  <span>{resolvedCategory.emoji}</span>
                                  <span>{categoryLabel}</span>
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
                                onClick={() => openExpenseWizardForEdit(personKey, 'free', category)}
                                className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80`}
                                aria-label={t('editLabel')}
                              >
                                <Edit2 size={14} />
                              </button>
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
          </DragDropContext>
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
              return (
                <div key={category.id} className="px-2 py-2">
                  <div className={`flex items-center gap-2 rounded-lg px-2 py-1.5 transition ${darkMode ? 'hover:bg-slate-900/70' : 'hover:bg-slate-50'}`}>
                    <input
                      type="checkbox"
                      checked={category.isChecked || false}
                      onChange={(e) => updateCategory(personKey, category.id, 'isChecked', e.target.checked)}
                      className="h-4 w-4"
                      style={{ accentColor: freeTone.border }}
                      aria-label={t('validateExpenseLabel')}
                    />
                    <span className={`flex-1 text-sm truncate ${category.isChecked ? 'line-through opacity-70' : ''}`}>
                      {category.name || t('newCategoryLabel')}
                    </span>
                    {resolvedCategory && badgeClass && (
                      <span className={badgeClass}>
                        <span>{resolvedCategory.emoji}</span>
                        <span>{categoryLabel}</span>
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
                      onClick={() => openExpenseWizardForEdit(personKey, 'free', category)}
                      className={`p-1 rounded ${darkMode ? 'text-slate-200' : 'text-slate-500'} hover:opacity-80`}
                      aria-label={t('editLabel')}
                    >
                      <Edit2 size={14} />
                    </button>
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
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
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

const BudgetColumn = React.memo(({
  person,
  personKey,
  darkMode,
  sortByCost,
  enableDrag,
  palette,
  currencyPreference,
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
      darkMode={darkMode}
      sortByCost={sortByCost}
      enableDrag={enableDrag}
      palette={palette}
      currencyPreference={currencyPreference}
      openExpenseWizard={openExpenseWizard}
      openExpenseWizardForEdit={openExpenseWizardForEdit}
      updateFixedExpense={updateFixedExpense}
      reorderFixedExpenses={reorderFixedExpenses}
    />
    <BudgetFreeSection
      person={person}
      personKey={personKey}
      darkMode={darkMode}
      sortByCost={sortByCost}
      enableDrag={enableDrag}
      palette={palette}
      currencyPreference={currencyPreference}
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
  onLogin: (username: string, password: string) => Promise<void> | void;
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
  const resolvedProviderName = oidcProviderName.trim() || 'OIDC';

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void onLogin(username.trim(), password);
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
        <div className="space-y-1">
          <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
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
              className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
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
              className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
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
  onCreateAdmin
}: OnboardingWizardProps) => {
  const { t } = useTranslation();
  const [step, setStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [adminForm, setAdminForm] = useState({ username: 'admin', password: '', confirm: '' });
  const [modeChoice, setModeChoice] = useState<'solo' | 'duo'>(soloModeEnabled ? 'solo' : 'duo');
  const [person1Name, setPerson1Name] = useState('');
  const [person2Name, setPerson2Name] = useState('');
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

  const handleFinish = () => {
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
            <div className="flex items-center justify-between">
              <button type="button" onClick={handleBack} className="text-sm font-semibold text-slate-500">
                {t('onboardingBack')}
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="px-4 py-2 rounded-md font-semibold btn-gradient"
              >
                {t('onboardingFinish')}
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

type SettingsViewProps = {
  user: AuthUser | null;
  fallbackUsername: string;
  darkMode: boolean;
  onAuthFailure: (error: unknown) => boolean;
  onProfileUpdated: (user: AuthUser) => void;
  onUserLabelUpdate: (userId: string, label: string) => void;
  sortByCost: boolean;
  onToggleSortByCost: (value: boolean) => void;
  languagePreference: LanguageCode;
  onLanguagePreferenceChange: (value: LanguageCode) => void;
  jointAccountEnabled: boolean;
  onToggleJointAccountEnabled: (value: boolean) => void;
  soloModeEnabled: boolean;
  onToggleSoloModeEnabled: (value: boolean) => void;
  currencyPreference: 'EUR' | 'USD';
  onCurrencyPreferenceChange: (value: 'EUR' | 'USD') => void;
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
  languagePreference,
  onLanguagePreferenceChange,
  jointAccountEnabled,
  onToggleJointAccountEnabled,
  soloModeEnabled,
  onToggleSoloModeEnabled,
  currencyPreference,
  onCurrencyPreferenceChange,
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
  const activeToggleClass = 'bg-emerald-500';
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' });
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [avatarInput, setAvatarInput] = useState(user?.avatarUrl ?? '');
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarUploadLoading, setAvatarUploadLoading] = useState(false);
  const [oidcLinkLoading, setOidcLinkLoading] = useState(false);
  const [oidcLinkError, setOidcLinkError] = useState<string | null>(null);
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

  const ToggleRow = ({
    icon: Icon,
    label,
    hint,
    checked,
    onChange,
    disabled = false
  }: {
    icon: React.ComponentType<{ size?: number | string }>;
    label: string;
    hint?: string;
    checked: boolean;
    onChange: (next: boolean) => void;
    disabled?: boolean;
  }) => (
    <div
      className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${
        darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'
      } ${disabled ? 'opacity-60' : ''}`}
    >
      <div className="flex items-center gap-3">
        <span className={`h-9 w-9 rounded-full flex items-center justify-center ${
          darkMode ? 'bg-slate-800 text-slate-100' : 'bg-emerald-50 text-emerald-700'
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
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
          checked ? activeToggleClass : (darkMode ? 'bg-slate-700' : 'bg-slate-200')
        } ${disabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span
          className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
            checked ? 'translate-x-5' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );

  const SelectRow = ({
    icon: Icon,
    label,
    value,
    onChange,
    options
  }: {
    icon: React.ComponentType<{ size?: number | string }>;
    label: string;
    value: string;
    onChange: (next: string) => void;
    options: Array<{ value: string; label: string }>;
  }) => (
    <div className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
      <div className="flex items-center gap-3">
        <span className={`h-9 w-9 rounded-full flex items-center justify-center ${
          darkMode ? 'bg-slate-800 text-slate-100' : 'bg-emerald-50 text-emerald-700'
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
              className={darkMode ? 'focus:bg-slate-800 focus:text-slate-100' : 'focus:bg-emerald-50 focus:text-emerald-700'}
            >
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );

  useEffect(() => {
    setAvatarInput(user?.avatarUrl ?? '');
    setAvatarFile(null);
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

  const handleAvatarUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarLoading(true);
    try {
      const trimmed = avatarInput.trim();
      const updated = await updateProfileRequest({
        avatarUrl: trimmed ? trimmed : null
      });
      onProfileUpdated(updated);
      setAvatarSuccess(t('profileImageUpdated'));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setAvatarError(resolveErrorMessage(error, t('profileImageError')));
      }
    } finally {
      setAvatarLoading(false);
    }
  };

  const handleAvatarUpload = async () => {
    if (!avatarFile) {
      setAvatarError(t('profileImageUploadError'));
      return;
    }
    setAvatarError(null);
    setAvatarSuccess(null);
    setAvatarUploadLoading(true);
    try {
      const updated = await uploadProfileImageRequest(avatarFile);
      onProfileUpdated(updated);
      setAvatarInput(updated.avatarUrl ?? '');
      setAvatarFile(null);
      setAvatarSuccess(t('profileImageUploadSuccess'));
    } catch (error) {
      if (!onAuthFailure(error)) {
        setAvatarError(resolveErrorMessage(error, t('profileImageUploadError')));
      }
    } finally {
      setAvatarUploadLoading(false);
    }
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
              <div className={`h-12 w-12 rounded-full flex items-center justify-center overflow-hidden ${darkMode ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                {avatarInput.trim() ? (
                  <img src={resolveAssetUrl(avatarInput.trim()) ?? ''} alt={displayName} className="h-full w-full object-cover" />
                ) : (
                  <span className="text-lg font-semibold">{profileInitial}</span>
                )}
              </div>
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
              <form onSubmit={handleAvatarUpdate} className={`rounded-xl border px-4 py-3 text-sm ${darkMode ? 'border-slate-800 bg-slate-950/40 text-slate-200' : 'border-slate-100 bg-white/90 text-slate-700'}`}>
                <div className="flex flex-wrap items-center gap-4">
                  <div className={`h-14 w-14 rounded-full flex items-center justify-center overflow-hidden ${darkMode ? 'bg-slate-800 text-white' : 'bg-emerald-50 text-emerald-700'}`}>
                    {avatarInput.trim() ? (
                      <img src={resolveAssetUrl(avatarInput.trim()) ?? ''} alt={displayName} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-lg font-semibold">{profileInitial}</span>
                    )}
                  </div>
                  <div className="flex-1 min-w-[12rem] space-y-1">
                    <label className={darkMode ? 'text-slate-300' : 'text-slate-600'}>{t('profileImageLabel')}</label>
                    <input
                      type="url"
                      value={avatarInput}
                      onChange={(event) => setAvatarInput(event.target.value)}
                      className={`w-full px-3 py-2 rounded-lg border text-sm ${darkMode ? 'bg-slate-900 border-slate-700 text-white' : 'bg-white border-slate-200'}`}
                      placeholder={t('profileImageUrlPlaceholder')}
                    />
                    <div className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
                      {t('profileImageHint')}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-3">
                      <input
                        type="file"
                        accept="image/*"
                        onChange={(event) => setAvatarFile(event.target.files?.[0] ?? null)}
                        className={`text-xs ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}
                      />
                      <button
                        type="button"
                        onClick={handleAvatarUpload}
                        disabled={avatarUploadLoading || !avatarFile}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold pill-emerald ${avatarUploadLoading || !avatarFile ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        {avatarUploadLoading ? t('profileImageUploadLoading') : t('profileImageUploadButton')}
                      </button>
                      {avatarFile && (
                        <span className={darkMode ? 'text-slate-400 text-xs' : 'text-slate-500 text-xs'}>
                          {avatarFile.name}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    type="submit"
                    disabled={avatarLoading}
                    className={`px-4 py-2 rounded-full font-semibold pill-emerald ${avatarLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
                  >
                    {avatarLoading ? t('profileImageSaving') : t('profileImageSaveButton')}
                  </button>
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
              </form>
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
            <h3 className="text-lg font-semibold">{t('settingsSectionTitle')}</h3>
            <div className="space-y-3">
              <ToggleRow
                icon={ArrowUpDown}
                label={t('sortExpensesLabel')}
                hint={t('fixedFreeLabel')}
                checked={sortByCost}
                onChange={onToggleSortByCost}
              />
              <ToggleRow
                icon={Users}
                label={t('jointAccountSettingLabel')}
                hint={t('jointAccountSettingHint')}
                checked={jointAccountEnabled}
                onChange={onToggleJointAccountEnabled}
              />
              <ToggleRow
                icon={User}
                label={t('soloModeSettingLabel')}
                hint={t('soloModeSettingHint')}
                checked={soloModeEnabled}
                onChange={onToggleSoloModeEnabled}
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
              />
              {isAdmin && (
                <>
                  <ToggleRow
                    icon={KeyRound}
                    label={t('oidcSectionTitle')}
                    checked={oidcEnabled}
                    onChange={onOidcEnabledChange}
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
                </>
              )}
            </div>
          </section>

          {isAdmin && (
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
          )}

          {isAdmin && (
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
                                  <label className="inline-flex items-center gap-2">
                                    <input
                                      type="checkbox"
                                      checked={item.isActive}
                                      disabled={Boolean(userActionId) || isSelf}
                                      onChange={(event) => handleActiveChange(item.id, event.target.checked)}
                                      className="h-4 w-4 accent-emerald-500"
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
          )}
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
  const [currencyPreference, setCurrencyPreference] = useState<'EUR' | 'USD'>(() => getInitialCurrencyPreference());
  const [oidcEnabled, setOidcEnabled] = useState(false);
  const [oidcProviderName, setOidcProviderName] = useState('');
  const [oidcIssuer, setOidcIssuer] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');
  const [oidcRedirectUri, setOidcRedirectUri] = useState('');
  const [latestVersion, setLatestVersion] = useState<string | null>(null);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [oidcLoginConfig, setOidcLoginConfig] = useState<OidcConfigResponse | null>(null);
  const [paletteId, setPaletteId] = useState(() => {
    if (typeof window === 'undefined') {
      return PALETTES[0].id;
    }
    return localStorage.getItem('paletteId') ?? PALETTES[0].id;
  });
  const [expenseWizard, setExpenseWizard] = useState<ExpenseWizardState | null>(null);
  const [jointWizard, setJointWizard] = useState<JointWizardState | null>(null);
  const [jointDeleteArmed, setJointDeleteArmed] = useState(false);
  const [toast, setToast] = useState<{ message: string; tone?: 'success' | 'error' } | null>(null);
  const [deleteMonthOpen, setDeleteMonthOpen] = useState(false);
  const [deleteMonthInput, setDeleteMonthInput] = useState('');

  const [monthlyBudgets, setMonthlyBudgets] = useState<MonthlyBudget>({});
  const [isHydrated, setIsHydrated] = useState(false);
  const saveTimeoutRef = useRef<number | null>(null);
  const lastSavedPayloadRef = useRef<Record<string, string>>({});
  const lastSavedSettingsRef = useRef<string | null>(null);
  const oidcHandledRef = useRef(false);
  const jointDeleteTimerRef = useRef<number | null>(null);
  const toastTimeoutRef = useRef<number | null>(null);

  const palette = useMemo(() => getPaletteById(paletteId), [paletteId]);
  const jointTone = useMemo(() => getPaletteTone(palette, 3, darkMode), [palette, darkMode]);
  const isDefaultPalette = palette.id === 'default';
  const t = useMemo(() => createTranslator(languagePreference), [languagePreference]);
  const isBudgetView = activePage === 'budget';
  const isSettingsView = activePage === 'settings';
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
  const data = useMemo(
    () => monthlyBudgets[currentMonthKey] || getDefaultBudgetData(),
    [currentMonthKey, monthlyBudgets]
  );
  const person1UserId = data.person1UserId ?? null;
  const person2UserId = data.person2UserId ?? null;
  const isPerson1Linked = Boolean(person1UserId);
  const isPerson2Linked = Boolean(person2UserId);
  const availableMonthKeys = useMemo(() => Object.keys(monthlyBudgets).sort(), [monthlyBudgets]);
  const monthOptions = useMemo(() => MONTH_LABELS[languagePreference], [languagePreference]);
  const formatMonthKey = useCallback((monthKey: string) => {
    const [year, month] = monthKey.split('-');
    const monthIndex = Number(month) - 1;
    const monthLabel = monthOptions[monthIndex] ?? monthKey;
    return `${monthLabel} ${year}`;
  }, [monthOptions]);
  const breadcrumbItems = useMemo(() => (
    isBudgetView
      ? [t('appName'), t('budgetLabel'), formatMonthKey(currentMonthKey)]
      : isSettingsView
        ? [t('appName'), t('settingsLabel'), t('profileTitle')]
        : [t('appName'), pageLabel]
  ), [currentMonthKey, formatMonthKey, isBudgetView, isSettingsView, pageLabel, t]);
  const pageStyle = useMemo(() => ({
    backgroundColor: darkMode ? '#0b1220' : '#fbf7f2',
    backgroundImage: darkMode
      ? 'radial-gradient(1200px circle at 85% -10%, rgba(255,255,255,0.08), transparent 45%), radial-gradient(900px circle at 0% 100%, rgba(255,255,255,0.06), transparent 50%)'
      : 'radial-gradient(1200px circle at 15% -15%, rgba(31,157,106,0.12), transparent 45%), radial-gradient(900px circle at 90% 5%, rgba(242,123,99,0.10), transparent 50%)'
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
    currencyPreference,
    oidcEnabled,
    oidcProviderName,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcRedirectUri,
    ...overrides
  });

  const applyLoginResult = (result: LoginResponse) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('authToken', result.token);
      localStorage.setItem('authUser', result.user.username);
    }
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

  useEffect(() => {
    return () => {
      if (jointDeleteTimerRef.current) {
        window.clearTimeout(jointDeleteTimerRef.current);
      }
      if (toastTimeoutRef.current) {
        window.clearTimeout(toastTimeoutRef.current);
      }
    };
  }, []);

  const handleLogin = async (username: string, password: string) => {
    if (!username || !password) {
      setAuthError(t('authRequiredError'));
      return;
    }
    setAuthLoading(true);
    setAuthError(null);
    try {
      const result = await loginRequest(username, password);
      applyLoginResult(result);
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
    localStorage.setItem('currencyPreference', currencyPreference);
  }, [currencyPreference]);

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
    void updateAppSettingsRequest(payload)
      .then((settings) => {
        lastSavedSettingsRef.current = JSON.stringify(settings);
      })
      .catch((error) => {
        lastSavedSettingsRef.current = previous;
        console.error('Failed to update settings', error);
      });
  }, [
    authToken,
    settingsLoaded,
    showOnboarding,
    languagePreference,
    soloModeEnabled,
    jointAccountEnabled,
    sortByCost,
    currencyPreference,
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
        setLanguagePreference(settings.languagePreference);
        setCurrencyPreference(settings.currencyPreference ?? 'EUR');
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
      id: Date.now().toString() + Math.random()
    }));
    newData.person2.incomeSources = previousData.person2.incomeSources.map(src => ({
      ...src,
      id: Date.now().toString() + Math.random()
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
      isChecked: overrides.isChecked ?? false
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

  const reorderFixedExpenses = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        fixedExpenses: reorderList(prev[personKey].fixedExpenses, sourceIndex, destinationIndex)
      }
    }));
  };

  const addCategory = (personKey: 'person1' | 'person2', overrides: Partial<Category> = {}) => {
    const newCategory: Category = {
      id: Date.now().toString(),
      name: overrides.name ?? t('newCategoryLabel'),
      amount: overrides.amount ?? 0,
      categoryOverrideId: overrides.categoryOverrideId ?? '',
      isChecked: overrides.isChecked ?? false,
      isRecurring: overrides.isRecurring ?? false,
      recurringMonths: overrides.recurringMonths,
      startMonth: overrides.startMonth
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

  const reorderCategories = (personKey: 'person1' | 'person2', sourceIndex: number, destinationIndex: number) => {
    setData(prev => ({
      ...prev,
      [personKey]: {
        ...prev[personKey],
        categories: reorderList(prev[personKey].categories, sourceIndex, destinationIndex)
      }
    }));
  };

  const openExpenseWizard = (personKey: 'person1' | 'person2', type: 'fixed' | 'free') => {
    setExpenseWizard({
      mode: 'create',
      step: 1,
      type,
      personKey,
      name: '',
      amount: '',
      categoryOverrideId: '',
      isRecurring: false,
      recurringMonths: 3,
      startMonth: currentMonthKey
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
    setExpenseWizard({
      mode: 'edit',
      step: 1,
      type,
      personKey,
      targetId: payload.id,
      name: payload.name ?? '',
      amount: String(amountValue),
      categoryOverrideId: payload.categoryOverrideId ?? '',
      isRecurring,
      recurringMonths,
      startMonth
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
    if (expenseWizard.mode === 'edit' && expenseWizard.targetId) {
      if (expenseWizard.type === 'fixed') {
        updateFixedExpense(expenseWizard.personKey, expenseWizard.targetId, 'name', name);
        updateFixedExpense(expenseWizard.personKey, expenseWizard.targetId, 'amount', amount);
        updateFixedExpense(expenseWizard.personKey, expenseWizard.targetId, 'categoryOverrideId', expenseWizard.categoryOverrideId);
      } else {
        updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'name', name);
        updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'amount', amount);
        updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'categoryOverrideId', expenseWizard.categoryOverrideId);
        updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'isRecurring', expenseWizard.isRecurring);
        if (expenseWizard.isRecurring) {
          updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'recurringMonths', expenseWizard.recurringMonths);
          updateCategory(expenseWizard.personKey, expenseWizard.targetId, 'startMonth', expenseWizard.startMonth);
        }
      }
    } else if (expenseWizard.type === 'fixed') {
      addFixedExpense(expenseWizard.personKey, {
        name,
        amount,
        categoryOverrideId: expenseWizard.categoryOverrideId
      });
    } else {
      addCategory(expenseWizard.personKey, {
        name,
        amount,
        categoryOverrideId: expenseWizard.categoryOverrideId,
        isRecurring: expenseWizard.isRecurring,
        recurringMonths: expenseWizard.isRecurring ? expenseWizard.recurringMonths : undefined,
        startMonth: expenseWizard.isRecurring ? expenseWizard.startMonth : undefined
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

  const showToast = (message: string, tone: 'success' | 'error' = 'success') => {
    setToast({ message, tone });
    if (toastTimeoutRef.current) {
      window.clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimeoutRef.current = null;
    }, 2600);
  };

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

  if (showOnboarding) {
    return (
      <TranslationContext.Provider value={{ t, language: languagePreference }}>
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
                setLanguagePreference(settings.languagePreference);
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
        />
      </TranslationContext.Provider>
    );
  }

  if (!authToken) {
    return (
      <TranslationContext.Provider value={{ t, language: languagePreference }}>
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

  return (
    <TranslationContext.Provider value={{ t, language: languagePreference }}>
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
              deleteMonthLabel={t('deleteMonth')}
              onRequestDeleteMonth={requestDeleteCurrentMonth}
              renderPaletteSelector={() => (
                <PaletteSelector
                  palettes={PALETTES}
                  value={palette.id}
                  onChange={setPaletteId}
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
            />

      {isBudgetView && selectorError && (
        <div className={`mb-4 text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>
          {selectorError}
        </div>
      )}

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
          languagePreference={languagePreference}
          onLanguagePreferenceChange={setLanguagePreference}
          currencyPreference={currencyPreference}
          onCurrencyPreferenceChange={setCurrencyPreference}
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
              enableDrag={enableDrag}
              palette={palette}
              currencyPreference={currencyPreference}
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
                  enableDrag={enableDrag}
                  palette={palette}
                  currencyPreference={currencyPreference}
                  addIncomeSource={addIncomeSource}
                  deleteIncomeSource={deleteIncomeSource}
                  updateIncomeSource={updateIncomeSource}
                  reorderIncomeSources={reorderIncomeSources}
                />
                <BudgetFixedSection
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  sortByCost={sortByCost}
                  enableDrag={enableDrag}
                  palette={palette}
                  currencyPreference={currencyPreference}
                  openExpenseWizard={openExpenseWizard}
                  openExpenseWizardForEdit={openExpenseWizardForEdit}
                  updateFixedExpense={updateFixedExpense}
                  reorderFixedExpenses={reorderFixedExpenses}
                />
                <BudgetFreeSection
                  person={data.person1}
                  personKey="person1"
                  darkMode={darkMode}
                  sortByCost={sortByCost}
                  enableDrag={enableDrag}
                  palette={palette}
                  currencyPreference={currencyPreference}
                  openExpenseWizard={openExpenseWizard}
                  openExpenseWizardForEdit={openExpenseWizardForEdit}
                  updateCategory={updateCategory}
                  reorderCategories={reorderCategories}
                />
              </div>
            </div>
          ) : (
            <div className="hidden sm:grid sm:grid-cols-2 sm:gap-6 sm:mb-6 w-full max-w-6xl mx-auto">
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
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                sortByCost={sortByCost}
                enableDrag={enableDrag}
                palette={palette}
                currencyPreference={currencyPreference}
                openExpenseWizard={openExpenseWizard}
                openExpenseWizardForEdit={openExpenseWizardForEdit}
                updateFixedExpense={updateFixedExpense}
                reorderFixedExpenses={reorderFixedExpenses}
              />
              <BudgetFixedSection
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                sortByCost={sortByCost}
                enableDrag={enableDrag}
                palette={palette}
                currencyPreference={currencyPreference}
                openExpenseWizard={openExpenseWizard}
                openExpenseWizardForEdit={openExpenseWizardForEdit}
                updateFixedExpense={updateFixedExpense}
                reorderFixedExpenses={reorderFixedExpenses}
              />
              <BudgetFreeSection
                person={data.person1}
                personKey="person1"
                darkMode={darkMode}
                sortByCost={sortByCost}
                enableDrag={enableDrag}
                palette={palette}
                currencyPreference={currencyPreference}
                openExpenseWizard={openExpenseWizard}
                openExpenseWizardForEdit={openExpenseWizardForEdit}
                updateCategory={updateCategory}
                reorderCategories={reorderCategories}
              />
              <BudgetFreeSection
                person={data.person2}
                personKey="person2"
                darkMode={darkMode}
                sortByCost={sortByCost}
                enableDrag={enableDrag}
                palette={palette}
                currencyPreference={currencyPreference}
                openExpenseWizard={openExpenseWizard}
                openExpenseWizardForEdit={openExpenseWizardForEdit}
                updateCategory={updateCategory}
                reorderCategories={reorderCategories}
              />
            </div>
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
                          {(provided) => (
                            <tbody ref={provided.innerRef} {...provided.droppableProps}>
                              {data.jointAccount.transactions.map((transaction, index) => (
                                <Draggable key={transaction.id} draggableId={`joint-${transaction.id}`} index={index}>
                                  {(dragProvided, snapshot) => (
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
              className={`w-full max-w-md rounded-2xl p-6 space-y-4 shadow-lg ${
                darkMode ? 'bg-slate-950/90 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm uppercase tracking-wide text-slate-500">{t('appName')}</p>
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
                    <label className="text-sm font-medium" htmlFor="expense-name">{t('expenseNameLabel')}</label>
                    <input
                      id="expense-name"
                      type="text"
                      value={expenseWizard.name}
                      onChange={(e) => updateExpenseWizard({ name: e.target.value })}
                      placeholder={expenseWizard.type === 'fixed' ? t('newFixedExpenseLabel') : t('newCategoryLabel')}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="expense-amount">{t('amountLabel')}</label>
                    <input
                      id="expense-amount"
                      type="number"
                      value={expenseWizard.amount}
                      onChange={(e) => updateExpenseWizard({ amount: e.target.value })}
                      className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                    />
                  </div>
                </div>
              )}

              {expenseWizard.step === 2 && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-sm font-medium" htmlFor="expense-category">{t('categoryLabel')}</label>
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
                          onChange={(e) => updateExpenseWizard({ isRecurring: e.target.checked })}
                          className="h-4 w-4 accent-emerald-500"
                        />
                        {t('installmentLabel')}
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
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                        darkMode ? 'bg-rose-500/20 text-rose-200 hover:bg-rose-500/30' : 'bg-rose-100 text-rose-600 hover:bg-rose-200'
                      }`}
                    >
                      {t('deleteLabel')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={closeExpenseWizard}
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${
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
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                        darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {t('onboardingBack')}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={expenseWizard.step === 1 ? handleExpenseWizardNext : handleExpenseWizardSubmit}
                    className="px-3 py-2 rounded-lg text-sm font-semibold btn-gradient"
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
              className={`w-full max-w-md rounded-2xl p-6 space-y-4 shadow-lg ${
                darkMode ? 'bg-slate-950/90 border border-slate-800 text-slate-100' : 'card-float text-slate-900'
              }`}
            >
              <div className="space-y-1">
                <p className="text-sm uppercase tracking-wide text-slate-500">{t('jointAccountTitle')}</p>
                <h2 className="text-xl font-semibold">
                  {jointWizard.mode === 'edit' ? t('jointWizardEditTitle') : t('jointWizardTitle')}
                </h2>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="joint-date">{t('dateLabel')}</label>
                  <input
                    id="joint-date"
                    type="date"
                    value={jointWizard.date}
                    onChange={(e) => updateJointWizardField('date', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('typeLabel')}</label>
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
                  <label className="text-sm font-medium" htmlFor="joint-description">{t('descriptionLabel')}</label>
                  <input
                    id="joint-description"
                    type="text"
                    value={jointWizard.description}
                    onChange={(e) => updateJointWizardField('description', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-slate-900 text-white border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium" htmlFor="joint-amount">{t('amountLabel')}</label>
                  <input
                    id="joint-amount"
                    type="number"
                    value={jointWizard.amount}
                    onChange={(e) => updateJointWizardField('amount', e.target.value)}
                    className={`w-full px-3 py-2 border rounded-lg text-right ${
                      jointWizard.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'
                    } ${darkMode ? 'bg-slate-900 border-slate-700' : 'bg-white border-slate-200'}`}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium">{t('personLabel')}</label>
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
                      className={`px-3 py-2 rounded-lg text-sm font-semibold ${
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
                    className={`px-3 py-2 rounded-lg text-sm font-semibold ${
                      darkMode ? 'bg-slate-900 text-slate-100 hover:bg-slate-800' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {t('cancelLabel')}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={handleJointWizardSubmit}
                  className="px-3 py-2 rounded-lg text-sm font-semibold btn-gradient"
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
              className={`w-full sm:w-auto sm:min-w-[220px] rounded-xl px-4 py-2 text-sm font-semibold shadow-lg ${
                toast.tone === 'error'
                  ? (darkMode ? 'bg-rose-600 text-white' : 'bg-rose-500 text-white')
                  : (darkMode ? 'bg-emerald-600 text-white' : 'bg-emerald-500 text-white')
              }`}
            >
              {toast.message}
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
