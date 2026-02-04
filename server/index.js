import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { Issuer, generators } from 'openid-client';
import { fileURLToPath } from 'url';
import { pool } from './db.js';

const app = express();
const port = process.env.PORT || 3001;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, 'uploads');
const avatarDir = path.join(uploadsDir, 'avatars');
fs.mkdirSync(avatarDir, { recursive: true });

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);
const getFrontendBase = () => allowedOrigins[0] || 'http://localhost:5173';

app.disable('x-powered-by');
app.use(cors({
  origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '10mb' }));
app.use('/uploads', express.static(uploadsDir));

const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const jwtSecret = process.env.JWT_SECRET;
const passwordResetTtlEnv = Number(process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES);
const passwordMinLengthEnv = Number(process.env.PASSWORD_MIN_LENGTH);
const passwordResetTtlMinutes = Number.isFinite(passwordResetTtlEnv) ? passwordResetTtlEnv : 60;
const passwordMinLength = Number.isFinite(passwordMinLengthEnv) ? passwordMinLengthEnv : 8;

const isValidMonthKey = (value) => {
  if (!/^\d{4}-\d{2}$/.test(value)) {
    return false;
  }
  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
};

const normalizeLogin = (value) => (value ?? '').trim().toLowerCase();
const capitalizeFirst = (value) => {
  if (!value) {
    return value;
  }
  return value[0].toUpperCase() + value.slice(1);
};
const normalizeDisplayName = (value) => {
  const trimmed = (value ?? '').trim();
  if (!trimmed) {
    return null;
  }
  return capitalizeFirst(trimmed);
};
const normalizeAvatarUrl = (value) => {
  const trimmed = (value ?? '').trim();
  return trimmed || null;
};

const DEFAULT_ACCOUNT_COLORS = ['#6366F1', '#10B981', '#F97316'];

const defaultSettings = {
  languagePreference: 'fr',
  soloModeEnabled: false,
  jointAccountEnabled: true,
  sortByCost: false,
  showSidebarMonths: true,
  budgetWidgetsEnabled: true,
  currencyPreference: 'EUR',
  sessionDurationHours: 12,
  oidcEnabled: false,
  oidcProviderName: '',
  oidcIssuer: '',
  oidcClientId: '',
  oidcClientSecret: '',
  oidcRedirectUri: '',
  bankAccountsEnabled: true,
  bankAccounts: {
    person1: [{ id: 'person1-1', name: 'Compte 1', color: DEFAULT_ACCOUNT_COLORS[0] }],
    person2: [{ id: 'person2-1', name: 'Compte 1', color: DEFAULT_ACCOUNT_COLORS[0] }]
  }
};

const dockerHubRepo = process.env.DOCKERHUB_REPO || 'homynudget/homybudget';
const dockerHubApiBase = 'https://hub.docker.com/v2/repositories';
const versionCache = { value: null, checkedAt: 0 };

const parseVersionTag = (tag) => {
  if (!tag) {
    return null;
  }
  const match = tag.match(/v?(\d+(?:\.\d+){0,2})/i);
  return match ? match[1] : null;
};

const compareVersions = (a, b) => {
  const partsA = a.split('.').map(Number);
  const partsB = b.split('.').map(Number);
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

const fetchLatestDockerVersion = async () => {
  const now = Date.now();
  if (versionCache.value && now - versionCache.checkedAt < 15 * 60 * 1000) {
    return versionCache.value;
  }
  const response = await fetch(`${dockerHubApiBase}/${dockerHubRepo}/tags?page_size=50&ordering=last_updated`);
  if (!response.ok) {
    throw new Error(`Docker Hub request failed: ${response.status}`);
  }
  const payload = await response.json();
  const versions = (payload.results || []).map(tag => {
    const version = parseVersionTag(tag.name);
    if (!version) {
      return null;
    }
    return {
      version,
      tag: tag.name,
      updatedAt: tag.last_updated
    };
  }).filter(Boolean);
  if (versions.length === 0) {
    return null;
  }
  const latest = versions.reduce((best, entry) => (
    compareVersions(entry.version, best.version) > 0 ? entry : best
  ));
  versionCache.value = latest;
  versionCache.checkedAt = now;
  return latest;
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const requiredTables = [
  'monthly_budgets',
  'users',
  'password_reset_tokens',
  'app_settings',
  'oauth_accounts'
];

const ensureSchema = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  let schemaSql = '';
  try {
    schemaSql = fs.readFileSync(schemaPath, 'utf8');
  } catch (error) {
    console.warn('Schema file not found, skipping init.', error);
    return;
  }
  if (!schemaSql.trim()) {
    return;
  }
  try {
    const existing = await pool.query(
      `select table_name
       from information_schema.tables
       where table_schema = 'public'
         and table_name = any($1::text[])`,
      [requiredTables]
    );
    if (!process.env.FORCE_SCHEMA_INIT && existing.rowCount > 0) {
      console.log('Database schema already present, skipping init.');
      return;
    }
  } catch (error) {
    console.warn('Schema presence check failed, continuing with init.', error);
  }
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      await pool.query(schemaSql);
      console.log('Database schema ready');
      return;
    } catch (error) {
      console.error(`Database schema init failed (attempt ${attempt})`, error);
      if (attempt === 10) {
        throw error;
      }
      await sleep(2000);
    }
  }
};

