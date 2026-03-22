import { useState, useMemo } from 'react';
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

// Category ordering for column sorting
const CATEGORY_ORDER: Record<string, number> = {
  'To Do': 0,
  'In Progress': 1,
  'Done': 2,
};

// Color dot for each category
const CATEGORY_COLORS: Record<string, string> = {
  'To Do': 'bg-gray-400 dark:bg-gray-500',
  'In Progress': 'bg-blue-400 dark:bg-blue-500',
  'Done': 'bg-green-400 dark:bg-green-500',
};

const DATE_FILTER_OPTIONS = [
  { label: 'All time', value: '' },
  { label: 'Today', value: '1d' },
  { label: 'Last 3 days', value: '3d' },
  { label: 'This week', value: '1w' },
  { label: 'Last 2 weeks', value: '2w' },
  { label: 'This month', value: '1m' },
  { label: 'Last 3 months', value: '3m' },
];

function getDateThreshold(filter: string): Date | null {
  if (!filter) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  if (filter === '1d') return now;
  if (filter === '3d') { now.setDate(now.getDate() - 3); return now; }
  if (filter === '1w') {
    const day = now.getDay();
    const diff = day === 0 ? 6 : day - 1;
    now.setDate(now.getDate() - diff);
    return now;
  }
  if (filter === '2w') { now.setDate(now.getDate() - 14); return now; }
  if (filter === '1m') { now.setMonth(now.getMonth() - 1); return now; }
  if (filter === '3m') { now.setMonth(now.getMonth() - 3); return now; }
  return null;
}

function getIssueDateForColumn(issue: JiraIssue, category: string): Date {
  if (category === 'Done') {
    const d = issue.fields.statuscategorychangedate || issue.fields.resolutiondate || issue.fields.updated;
    return new Date(d as string);
  }
  return new Date(issue.fields.updated);
}

