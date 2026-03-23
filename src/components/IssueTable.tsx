import { type JiraIssue, updateIssue, fetchPriorities, proxyImageUrl } from '../api';
import EditableCell from './EditableCell';
import StatusTransition from './StatusTransition';
import { useState, useEffect } from 'react';

interface IssueTableProps {
  issues: JiraIssue[];
  onRefresh: () => void;
  onSelectIssue: (key: string) => void;
}

export default function IssueTable({ issues, onRefresh, onSelectIssue }: IssueTableProps) {
  const [priorities, setPriorities] = useState<{ name: string; id: string }[]>([]);

  useEffect(() => {
    fetchPriorities().then(setPriorities).catch(() => {});
  }, []);

  const handleSummaryUpdate = async (issue: JiraIssue, newValue: string) => {
    await updateIssue(issue.key, { summary: newValue });
    onRefresh();
  };

  const handlePriorityUpdate = async (issue: JiraIssue, priorityName: string) => {
    const p = priorities.find((pr) => pr.name === priorityName);
    if (p) {
      await updateIssue(issue.key, { priority: { id: p.id } });
      onRefresh();
    }
  };

  const handleLabelsUpdate = async (issue: JiraIssue, newValue: string) => {
    const labels = newValue.split(',').map((l) => l.trim()).filter(Boolean);
    await updateIssue(issue.key, { labels });
    onRefresh();
  };

  if (issues.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No issues found. Try adjusting your JQL query.
      </div>
    );
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-gray-200 dark:border-gray-700 text-xs text-gray-500 uppercase tracking-wider">
              <th className="px-3 py-3 font-medium">Key</th>
              <th className="px-3 py-3 font-medium">Type</th>
              <th className="px-3 py-3 font-medium min-w-[250px]">Summary</th>
              <th className="px-3 py-3 font-medium">Status</th>
              <th className="px-3 py-3 font-medium">Priority</th>
              <th className="px-3 py-3 font-medium">Assignee</th>
              <th className="px-3 py-3 font-medium">Project</th>
              <th className="px-3 py-3 font-medium">Labels</th>
              <th className="px-3 py-3 font-medium">Updated</th>
            </tr>
          </thead>
          <tbody>
            {issues.map((issue) => (
              <tr
                key={issue.id}
                className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <td className="px-3 py-2">
                  <button
                    onClick={() => onSelectIssue(issue.key)}
                    className="font-mono text-blue-600 dark:text-blue-400 font-medium hover:underline"
                  >
                    {issue.key}
                  </button>
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {issue.fields.issuetype?.iconUrl && (
                      <img src={proxyImageUrl(issue.fields.issuetype.iconUrl)} alt="" className="w-4 h-4" />
                    )}
                    <span className="text-gray-600 dark:text-gray-400">{issue.fields.issuetype?.name}</span>
                  </div>
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={issue.fields.summary}
                    onSave={(v) => handleSummaryUpdate(issue, v)}
                  />
                </td>
                <td className="px-3 py-2">
                  <StatusTransition
                    issueKey={issue.key}
                    currentStatus={issue.fields.status.name}
                    colorName={issue.fields.status.statusCategory?.colorName || 'blue-gray'}
                    onTransitioned={onRefresh}
                  />
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={issue.fields.priority?.name || 'None'}
                    onSave={(v) => handlePriorityUpdate(issue, v)}
                    type="select"
                    options={priorities.map((p) => ({ label: p.name, value: p.name }))}
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {issue.fields.assignee?.displayName || 'Unassigned'}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span className="text-gray-600 dark:text-gray-400">
                    {issue.fields.project?.key}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <EditableCell
                    value={(issue.fields.labels || []).join(', ')}
                    onSave={(v) => handleLabelsUpdate(issue, v)}
                  />
                </td>
                <td className="px-3 py-2 text-gray-500 whitespace-nowrap text-xs">
                  {new Date(issue.fields.updated).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list */}
      <div className="md:hidden divide-y divide-gray-100 dark:divide-gray-800">
        {issues.map((issue) => (
          <div key={issue.id} className="p-3 space-y-2">
            {/* Top row: key + status */}
            <div className="flex items-center justify-between">
              <button
                onClick={() => onSelectIssue(issue.key)}
                className="font-mono text-blue-600 dark:text-blue-400 font-medium text-sm hover:underline"
              >
                {issue.key}
              </button>
              <StatusTransition
                issueKey={issue.key}
                currentStatus={issue.fields.status.name}
                colorName={issue.fields.status.statusCategory?.colorName || 'blue-gray'}
                onTransitioned={onRefresh}
              />
            </div>

            {/* Summary */}
            <div className="text-sm">
              <EditableCell
                value={issue.fields.summary}
                onSave={(v) => handleSummaryUpdate(issue, v)}
              />
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
              <div className="flex items-center gap-1">
                {issue.fields.issuetype?.iconUrl && (
                  <img src={proxyImageUrl(issue.fields.issuetype.iconUrl)} alt="" className="w-3.5 h-3.5" />
                )}
                {issue.fields.issuetype?.name}
              </div>
              <span>{issue.fields.project?.key}</span>
              <span>{issue.fields.priority?.name || 'No priority'}</span>
              <span>{issue.fields.assignee?.displayName || 'Unassigned'}</span>
              <span>{new Date(issue.fields.updated).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
