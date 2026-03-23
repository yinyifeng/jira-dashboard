import { useDroppable } from '@dnd-kit/core';
import { type JiraIssue } from '../api';
import KanbanCard from './KanbanCard';

interface KanbanColumnProps {
  id: string;
  color: string;
  issues: JiraIssue[];
  onSelectIssue: (key: string) => void;
  headerExtra?: React.ReactNode;
}

export default function KanbanColumn({ id, color, issues, onSelectIssue, headerExtra }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      className={`flex-shrink-0 w-72 md:w-80 flex flex-col rounded-xl transition-colors ${
        isOver ? 'bg-blue-50 dark:bg-blue-950/30 ring-2 ring-blue-400' : 'bg-gray-100/50 dark:bg-gray-900/50'
      }`}
    >
      {/* Column header */}
      <div className="px-3 py-2.5 flex items-center gap-2">
        <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">{id}</h3>
        <span className="text-xs text-gray-400 bg-gray-200 dark:bg-gray-800 px-1.5 py-0.5 rounded-full">
          {issues.length}
        </span>
        {headerExtra && <span className="ml-auto">{headerExtra}</span>}
      </div>

      {/* Cards */}
      <div className="flex-1 px-2 pb-2 space-y-2 overflow-y-auto max-h-[calc(100vh-280px)]">
        {issues.map((issue) => (
          <KanbanCard
            key={issue.key}
            issue={issue}
            onSelectIssue={onSelectIssue}
          />
        ))}
        {issues.length === 0 && (
          <div className="text-center py-8 text-xs text-gray-400">
            No issues
          </div>
        )}
      </div>
    </div>
  );
}
