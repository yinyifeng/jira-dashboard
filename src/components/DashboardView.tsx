import { useMemo, useState, useEffect } from 'react';
import { fetchIssues, proxyImageUrl, type JiraIssue } from '../api';

interface DashboardViewProps {
  baseJql: string;
  onSelectIssue: (key: string) => void;
}

interface AttentionItem {
  issue: JiraIssue;
  reasons: string[];
}

const CATEGORY_CONFIG = [
  { key: 'overdue', label: 'Overdue', color: 'red' },
  { key: 'dueSoon', label: 'Due Soon (within 3 days)', color: 'orange' },
  { key: 'noDueDate', label: 'Missing Due Date', color: 'yellow' },
  { key: 'noDescription', label: 'Missing Description', color: 'purple' },
  { key: 'unassigned', label: 'Unassigned', color: 'blue' },
] as const;

type CategoryKey = typeof CATEGORY_CONFIG[number]['key'];

// Strip ORDER BY from JQL to get the base filter
function stripOrderBy(jql: string): string {
  return jql.replace(/\s+ORDER\s+BY\s+.+$/i, '');
}

// Build JQL for each attention category
function buildCategoryJql(base: string): Record<CategoryKey | 'open', string> {
  const open = `${base} AND statusCategory != Done`;
  const today = new Date().toISOString().slice(0, 10);
  const threeDays = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    open: `${open} ORDER BY updated DESC`,
    overdue: `${open} AND duedate < "${today}" ORDER BY duedate ASC`,
    dueSoon: `${open} AND duedate >= "${today}" AND duedate <= "${threeDays}" ORDER BY duedate ASC`,
    noDueDate: `${open} AND duedate is EMPTY ORDER BY priority DESC`,
    noDescription: `${open} AND description is EMPTY ORDER BY priority DESC`,
    unassigned: `${open} AND assignee is EMPTY ORDER BY priority DESC`,
  };
}

