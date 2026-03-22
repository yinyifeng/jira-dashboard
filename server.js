import express from 'express';
import cors from 'cors';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Secrets are injected by Doppler via `doppler run` — no .env needed.
// Run: doppler run -- node server.js

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true,
}));
app.use(express.json());

const {
  JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN,
  DASHBOARD_USER, DASHBOARD_PASS,
  GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_EMAILS,
} = process.env;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Missing required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN');
  console.error('Run with: doppler run -- node server.js');
  process.exit(1);
}

const useGoogleAuth = !!(GOOGLE_CLIENT_ID && GOOGLE_CLIENT_SECRET);
const usePasswordAuth = !!(DASHBOARD_USER && DASHBOARD_PASS);

if (!useGoogleAuth && !usePasswordAuth) {
  console.error('Missing auth config. Set either:');
  console.error('  - GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET (+ ALLOWED_EMAILS) for Google OAuth');
  console.error('  - DASHBOARD_USER + DASHBOARD_PASS for password auth');
  process.exit(1);
}

const allowedEmails = (ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
if (useGoogleAuth) {
  console.log(`Google OAuth enabled. Allowed emails: ${allowedEmails.length > 0 ? allowedEmails.join(', ') : 'ALL (no restriction)'}`);
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

// --- Session auth ---
const sessions = new Map(); // token -> { expiresAt }
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

// --- Auth method info ---
app.get('/api/auth/methods', (req, res) => {
  res.json({
    google: useGoogleAuth,
    password: usePasswordAuth,
  });
});

// --- Password login (legacy, only if configured) ---
app.post('/api/auth/login', (req, res) => {
  if (!usePasswordAuth) {
    return res.status(404).json({ error: 'Password auth not configured' });
  }
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const userMatch = crypto.timingSafeEqual(
    Buffer.from(username.padEnd(256)),
    Buffer.from(DASHBOARD_USER.padEnd(256)),
  );
  const passMatch = crypto.timingSafeEqual(
    Buffer.from(password.padEnd(256)),
    Buffer.from(DASHBOARD_PASS.padEnd(256)),
  );
  if (!userMatch || !passMatch) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + SESSION_TTL });
  res.json({ token, expiresIn: SESSION_TTL });
});

// --- Google OAuth ---
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || (
  process.env.NODE_ENV === 'production'
    ? 'https://jira.yinyi.dev/api/auth/google/callback'
    : 'http://localhost:3001/api/auth/google/callback'
);
const FRONTEND_URL = process.env.FRONTEND_URL || (
  process.env.NODE_ENV === 'production'
    ? ''
    : 'http://localhost:5175'
);

app.get('/api/auth/google', (req, res) => {
  if (!useGoogleAuth) return res.status(404).json({ error: 'Google auth not configured' });
  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: GOOGLE_REDIRECT_URI,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    prompt: 'select_account',
  });
  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get('/api/auth/google/callback', async (req, res) => {
  if (!useGoogleAuth) return res.status(404).json({ error: 'Google auth not configured' });
  const { code, error } = req.query;
  if (error || !code) {
    return res.redirect(`${FRONTEND_URL}/?error=google_auth_denied`);
  }
  try {
    // Exchange code for tokens
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });
    if (!tokenRes.ok) {
      const text = await tokenRes.text();
      console.error('Google token exchange failed:', text);
      return res.redirect(`${FRONTEND_URL}/?error=google_token_failed`);
    }
    const tokenData = await tokenRes.json();

    // Get user info
    const userRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    if (!userRes.ok) {
      return res.redirect(`${FRONTEND_URL}/?error=google_userinfo_failed`);
    }
    const userInfo = await userRes.json();
    const email = (userInfo.email || '').toLowerCase();

    // Check allowlist
    if (allowedEmails.length > 0 && !allowedEmails.includes(email)) {
      console.warn(`Google login denied for: ${email}`);
      return res.redirect(`${FRONTEND_URL}/?error=email_not_allowed&email=${encodeURIComponent(email)}`);
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    sessions.set(sessionToken, {
      expiresAt: Date.now() + SESSION_TTL,
      email,
      name: userInfo.name,
      picture: userInfo.picture,
    });

    // Redirect to frontend with token
    res.redirect(`${FRONTEND_URL}/?token=${sessionToken}`);
  } catch (err) {
    console.error('Google OAuth error:', err);
    res.redirect(`${FRONTEND_URL}/?error=google_auth_error`);
  }
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) sessions.delete(token);
  res.json({ success: true });
});

