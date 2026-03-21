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
  total: number;
  startAt: number;
  maxResults: number;
  names?: Record<string, string>;
}

export interface Transition {
  id: string;
  name: string;
  to: { name: string };
}

export async function fetchIssues(jql?: string, startAt = 0, maxResults = 50): Promise<SearchResult> {
  const params = new URLSearchParams({ startAt: String(startAt), maxResults: String(maxResults) });
  if (jql) params.set('jql', jql);
  const res = await fetch(`/api/issues?${params}`);
  if (!res.ok) throw new Error((await res.json()).error || 'Failed to fetch issues');
  return res.json();
}

export async function updateIssue(key: string, fields: Record<string, unknown>): Promise<void> {
  const res = await fetch(`/api/issues/${key}`, {
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
  const res = await fetch(`/api/issues/${key}/transitions`);
  if (!res.ok) throw new Error('Failed to fetch transitions');
  const data = await res.json();
  return data.transitions;
}

export async function transitionIssue(key: string, transitionId: string): Promise<void> {
  const res = await fetch(`/api/issues/${key}/transitions`, {
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
  const res = await fetch(`/api/users?query=${encodeURIComponent(query)}`);
  if (!res.ok) throw new Error('Failed to search users');
  return res.json();
}

export async function fetchBoards(): Promise<{ id: string; name: string; key?: string; type?: string }[]> {
  const res = await fetch('/api/boards');
  if (!res.ok) throw new Error('Failed to fetch boards');
  const data = await res.json();
  return data.boards;
}
