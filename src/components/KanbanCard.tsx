import { useDraggable } from '@dnd-kit/core';
import { type JiraIssue } from '../api';
import StatusBadge from './StatusBadge';

interface KanbanCardProps {
  issue: JiraIssue;
  isDragging?: boolean;
  isTransitioning?: boolean;
  onSelectIssue: (key: string) => void;
}

export default function KanbanCard({ issue, isDragging, isTransitioning, onSelectIssue }: KanbanCardProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: issue.key,
  });

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-grab active:cursor-grabbing transition-shadow ${
        isDragging ? 'shadow-lg opacity-90 rotate-2' : 'shadow-sm hover:shadow-md'
      } ${isTransitioning ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* Top row: key + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onSelectIssue(issue.key);
          }}
          onPointerDown={(e) => e.stopPropagation()}
          className="font-mono text-xs text-blue-600 dark:text-blue-400 font-medium hover:underline"
        >
          {issue.key}
        </button>
        <div className="flex items-center gap-1.5">
          {issue.fields.priority?.iconUrl && (
            <img src={issue.fields.priority.iconUrl} alt={issue.fields.priority.name} className="w-3.5 h-3.5" title={issue.fields.priority.name} />
          )}
          {issue.fields.issuetype?.iconUrl && (
            <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype.name} className="w-3.5 h-3.5" title={issue.fields.issuetype.name} />
          )}
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-gray-800 dark:text-gray-200 leading-snug mb-2 line-clamp-2">
        {issue.fields.summary}
      </p>

      {/* Bottom row: status + assignee + project */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <StatusBadge
            name={issue.fields.status.name}
            colorName={issue.fields.status.statusCategory?.colorName || 'blue-gray'}
          />
          <span className="text-xs text-gray-400">{issue.fields.project?.key}</span>
        </div>
        {issue.fields.assignee?.avatarUrls?.['16x16'] ? (
          <img
            src={issue.fields.assignee.avatarUrls['16x16']}
            alt={issue.fields.assignee.displayName}
            title={issue.fields.assignee.displayName}
            className="w-5 h-5 rounded-full"
          />
        ) : (
          <span className="text-xs text-gray-400">Unassigned</span>
        )}
      </div>

      {/* Labels */}
      {issue.fields.labels && issue.fields.labels.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          {issue.fields.labels.map((label) => (
            <span key={label} className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">
              {label}
            </span>
          ))}
        </div>
      )}

      {isTransitioning && (
        <div className="mt-2 text-xs text-blue-500 animate-pulse">Moving...</div>
      )}
    </div>
  );
}
