import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { pool } from './db.js';

const app = express();
const port = process.env.PORT || 3001;

const corsOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
const allowedOrigins = corsOrigin.split(',').map(origin => origin.trim()).filter(Boolean);

app.disable('x-powered-by');
app.use(cors({
  origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '1mb' }));

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
  role: user.role,
  isActive: user.is_active,
  createdAt: user.created_at,
  lastLoginAt: user.last_login_at
});

const createAuthToken = (user) => {
  if (!jwtSecret) {
    return null;
  }
  return jwt.sign({ sub: user.id, username: user.username, role: user.role }, jwtSecret, { expiresIn: '8h' });
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
      'select id, username, display_name, role, is_active, created_at, last_login_at from users where id = $1',
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
    const token = createAuthToken(user);
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

app.post('/api/login', loginHandler);
app.post('/api/auth/login', loginHandler);

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

app.get('/api/users', authRequired, requireAdmin, async (_req, res) => {
  try {
    const result = await pool.query(
      'select id, username, display_name, role, is_active, created_at, last_login_at from users order by created_at'
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
       returning id, username, display_name, role, is_active, created_at, last_login_at`,
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
      'select month_key, data from monthly_budgets order by month_key'
    );
    const months = result.rows.map(row => ({
      monthKey: row.month_key,
      data: row.data
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
      'select month_key, data from monthly_budgets where month_key = $1',
      [monthKey]
    );
    if (result.rowCount === 0) {
      res.status(404).json({ error: 'Month not found' });
      return;
    }
    res.json({ monthKey, data: result.rows[0].data });
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
    await pool.query(
      `insert into monthly_budgets (month_key, data, created_at, updated_at)
       values ($1, $2::jsonb, now(), now())
       on conflict (month_key)
       do update set data = excluded.data, updated_at = now()`,
      [monthKey, JSON.stringify(data)]
    );
    res.status(204).end();
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

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