const ensureThemePreferenceColumn = async () => {
  try {
    const columnCheck = await pool.query(
      `select 1
       from information_schema.columns
       where table_schema = 'public'
         and table_name = 'users'
         and column_name = 'theme_preference'`
    );
    if (columnCheck.rowCount > 0) {
      return;
    }
    const ownerResult = await pool.query(
      `select tableowner
       from pg_tables
       where schemaname = 'public'
         and tablename = 'users'`
    );
    const currentResult = await pool.query('select current_user as name');
    const owner = ownerResult.rows[0]?.tableowner;
    const currentUser = currentResult.rows[0]?.name;
    if (!owner || !currentUser || owner !== currentUser) {
      console.warn('Missing theme_preference column; run migration as table owner to enable per-user theme.');
      return;
    }
    await pool.query(`alter table users add column if not exists theme_preference text not null default 'light'`);
  } catch (error) {
    console.warn('Failed to ensure theme_preference column', error);
  }
};

const normalizeSettings = (input) => {
  const next = {};
  const sessionHours = Number(input.sessionDurationHours);
  const normalizeBankAccountList = (list) => {
    if (!Array.isArray(list)) {
      return null;
    }
    const nextList = [];
    const used = new Set();
    list.forEach((item, index) => {
      if (nextList.length >= 3) {
        return;
      }
      const name = typeof item?.name === 'string' ? item.name.trim() : '';
      if (!name) {
        return;
      }
      let id = typeof item?.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID();
      if (used.has(id)) {
        id = crypto.randomUUID();
      }
      used.add(id);
      const rawColor = typeof item?.color === 'string' ? item.color.trim() : '';
      const color = /^#[0-9a-f]{6}$/i.test(rawColor)
        ? rawColor
        : DEFAULT_ACCOUNT_COLORS[index % DEFAULT_ACCOUNT_COLORS.length];
      nextList.push({ id, name, color });
    });
    return nextList;
  };
  const normalizeBankAccounts = (value) => {
    if (!value || typeof value !== 'object') {
      return null;
    }
    const person1 = normalizeBankAccountList(value.person1);
    const person2 = normalizeBankAccountList(value.person2);
    if (!person1 && !person2) {
      return null;
    }
    return {
      person1: person1 ?? [],
      person2: person2 ?? []
    };
  };
  if (input.languagePreference === 'fr' || input.languagePreference === 'en') {
    next.languagePreference = input.languagePreference;
  }
  if (input.soloModeEnabled !== undefined) {
    next.soloModeEnabled = Boolean(input.soloModeEnabled);
  }
  if (input.jointAccountEnabled !== undefined) {
    next.jointAccountEnabled = Boolean(input.jointAccountEnabled);
  }
  if (input.sortByCost !== undefined) {
    next.sortByCost = Boolean(input.sortByCost);
  }
  if (input.currencyPreference === 'EUR' || input.currencyPreference === 'USD') {
    next.currencyPreference = input.currencyPreference;
  }
  if (Number.isFinite(sessionHours)) {
    next.sessionDurationHours = Math.min(24, Math.max(1, Math.round(sessionHours)));
  }
  if (input.oidcEnabled !== undefined) {
    next.oidcEnabled = Boolean(input.oidcEnabled);
  }
  if (typeof input.oidcProviderName === 'string') {
    next.oidcProviderName = input.oidcProviderName.trim();
  }
  if (typeof input.oidcIssuer === 'string') {
    next.oidcIssuer = input.oidcIssuer.trim();
  }
  if (typeof input.oidcClientId === 'string') {
    next.oidcClientId = input.oidcClientId.trim();
  }
  if (typeof input.oidcClientSecret === 'string') {
    next.oidcClientSecret = input.oidcClientSecret.trim();
  }
  if (typeof input.oidcRedirectUri === 'string') {
    next.oidcRedirectUri = input.oidcRedirectUri.trim();
  }
  if (input.bankAccountsEnabled !== undefined) {
    next.bankAccountsEnabled = Boolean(input.bankAccountsEnabled);
  }
  const bankAccounts = normalizeBankAccounts(input.bankAccounts);
  if (bankAccounts) {
    next.bankAccounts = bankAccounts;
  }
  return next;
};

const oidcStateStore = new Map();
const oidcClientCache = { key: '', client: null };
const oidcStateTtlMs = 10 * 60 * 1000;

const resolveOidcSettings = (settings) => {
  if (!settings?.oidcEnabled) {
    return null;
  }
  const issuer = (settings.oidcIssuer || '').trim();
  const clientId = (settings.oidcClientId || '').trim();
  const redirectUri = (settings.oidcRedirectUri || '').trim();
  if (!issuer || !clientId || !redirectUri) {
    return null;
  }
  return {
    providerName: (settings.oidcProviderName || '').trim() || 'OIDC',
    issuer,
    clientId,
    clientSecret: (settings.oidcClientSecret || '').trim(),
    redirectUri
  };
};

