import { useMemo, useState, useEffect } from 'react';
import { fetchIssues, type JiraIssue } from '../api';

interface DashboardViewProps {
  issues: JiraIssue[];
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

export default function DashboardView({ issues, onSelectIssue }: DashboardViewProps) {
  const [noDescKeys, setNoDescKeys] = useState<Set<string> | null>(null);

  // Fetch issues with empty descriptions via JQL (since bulk search doesn't return description field)
  useEffect(() => {
    const issueKeys = issues.map(i => i.key);
    if (issueKeys.length === 0) {
      setNoDescKeys(new Set());
      return;
    }
    // Query for issues in current set that have empty descriptions
    const jql = `key in (${issueKeys.join(',')}) AND description is EMPTY`;
    fetchIssues(jql, undefined, issueKeys.length)
      .then((data) => {
        setNoDescKeys(new Set(data.issues.map(i => i.key)));
      })
      .catch(() => {
        setNoDescKeys(new Set());
      });
  }, [issues]);

  const { categories, attentionItems } = useMemo(() => {
    const now = new Date();
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const cats: Record<CategoryKey, AttentionItem[]> = {
      overdue: [],
      dueSoon: [],
      noDueDate: [],
      noDescription: [],
      unassigned: [],
    };

    const itemMap = new Map<string, AttentionItem>();

    // Only look at open issues
    const openIssues = issues.filter(
      (i) => i.fields.status?.statusCategory?.name !== 'Done'
    );

    for (const issue of openIssues) {
      const reasons: string[] = [];
      const duedate = issue.fields.duedate as string | null;

      // Overdue
      if (duedate && new Date(duedate) < now) {
        reasons.push('overdue');
        const item = { issue, reasons };
        cats.overdue.push(item);
        itemMap.set(issue.key, item);
      }
      // Due soon
      else if (duedate && new Date(duedate) <= threeDaysFromNow) {
        reasons.push('dueSoon');
        const item = itemMap.get(issue.key) || { issue, reasons };
        if (!itemMap.has(issue.key)) itemMap.set(issue.key, item);
        else item.reasons.push('dueSoon');
        cats.dueSoon.push(item);
      }

      // No due date
      if (!duedate) {
        const item = itemMap.get(issue.key) || { issue, reasons: [] };
        item.reasons.push('noDueDate');
        if (!itemMap.has(issue.key)) itemMap.set(issue.key, item);
        cats.noDueDate.push(item);
      }

      // No description (from JQL query)
      if (noDescKeys?.has(issue.key)) {
        const item = itemMap.get(issue.key) || { issue, reasons: [] };
        item.reasons.push('noDescription');
        if (!itemMap.has(issue.key)) itemMap.set(issue.key, item);
        cats.noDescription.push(item);
      }

      // Unassigned
      if (!issue.fields.assignee) {
        const item = itemMap.get(issue.key) || { issue, reasons: [] };
        item.reasons.push('unassigned');
        if (!itemMap.has(issue.key)) itemMap.set(issue.key, item);
        cats.unassigned.push(item);
      }

    }

    return {
      categories: cats,
      attentionItems: itemMap.size,
    };
  }, [issues, noDescKeys]);

  const colorClasses: Record<string, { bg: string; border: string; text: string; badge: string }> = {
    red: { bg: 'bg-red-50 dark:bg-red-900/20', border: 'border-red-200 dark:border-red-800', text: 'text-red-700 dark:text-red-400', badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400' },
    orange: { bg: 'bg-orange-50 dark:bg-orange-900/20', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-700 dark:text-orange-400', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-400' },
    yellow: { bg: 'bg-yellow-50 dark:bg-yellow-900/20', border: 'border-yellow-200 dark:border-yellow-800', text: 'text-yellow-700 dark:text-yellow-400', badge: 'bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400' },
    purple: { bg: 'bg-purple-50 dark:bg-purple-900/20', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-700 dark:text-purple-400', badge: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-400' },
    blue: { bg: 'bg-blue-50 dark:bg-blue-900/20', border: 'border-blue-200 dark:border-blue-800', text: 'text-blue-700 dark:text-blue-400', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400' },
    gray: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-200 dark:border-gray-700', text: 'text-gray-700 dark:text-gray-400', badge: 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-400' },
  };

  const openCount = issues.filter(i => i.fields.status?.statusCategory?.name !== 'Done').length;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {CATEGORY_CONFIG.map(({ key, label, color }) => {
          const count = categories[key].length;
          const c = colorClasses[color];
          return (
            <div key={key} className={`${c.bg} ${c.border} border rounded-xl p-3 text-center`}>
              <div className={`text-2xl font-bold ${c.text}`}>
                {key === 'noDescription' && noDescKeys === null ? '...' : count}
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
            {attentionItems} of {openCount} open issues need attention
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              openCount === 0 ? 'bg-green-500' :
              attentionItems / openCount > 0.5 ? 'bg-red-500' :
              attentionItems / openCount > 0.25 ? 'bg-yellow-500' :
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

        return (
          <div key={key} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center gap-2">
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.badge}`}>
                {items.length}
              </span>
              <h3 className="text-sm font-medium">{label}</h3>
            </div>
            <div className="divide-y divide-gray-100 dark:divide-gray-800">
              {items.map(({ issue }) => {
                const statusName = issue.fields.status?.name ?? '';
                const statusCategory = issue.fields.status?.statusCategory?.name ?? '';
                const isInProgress = statusCategory === 'In Progress';
                return (
                  <button
                    key={issue.key}
                    onClick={() => onSelectIssue(issue.key)}
                    className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
                  >
                    {issue.fields.issuetype?.iconUrl && (
                      <img src={issue.fields.issuetype.iconUrl} alt="" className="w-4 h-4 flex-shrink-0" />
                    )}
                    <span className="text-xs font-mono text-gray-500 dark:text-gray-400 w-20 flex-shrink-0">
                      {issue.key}
                    </span>
                    <span className="text-sm truncate flex-1">{issue.fields.summary}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${
                      isInProgress
                        ? 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-400'
                        : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400'
                    }`}>
                      {statusName}
                    </span>
                    {issue.fields.priority?.iconUrl && (
                      <img src={issue.fields.priority.iconUrl} alt={issue.fields.priority.name} className="w-4 h-4 flex-shrink-0" />
                    )}
                    {issue.fields.assignee ? (
                      <img
                        src={issue.fields.assignee.avatarUrls?.['24x24']}
                        alt={issue.fields.assignee.displayName}
                        title={issue.fields.assignee.displayName}
                        className="w-5 h-5 rounded-full flex-shrink-0"
                      />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-gray-200 dark:bg-gray-700 flex-shrink-0" title="Unassigned" />
                    )}
                    {(key === 'overdue' || key === 'dueSoon') && !!issue.fields.duedate && (
                      <span className={`text-[10px] flex-shrink-0 ${
                        key === 'overdue' ? 'text-red-600 dark:text-red-400' : 'text-orange-600 dark:text-orange-400'
                      }`}>
                        {new Date(issue.fields.duedate as string).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* All good state */}
      {attentionItems === 0 && noDescKeys !== null && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-12 text-center">
          <div className="text-4xl mb-3">{'\u2713'}</div>
          <p className="text-gray-500 dark:text-gray-400">All issues look good! No items need attention.</p>
        </div>
      )}
    </div>
  );
}