export default function KanbanBoard({ issues, onRefresh, onSelectIssue }: KanbanBoardProps) {
  const [activeIssue, setActiveIssue] = useState<JiraIssue | null>(null);
  const [transitioning, setTransitioning] = useState<string | null>(null);
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set());
  const [columnDateFilters, setColumnDateFilters] = useState<Record<string, string>>({});
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  // Optimistic status overrides: issueKey -> { statusName, category }
  const [optimisticMoves, setOptimisticMoves] = useState<Record<string, { statusName: string; categoryName: string }>>({});

  // Clear optimistic overrides once real data catches up
  useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return;
    const resolved: string[] = [];
    for (const [key, override] of Object.entries(optimisticMoves)) {
      const real = issues.find((i) => i.key === key);
      if (real && real.fields.status.name === override.statusName) {
        resolved.push(key);
      }
    }
    if (resolved.length > 0) {
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        for (const k of resolved) delete next[k];
        return next;
      });
    }
  }, [issues, optimisticMoves]);

  // Apply optimistic overrides to issues
  const effectiveIssues = useMemo(() => {
    if (Object.keys(optimisticMoves).length === 0) return issues;
    return issues.map((issue) => {
      const override = optimisticMoves[issue.key];
      if (!override) return issue;
      return {
        ...issue,
        fields: {
          ...issue.fields,
          status: {
            ...issue.fields.status,
            name: override.statusName,
            statusCategory: {
              ...issue.fields.status.statusCategory,
              name: override.categoryName,
              colorName: issue.fields.status.statusCategory?.colorName || 'blue-gray',
            },
          },
        },
      };
    });
  }, [issues, optimisticMoves]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  );

  // Build columns dynamically from actual statuses in the issues
  const allColumns = useMemo(() => {
    const statusMap = new Map<string, { category: string; issues: JiraIssue[] }>();
    for (const issue of effectiveIssues) {
      const statusName = issue.fields.status.name;
      const categoryName = issue.fields.status.statusCategory?.name || 'To Do';
      if (!statusMap.has(statusName)) {
        statusMap.set(statusName, { category: categoryName, issues: [] });
      }
      statusMap.get(statusName)!.issues.push(issue);
    }

    return Array.from(statusMap.entries())
      .map(([name, { category, issues: columnIssues }]) => ({ name, category, issues: columnIssues }))
      .sort((a, b) => {
        const catDiff = (CATEGORY_ORDER[a.category] ?? 1) - (CATEGORY_ORDER[b.category] ?? 1);
        if (catDiff !== 0) return catDiff;
        return a.name.localeCompare(b.name);
      });
  }, [effectiveIssues]);

  // Apply visibility and date filters
  const visibleColumns = allColumns
    .filter((col) => !hiddenColumns.has(col.name))
    .map((col) => {
      const dateFilter = columnDateFilters[col.name] || '';
      const threshold = getDateThreshold(dateFilter);
      const allIssues = col.issues;
      const filtered = threshold
        ? allIssues.filter((issue) => getIssueDateForColumn(issue, col.category) >= threshold)
        : allIssues;
      return { ...col, issues: filtered, totalCount: allIssues.length };
    });

  const toggleColumn = (name: string) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const setDateFilter = (colName: string, value: string) => {
    setColumnDateFilters((prev) => ({ ...prev, [colName]: value }));
  };

  const handleDragStart = (event: DragStartEvent) => {
    const issue = issues.find((i) => i.key === event.active.id);
    setActiveIssue(issue || null);
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    setActiveIssue(null);
    const { active, over } = event;
    if (!over) return;

    const issueKey = active.id as string;
    const targetStatus = over.id as string;

    const issue = issues.find((i) => i.key === issueKey);
    if (!issue) return;

    const currentStatus = issue.fields.status.name;
    if (currentStatus === targetStatus) return;

    // Find the target column's category for optimistic update
    const targetCol = allColumns.find((c) => c.name === targetStatus);
    const targetCategory = targetCol?.category || 'In Progress';

    // Optimistically move the card immediately
    setOptimisticMoves((prev) => ({
      ...prev,
      [issueKey]: { statusName: targetStatus, categoryName: targetCategory },
    }));

    try {
      const transitions = await fetchTransitions(issueKey);
      const match = transitions.find((t) => t.to.name === targetStatus);

      if (match) {
        await transitionIssue(issueKey, match.id);
        // Refresh in background — keep optimistic override until new data arrives
        onRefresh();
      } else {
        // Revert optimistic move
        setOptimisticMoves((prev) => {
          const next = { ...prev };
          delete next[issueKey];
          return next;
        });
        console.warn(`No matching transition found for ${issueKey} → ${targetStatus}. Available:`, transitions.map(t => `${t.name} → ${t.to.name}`));
      }
    } catch (e) {
      // Revert optimistic move on error
      setOptimisticMoves((prev) => {
        const next = { ...prev };
        delete next[issueKey];
        return next;
      });
      console.error('Failed to transition issue:', e);
    }
  };

  return (
    <div>
      {/* Board settings bar */}
      <div className="flex items-center gap-2 mb-3">
        <div className="relative">
          <button
            onClick={() => setShowColumnSettings(!showColumnSettings)}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
            </svg>
            Columns
          </button>
          {showColumnSettings && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColumnSettings(false)} />
              <div className="absolute z-20 mt-1 left-0 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[280px]" onClick={(e) => e.stopPropagation()}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 border-b border-gray-100 dark:border-gray-700">
                  Show / Hide Columns
                </div>
                {allColumns.map((col) => (
                  <label
                    key={col.name}
                    className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={!hiddenColumns.has(col.name)}
                      onChange={() => toggleColumn(col.name)}
                      className="rounded border-gray-300 dark:border-gray-600 text-blue-500 focus:ring-blue-500"
                    />
                    <span className={`w-2 h-2 rounded-full ${CATEGORY_COLORS[col.category] || 'bg-gray-400'}`} />
                    <span className="text-xs text-gray-700 dark:text-gray-300">{col.name}</span>
                    <span className="text-[10px] text-gray-400 ml-auto">{col.issues.length}</span>
                  </label>
                ))}
                <div className="border-t border-gray-100 dark:border-gray-700 px-3 py-1.5 flex gap-2">
                  <button
                    onClick={(e) => { e.stopPropagation(); setHiddenColumns(new Set()); }}
                    className="text-[10px] text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Show all
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Per-column date filters (inline, shown for visible columns) */}
        {visibleColumns.map((col) => {
          const dateFilter = columnDateFilters[col.name] || '';
          if (!dateFilter && col.totalCount === col.issues.length) return null;
          return (
            <span key={col.name} className="text-[10px] text-gray-500 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
              {col.name}: {DATE_FILTER_OPTIONS.find(o => o.value === dateFilter)?.label || 'All time'}
              {col.issues.length !== col.totalCount && ` (${col.issues.length}/${col.totalCount})`}
            </span>
          );
        })}
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="flex gap-4 overflow-x-auto pb-4 min-h-[400px]">
          {visibleColumns.map((col) => (
            <KanbanColumn
              key={col.name}
              id={col.name}
              color={CATEGORY_COLORS[col.category] || 'bg-gray-400 dark:bg-gray-500'}
              issues={col.issues}
              transitioning={transitioning}
              onSelectIssue={onSelectIssue}
              headerExtra={
                <div className="flex items-center gap-1">
                  <select
                    value={columnDateFilters[col.name] || ''}
                    onChange={(e) => setDateFilter(col.name, e.target.value)}
                    className="text-[10px] bg-transparent border border-gray-300 dark:border-gray-600 rounded px-1 py-0.5 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer focus:outline-none"
                    title="Filter by date"
                  >
                    {DATE_FILTER_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  {col.issues.length !== col.totalCount && (
                    <span className="text-[10px] text-gray-400">/ {col.totalCount}</span>
                  )}
                </div>
              }
            />
          ))}
        </div>

        <DragOverlay>
          {activeIssue && (
            <KanbanCard issue={activeIssue} isDragging onSelectIssue={() => {}} />
          )}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