export default function DashboardView({ baseJql, onSelectIssue }: DashboardViewProps) {
  const [categoryData, setCategoryData] = useState<Record<CategoryKey, JiraIssue[]>>({
    overdue: [], dueSoon: [], noDueDate: [], noDescription: [], unassigned: [],
  });
  const [openCount, setOpenCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Fetch attention issues directly via JQL for each category
  useEffect(() => {
    const base = stripOrderBy(baseJql);
    const queries = buildCategoryJql(base);
    setLoading(true);

    // Fetch open count (just need 1 result to get total)
    const openPromise = fetchIssues(queries.open, undefined, 1)
      .then((data) => data.issues.length + (data.isLast ? 0 : 999))
      .catch(() => 0);

    // For open count, we actually need to fetch enough to count, or use a different approach
    // Fetch with maxResults=200 to get a good count
    const openCountPromise = fetchIssues(queries.open, undefined, 200)
      .then((data) => {
        // If there are more pages, the count is approximate
        const count = data.issues.length;
        return data.isLast ? count : `${count}+`;
      })
      .catch(() => 0);

    const categoryPromises = Promise.all(
      (Object.entries(queries) as [string, string][])
        .filter(([key]) => key !== 'open')
        .map(([key, jql]) =>
          fetchIssues(jql, undefined, 200)
            .then((data) => [key, data.issues] as const)
            .catch(() => [key, []] as const)
        )
    );

    Promise.all([openCountPromise, categoryPromises]).then(([count, results]) => {
      setOpenCount(typeof count === 'string' ? parseInt(count) : count);
      const data: Record<string, JiraIssue[]> = {};
      for (const [key, issues] of results) {
        data[key] = issues;
      }
      setCategoryData(data as Record<CategoryKey, JiraIssue[]>);
      setLoading(false);
    });
  }, [baseJql]);

  // Build attention items for display and count unique issues needing attention
  const { categories, attentionItems } = useMemo(() => {
    const cats: Record<CategoryKey, AttentionItem[]> = {
      overdue: [], dueSoon: [], noDueDate: [], noDescription: [], unassigned: [],
    };
    const itemMap = new Map<string, AttentionItem>();

    for (const key of Object.keys(categoryData) as CategoryKey[]) {
      for (const issue of categoryData[key]) {
        const existing = itemMap.get(issue.key);
        if (existing) {
          existing.reasons.push(key);
          cats[key].push(existing);
        } else {
          const item: AttentionItem = { issue, reasons: [key] };
          itemMap.set(issue.key, item);
          cats[key].push(item);
        }
      }
    }

    return {
      categories: cats,
      attentionItems: itemMap.size,
    };
  }, [categoryData]);

  const colorClasses: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-700 dark:text-yellow-400', badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
    gray: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-400', badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400' },
  };

  const healthRatio = openCount === 0 ? 0 : attentionItems / openCount;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        <div className={`${colorClasses.gray.bg} ${colorClasses.gray.border} border rounded-xl p-2 sm:p-3 text-center`}>
          <div className={`text-xl sm:text-2xl font-bold ${colorClasses.gray.text}`}>{loading ? '...' : openCount}</div>
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Open</div>
        </div>
        {CATEGORY_CONFIG.map(({ key, label, color }) => {
          const count = categories[key].length;
          const c = colorClasses[color];
          return (
            <div key={key} className={`${c.bg} ${c.border} border rounded-xl p-2 sm:p-3 text-center`}>
              <div className={`text-xl sm:text-2xl font-bold ${c.text}`}>
                {loading ? '...' : count}
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</div>
            </div>
          );
        })}
      </div>

      {/* Health score */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">Issue Health</span>
          <span className="text-xs text-gray-500">
            {loading ? '...' : `${attentionItems} of ${openCount} open issues need attention`}
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              openCount === 0 ? 'bg-green-500' :
              healthRatio > 0.5 ? 'bg-red-500' :
              healthRatio > 0.25 ? 'bg-yellow-500' :
              'bg-green-500'
            }`}
            style={{ width: `${openCount === 0 ? 100 : Math.max(4, ((openCount - attentionItems) / openCount) * 100)}%` }}
          />
        </div>
      </div>

      {/* Category sections */}
      {CATEGORY_CONFIG.map(({ key, label, color }) => {
        const items = categories[key];
        if (items.length === 0) return null;
        const c = colorClasses[color];
        const isCollapsed = collapsedSections.has(key);

        return (
          <div key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <button
              onClick={() => toggleSection(key)}
              className="w-full px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
            >
              <svg
                className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {items.length}
              </span>
              <h3 className="text-sm font-medium">{label}</h3>
            </button>
            {!isCollapsed && (
              <div className="divide-y divide-gray-100 dark:divide-gray-800">
                {items.map(({ issue }) => {
                  const statusName = issue.fields.status?.name ?? '';
                  const statusCategory = issue.fields.status?.statusCategory?.name ?? '';
                  const isInProgress = statusCategory === 'In Progress';
                  return (
                    <button
                      key={issue.key}
                      onClick={() => onSelectIssue(issue.key)}
                      className="w-full px-3 sm:px-4 py-2 sm:py-2.5 flex items-center gap-1.5 sm:gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                    >
                      {issue.fields.issuetype?.iconUrl && (
                        <img src={proxyImageUrl(issue.fields.issuetype.iconUrl)} alt="" className="w-4 h-4 flex-shrink-0" />
                      )}
                      <span className="text-xs font-mono text-gray-500 dark:text-gray-400 flex-shrink-0 hidden sm:inline w-20">
                        {issue.key}
                      </span>
                      <span className="text-sm truncate flex-1 min-w-0">{issue.fields.summary}</span>
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded hidden sm:inline ${
                          isInProgress
                            ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                            : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                        }`}>
                          {statusName}
                        </span>
                        <div className="w-4 flex justify-center">
                          {issue.fields.priority?.iconUrl ? (
                            <img src={proxyImageUrl(issue.fields.priority.iconUrl)} alt={issue.fields.priority.name} className="w-4 h-4" />
                          ) : <div className="w-4" />}
                        </div>
                        <div className="w-5 flex justify-center">
                          {issue.fields.assignee ? (
                            <img
                              src={issue.fields.assignee.avatarUrls?.['24x24'] ? proxyImageUrl(issue.fields.assignee.avatarUrls['24x24']) : undefined}
                              alt={issue.fields.assignee.displayName}
                              title={issue.fields.assignee.displayName}
                              className="w-5 h-5 rounded-full"
                            />
                          ) : (
                            <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700" title="Unassigned" />
                          )}
                        </div>
                        <span className={`text-[10px] w-10 text-right ${
                          !issue.fields.duedate ? 'invisible'
                          : key === 'overdue' ? 'text-red-600 dark:text-red-400'
                          : key === 'dueSoon' ? 'text-orange-600 dark:text-orange-400'
                          : 'text-gray-500 dark:text-gray-400'
                        }`}>
                          {issue.fields.duedate
                            ? new Date(issue.fields.duedate as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
                            : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* All good state */}
      {!loading && attentionItems === 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">{'\u2713'}</div>
          <p className="text-gray-500 dark:text-gray-400">All issues look good! No items need attention.</p>
        </div>
      )}
    </div>
  );
}
