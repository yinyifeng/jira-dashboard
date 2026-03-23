import { useState, useEffect, useCallback } from 'react';
import { fetchIssues, checkAuth, logout, setToken, fetchStatuses, fetchPriorities, fetchTeams, proxyImageUrl, type JiraIssue, type TeamConfig } from './api';
import IssueTable from './components/IssueTable';
import IssueDetailPanel from './components/IssueDetailPanel';
import KanbanBoard from './components/KanbanBoard';
import LoginPage from './components/LoginPage';
import SettingsPanel from './components/SettingsPanel';
import DashboardView from './components/DashboardView';

type ViewMode = 'dashboard' | 'table' | 'kanban';

const PRESETS: { label: string; jql: string }[] = [
  { label: 'My Open Issues', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC' },
  { label: 'Recently Updated', jql: 'assignee = currentUser() AND updated >= -7d ORDER BY updated DESC' },
];

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null); // null = checking
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jql, setJql] = useState(PRESETS[0].jql);
  const [, setJqlInput] = useState(PRESETS[0].jql);
  const [boards, setBoards] = useState<{ key: string; name: string }[]>([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [pageTokenHistory, setPageTokenHistory] = useState<(string | undefined)[]>([]);
  const [isLast, setIsLast] = useState(true);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [teams, setTeams] = useState<TeamConfig[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<Set<string>>(new Set());

  // Filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterType, setFilterType] = useState('');

  // Filter options
  const [statusOptions, setStatusOptions] = useState<{ name: string }[]>([]);
  const [priorityOptions, setPriorityOptions] = useState<{ name: string }[]>([]);
  const [typeOptions, setTypeOptions] = useState<string[]>([]);

  const loadIssues = useCallback(async (query: string, token?: string) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchIssues(query, token, 50);
      setIssues(data.issues);
      setNextPageToken(data.nextPageToken);
      setIsLast(data.isLast);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issues');
      setIssues([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load filter options when authed
  const loadFilterOptions = useCallback(async () => {
    try {
      const [statuses, priorities] = await Promise.all([
        fetchStatuses(),
        fetchPriorities(),
      ]);
      // Dedupe statuses by name
      const seen = new Set<string>();
      setStatusOptions(statuses.filter(s => { if (seen.has(s.name)) return false; seen.add(s.name); return true; }));
      setPriorityOptions(priorities);
    } catch {
      // silently fail — filters just won't have options
    }
  }, []);

  // Build JQL from filters
  const buildJql = useCallback((board: string, status: string, priority: string, type: string) => {
    const clauses: string[] = [];
    if (board) clauses.push(`project = "${board}"`);
    clauses.push('assignee = currentUser()');
    if (status) clauses.push(`status = "${status}"`);
    if (priority) clauses.push(`priority = "${priority}"`);
    if (type) clauses.push(`issuetype = "${type}"`);
    return clauses.join(' AND ') + ' ORDER BY updated DESC';
  }, []);

  // Build JQL with team members
  const buildTeamJql = useCallback((
    teamMembers: { accountId: string }[],
    memberFilter: Set<string>,
    board: string, status: string, priority: string, type: string,
  ) => {
    const clauses: string[] = [];
    if (board) clauses.push(`project = "${board}"`);
    const members = memberFilter.size > 0
      ? teamMembers.filter((m) => memberFilter.has(m.accountId))
      : teamMembers;
    if (members.length > 0) {
      const ids = members.map((m) => `"${m.accountId}"`).join(', ');
      clauses.push(`assignee in (${ids})`);
    }
    if (status) clauses.push(`status = "${status}"`);
    if (priority) clauses.push(`priority = "${priority}"`);
    if (type) clauses.push(`issuetype = "${type}"`);
    return clauses.join(' AND ') + ' ORDER BY updated DESC';
  }, []);

  useEffect(() => {
    // Check for OAuth token in URL (Google OAuth callback)
    const params = new URLSearchParams(window.location.search);
    const oauthToken = params.get('token');
    if (oauthToken) {
      setToken(oauthToken);
      window.history.replaceState({}, '', '/');
      setAuthed(true);
      return;
    }
    checkAuth().then(setAuthed);
  }, []);

  // Load filter options and teams once authed
  useEffect(() => {
    if (authed) {
      loadFilterOptions();
      fetchTeams().then((t) => {
        setTeams(t);
        // Auto-select current user if found in first team
        if (t.length > 0 && selectedMembers.size === 0) {
          const yinyi = t[0].members.find((m) => m.displayName === 'Yinyi Feng');
          if (yinyi) {
            const initial = new Set([yinyi.accountId]);
            setSelectedMembers(initial);
            // Update JQL to filter by this user
            const newJql = buildTeamJql(t[0].members, initial, '', '', '', '');
            setJql(newJql);
            setJqlInput(newJql);
          }
        }
      }).catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed, loadFilterOptions]);

  // Derive issue type options from fetched issues
  useEffect(() => {
    const types = new Set<string>();
    for (const issue of issues) {
      if (issue.fields.issuetype?.name) types.add(issue.fields.issuetype.name);
    }
    setTypeOptions(Array.from(types).sort());
  }, [issues]);

  // Derive boards from fetched issues — only update when not filtering by a specific board
  const issuesKey = issues.map(i => i.fields.project?.key).join(',');
  useEffect(() => {
    if (selectedBoard) return;
    const projectMap = new Map<string, string>();
    for (const issue of issues) {
      const p = issue.fields.project;
      if (p?.key && !projectMap.has(p.key)) {
        projectMap.set(p.key, p.name);
      }
    }
    setBoards(
      Array.from(projectMap.entries())
        .map(([key, name]) => ({ key, name }))
        .sort((a, b) => a.name.localeCompare(b.name))
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issuesKey, selectedBoard]);

  useEffect(() => {
    if (!authed) return;
    setPageTokenHistory([]);
    setNextPageToken(undefined);
    loadIssues(jql);
  }, [jql, loadIssues, authed]);


  const handlePreset = (preset: typeof PRESETS[number]) => {
    // Toggle: clicking the active preset deselects it
    if (jql === preset.jql && !selectedBoard) {
      applyCurrentFilters(selectedMembers, '', filterStatus, filterPriority, filterType);
      return;
    }
    setJqlInput(preset.jql);
    setJql(preset.jql);
    setSelectedBoard('');
    setFilterStatus('');
    setFilterPriority('');
    setFilterType('');
    setSelectedMembers(new Set());
  };

  const handleBoardFilter = (boardKey: string) => {
    setSelectedBoard(boardKey);
    applyCurrentFilters(selectedMembers, boardKey, filterStatus, filterPriority, filterType);
  };

  const applyCurrentFilters = (
    members: Set<string>,
    board: string, status: string, priority: string, type: string,
  ) => {
    const team = teams[0];
    if (team && team.members.length > 0) {
      const newJql = buildTeamJql(team.members, members, board, status, priority, type);
      setJqlInput(newJql);
      setJql(newJql);
      return;
    }
    const newJql = buildJql(board, status, priority, type);
    setJqlInput(newJql);
    setJql(newJql);
  };

  const handleFilterChange = (
    newStatus?: string, newPriority?: string, newType?: string,
  ) => {
    const s = newStatus ?? filterStatus;
    const p = newPriority ?? filterPriority;
    const t = newType ?? filterType;
    if (newStatus !== undefined) setFilterStatus(s);
    if (newPriority !== undefined) setFilterPriority(p);
    if (newType !== undefined) setFilterType(t);
    applyCurrentFilters(selectedMembers, selectedBoard, s, p, t);
  };

  const handleToggleMember = (accountId: string) => {
    const next = new Set(selectedMembers);
    if (next.has(accountId)) {
      next.delete(accountId);
    } else {
      next.add(accountId);
    }
    setSelectedMembers(next);
    applyCurrentFilters(next, selectedBoard, filterStatus, filterPriority, filterType);
  };

  const clearAllFilters = () => {
    setFilterStatus('');
    setFilterPriority('');
    setFilterType('');
    setSelectedMembers(new Set());
    setSelectedBoard('');
    setJqlInput(PRESETS[0].jql);
    setJql(PRESETS[0].jql);
  };

  const hasActiveFilters = !!(filterStatus || filterPriority || filterType);

  const handleNextPage = () => {
    if (nextPageToken) {
      setPageTokenHistory((prev) => [...prev, undefined]); // store current position marker
      loadIssues(jql, nextPageToken);
    }
  };

  const handlePrevPage = () => {
    // Go back to first page (cursor pagination doesn't support arbitrary back navigation)
    setPageTokenHistory([]);
    loadIssues(jql);
  };

  const currentPage = pageTokenHistory.length;

  if (authed === null) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-950 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full" />
      </div>
    );
  }

  if (!authed) {
    return <LoginPage onLoggedIn={() => setAuthed(true)} />;
  }

  const handleLogout = async () => {
    await logout();
    setAuthed(false);
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Jira Dashboard</h1>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {issues.length} shown
            </span>
          </div>
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden">
              {(['dashboard', 'table', 'kanban'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() => setViewMode(mode)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    viewMode === mode
                      ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  {mode === 'dashboard' ? 'Dashboard' : mode === 'table' ? 'Table' : 'Board'}
                </button>
              ))}
            </div>
            <button
              onClick={() => loadIssues(jql)}
              disabled={loading}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
            <button
              onClick={() => setShowSettings(true)}
              className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              title="Settings"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
            <button
              onClick={handleLogout}
              className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        {/* Filters */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          {/* Project */}
          <select
            value={selectedBoard}
            onChange={(e) => handleBoardFilter(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All projects</option>
            {boards.map((b) => (
              <option key={b.key} value={b.key}>{b.name} ({b.key})</option>
            ))}
          </select>

          {/* Status / Priority / Type */}
          <select
            value={filterStatus}
            onChange={(e) => handleFilterChange(e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Status</option>
            {statusOptions.map((s) => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          <select
            value={filterPriority}
            onChange={(e) => handleFilterChange(undefined, e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Priority</option>
            {priorityOptions.map((p) => (
              <option key={p.name} value={p.name}>{p.name}</option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => handleFilterChange(undefined, undefined, e.target.value)}
            className="text-xs border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">Type</option>
            {typeOptions.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <div className="h-4 w-px bg-gray-300 dark:bg-gray-700 flex-shrink-0" />

          {/* Presets */}
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => handlePreset(p)}
              className={`text-xs px-2.5 py-1.5 rounded-lg border transition-colors whitespace-nowrap ${
                jql === p.jql && !selectedBoard
                  ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
              }`}
            >
              {p.label}
            </button>
          ))}

          {hasActiveFilters && (
            <button onClick={clearAllFilters} className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 whitespace-nowrap">
              Clear
            </button>
          )}

          {/* Team member avatars */}
          {(() => {
            const team = teams[0];
            if (!team || team.members.length === 0) return null;
            return (
              <div className="flex items-center gap-2 flex-wrap">
                <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
                {team.members.map((m) => {
                  const isSelected = selectedMembers.size === 0 || selectedMembers.has(m.accountId);
                  const initials = m.displayName.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
                  return (
                    <button
                      key={m.accountId}
                      onClick={() => handleToggleMember(m.accountId)}
                      title={m.displayName}
                      className={`relative rounded-full transition-all ${
                        isSelected
                          ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-gray-950'
                          : 'opacity-40 hover:opacity-70'
                      }`}
                    >
                      {m.avatarUrl ? (
                        <img src={proxyImageUrl(m.avatarUrl)} alt={m.displayName} className="w-7 h-7 rounded-full" />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-blue-500 flex items-center justify-center text-white text-[10px] font-bold">
                          {initials}
                        </div>
                      )}
                    </button>
                  );
                })}
                {selectedMembers.size > 0 && (
                  <button
                    onClick={() => {
                      setSelectedMembers(new Set());
                      applyCurrentFilters(new Set(), selectedBoard, filterStatus, filterPriority, filterType);
                    }}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    All
                  </button>
                )}
              </div>
            );
          })()}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        )}

        {/* Content */}
        {loading && issues.length === 0 ? (
          <div className="py-20 text-center text-gray-400">
            <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full mb-3" />
            <p>Loading issues...</p>
          </div>
        ) : viewMode === 'dashboard' ? (
          <DashboardView issues={issues} onSelectIssue={setSelectedIssueKey} />
        ) : viewMode === 'kanban' ? (
          <KanbanBoard issues={issues} onRefresh={() => loadIssues(jql)} onSelectIssue={setSelectedIssueKey} selectedBoard={selectedBoard} />
        ) : (
          <>
            <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
              <IssueTable issues={issues} onRefresh={() => loadIssues(jql)} onSelectIssue={setSelectedIssueKey} />
            </div>

            {/* Pagination */}
            {(currentPage > 0 || !isLast) && (
              <div className="flex items-center justify-between mt-4 text-sm">
                <span className="text-gray-500">
                  Page {currentPage + 1}
                </span>
                <div className="flex gap-1">
                  <button
                    onClick={handlePrevPage}
                    disabled={currentPage === 0}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    First
                  </button>
                  <button
                    onClick={handleNextPage}
                    disabled={isLast}
                    className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Issue detail slide-over */}
      {selectedIssueKey && (
        <IssueDetailPanel
          issueKey={selectedIssueKey}
          onClose={() => setSelectedIssueKey(null)}
          onUpdated={() => loadIssues(jql)}
          onSelectIssue={(key) => setSelectedIssueKey(key)}
        />
      )}

      {/* Settings */}
      {showSettings && (
        <SettingsPanel
          onClose={() => setShowSettings(false)}
          onTeamsChanged={(updated) => setTeams(updated)}
        />
      )}
    </div>
  );
}
