import { useState, useEffect, useCallback } from 'react';
import { fetchIssues, fetchBoards, type JiraIssue } from './api';
import IssueTable from './components/IssueTable';

const PRESETS: { label: string; jql: string }[] = [
  { label: 'My Issues', jql: 'assignee = currentUser() ORDER BY updated DESC' },
  { label: 'My Open Issues', jql: 'assignee = currentUser() AND resolution = Unresolved ORDER BY priority DESC' },
  { label: 'Recently Updated', jql: 'assignee = currentUser() AND updated >= -7d ORDER BY updated DESC' },
  { label: 'All Unresolved', jql: 'resolution = Unresolved ORDER BY created DESC' },
];

export default function App() {
  const [issues, setIssues] = useState<JiraIssue[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [jql, setJql] = useState(PRESETS[0].jql);
  const [jqlInput, setJqlInput] = useState(PRESETS[0].jql);
  const [boards, setBoards] = useState<{ id: string; name: string; key?: string }[]>([]);
  const [selectedBoard, setSelectedBoard] = useState('');
  const pageSize = 25;

  const loadIssues = useCallback(async (query: string, pageNum: number) => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchIssues(query, pageNum * pageSize, pageSize);
      setIssues(data.issues);
      setTotal(data.total);
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
    loadIssues(jql, page);
  }, [jql, page, loadIssues]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    setJql(jqlInput);
  };

  const handlePreset = (preset: typeof PRESETS[number]) => {
    setJqlInput(preset.jql);
    setJql(preset.jql);
    setPage(0);
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
    setPage(0);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100">
      {/* Header */}
      <header className="bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 sticky top-0 z-30">
        <div className="max-w-screen-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold tracking-tight">Jira Dashboard</h1>
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
              {total} issues
            </span>
          </div>
          <button
            onClick={() => loadIssues(jql, page)}
            disabled={loading}
            className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
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

        {/* Table */}
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm overflow-hidden">
          {loading && issues.length === 0 ? (
            <div className="py-20 text-center text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full mb-3" />
              <p>Loading issues...</p>
            </div>
          ) : (
            <IssueTable issues={issues} onRefresh={() => loadIssues(jql, page)} />
          )}
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <span className="text-gray-500">
              Showing {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage(Math.max(0, page - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Previous
              </button>
              <button
                onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg disabled:opacity-40 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
