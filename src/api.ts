const API_BASE = import.meta.env.VITE_API_URL || '';

// --- Auth helpers ---
const TOKEN_KEY = 'jira_dash_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function authFetch(url: string, options: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, {
    ...options,
    headers: { ...authHeaders(), ...options.headers },
  });
  if (res.status === 401) {
    clearToken();
    window.location.reload();
  }
  return res;
}

export async function fetchAuthMethods(): Promise<{ google: boolean; password: boolean }> {
  try {
    const res = await fetch(`${API_BASE}/api/auth/methods`);
    if (!res.ok) return { google: false, password: true };
    return res.json();
  } catch {
    return { google: false, password: true };
  }
}

export function loginWithGoogle() {
  window.location.href = `${API_BASE}/api/auth/google`;
}

export async function login(username: string, password: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Login failed');
  }
  const { token } = await res.json();
  setToken(token);
}

export async function logout(): Promise<void> {
  await fetch(`${API_BASE}/api/auth/logout`, {
    method: 'POST',
    headers: authHeaders(),
  }).catch(() => {});
  clearToken();
}

export async function checkAuth(): Promise<boolean> {
  const token = getToken();
  if (!token) return false;
  try {
    const res = await fetch(`${API_BASE}/api/auth/check`, {
      headers: authHeaders(),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export interface JiraIssue {
  id: string;
  key: string;
  self?: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { name: string; colorName: string } };
    priority: { name: string; iconUrl: string } | null;
    assignee: { displayName: string; avatarUrls: Record<string, string>; accountId: string } | null;
    issuetype: { name: string; iconUrl: string };
    project: { key: string; name: string };
    updated: string;
    created: string;
    labels: string[];
    [key: string]: unknown;
  };
}

export interface SearchResult {
  issues: JiraIssue[];
  nextPageToken?: string;
  isLast: boolean;
}

export interface Transition {
  id: string;
  name: string;
  to: { name: string };
}

export async function fetchIssues(jql?: string, nextPageToken?: string, maxResults = 25): Promise<SearchResult> {
  const params = new URLSearchParams({ maxResults: String(maxResults) });
  if (jql) params.set('jql', jql);
  if (nextPageToken) params.set('nextPageToken', nextPageToken);
  const res = await authFetch(`${API_BASE}/api/issues?${params}`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch issues');
  return res.json();
}

export async function updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to update issue');
  }
}

export async function fetchTransitions(key: string): Promise<Transition[]> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}/transitions`);
  if (!res.ok) throw new Error('Failed to fetch transitions');
  const data = await res.json();
  return data.transitions;
}

export async function transitionIssue(key: string, transitionId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}/transitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transitionId }),
  });
  if (!res.ok) throw new Error('Failed to transition issue');
}

export async function fetchPriorities(): Promise<{ name: string; iconUrl: string; id: string }[]> {
  const res = await authFetch(`${API_BASE}/api/priorities`);
  if (!res.ok) throw new Error('Failed to fetch priorities');
  return res.json();
}

export async function fetchIssueTypes(projectKey?: string): Promise<{ id: string; name: string; iconUrl: string }[]> {
  const params = projectKey ? `?projectKey=${encodeURIComponent(projectKey)}` : '';
  const res = await authFetch(`${API_BASE}/api/issuetypes${params}`);
  if (!res.ok) throw new Error('Failed to fetch issue types');
  return res.json();
}

export async function searchUsers(query: string): Promise<{ accountId: string; displayName: string; avatarUrls?: Record<string, string> }[]> {
  const res = await authFetch(`${API_BASE}/api/users?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search users');
  return res.json();
}

export async function fetchBoards(): Promise<{ id: string; name: string; key?: string; type?: string }[]> {
  const res = await authFetch(`${API_BASE}/api/boards`);
  if (!res.ok) throw new Error('Failed to fetch boards');
  const data = await res.json();
  return data.boards;
}

export async function fetchStatuses(): Promise<{ id: string; name: string; statusCategory: { name: string; colorName: string } }[]> {
  const res = await authFetch(`${API_BASE}/api/statuses`);
  if (!res.ok) throw new Error('Failed to fetch statuses');
  return res.json();
}

export async function fetchLabels(): Promise<string[]> {
  const res = await authFetch(`${API_BASE}/api/labels`);
  if (!res.ok) throw new Error('Failed to fetch labels');
  return res.json();
}

