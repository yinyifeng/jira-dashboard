import { useDraggable } from '@dnd-kit/core';
import { type JiraIssue } from '../api';
import StatusBadge from './StatusBadge';

const PROJECT_THEMES: { border: string; badge: string }[] = [
  { border: 'border-l-blue-500', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
  { border: 'border-l-rose-500', badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
  { border: 'border-l-emerald-500', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
  { border: 'border-l-violet-500', badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
  { border: 'border-l-amber-500', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
  { border: 'border-l-cyan-500', badge: 'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300' },
  { border: 'border-l-pink-500', badge: 'bg-pink-100 dark:bg-pink-900/40 text-pink-700 dark:text-pink-300' },
  { border: 'border-l-lime-500', badge: 'bg-lime-100 dark:bg-lime-900/40 text-lime-700 dark:text-lime-300' },
  { border: 'border-l-indigo-500', badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' },
  { border: 'border-l-orange-500', badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300' },
];

// Assign colors by order of appearance — guarantees visually distinct colors
const projectColorMap = new Map<string, number>();
function getProjectColorIndex(key: string): number {
  if (!projectColorMap.has(key)) {
    projectColorMap.set(key, projectColorMap.size % PROJECT_THEMES.length);
  }
  return projectColorMap.get(key)!;
}

interface KanbanCardProps {
  issue: JiraIssue;
  isDragging?: boolean;
  isTransitioning?: boolean;
  onSelectIssue: (key: string) => void;
}

export default function KanbanCard({ issue, isDragging, isTransitioning, onSelectIssue }: KanbanCardProps) {
  const projectKey = issue.fields.project?.key || '';
  const theme = PROJECT_THEMES[getProjectColorIndex(projectKey)];
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: issue.key,
  });

  const pointerStart = { x: 0, y: 0 };

  const style = transform
    ? { transform: `translate(${transform.x}px, ${transform.y}px)` }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      onPointerDown={(e) => {
        pointerStart.x = e.clientX;
        pointerStart.y = e.clientY;
        listeners?.onPointerDown?.(e as never);
      }}
      onClick={(e) => {
        // Only open detail if user didn't drag (moved less than 5px)
        const dx = e.clientX - pointerStart.x;
        const dy = e.clientY - pointerStart.y;
        if (Math.abs(dx) < 5 && Math.abs(dy) < 5) {
          onSelectIssue(issue.key);
        }
      }}
      className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 border-l-[3px] ${theme.border} p-3 cursor-pointer active:cursor-grabbing transition-shadow ${
        isDragging ? 'shadow-lg opacity-90 rotate-2 cursor-grabbing' : 'shadow-sm hover:shadow-md'
      } ${isTransitioning ? 'opacity-50 pointer-events-none' : ''}`}
    >
      {/* Top row: key + priority */}
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-mono text-xs text-blue-600 dark:text-blue-400 font-medium">
          {issue.key}
        </span>
        <div className="flex items-center gap-1.5">
          {(issue.fields as Record<string, unknown>).duedate && (() => {
            const due = new Date((issue.fields as Record<string, unknown>).duedate as string);
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const diffDays = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
            const isDone = issue.fields.status.statusCategory?.name === 'Done';
            const isOverdue = diffDays < 0 && !isDone;
            const isDueSoon = diffDays >= 0 && diffDays <= 1 && !isDone;
            const color = isOverdue
              ? 'text-red-600 dark:text-red-400'
              : isDueSoon
                ? 'text-orange-600 dark:text-orange-400'
                : 'text-gray-500 dark:text-gray-400';
            return (
              <span className={`text-[10px] flex items-center gap-0.5 ${color}`} title={`Due: ${due.toLocaleDateString()}`}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                {due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </span>
            );
          })()}
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
          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${theme.badge}`}>
            {issue.fields.project?.key}
          </span>
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
