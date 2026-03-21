const API_BASE = import.meta.env.VITE_API_URL || '';

export interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    status: { name: string; statusCategory: { colorName: string } };
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
  const res = await fetch(`${API_BASE}/api/issues?${params}`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch issues');
  return res.json();
}

export async function updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`${API_BASE}/api/issues/${key}`, {
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
  const res = await fetch(`${API_BASE}/api/issues/${key}/transitions`);
  if (!res.ok) throw new Error('Failed to fetch transitions');
  const data = await res.json();
  return data.transitions;
}

export async function transitionIssue(key: string, transitionId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/issues/${key}/transitions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transitionId }),
  });
  if (!res.ok) throw new Error('Failed to transition issue');
}

export async function fetchPriorities(): Promise<{ name: string; iconUrl: string; id: string }[]> {
  const res = await fetch('/api/priorities');
  if (!res.ok) throw new Error('Failed to fetch priorities');
  return res.json();
}

export async function searchUsers(query: string): Promise<{ accountId: string; displayName: string }[]> {
  const res = await fetch(`${API_BASE}/api/users?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search users');
  return res.json();
}

export async function fetchBoards(): Promise<{ id: string; name: string; key?: string; type?: string }[]> {
  const res = await fetch('/api/boards');
  if (!res.ok) throw new Error('Failed to fetch boards');
  const data = await res.json();
  return data.boards;
}

export interface JiraComment {
  id: string;
  author: { displayName: string; avatarUrls: Record<string, string>; accountId: string };
  body: unknown; // ADF format
  created: string;
  updated: string;
}

export async function fetchIssueDetail(key: string): Promise<JiraIssue> {
  const res = await fetch(`${API_BASE}/api/issues/${key}`);
  if (!res.ok) throw new Error('Failed to fetch issue');
  return res.json();
}

export async function fetchComments(key: string): Promise<JiraComment[]> {
  const res = await fetch(`${API_BASE}/api/issues/${key}/comments`);
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
  const res = await fetch(`${API_BASE}/api/issues/${key}/comments`, {
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
  const res = await fetch(`${API_BASE}/api/issues/${issueKey}/comments/${commentId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  });
  if (!res.ok) throw new Error('Failed to edit comment');
  return res.json();
}

export async function deleteComment(issueKey: string, commentId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/issues/${issueKey}/comments/${commentId}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Failed to delete comment');
}
