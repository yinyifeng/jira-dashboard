import express from 'express';
import cors from 'cors';
import crypto from 'crypto';

// Secrets are injected by Doppler via `doppler run` — no .env needed.
// Run: doppler run -- node server.js

const app = express();
app.use(cors({
  origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
  credentials: true,
}));
app.use(express.json());

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, DASHBOARD_USER, DASHBOARD_PASS } = process.env;

if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Missing required env vars: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN');
  console.error('Run with: doppler run -- node server.js');
  process.exit(1);
}

if (!DASHBOARD_USER || !DASHBOARD_PASS) {
  console.error('Missing required env vars: DASHBOARD_USER, DASHBOARD_PASS');
  console.error('Set login credentials: doppler secrets set DASHBOARD_USER DASHBOARD_PASS');
  process.exit(1);
}

const authHeader = 'Basic ' + Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

// --- Session auth ---
const sessions = new Map(); // token -> { expiresAt }
const SESSION_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  // Constant-time comparison to prevent timing attacks
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
      fields: ['summary', 'status', 'priority', 'assignee', 'issuetype', 'project', 'updated', 'created', 'labels'],
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Jira proxy server running on http://localhost:${PORT}`);
});