const getOidcClient = async (settings) => {
  const cacheKey = [
    settings.issuer,
    settings.clientId,
    settings.clientSecret ? 'secret' : 'public',
    settings.redirectUri
  ].join('|');
  if (oidcClientCache.key === cacheKey && oidcClientCache.client) {
    return oidcClientCache.client;
  }
  const discovered = await Issuer.discover(settings.issuer);
  const client = new discovered.Client({
    client_id: settings.clientId,
    client_secret: settings.clientSecret || undefined,
    redirect_uris: [settings.redirectUri],
    response_types: ['code']
  });
  oidcClientCache.key = cacheKey;
  oidcClientCache.client = client;
  return client;
};

const cleanupOidcState = () => {
  const now = Date.now();
  for (const [state, data] of oidcStateStore.entries()) {
    if (now - data.createdAt > oidcStateTtlMs) {
      oidcStateStore.delete(state);
    }
  }
};

const createOidcState = (type, userId = null) => {
  cleanupOidcState();
  const state = generators.state();
  const nonce = generators.nonce();
  const codeVerifier = generators.codeVerifier();
  const codeChallenge = generators.codeChallenge(codeVerifier);
  oidcStateStore.set(state, {
    type,
    userId,
    codeVerifier,
    nonce,
    createdAt: Date.now()
  });
  return { state, nonce, codeVerifier, codeChallenge };
};

const findOauthAccount = async (issuer, subject) => {
  const result = await pool.query(
    'select * from oauth_accounts where issuer = $1 and subject = $2 limit 1',
    [issuer, subject]
  );
  return result.rows[0] ?? null;
};

const createOauthAccount = async ({ provider, issuer, subject, userId }) => {
  const id = crypto.randomUUID();
  const result = await pool.query(
    `insert into oauth_accounts (id, provider, issuer, subject, user_id, created_at)
     values ($1, $2, $3, $4, $5, now())
     returning *`,
    [id, provider, issuer, subject, userId]
  );
  return result.rows[0];
};

const getUserById = async (userId) => {
  const result = await pool.query(
    'select * from users where id = $1 limit 1',
    [userId]
  );
  return result.rows[0] ?? null;
};

const getAppSettings = async () => {
  const result = await pool.query('select data from app_settings where id = 1');
  if (result.rowCount > 0) {
    return result.rows[0].data;
  }
  const insert = await pool.query(
    'insert into app_settings (id, data, updated_at) values (1, $1, now()) returning data',
    [defaultSettings]
  );
  return insert.rows[0].data;
};

const updateAppSettings = async (updates) => {
  const current = await getAppSettings();
  const merged = { ...current, ...updates };
  const result = await pool.query(
    'update app_settings set data = $1, updated_at = now() where id = 1 returning data',
    [merged]
  );
  return result.rows[0].data;
};

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, avatarDir),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExt = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
      const resolvedExt = allowedExt.includes(ext) ? ext : '.png';
      const safeId = req.user?.id ?? crypto.randomUUID();
      cb(null, `${safeId}-${Date.now()}${resolvedExt}`);
    }
  }),
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  },
  limits: {
    fileSize: 5 * 1024 * 1024
  }
});

const validatePassword = (password) => {
  if (!password || password.length < passwordMinLength) {
    return `Password must be at least ${passwordMinLength} characters`;
  }
  return null;
};

const sanitizeUser = (user) => ({
  id: user.id,
  username: user.username,
  displayName: user.display_name,
  avatarUrl: user.avatar_url,
  themePreference: user.theme_preference || 'light',
  role: user.role,
  isActive: user.is_active,
  createdAt: user.created_at,
  lastLoginAt: user.last_login_at
});

const stripOidcSettings = (settings) => {
  if (!settings || typeof settings !== 'object') {
    return settings;
  }
  const {
    oidcEnabled,
    oidcProviderName,
    oidcIssuer,
    oidcClientId,
    oidcClientSecret,
    oidcRedirectUri,
    ...rest
  } = settings;
  return rest;
};

const sanitizeSettingsForUser = (settings, user) => {
  if (user?.role === 'admin') {
    return settings;
  }
  return {
    ...stripOidcSettings(settings),
    oidcEnabled: false,
    oidcProviderName: '',
    oidcIssuer: '',
    oidcClientId: '',
    oidcClientSecret: '',
    oidcRedirectUri: ''
  };
};

const resolveSessionDurationHours = (value) => {
  const hours = Number(value);
  if (!Number.isFinite(hours)) {
    return 12;
  }
  return Math.min(24, Math.max(1, Math.round(hours)));
};

const createAuthToken = (user, sessionDurationHours) => {
  if (!jwtSecret) {
    return null;
  }
  const hours = resolveSessionDurationHours(sessionDurationHours);
  return jwt.sign(
    { sub: user.id, username: user.username, role: user.role },
    jwtSecret,
    { expiresIn: `${hours}h` }
  );
};

const getUserByLogin = async (login) => {
  const normalized = normalizeLogin(login);
  if (!normalized) {
    return null;
  }
  const result = await pool.query(
    'select * from users where lower(username) = $1 limit 1',
    [normalized]
  );
  return result.rows[0] ?? null;
};

