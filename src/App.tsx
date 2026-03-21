import { useState, useEffect, useCallback } from 'react';
import { fetchIssues, fetchBoards, type JiraIssue } from './api';
import IssueTable from './components/IssueTable';
import IssueDetailPanel from './components/IssueDetailPanel';
import KanbanBoard from './components/KanbanBoard';

type ViewMode = 'table' | 'kanban';

const PRESETS: { label: string; jql: string }[] = [
  { label: 'My Issues', jql: 'assignee = currentUser() ORDER BY updated DESC' },
  { label: 'My Open Issues', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC' },
  { label: 'Recently Updated', jql: 'assignee = currentUser() AND updated >= -7d ORDER BY updated DESC' },
  { label: 'All Unresolved', jql: 'resolution = Unresolved ORDER BY created DESC' },
];

export default function App() {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jql, setJql] = useState(PRESETS[0].jql);
  const [jqlInput, setJqlInput] = useState(PRESETS[0].jql);
  const [boards, setBoards] = useState<{ id: string; name: string; key?: string }[]>([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const [nextPageToken, setNextPageToken] = useState<string | undefined>();
  const [pageTokenHistory, setPageTokenHistory] = useState<(string | undefined)[]>([]);
  const [isLast, setIsLast] = useState(true);
  const [selectedIssueKey, setSelectedIssueKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>('table');

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

  useEffect(() => {
    fetchBoards().then(setBoards).catch(() => {});
  }, []);

  useEffect(() => {
    setPageTokenHistory([]);
    setNextPageToken(undefined);
    loadIssues(jql);
  }, [jql, loadIssues]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setJql(jqlInput);
  };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setJqlInput(preset.jql);
    setJql(preset.jql);
    setSelectedBoard('');
  };

  const handleBoardFilter = (boardKey: string) => {
    setSelectedBoard(boardKey);
    if (boardKey) {
      const newJql = `project = "${boardKey}" AND assignee = currentUser() ORDER BY updated DESC`;
      setJqlInput(newJql);
      setJql(newJql);
    } else {
      setJqlInput(PRESETS[0].jql);
      setJql(PRESETS[0].jql);
    }
  };

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
              <button
                onClick={() => setViewMode('table')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'table'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Table
              </button>
              <button
                onClick={() => setViewMode('kanban')}
                className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  viewMode === 'kanban'
                    ? 'bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                Board
              </button>
            </div>
            <button
              onClick={() => loadIssues(jql)}
              disabled={loading}
              className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {loading ? 'Loading...' : 'Refresh'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-screen-2xl mx-auto px-4 py-4">
        {/* Filters */}
        <div className="flex flex-col gap-3 mb-4">
          {/* Board selector + presets */}
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedBoard}
              onChange={(e) => handleBoardFilter(e.target.value)}
              className="text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">All boards</option>
              {boards.map((b) => (
                <option key={b.id} value={b.key || b.name}>{b.name}</option>
              ))}
            </select>
            <div className="h-4 w-px bg-gray-300 dark:bg-gray-700" />
            {PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => handlePreset(p)}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                  jql === p.jql && !selectedBoard
                    ? 'bg-blue-50 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* JQL search */}
          <form onSubmit={handleSearch} className="flex gap-2">
            <input
              type="text"
              value={jqlInput}
              onChange={(e) => setJqlInput(e.target.value)}
              placeholder="Enter JQL query..."
              className="flex-1 text-sm border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="text-sm px-4 py-1.5 bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 rounded-lg hover:opacity-90 transition-opacity"
            >
              Search
            </button>
          </form>
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
        ) : viewMode === 'kanban' ? (
          <KanbanBoard issues={issues} onRefresh={() => loadIssues(jql)} onSelectIssue={setSelectedIssueKey} />
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
        />
      )}
    </div>
  );
}
