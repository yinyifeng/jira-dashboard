import { useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  closestCenter,
} from '@dnd-kit/core';
import { type JiraIssue, fetchTransitions, transitionIssue } from '../api';
import KanbanColumn from './KanbanColumn';
import KanbanCard from './KanbanCard';

interface KanbanBoardProps {
  issues: JiraIssue[];
  onRefresh: () => void;
  onSelectIssue: (key: string) => void;
}

const COLUMNS = [
  { id: 'To Do', colorName: 'blue-gray', color: 'bg-gray-200 dark:bg-gray-700' },
  { id: 'In Progress', colorName: 'blue', color: 'bg-blue-200 dark:bg-blue-800' },
  { id: 'Done', colorName: 'green', color: 'bg-green-200 dark:bg-green-800' },
];

function getStartOfWeek(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const diff = day === 0 ? 6 : day - 1; // days since Monday
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function KanbanBoard({ issues, onRefresh, onSelectIssue }: KanbanBoardProps) {
  const [activeIssue, setActiveIssue] = useState<JiraIssue | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [showAllDone, setShowAllDone] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  const weekStart = getStartOfWeek();

  const groupedIssues: Record<string, JiraIssue[]> = {};
  for (const col of COLUMNS) {
    groupedIssues[col.id] = [];
  }
  for (const issue of issues) {
    const category = issue.fields.status.statusCategory?.name || 'To Do';
    if (groupedIssues[category]) {
      groupedIssues[category].push(issue);
    } else {
      groupedIssues['To Do'].push(issue);
    }
  }

  // Filter Done column to only show issues resolved/completed this week (since Monday)
  const allDone = groupedIssues['Done'];
  const thisWeekDone = allDone.filter((issue) => {
    const doneDate = issue.fields.statuscategorychangedate || issue.fields.resolutiondate || issue.fields.updated;
    return new Date(doneDate as string) >= weekStart;
  });
  groupedIssues['Done'] = showAllDone ? allDone : thisWeekDone;

  const handleDragStart = (event: DragStartEvent) => {
    const issue = issues.find((i) => i.key === event.active.id);
    setActiveIssue(issue || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;

    const issueKey = active.id as string;
    const targetColumn = over.id as string;

    const issue = issues.find((i) => i.key === issueKey);
    if (!issue) return;

    const currentCategory = issue.fields.status.statusCategory?.name || 'To Do';
    if (currentCategory === targetColumn) return;

    setTransitioning(issueKey);
    try {
      const transitions = await fetchTransitions(issueKey);
      // Find a transition that leads to the target status category
      const match = transitions.find((t) => {
        // The transition's target status name often matches the column,
        // but we need to check category. We'll match by name heuristic.
        const toName = t.to.name.toLowerCase();
        const target = targetColumn.toLowerCase();
        if (target === 'to do') return toName.includes('to do') || toName.includes('backlog') || toName.includes('open');
        if (target === 'in progress') return toName.includes('progress') || toName.includes('review') || toName.includes('doing');
        if (target === 'done') return toName.includes('done') || toName.includes('closed') || toName.includes('resolved') || toName.includes('complete');
        return false;
      });

      if (match) {
        await transitionIssue(issueKey, match.id);
        onRefresh();
      } else {
        // If no heuristic match, try first transition that leads anywhere in target category
        // Fall back to showing available transitions
        console.warn(`No matching transition found for ${issueKey} → ${targetColumn}. Available:`, transitions.map(t => `${t.name} → ${t.to.name}`));
      }
    } catch (e) {
      console.error('Failed to transition issue:', e);
    } finally {
      setTransitioning(null);
    }
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            color={col.color}
            issues={groupedIssues[col.id]}
            transitioning={transitioning}
            onSelectIssue={onSelectIssue}
            headerExtra={col.id === 'Done' ? (
              <button
                onClick={() => setShowAllDone(!showAllDone)}
                className="text-[10px] px-1.5 py-0.5 rounded border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                {showAllDone ? 'This week' : `All (${allDone.length})`}
              </button>
            ) : undefined}
          />
        ))}
      </div>

      <DragOverlay>
        {activeIssue && (
          <KanbanCard issue={activeIssue} isDragging onSelectIssue={() => {}} />
        )}
      </DragOverlay>
    </DndContext>
  );
}