const createUser = async ({ username, displayName, password, role }) => {
  const id = crypto.randomUUID();
  const passwordHash = await bcrypt.hash(password, 10);
  const normalizedUsername = normalizeLogin(username);
  const resolvedDisplayName = normalizeDisplayName(displayName) ?? capitalizeFirst(normalizedUsername);
  const result = await pool.query(
    `insert into users (id, username, display_name, password_hash, role, created_at, updated_at)
     values ($1, $2, $3, $4, $5, now(), now())
     returning *`,
    [id, normalizedUsername, resolvedDisplayName, passwordHash, role]
  );
  return result.rows[0];
};

const maybeBootstrapAdmin = async (username, password) => {
  if (!adminUsername || !adminPassword) {
    return null;
  }
  if (normalizeLogin(username) !== normalizeLogin(adminUsername)) {
    return null;
  }
  if (password !== adminPassword) {
    return null;
  }
  const existing = await pool.query('select id from users limit 1');
  if (existing.rowCount > 0) {
    return null;
  }
  return createUser({
    username: adminUsername,
    displayName: 'Admin',
    password: adminPassword,
    role: 'admin'
  });
};

const createPasswordResetToken = async (userId) => {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + passwordResetTtlMinutes * 60 * 1000);
  await pool.query(
    `insert into password_reset_tokens (id, user_id, token_hash, expires_at, created_at)
     values ($1, $2, $3, $4, now())`,
    [crypto.randomUUID(), userId, tokenHash, expiresAt]
  );
  return { token, expiresAt };
};

const consumePasswordResetToken = async (token, newPassword) => {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const tokenResult = await pool.query(
    `select id, user_id from password_reset_tokens
     where token_hash = $1 and used_at is null and expires_at > now()
     order by created_at desc
     limit 1`,
    [tokenHash]
  );
  if (tokenResult.rowCount === 0) {
    return { ok: false, error: 'Invalid or expired token' };
  }
  const { id, user_id: userId } = tokenResult.rows[0];
  const passwordHash = await bcrypt.hash(newPassword, 10);
  await pool.query('update users set password_hash = $1, updated_at = now() where id = $2', [passwordHash, userId]);
  await pool.query('update password_reset_tokens set used_at = now() where id = $1', [id]);
  return { ok: true };
};

const authRequired = async (req, res, next) => {
  if (!jwtSecret) {
    res.status(500).json({ error: 'Auth not configured' });
    return;
  }
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, jwtSecret);
  } catch (error) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  try {
    const result = await pool.query(
      'select id, username, display_name, avatar_url, theme_preference, role, is_active, created_at, last_login_at from users where id = $1',
      [payload.sub]
    );
    if (result.rowCount === 0) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const user = result.rows[0];
    if (!user.is_active) {
      res.status(403).json({ error: 'Account disabled' });
      return;
    }
    req.user = user;
    next();
  } catch (error) {
    console.error('Auth lookup failed', error);
    res.status(500).json({ error: 'Auth lookup failed' });
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }
  next();
};