export async function searchGroups(query: string): Promise<{ name: string; groupId: string }[]> {
  const res = await authFetch(`${API_BASE}/api/groups?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search groups');
  return res.json();
}

export interface IssueLink {
  id: string;
  type: { id: string; name: string; inward: string; outward: string };
  inwardIssue?: { key: string; fields: { summary: string; status: { name: string; statusCategory: { name: string; colorName: string } }; issuetype: { name: string; iconUrl: string } } };
  outwardIssue?: { key: string; fields: { summary: string; status: { name: string; statusCategory: { name: string; colorName: string } }; issuetype: { name: string; iconUrl: string } } };
}

export interface IssueLinkType {
  id: string;
  name: string;
  inward: string;
  outward: string;
}

export async function fetchIssueLinkTypes(): Promise<IssueLinkType[]> {
  const res = await authFetch(`${API_BASE}/api/issuelinktypes`);
  if (!res.ok) throw new Error('Failed to fetch link types');
  return res.json();
}

export async function createIssueLink(typeName: string, inwardKey: string, outwardKey: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/issuelinks`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: { name: typeName },
      inwardIssue: { key: inwardKey },
      outwardIssue: { key: outwardKey },
    }),
  });
  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error || 'Failed to create link');
  }
}

export async function deleteIssueLink(linkId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/issuelinks/${linkId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete link');
}

export interface ChangelogItem {
  field: string;
  fieldtype: string;
  fromString: string | null;
  toString: string | null;
}

export interface ChangelogEntry {
  id: string;
  author: { displayName: string; avatarUrls: Record<string, string>; accountId: string };
  created: string;
  items: ChangelogItem[];
}

export async function fetchChangelog(key: string): Promise<ChangelogEntry[]> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}/changelog`);
  if (!res.ok) throw new Error('Failed to fetch changelog');
  const data = await res.json();
  return data.values || [];
}

export interface WorklogEntry {
  id: string;
  author: { displayName: string; avatarUrls: Record<string, string>; accountId: string };
  created: string;
  updated: string;
  started: string;
  timeSpent: string;
  timeSpentSeconds: number;
  comment?: unknown;
}

export async function fetchWorklog(key: string): Promise<WorklogEntry[]> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}/worklog`);
  if (!res.ok) throw new Error('Failed to fetch worklog');
  const data = await res.json();
  return data.worklogs || [];
}

// --- Shared teams ---
export interface TeamMember {
  accountId: string;
  displayName: string;
  avatarUrl?: string;
}

export interface TeamConfig {
  name: string;
  members: TeamMember[];
}

export async function fetchTeams(): Promise<TeamConfig[]> {
  const res = await authFetch(`${API_BASE}/api/teams`);
  if (!res.ok) throw new Error('Failed to fetch teams');
  return res.json();
}

export async function saveTeams(teams: TeamConfig[]): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/teams`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(teams),
  });
  if (!res.ok) throw new Error('Failed to save teams');
}

export interface JiraComment {
  id: string;
  author: { displayName: string; avatarUrls: Record<string, string>; accountId: string };
  body: unknown; // ADF format
  created: string;
  updated: string;
}

export async function fetchIssueDetail(key: string): Promise<JiraIssue> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}`);
  if (!res.ok) throw new Error('Failed to fetch issue');
  return res.json();
}

export async function fetchComments(key: string): Promise<JiraComment[]> {
  const res = await authFetch(`${API_BASE}/api/issues/${key}/comments`);
  if (!res.ok) throw new Error('Failed to fetch comments');
  const data = await res.json();
  return data.comments || [];
}

export async function addComment(key: string, bodyText: string): Promise<JiraComment> {
  const body = {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: bodyText }] }],
  };
  const res = await authFetch(`${API_BASE}/api/issues/${key}/comments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error('Failed to add comment');
  return res.json();
}

export async function editComment(issueKey: string, commentId: string, bodyText: string): Promise<JiraComment> {
  const body = {
    type: 'doc',
    version: 1,
    content: [{ type: 'paragraph', content: [{ type: 'text', text: bodyText }] }],
  };
  const res = await authFetch(`${API_BASE}/api/issues/${issueKey}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error('Failed to edit comment');
  return res.json();
}

export async function deleteComment(issueKey: string, commentId: string): Promise<void> {
  const res = await authFetch(`${API_BASE}/api/issues/${issueKey}/comments/${commentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete comment');
}