app.get('/api/auth/check', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  res.json({ valid: true });
});

// Auth middleware — protect all /api routes except /api/auth/*
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    sessions.delete(token);
    return res.status(401).json({ error: 'Session expired' });
  }
  next();
});

async function jiraFetch(path, options = {}) {
  const url = `${JIRA_BASE_URL}/rest/api/3${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: authHeader,
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...options.headers,
    },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Jira API ${res.status}: ${text}`);
  }

  return res.json();
}

// Get all boards the user has access to
app.get('/api/boards', async (req, res) => {
  try {
    // Try Agile API first for Scrum/Kanban boards
    const url = `${JIRA_BASE_URL}/rest/agile/1.0/board`;
    const agileRes = await fetch(url, {
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    
    if (agileRes.ok) {
      const agileData = await agileRes.json();
      const boards = (agileData.values || []).map(b => ({
        id: b.id,
        name: b.name,
        key: b.key || b.id,
        type: b.type || 'board'
      }));
      
      if (boards.length > 0) {
        return res.json({ boards });
      }
    }
    
    // Fallback: return projects if no boards found
    console.log('No boards found via Agile API, falling back to projects');
    const projects = await jiraFetch('/project');
    const boards = projects.map(p => ({
      id: p.id,
      name: p.name,
      key: p.key,
      type: 'project'
    }));
    res.json({ boards });
  } catch (err) {
    console.error('Error fetching boards:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// Search issues with JQL (using new /search/jql endpoint with cursor pagination)
app.get('/api/issues', async (req, res) => {
  try {
    const { jql, maxResults = 25, nextPageToken } = req.query;
    const defaultJql = 'assignee = currentUser() ORDER BY updated DESC';
    const query = jql || defaultJql;
    const url = `${JIRA_BASE_URL}/rest/api/3/search/jql`;
    const body = {
      jql: query,
      maxResults: Number(maxResults),
      fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'project', 'updated', 'created', 'labels', 'resolutiondate', 'statuscategorychangedate', 'issuelinks', 'duedate', 'subtasks'],
    };
    if (nextPageToken) {
      body.nextPageToken = nextPageToken;
    }
    const jiraRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      throw new Error(`Jira API ${jiraRes.status}: ${text}`);
    }
    const data = await jiraRes.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get single issue
app.get('/api/issues/:key', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update issue fields
app.put('/api/issues/:key', async (req, res) => {
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issue/${req.params.key}`;
    const jiraRes = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ fields: req.body.fields }),
    });

    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      res.status(jiraRes.status).json({ error: text });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get transitions for an issue
app.get('/api/issues/:key/transitions', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/transitions`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Transition an issue (change status)
app.post('/api/issues/:key/transitions', async (req, res) => {
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issue/${req.params.key}/transitions`;
    const jiraRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ transition: { id: req.body.transitionId } }),
    });

    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      res.status(jiraRes.status).json({ error: text });
      return;
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all statuses
app.get('/api/statuses', async (req, res) => {
  try {
    const data = await jiraFetch('/status');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get issue types for a project
app.get('/api/issuetypes', async (req, res) => {
  try {
    const { projectKey } = req.query;
    if (projectKey) {
      const data = await jiraFetch(`/issue/createmeta/${projectKey}/issuetypes`);
      res.json(data.issueTypes || data.values || data);
    } else {
      const data = await jiraFetch('/issuetype');
      res.json(data);
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get all priorities
app.get('/api/priorities', async (req, res) => {
  try {
    const data = await jiraFetch('/priority');
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get comments for an issue
app.get('/api/issues/:key/comments', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/comment?orderBy=-created`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Add a comment to an issue
app.post('/api/issues/:key/comments', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/comment`, {
      method: 'POST',
      body: JSON.stringify({ body: req.body.body }),
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a comment
app.put('/api/issues/:key/comments/:commentId', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/comment/${req.params.commentId}`, {
      method: 'PUT',
      body: JSON.stringify({ body: req.body.body }),
    });
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a comment
app.delete('/api/issues/:key/comments/:commentId', async (req, res) => {
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issue/${req.params.key}/comment/${req.params.commentId}`;
    const jiraRes = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      res.status(jiraRes.status).json({ error: text });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get changelog for an issue
app.get('/api/issues/:key/changelog', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/changelog?maxResults=50`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get worklog for an issue
app.get('/api/issues/:key/worklog', async (req, res) => {
  try {
    const data = await jiraFetch(`/issue/${req.params.key}/worklog`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search users (for assignee)
app.get('/api/users', async (req, res) => {
  try {
    const { query = '' } = req.query;
    const data = await jiraFetch(`/user/search?query=${encodeURIComponent(query)}&maxResults=10`);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Search groups
app.get('/api/groups', async (req, res) => {
  try {
    const { query = '' } = req.query;
    const data = await jiraFetch(`/groups/picker?query=${encodeURIComponent(query)}&maxResults=25`);
    res.json(data.groups || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get group members
app.get('/api/groups/:groupname/members', async (req, res) => {
  try {
    const data = await jiraFetch(`/group/member?groupname=${encodeURIComponent(req.params.groupname)}&maxResults=50`);
    res.json(data.values || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get issue link types
app.get('/api/issuelinktypes', async (req, res) => {
  try {
    const data = await jiraFetch('/issueLinkType');
    res.json(data.issueLinkTypes || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create issue link
app.post('/api/issuelinks', async (req, res) => {
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issueLink`;
    const jiraRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: authHeader,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(req.body),
    });
    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      res.status(jiraRes.status).json({ error: text });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete issue link
app.delete('/api/issuelinks/:linkId', async (req, res) => {
  try {
    const url = `${JIRA_BASE_URL}/rest/api/3/issueLink/${req.params.linkId}`;
    const jiraRes = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: authHeader, Accept: 'application/json' },
    });
    if (!jiraRes.ok) {
      const text = await jiraRes.text();
      res.status(jiraRes.status).json({ error: text });
      return;
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get labels
app.get('/api/labels', async (req, res) => {
  try {
    const data = await jiraFetch('/label?maxResults=200');
    res.json(data.values || []);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// --- Shared team configs (persisted to file) ---
const TEAMS_FILE = path.join(process.cwd(), 'teams.json');

function loadTeamsFromFile() {
  try {
    if (fs.existsSync(TEAMS_FILE)) {
      return JSON.parse(fs.readFileSync(TEAMS_FILE, 'utf-8'));
    }
  } catch (err) {
    console.error('Error reading teams file:', err.message);
  }
  return [];
}

function saveTeamsToFile(teams) {
  try {
    fs.writeFileSync(TEAMS_FILE, JSON.stringify(teams, null, 2));
  } catch (err) {
    console.error('Error writing teams file:', err.message);
  }
}

app.get('/api/teams', (req, res) => {
  res.json(loadTeamsFromFile());
});

app.put('/api/teams', (req, res) => {
  const teams = req.body;
  if (!Array.isArray(teams)) {
    return res.status(400).json({ error: 'Expected array of teams' });
  }
  saveTeamsToFile(teams);
  res.json({ success: true });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Jira proxy server running on http://localhost:${PORT}`);
});