const loginHandler = async (req, res) => {
  if (!jwtSecret) {
    res.status(500).json({ error: 'Auth not configured' });
    return;
  }
  const { username, password } = req.body || {};
  if (!username || !password) {
    res.status(400).json({ error: 'Missing credentials' });
    return;
  }

  try {
    let user = await getUserByLogin(username);
    if (!user) {
      user = await maybeBootstrapAdmin(username, password);
    }
    if (!user) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    if (!user.is_active) {
      res.status(403).json({ error: 'Account disabled' });
      return;
    }
    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    await pool.query('update users set last_login_at = now(), updated_at = now() where id = $1', [user.id]);
    const settings = await getAppSettings();
    const token = createAuthToken(user, settings?.sessionDurationHours);
    res.json({ token, user: sanitizeUser(user) });
  } catch (error) {
    console.error('Login failed', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

app.post('/api/auth/bootstrap', async (req, res) => {
  const { username, password, displayName } = req.body || {};
  const bootstrapUsername = normalizeLogin(username || adminUsername);
  const bootstrapPassword = password || adminPassword;

  try {
    const existing = await pool.query('select id from users limit 1');
    if (existing.rowCount > 0) {
      res.status(403).json({ error: 'Bootstrap already completed' });
      return;
    }
    if (!bootstrapUsername || !bootstrapPassword) {
      res.status(400).json({ error: 'Missing credentials' });
      return;
    }
    const passwordError = validatePassword(bootstrapPassword);
    if (passwordError) {
      res.status(400).json({ error: passwordError });
      return;
    }
    const user = await createUser({
      username: bootstrapUsername,
      displayName,
      password: bootstrapPassword,
      role: 'admin'
    });
    res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Bootstrap failed', error);
    res.status(500).json({ error: 'Bootstrap failed' });
  }
});

app.get('/api/auth/bootstrap-status', async (_req, res) => {
  try {
    const result = await pool.query('select 1 from users limit 1');
    res.json({ hasUsers: result.rowCount > 0 });
  } catch (error) {
    console.error('Bootstrap status failed', error);
    res.status(500).json({ error: 'Bootstrap status failed' });
  }
});

app.post('/api/login', loginHandler);
app.post('/api/auth/login', loginHandler);

app.get('/api/auth/oidc/config', async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const oidc = resolveOidcSettings(settings);
    res.json({
      enabled: Boolean(oidc),
      providerName: oidc?.providerName ?? ''
    });
  } catch (error) {
    console.error('OIDC config load failed', error);
    res.status(500).json({ error: 'Failed to load OIDC config' });
  }
});

app.get('/api/auth/oidc/start', async (_req, res) => {
  try {
    const settings = await getAppSettings();
    const oidc = resolveOidcSettings(settings);
    if (!oidc) {
      res.status(400).json({ error: 'OIDC not configured' });
      return;
    }
    const client = await getOidcClient(oidc);
    const { state, nonce, codeChallenge } = createOidcState('login');
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      response_mode: 'query',
      redirect_uri: oidc.redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    res.redirect(url);
  } catch (error) {
    console.error('OIDC start failed', error);
    res.status(500).json({ error: 'OIDC start failed' });
  }
});

app.post('/api/auth/oidc/link', authRequired, async (req, res) => {
  try {
    const settings = await getAppSettings();
    const oidc = resolveOidcSettings(settings);
    if (!oidc) {
      res.status(400).json({ error: 'OIDC not configured' });
      return;
    }
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const client = await getOidcClient(oidc);
    const { state, nonce, codeChallenge } = createOidcState('link', userId);
    const url = client.authorizationUrl({
      scope: 'openid profile email',
      response_mode: 'query',
      redirect_uri: oidc.redirectUri,
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    });
    res.json({ url });
  } catch (error) {
    console.error('OIDC link start failed', error);
    res.status(500).json({ error: 'OIDC link failed' });
  }
});

app.get('/api/auth/oidc/callback', async (req, res) => {
  try {
    const settings = await getAppSettings();
    const oidc = resolveOidcSettings(settings);
    if (!oidc) {
      res.status(400).json({ error: 'OIDC not configured' });
      return;
    }
    const client = await getOidcClient(oidc);
    const params = client.callbackParams(req);
    const stored = params.state ? oidcStateStore.get(params.state) : null;
    if (!stored || !params.state) {
      res.status(400).json({ error: 'Invalid state' });
      return;
    }
    oidcStateStore.delete(params.state);
    if (Date.now() - stored.createdAt > oidcStateTtlMs) {
      res.redirect(`${getFrontendBase()}/?oidc=expired`);
      return;
    }

    const tokenSet = await client.callback(oidc.redirectUri, params, {
      code_verifier: stored.codeVerifier,
      state: params.state,
      nonce: stored.nonce
    });
    const claims = tokenSet.claims();
    const subject = claims?.sub;
    if (!subject) {
      res.redirect(`${getFrontendBase()}/?oidc=invalid`);
      return;
    }

    const account = await findOauthAccount(oidc.issuer, subject);

    if (stored.type === 'link') {
      const userId = stored.userId;
      if (!userId) {
        res.redirect(`${getFrontendBase()}/?oidc=invalid`);
        return;
      }
      if (account && account.user_id !== userId) {
        res.redirect(`${getFrontendBase()}/?oidc=linked_conflict`);
        return;
      }
      if (!account) {
        await createOauthAccount({
          provider: oidc.providerName,
          issuer: oidc.issuer,
          subject,
          userId
        });
      }
      res.redirect(`${getFrontendBase()}/?oidc=linked`);
      return;
    }

    if (!account) {
      res.redirect(`${getFrontendBase()}/?oidc=unlinked`);
      return;
    }
    const user = await getUserById(account.user_id);
    if (!user || !user.is_active) {
      res.redirect(`${getFrontendBase()}/?oidc=inactive`);
      return;
    }
    await pool.query('update users set last_login_at = now(), updated_at = now() where id = $1', [user.id]);
    const token = createAuthToken(user, settings?.sessionDurationHours);
    if (!token) {
      res.status(500).json({ error: 'Server misconfigured' });
      return;
    }
    res.redirect(`${getFrontendBase()}/?token=${encodeURIComponent(token)}`);
  } catch (error) {
    console.error('OIDC callback failed', error);
    res.redirect(`${getFrontendBase()}/?oidc=failed`);
  }
});

app.get('/api/settings', authRequired, async (req, res) => {
  try {
    const settings = await getAppSettings();
    res.json({ settings: sanitizeSettingsForUser(settings, req.user) });
  } catch (error) {
    console.error('Failed to load settings', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
});

app.patch('/api/settings', authRequired, async (req, res) => {
  let updates = normalizeSettings(req.body || {});
  if (req.user?.role !== 'admin') {
    updates = stripOidcSettings(updates);
    delete updates.sessionDurationHours;
  }
  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: 'No updates provided' });
    return;
  }
  try {
    const settings = await updateAppSettings(updates);
    res.json({ settings: sanitizeSettingsForUser(settings, req.user) });
  } catch (error) {
    console.error('Failed to update settings', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

app.get('/api/backup/export', authRequired, requireAdmin, async (req, res) => {
  const includeUsers = String(req.query.includeUsers ?? 'true').toLowerCase() !== 'false';
  try {
    const monthsResult = await pool.query('select month_key, data, updated_at from monthly_budgets order by month_key');
    const settingsResult = await pool.query('select data, updated_at from app_settings where id = 1');
    const usersResult = includeUsers
      ? await pool.query(`
          select id, username, display_name, avatar_url, theme_preference,
                 password_hash, role, is_active, created_at, updated_at, last_login_at
          from users
          order by created_at
        `)
      : { rows: [] };
    const oauthResult = includeUsers
      ? await pool.query('select id, provider, issuer, subject, user_id, created_at from oauth_accounts')
      : { rows: [] };

    res.json({
      version: 1,
      exportedAt: new Date().toISOString(),
      settings: settingsResult.rows[0]
        ? { data: settingsResult.rows[0].data, updatedAt: settingsResult.rows[0].updated_at }
        : null,
      months: monthsResult.rows.map(row => ({
        monthKey: row.month_key,
        data: row.data,
        updatedAt: row.updated_at
      })),
      users: includeUsers
        ? usersResult.rows.map(row => ({
            id: row.id,
            username: row.username,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            themePreference: row.theme_preference,
            passwordHash: row.password_hash,
            role: row.role,
            isActive: row.is_active,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            lastLoginAt: row.last_login_at
          }))
        : undefined,
      oauthAccounts: includeUsers
        ? oauthResult.rows.map(row => ({
            id: row.id,
            provider: row.provider,
            issuer: row.issuer,
            subject: row.subject,
            userId: row.user_id,
            createdAt: row.created_at
          }))
        : undefined
    });
  } catch (error) {
    console.error('Failed to export backup', error);
    res.status(500).json({ error: 'Failed to export backup' });
  }
});

app.post('/api/backup/import', authRequired, requireAdmin, async (req, res) => {
  const payload = req.body || {};
  const mode = payload.mode === 'merge' ? 'merge' : 'replace';
  const includeUsers = payload.includeUsers !== false;
  if (mode !== 'replace') {
    res.status(400).json({ error: 'Unsupported import mode' });
    return;
  }
  const months = Array.isArray(payload.months) ? payload.months : null;
  const settings = payload.settings ?? null;
  const users = includeUsers && Array.isArray(payload.users) ? payload.users : null;
  const oauthAccounts = includeUsers && Array.isArray(payload.oauthAccounts) ? payload.oauthAccounts : null;

  if (!months) {
    res.status(400).json({ error: 'Invalid backup payload' });
    return;
  }
  if (includeUsers && !users) {
    res.status(400).json({ error: 'Missing users in backup payload' });
    return;
  }
  if (includeUsers && users && !users.some(user => user && user.role === 'admin')) {
    res.status(400).json({ error: 'Backup must contain at least one admin user' });
    return;
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    await client.query('delete from monthly_budgets');
    if (includeUsers) {
      await client.query('delete from oauth_accounts');
      await client.query('delete from password_reset_tokens');
      if (users) {
        await client.query('delete from users');
      }
    }
    await client.query('delete from app_settings');

    if (settings && settings.data) {
      await client.query(
        'insert into app_settings (id, data, updated_at) values (1, $1, $2)',
        [JSON.stringify(settings.data), settings.updatedAt ? new Date(settings.updatedAt) : new Date()]
      );
    }

    for (const month of months) {
      if (!month || typeof month.monthKey !== 'string' || !isValidMonthKey(month.monthKey) || !month.data || typeof month.data !== 'object') {
        throw new Error('Invalid month payload');
      }
      await client.query(
        'insert into monthly_budgets (month_key, data, created_at, updated_at) values ($1, $2, now(), $3)',
        [month.monthKey, JSON.stringify(month.data), month.updatedAt ? new Date(month.updatedAt) : new Date()]
      );
    }

    if (users) {
      for (const user of users) {
        if (!user || !user.id || !user.username || !user.passwordHash) {
          throw new Error('Invalid user payload');
        }
        await client.query(
          `insert into users
            (id, username, display_name, avatar_url, theme_preference, password_hash, role, is_active, created_at, updated_at, last_login_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            String(user.id),
            String(user.username),
            user.displayName ?? null,
            user.avatarUrl ?? null,
            user.themePreference === 'dark' ? 'dark' : 'light',
            String(user.passwordHash),
            user.role === 'admin' ? 'admin' : 'user',
            user.isActive !== false,
            user.createdAt ? new Date(user.createdAt) : new Date(),
            user.updatedAt ? new Date(user.updatedAt) : new Date(),
            user.lastLoginAt ? new Date(user.lastLoginAt) : null
          ]
        );
      }
    }

    if (oauthAccounts) {
      for (const account of oauthAccounts) {
        if (!account || !account.id || !account.issuer || !account.subject || !account.userId) {
          throw new Error('Invalid oauth account payload');
        }
        await client.query(
          `insert into oauth_accounts
            (id, provider, issuer, subject, user_id, created_at)
           values ($1, $2, $3, $4, $5, $6)`,
          [
            String(account.id),
            account.provider ?? 'OIDC',
            String(account.issuer),
            String(account.subject),
            String(account.userId),
            account.createdAt ? new Date(account.createdAt) : new Date()
          ]
        );
      }
    }

    await client.query('commit');
    res.json({ status: 'ok' });
  } catch (error) {
    await client.query('rollback');
    console.error('Failed to import backup', error);
    res.status(500).json({ error: 'Failed to import backup' });
  } finally {
    client.release();
  }
});

app.get('/api/version/latest', async (_req, res) => {
  try {
    const latest = await fetchLatestDockerVersion();
    res.json({
      repo: dockerHubRepo,
      version: latest?.version ?? null,
      tag: latest?.tag ?? null,
      updatedAt: latest?.updatedAt ?? null
    });
  } catch (error) {
    console.error('Version check failed', error);
    res.status(500).json({ error: 'Version check failed' });
  }
});

app.post('/api/auth/request-reset', async (req, res) => {
  const { login } = req.body || {};
  if (!login) {
    res.status(400).json({ error: 'Missing login' });
    return;
  }

  try {
    const user = await getUserByLogin(login);
    if (!user || !user.is_active) {
      res.json({ ok: true });
      return;
    }
    const { token, expiresAt } = await createPasswordResetToken(user.id);
    res.json({ ok: true, resetToken: token, expiresAt });
  } catch (error) {
    console.error('Password reset request failed', error);
    res.status(500).json({ error: 'Password reset request failed' });
  }
});

app.post('/api/auth/reset', async (req, res) => {
  const { token, newPassword } = req.body || {};
  if (!token || !newPassword) {
    res.status(400).json({ error: 'Missing token or password' });
    return;
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const result = await consumePasswordResetToken(token, newPassword);
    if (!result.ok) {
      res.status(400).json({ error: result.error });
      return;
    }
    res.json({ ok: true });
  } catch (error) {
    console.error('Password reset failed', error);
    res.status(500).json({ error: 'Password reset failed' });
  }
});

app.post('/api/auth/change-password', authRequired, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    res.status(400).json({ error: 'Missing password' });
    return;
  }
  const passwordError = validatePassword(newPassword);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }

  try {
    const result = await pool.query('select password_hash from users where id = $1', [req.user.id]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    const passwordMatch = await bcrypt.compare(currentPassword, result.rows[0].password_hash);
    if (!passwordMatch) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await pool.query('update users set password_hash = $1, updated_at = now() where id = $2', [passwordHash, req.user.id]);
    res.json({ ok: true });
  } catch (error) {
    console.error('Change password failed', error);
    res.status(500).json({ error: 'Change password failed' });
  }
});

app.get('/api/users/me', authRequired, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.patch('/api/users/me', authRequired, async (req, res) => {
  const { displayName, avatarUrl, themePreference } = req.body || {};
  const updates = [];
  const values = [];

  if (displayName !== undefined) {
    values.push(normalizeDisplayName(displayName));
    updates.push(`display_name = $${values.length}`);
  }
  if (avatarUrl !== undefined) {
    values.push(normalizeAvatarUrl(avatarUrl));
    updates.push(`avatar_url = $${values.length}`);
  }
  if (themePreference !== undefined) {
    if (themePreference !== 'light' && themePreference !== 'dark') {
      res.status(400).json({ error: 'Invalid theme preference' });
      return;
    }
    values.push(themePreference);
    updates.push(`theme_preference = $${values.length}`);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No updates provided' });
    return;
  }

  values.push(req.user.id);

  try {
    const result = await pool.query(
      `update users set ${updates.join(', ')}, updated_at = now()
       where id = $${values.length}
       returning id, username, display_name, avatar_url, theme_preference, role, is_active, created_at, last_login_at`,
      values
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    console.error('Failed to update profile', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

app.post('/api/users/me/avatar', authRequired, avatarUpload.single('avatar'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded' });
    return;
  }
  const avatarUrl = `/uploads/avatars/${req.file.filename}`;
  try {
    const result = await pool.query(
      `update users set avatar_url = $1, updated_at = now()
       where id = $2
       returning id, username, display_name, avatar_url, theme_preference, role, is_active, created_at, last_login_at`,
      [avatarUrl, req.user.id]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    console.error('Failed to upload avatar', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

app.get('/api/users', authRequired, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      'select id, username, display_name, avatar_url, theme_preference, role, is_active, created_at, last_login_at from users order by created_at'
    );
    res.json({ users: result.rows.map(sanitizeUser) });
  } catch (error) {
    console.error('Failed to load users', error);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

app.post('/api/users', authRequired, requireAdmin, async (req, res) => {
  const { username, password, displayName, role } = req.body || {};
  const normalizedUsername = normalizeLogin(username);
  if (!normalizedUsername || !password) {
    res.status(400).json({ error: 'Missing credentials' });
    return;
  }
  const passwordError = validatePassword(password);
  if (passwordError) {
    res.status(400).json({ error: passwordError });
    return;
  }
  const resolvedRole = role === 'admin' ? 'admin' : 'user';

  try {
    const user = await createUser({
      username: normalizedUsername,
      displayName,
      password,
      role: resolvedRole
    });
    res.status(201).json({ user: sanitizeUser(user) });
  } catch (error) {
    console.error('Failed to create user', error);
    res.status(500).json({ error: 'Failed to create user' });
  }
});

app.patch('/api/users/:userId', authRequired, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  const { displayName, role, isActive } = req.body || {};

  const updates = [];
  const values = [];
  if (displayName !== undefined) {
    values.push(normalizeDisplayName(displayName));
    updates.push(`display_name = $${values.length}`);
  }
  if (role !== undefined) {
    if (role !== 'admin' && role !== 'user') {
      res.status(400).json({ error: 'Invalid role' });
      return;
    }
    values.push(role);
    updates.push(`role = $${values.length}`);
  }
  if (isActive !== undefined) {
    values.push(Boolean(isActive));
    updates.push(`is_active = $${values.length}`);
  }

  if (updates.length === 0) {
    res.status(400).json({ error: 'No updates provided' });
    return;
  }

  values.push(userId);

  try {
    const result = await pool.query(
      `update users set ${updates.join(', ')}, updated_at = now()
       where id = $${values.length}
       returning id, username, display_name, avatar_url, theme_preference, role, is_active, created_at, last_login_at`,
      values
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    res.json({ user: sanitizeUser(result.rows[0]) });
  } catch (error) {
    console.error('Failed to update user', error);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/users/:userId/reset-password', authRequired, requireAdmin, async (req, res) => {
  const { userId } = req.params;
  try {
    const result = await pool.query('select id, is_active from users where id = $1', [userId]);
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'User not found' });
      return;
    }
    if (!result.rows[0].is_active) {
      res.status(400).json({ error: 'User is disabled' });
      return;
    }
    const { token, expiresAt } = await createPasswordResetToken(userId);
    res.json({ resetToken: token, expiresAt });
  } catch (error) {
    console.error('Failed to create reset token', error);
    res.status(500).json({ error: 'Failed to create reset token' });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('select 1');
    res.json({ ok: true });
  } catch (error) {
    console.error('Health check failed', error);
    res.status(500).json({ ok: false });
  }
});

app.get('/api/months', authRequired, async (_req, res) => {
  try {
    const result = await pool.query(
      'select month_key, data, updated_at from monthly_budgets order by month_key'
    );
    const months = result.rows.map(row => ({
      monthKey: row.month_key,
      data: row.data,
      updatedAt: row.updated_at
    }));
    res.json({ months });
  } catch (error) {
    console.error('Failed to load months', error);
    res.status(500).json({ error: 'Failed to load months' });
  }
});

app.get('/api/months/:monthKey', authRequired, async (req, res) => {
  const { monthKey } = req.params;
  if (!isValidMonthKey(monthKey)) {
    res.status(400).json({ error: 'Invalid month key' });
    return;
  }

  try {
    const result = await pool.query(
      'select month_key, data, updated_at from monthly_budgets where month_key = $1',
      [monthKey]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Month not found' });
      return;
    }
    res.json({
      monthKey,
      data: result.rows[0].data,
      updatedAt: result.rows[0].updated_at
    });
  } catch (error) {
    console.error('Failed to load month', error);
    res.status(500).json({ error: 'Failed to load month' });
  }
});

app.put('/api/months/:monthKey', authRequired, async (req, res) => {
  const { monthKey } = req.params;
  if (!isValidMonthKey(monthKey)) {
    res.status(400).json({ error: 'Invalid month key' });
    return;
  }
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') {
    res.status(400).json({ error: 'Invalid payload' });
    return;
  }

  try {
    const result = await pool.query(
      `insert into monthly_budgets (month_key, data, created_at, updated_at)
       values ($1, $2::jsonb, now(), now())
       on conflict (month_key)
       do update set data = excluded.data, updated_at = now()
       returning updated_at`,
      [monthKey, JSON.stringify(data)]
    );
    res.json({ updatedAt: result.rows[0]?.updated_at ?? null });
  } catch (error) {
    console.error('Failed to save month', error);
    res.status(500).json({ error: 'Failed to save month' });
  }
});

app.delete('/api/months/:monthKey', authRequired, async (req, res) => {
  const { monthKey } = req.params;
  if (!isValidMonthKey(monthKey)) {
    res.status(400).json({ error: 'Invalid month key' });
    return;
  }

  try {
    await pool.query('delete from monthly_budgets where month_key = $1', [monthKey]);
    res.status(204).end();
  } catch (error) {
    console.error('Failed to delete month', error);
    res.status(500).json({ error: 'Failed to delete month' });
  }
});

app.use((err, _req, res, next) => {
  if (err instanceof multer.MulterError) {
    res.status(400).json({ error: 'Upload failed' });
    return;
  }
  next(err);
});

const startServer = async () => {
  try {
    await ensureSchema();
    await ensureThemePreferenceColumn();
  } catch (error) {
    console.error('Failed to initialize database schema', error);
    process.exit(1);
  }
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
};

startServer();
