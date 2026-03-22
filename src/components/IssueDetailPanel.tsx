import { useState, useEffect } from 'react';
import {
  fetchIssueDetail,
  fetchComments,
  fetchPriorities,
  fetchIssueTypes,
  fetchTransitions,
  transitionIssue,
  searchUsers,
  addComment,
  editComment,
  deleteComment,
  updateIssue,
  type JiraIssue,
  type JiraComment,
} from '../api';
import StatusBadge from './StatusBadge';

interface IssueDetailPanelProps {
  issueKey: string;
  onClose: () => void;
  onUpdated: () => void;
}

// --- ADF to plain text (for editing) ---
function adfToText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.type === 'text') return n.text || '';
  if (Array.isArray(n.content)) return n.content.map(adfToText).join('');
  return '';
}

function adfToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as { content?: unknown[] };
  if (!Array.isArray(d.content)) return '';
  return d.content
    .map((block) => {
      const b = block as { type?: string; content?: unknown[] };
      if (b.type === 'paragraph' && Array.isArray(b.content)) return b.content.map(adfToText).join('');
      if (b.type === 'heading' && Array.isArray(b.content)) return b.content.map(adfToText).join('');
      if (b.type === 'bulletList' || b.type === 'orderedList') {
        return ((b as { content?: unknown[] }).content || [])
          .map((item) => {
            const li = item as { content?: unknown[] };
            return '  - ' + (li.content || []).map((p) => ((p as { content?: unknown[] }).content || []).map(adfToText).join('')).join('');
          }).join('\n');
      }
      if (b.type === 'codeBlock' && Array.isArray(b.content)) return b.content.map(adfToText).join('');
      return adfToText(block);
    }).join('\n');
}

// --- ADF to HTML (for rich display) ---
function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function adfInlineToHtml(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const n = node as { type?: string; text?: string; content?: unknown[]; marks?: { type: string }[]; attrs?: Record<string, string> };

  if (n.type === 'text') {
    let html = escHtml(n.text || '');
    if (n.marks) {
      for (const mark of n.marks) {
        if (mark.type === 'strong') html = `<strong>${html}</strong>`;
        else if (mark.type === 'em') html = `<em>${html}</em>`;
        else if (mark.type === 'code') html = `<code class="adf-code">${html}</code>`;
        else if (mark.type === 'strike') html = `<del>${html}</del>`;
        else if (mark.type === 'underline') html = `<u>${html}</u>`;
        else if (mark.type === 'link') html = `<a href="${escHtml((mark as unknown as { attrs?: { href?: string } }).attrs?.href || '#')}" target="_blank" rel="noopener" class="adf-link">${html}</a>`;
      }
    }
    return html;
  }
  if (n.type === 'hardBreak') return '<br/>';
  if (n.type === 'mention') return `<span class="adf-mention">@${escHtml((n.attrs as Record<string, string>)?.text || '')}</span>`;
  if (n.type === 'emoji') return (n.attrs as Record<string, string>)?.text || '';
  if (n.type === 'inlineCard') return `<a href="${escHtml((n.attrs as Record<string, string>)?.url || '#')}" target="_blank" rel="noopener" class="adf-link">${escHtml((n.attrs as Record<string, string>)?.url || 'link')}</a>`;
  if (Array.isArray(n.content)) return n.content.map(adfInlineToHtml).join('');
  return '';
}

function adfBlockToHtml(block: unknown): string {
  if (!block || typeof block !== 'object') return '';
  const b = block as { type?: string; content?: unknown[]; attrs?: Record<string, unknown> };

  const inlines = Array.isArray(b.content) ? b.content.map(adfInlineToHtml).join('') : '';

  switch (b.type) {
    case 'paragraph':
      return `<p>${inlines}</p>`;
    case 'heading': {
      const level = (b.attrs as { level?: number })?.level || 3;
      return `<h${level}>${inlines}</h${level}>`;
    }
    case 'bulletList':
      return `<ul>${(b.content || []).map(adfBlockToHtml).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${(b.content || []).map(adfBlockToHtml).join('')}</ol>`;
    case 'listItem':
      return `<li>${(b.content || []).map(adfBlockToHtml).join('')}</li>`;
    case 'codeBlock':
      return `<pre class="adf-codeblock"><code>${inlines}</code></pre>`;
    case 'blockquote':
      return `<blockquote class="adf-blockquote">${(b.content || []).map(adfBlockToHtml).join('')}</blockquote>`;
    case 'rule':
      return '<hr/>';
    case 'mediaSingle':
    case 'mediaGroup':
      return (b.content || []).map(adfBlockToHtml).join('');
    case 'media':
      return '<p class="adf-media">[media attachment]</p>';
    case 'table':
      return `<table class="adf-table">${(b.content || []).map(adfBlockToHtml).join('')}</table>`;
    case 'tableRow':
      return `<tr>${(b.content || []).map(adfBlockToHtml).join('')}</tr>`;
    case 'tableHeader':
      return `<th>${(b.content || []).map(adfBlockToHtml).join('')}</th>`;
    case 'tableCell':
      return `<td>${(b.content || []).map(adfBlockToHtml).join('')}</td>`;
    case 'panel':
      return `<div class="adf-panel">${(b.content || []).map(adfBlockToHtml).join('')}</div>`;
    default:
      return inlines || '';
  }
}

function adfToHtml(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as { content?: unknown[] };
  if (!Array.isArray(d.content)) return '';
  return d.content.map(adfBlockToHtml).join('');
}

export default function IssueDetailPanel({ issueKey, onClose, onUpdated }: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<JiraIssue | null>(null);
  const [comments, setComments] = useState<JiraComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  // New comment
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);

  // Edit comment
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentDraft, setEditCommentDraft] = useState('');
  const [savingComment, setSavingComment] = useState(false);

  // Field editing
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState('');
  const [savingSummary, setSavingSummary] = useState(false);

  const [priorities, setPriorities] = useState<{ name: string; id: string }[]>([]);
  const [editingPriority, setEditingPriority] = useState(false);
  const [savingPriority, setSavingPriority] = useState(false);

  const [editingLabels, setEditingLabels] = useState(false);
  const [labelsDraft, setLabelsDraft] = useState('');
  const [savingLabels, setSavingLabels] = useState(false);

  const [transitions, setTransitions] = useState<{ id: string; name: string; to: { name: string } }[]>([]);
  const [showTransitions, setShowTransitions] = useState(false);
  const [savingTransition, setSavingTransition] = useState(false);

  const [editingAssignee, setEditingAssignee] = useState(false);
  const [userQuery, setUserQuery] = useState('');
  const [userResults, setUserResults] = useState<{ accountId: string; displayName: string }[]>([]);
  const [savingAssignee, setSavingAssignee] = useState(false);

  const [issueTypes, setIssueTypes] = useState<{ id: string; name: string; iconUrl: string }[]>([]);
  const [editingType, setEditingType] = useState(false);
  const [savingType, setSavingType] = useState(false);

  // Editable fields: time & dates
  const [editingField, setEditingField] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');
  const [savingField, setSavingField] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [issueData, commentsData] = await Promise.all([
        fetchIssueDetail(issueKey),
        fetchComments(issueKey),
      ]);
      setIssue(issueData);
      setComments(commentsData);
      setDescDraft(adfToPlainText(issueData.fields.description));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [issueKey]);

  const handleSaveDescription = async () => {
    setSavingDesc(true);
    try {
      const description = {
        type: 'doc',
        version: 1,
        content: descDraft.split('\n').map((line) => ({
          type: 'paragraph',
          content: line ? [{ type: 'text', text: line }] : [],
        })),
      };
      await updateIssue(issueKey, { description });
      setEditingDesc(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save description');
    } finally {
      setSavingDesc(false);
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;
    setAddingComment(true);
    try {
      await addComment(issueKey, newComment);
      setNewComment('');
      const updated = await fetchComments(issueKey);
      setComments(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add comment');
    } finally {
      setAddingComment(false);
    }
  };

  const handleEditComment = async (commentId: string) => {
    if (!editCommentDraft.trim()) return;
    setSavingComment(true);
    try {
      await editComment(issueKey, commentId, editCommentDraft);
      setEditingCommentId(null);
      const updated = await fetchComments(issueKey);
      setComments(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to edit comment');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await deleteComment(issueKey, commentId);
      setComments((prev) => prev.filter((c) => c.id !== commentId));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete comment');
    }
  };

  const startEditComment = (c: JiraComment) => {
    setEditingCommentId(c.id);
    setEditCommentDraft(adfToPlainText(c.body));
  };

  const handleSaveSummary = async () => {
    if (!summaryDraft.trim() || summaryDraft === issue?.fields.summary) {
      setEditingSummary(false);
      return;
    }
    setSavingSummary(true);
    try {
      await updateIssue(issueKey, { summary: summaryDraft });
      setEditingSummary(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save summary');
    } finally {
      setSavingSummary(false);
    }
  };

  const handleSavePriority = async (priorityId: string) => {
    setSavingPriority(true);
    try {
      await updateIssue(issueKey, { priority: { id: priorityId } });
      setEditingPriority(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save priority');
    } finally {
      setSavingPriority(false);
    }
  };

  const handleSaveLabels = async () => {
    setSavingLabels(true);
    try {
      const labels = labelsDraft.split(',').map(l => l.trim()).filter(Boolean);
      await updateIssue(issueKey, { labels });
      setEditingLabels(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save labels');
    } finally {
      setSavingLabels(false);
    }
  };

  const handleTransition = async (transitionId: string) => {
    setSavingTransition(true);
    try {
      await transitionIssue(issueKey, transitionId);
      setShowTransitions(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to transition');
    } finally {
      setSavingTransition(false);
    }
  };

  const handleOpenTransitions = async () => {
    setShowTransitions(!showTransitions);
    if (!showTransitions) {
      const t = await fetchTransitions(issueKey);
      setTransitions(t);
    }
  };

  const handleSearchUsers = async (query: string) => {
    setUserQuery(query);
    if (query.length >= 2) {
      const results = await searchUsers(query);
      setUserResults(results);
    } else {
      setUserResults([]);
    }
  };

  const handleAssign = async (accountId: string) => {
    setSavingAssignee(true);
    try {
      await updateIssue(issueKey, { assignee: { accountId } });
      setEditingAssignee(false);
      setUserQuery('');
      setUserResults([]);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update assignee');
    } finally {
      setSavingAssignee(false);
    }
  };

  const handleOpenPriorities = async () => {
    setEditingPriority(!editingPriority);
    if (!editingPriority && priorities.length === 0) {
      const p = await fetchPriorities();
      setPriorities(p);
    }
  };

  const handleOpenIssueTypes = async () => {
    setEditingType(!editingType);
    if (!editingType && issueTypes.length === 0) {
      const types = await fetchIssueTypes(issue?.fields.project?.key);
      setIssueTypes(types);
    }
  };

  const handleChangeType = async (typeId: string) => {
    setSavingType(true);
    try {
      await updateIssue(issueKey, { issuetype: { id: typeId } });
      setEditingType(false);
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to change type');
    } finally {
      setSavingType(false);
    }
  };

  const handleSaveField = async (fieldName: string, value: unknown) => {
    setSavingField(true);
    try {
      await updateIssue(issueKey, { [fieldName]: value });
      setEditingField(null);
      setFieldDraft('');
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : `Failed to save ${fieldName}`);
    } finally {
      setSavingField(false);
    }
  };

  const handleSaveTimeTracking = async (field: 'originalEstimate' | 'timeSpent', value: string) => {
    setSavingField(true);
    try {
      // Jira expects timetracking as a nested object with the specific field
      await updateIssue(issueKey, { timetracking: { [field]: value } });
      setEditingField(null);
      setFieldDraft('');
      onUpdated();
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save time');
    } finally {
      setSavingField(false);
    }
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8" onClick={onClose}>
        <div
          className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl border border-gray-200 dark:border-gray-800 flex flex-col max-h-[calc(100vh-4rem)]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              {/* Issue type — click to change */}
              <div className="relative">
                <button
                  onClick={handleOpenIssueTypes}
                  className="flex items-center gap-1 hover:bg-gray-100 dark:hover:bg-gray-800 rounded px-1.5 py-1 transition-colors"
                  title={`Type: ${issue?.fields.issuetype?.name || ''} (click to change)`}
                >
                  {issue?.fields.issuetype?.iconUrl && (
                    <img src={issue.fields.issuetype.iconUrl} alt={issue.fields.issuetype?.name} className="w-5 h-5" />
                  )}
                  <span className="text-xs text-gray-500">{issue?.fields.issuetype?.name}</span>
                </button>
                {editingType && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setEditingType(false)} />
                    <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px] left-0">
                      {savingType ? (
                        <div className="px-3 py-2 text-sm text-gray-500 animate-pulse">Saving...</div>
                      ) : issueTypes.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => handleChangeType(t.id)}
                          className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 ${t.name === issue?.fields.issuetype?.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}`}
                        >
                          {t.iconUrl && <img src={t.iconUrl} alt="" className="w-4 h-4" />}
                          {t.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
              <span className="text-gray-300 dark:text-gray-600">/</span>
              {issue && (
                <span className="text-sm text-gray-500">
                  {issue.fields.project?.name} <span className="text-xs text-gray-400">({issue.fields.project?.key})</span>
                </span>
              )}
              <span className="text-gray-300 dark:text-gray-600">/</span>
              <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold">
                {issueKey}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-400 hover:text-gray-600"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {loading ? (
            <div className="py-20 text-center text-gray-400">
              <div className="animate-spin inline-block w-6 h-6 border-2 border-gray-300 border-t-blue-500 rounded-full mb-3" />
              <p>Loading issue...</p>
            </div>
          ) : error && !issue ? (
            <div className="m-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
              {error}
            </div>
          ) : issue ? (
            <div className="flex flex-col md:flex-row min-h-0 flex-1 overflow-hidden">
              {/* Main content — left side */}
              <div className="flex-1 px-6 py-5 space-y-5 md:border-r border-gray-200 dark:border-gray-800 min-w-0 overflow-y-auto">
                {error && (
                  <div className="p-2.5 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-xs text-red-700 dark:text-red-400">
                    {error}
                  </div>
                )}

                {/* Summary */}
                {editingSummary ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={summaryDraft}
                      onChange={(e) => setSummaryDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveSummary();
                        if (e.key === 'Escape') { setEditingSummary(false); setSummaryDraft(issue.fields.summary); }
                      }}
                      autoFocus
                      className="w-full text-lg font-semibold border border-blue-400 rounded-lg px-3 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex gap-2">
                      <button onClick={handleSaveSummary} disabled={savingSummary} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                        {savingSummary ? 'Saving...' : 'Save'}
                      </button>
                      <button onClick={() => { setEditingSummary(false); setSummaryDraft(issue.fields.summary); }} className="text-xs px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <h2
                    className="text-lg font-semibold text-gray-900 dark:text-gray-100 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 -mx-2 transition-colors"
                    onClick={() => { setEditingSummary(true); setSummaryDraft(issue.fields.summary); }}
                    title="Click to edit"
                  >
                    {issue.fields.summary}
                  </h2>
                )}

                {/* Description */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Description</h3>
                  {editingDesc ? (
                    <div className="space-y-2">
                      <textarea
                        value={descDraft}
                        onChange={(e) => setDescDraft(e.target.value)}
                        rows={8}
                        autoFocus
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveDescription} disabled={savingDesc} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                          {savingDesc ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingDesc(false); setDescDraft(adfToPlainText(issue.fields.description)); }} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      onClick={() => setEditingDesc(true)}
                      title="Click to edit"
                    >
                      {adfToHtml(issue.fields.description) ? (
                        <div
                          className="adf-content text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-h-[40px]"
                          dangerouslySetInnerHTML={{ __html: adfToHtml(issue.fields.description) }}
                        />
                      ) : (
                        <div className="text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-h-[40px]">
                          <span className="text-gray-400 italic">Click to add description...</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Activity / Comments */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-3">
                    Activity <span className="text-gray-300 dark:text-gray-600">({comments.length})</span>
                  </h3>

                  {/* Add comment — top */}
                  <div className="flex gap-3 mb-4">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold flex-shrink-0">
                      You
                    </div>
                    <div className="flex-1">
                      <textarea
                        value={newComment}
                        onChange={(e) => setNewComment(e.target.value)}
                        placeholder="Add a comment..."
                        rows={2}
                        className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                      />
                      {newComment.trim() && (
                        <div className="flex gap-2 mt-2">
                          <button
                            onClick={handleAddComment}
                            disabled={addingComment}
                            className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {addingComment ? 'Saving...' : 'Save'}
                          </button>
                          <button onClick={() => setNewComment('')} className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700">
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Comment list */}
                  <div className="space-y-0">
                    {comments.map((c, i) => (
                      <div key={c.id} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                        {/* Avatar */}
                        {c.author.avatarUrls?.['24x24'] ? (
                          <img src={c.author.avatarUrls['24x24']} alt="" className="w-8 h-8 rounded-full flex-shrink-0" />
                        ) : (
                          <div className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-xs font-semibold text-gray-500 flex-shrink-0">
                            {c.author.displayName.charAt(0)}
                          </div>
                        )}

                        <div className="flex-1 min-w-0">
                          {/* Author line */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                              {c.author.displayName}
                            </span>
                            <span className="text-xs text-gray-400" title={new Date(c.created).toLocaleString()}>
                              {timeAgo(c.created)}
                            </span>
                            {c.updated !== c.created && (
                              <span className="text-xs text-gray-400 italic" title={new Date(c.updated).toLocaleString()}>
                                (edited)
                              </span>
                            )}
                          </div>

                          {/* Comment body or edit form */}
                          {editingCommentId === c.id ? (
                            <div className="space-y-2">
                              <textarea
                                value={editCommentDraft}
                                onChange={(e) => setEditCommentDraft(e.target.value)}
                                rows={3}
                                autoFocus
                                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                              />
                              <div className="flex gap-2">
                                <button onClick={() => handleEditComment(c.id)} disabled={savingComment} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                                  {savingComment ? 'Saving...' : 'Save'}
                                </button>
                                <button onClick={() => setEditingCommentId(null)} className="text-xs px-2.5 py-1 text-gray-500 hover:text-gray-700">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="group">
                              <div
                                className="adf-content text-sm text-gray-700 dark:text-gray-300 leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: adfToHtml(c.body) }}
                              />
                              <div className="flex gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button onClick={() => startEditComment(c)} className="text-xs text-gray-400 hover:text-blue-600">
                                  Edit
                                </button>
                                <button onClick={() => handleDeleteComment(c.id)} className="text-xs text-gray-400 hover:text-red-500">
                                  Delete
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                    {comments.length === 0 && (
                      <p className="text-sm text-gray-400 italic py-2">No comments yet</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sidebar — right side (fields) */}
              <div className="w-full md:w-64 px-6 py-5 space-y-4 text-sm flex-shrink-0 overflow-y-auto">
                {/* Status */}
                <div className="relative">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Status</span>
                  <button onClick={handleOpenTransitions} className="hover:opacity-80">
                    <StatusBadge name={issue.fields.status.name} colorName={issue.fields.status.statusCategory?.colorName || 'blue-gray'} />
                  </button>
                  {showTransitions && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowTransitions(false)} />
                      <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[180px] right-0">
                        {transitions.map((t) => (
                          <button
                            key={t.id}
                            onClick={() => handleTransition(t.id)}
                            disabled={savingTransition}
                            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                          >
                            {t.name} → <span className="font-medium">{t.to.name}</span>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Assignee */}
                <div className="relative">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Assignee</span>
                  {editingAssignee ? (
                    <div>
                      <input
                        type="text"
                        value={userQuery}
                        onChange={(e) => handleSearchUsers(e.target.value)}
                        placeholder="Search users..."
                        autoFocus
                        className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      {userResults.length > 0 && (
                        <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 w-full">
                          {userResults.map((u) => (
                            <button
                              key={u.accountId}
                              onClick={() => handleAssign(u.accountId)}
                              disabled={savingAssignee}
                              className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50"
                            >
                              {u.displayName}
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => { setEditingAssignee(false); setUserQuery(''); setUserResults([]); }} className="text-xs text-gray-400 mt-1 hover:underline">Cancel</button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setEditingAssignee(true)}
                      className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 -mx-2 transition-colors w-full"
                    >
                      {issue.fields.assignee?.avatarUrls?.['24x24'] ? (
                        <img src={issue.fields.assignee.avatarUrls['24x24']} alt="" className="w-6 h-6 rounded-full" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                      )}
                      <span className="text-gray-700 dark:text-gray-300">{issue.fields.assignee?.displayName || 'Unassigned'}</span>
                    </button>
                  )}
                </div>

                {/* Priority */}
                <div className="relative">
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Priority</span>
                  <button
                    onClick={handleOpenPriorities}
                    className="flex items-center gap-2 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 -mx-2 transition-colors w-full"
                  >
                    {issue.fields.priority?.iconUrl && <img src={issue.fields.priority.iconUrl} alt="" className="w-4 h-4" />}
                    <span className="text-gray-700 dark:text-gray-300">{issue.fields.priority?.name || 'None'}</span>
                  </button>
                  {editingPriority && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setEditingPriority(false)} />
                      <div className="absolute z-20 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg py-1 min-w-[160px] right-0">
                        {savingPriority ? (
                          <div className="px-3 py-2 text-sm text-gray-500 animate-pulse">Saving...</div>
                        ) : priorities.map((p) => (
                          <button
                            key={p.id}
                            onClick={() => handleSavePriority(p.id)}
                            className={`w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 ${p.name === issue.fields.priority?.name ? 'font-semibold text-blue-600 dark:text-blue-400' : ''}`}
                          >
                            {p.name}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Labels */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Labels</span>
                  {editingLabels ? (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        value={labelsDraft}
                        onChange={(e) => setLabelsDraft(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveLabels();
                          if (e.key === 'Escape') setEditingLabels(false);
                        }}
                        autoFocus
                        placeholder="label1, label2"
                        className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button onClick={handleSaveLabels} disabled={savingLabels} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                          {savingLabels ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => setEditingLabels(false)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setEditingLabels(true); setLabelsDraft(issue.fields.labels?.join(', ') || ''); }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg px-2 py-1 -mx-2 transition-colors text-left w-full"
                    >
                      {issue.fields.labels && issue.fields.labels.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {issue.fields.labels.map((l) => (
                            <span key={l} className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">{l}</span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">None</span>
                      )}
                    </button>
                  )}
                </div>

                {/* Reporter */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Reporter</span>
                  <div className="flex items-center gap-2">
                    {(issue.fields.reporter as { avatarUrls?: Record<string, string>; displayName?: string })?.avatarUrls?.['24x24'] ? (
                      <img src={(issue.fields.reporter as { avatarUrls: Record<string, string> }).avatarUrls['24x24']} alt="" className="w-6 h-6 rounded-full" />
                    ) : (
                      <div className="w-6 h-6 rounded-full bg-gray-200 dark:bg-gray-700" />
                    )}
                    <span className="text-gray-700 dark:text-gray-300">
                      {(issue.fields.reporter as { displayName?: string })?.displayName || 'None'}
                    </span>
                  </div>
                </div>

                <hr className="border-gray-100 dark:border-gray-800" />

                {/* Time tracking */}
                {(() => {
                  const tt = issue.fields.timetracking as { originalEstimate?: string; remainingEstimate?: string; timeSpent?: string; originalEstimateSeconds?: number; timeSpentSeconds?: number } | undefined;
                  const formatTime = (seconds: number) => {
                    const h = Math.floor(seconds / 3600);
                    const m = Math.floor((seconds % 3600) / 60);
                    if (h > 0 && m > 0) return `${h}h ${m}m`;
                    if (h > 0) return `${h}h`;
                    return `${m}m`;
                  };
                  return (
                    <>
                      {/* Estimated */}
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Estimated</span>
                        {editingField === 'originalEstimate' ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={fieldDraft}
                              onChange={(e) => setFieldDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTimeTracking('originalEstimate', fieldDraft);
                                if (e.key === 'Escape') setEditingField(null);
                              }}
                              autoFocus
                              placeholder="e.g. 2w 3d 4h"
                              className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveTimeTracking('originalEstimate', fieldDraft)} disabled={savingField} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md disabled:opacity-50">{savingField ? 'Saving...' : 'Save'}</button>
                              <button onClick={() => setEditingField(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingField('originalEstimate'); setFieldDraft(tt?.originalEstimate || ''); }}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full text-gray-700 dark:text-gray-300"
                          >
                            {tt?.originalEstimate || <span className="text-gray-400 italic">None</span>}
                          </button>
                        )}
                      </div>

                      {/* Logged */}
                      <div>
                        <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Logged</span>
                        {editingField === 'timeSpent' ? (
                          <div className="space-y-1.5">
                            <input
                              type="text"
                              value={fieldDraft}
                              onChange={(e) => setFieldDraft(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveTimeTracking('timeSpent', fieldDraft);
                                if (e.key === 'Escape') setEditingField(null);
                              }}
                              autoFocus
                              placeholder="e.g. 1d 2h 30m"
                              className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <div className="flex gap-2">
                              <button onClick={() => handleSaveTimeTracking('timeSpent', fieldDraft)} disabled={savingField} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md disabled:opacity-50">{savingField ? 'Saving...' : 'Save'}</button>
                              <button onClick={() => setEditingField(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => { setEditingField('timeSpent'); setFieldDraft(tt?.timeSpent || ''); }}
                            className="hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full text-gray-700 dark:text-gray-300"
                          >
                            {tt?.timeSpent || <span className="text-gray-400 italic">None</span>}
                          </button>
                        )}
                      </div>

                      {/* Remaining + progress bar */}
                      {tt?.originalEstimateSeconds && tt?.timeSpentSeconds != null && (
                        <>
                          <div>
                            <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Remaining</span>
                            <span className="text-gray-700 dark:text-gray-300">{tt.remainingEstimate || formatTime(Math.max(0, tt.originalEstimateSeconds - tt.timeSpentSeconds))}</span>
                          </div>
                          <div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-1.5 rounded-full ${tt.timeSpentSeconds > tt.originalEstimateSeconds ? 'bg-red-500' : 'bg-blue-500'}`}
                                style={{ width: `${Math.min(100, (tt.timeSpentSeconds / tt.originalEstimateSeconds) * 100)}%` }}
                              />
                            </div>
                          </div>
                        </>
                      )}
                    </>
                  );
                })()}

                <hr className="border-gray-100 dark:border-gray-800" />

                {/* Dates */}
                {/* Start Date */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Start Date</span>
                  {editingField === 'startDate' ? (
                    <div className="space-y-1.5">
                      <input
                        type="date"
                        value={fieldDraft}
                        onChange={(e) => setFieldDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null); }}
                        autoFocus
                        className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveField('customfield_10015', fieldDraft || null)} disabled={savingField} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md disabled:opacity-50">{savingField ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setEditingField(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                        {((issue.fields.customfield_10015 as string) || (issue.fields.startDate as string)) && (
                          <button onClick={() => handleSaveField('customfield_10015', null)} className="text-xs text-red-400 hover:underline">Clear</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const val = (issue.fields.customfield_10015 || issue.fields.startDate) as string || '';
                        setEditingField('startDate');
                        setFieldDraft(val ? val.slice(0, 10) : '');
                      }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full text-gray-700 dark:text-gray-300"
                    >
                      {(issue.fields.customfield_10015 || issue.fields.startDate) as string
                        ? new Date((issue.fields.customfield_10015 || issue.fields.startDate) as string).toLocaleDateString()
                        : <span className="text-gray-400 italic">None</span>}
                    </button>
                  )}
                </div>

                {/* Due Date */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Due Date</span>
                  {editingField === 'duedate' ? (
                    <div className="space-y-1.5">
                      <input
                        type="date"
                        value={fieldDraft}
                        onChange={(e) => setFieldDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setEditingField(null); }}
                        autoFocus
                        className="w-full border border-blue-400 rounded-lg px-2.5 py-1.5 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                      <div className="flex gap-2">
                        <button onClick={() => handleSaveField('duedate', fieldDraft || null)} disabled={savingField} className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md disabled:opacity-50">{savingField ? 'Saving...' : 'Save'}</button>
                        <button onClick={() => setEditingField(null)} className="text-xs text-gray-400 hover:underline">Cancel</button>
                        {(issue.fields.duedate as string) && (
                          <button onClick={() => handleSaveField('duedate', null)} className="text-xs text-red-400 hover:underline">Clear</button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setEditingField('duedate');
                        setFieldDraft(issue.fields.duedate ? (issue.fields.duedate as string).slice(0, 10) : '');
                      }}
                      className="hover:bg-gray-50 dark:hover:bg-gray-800 rounded px-2 py-1 -mx-2 transition-colors text-left w-full text-gray-700 dark:text-gray-300"
                    >
                      {issue.fields.duedate as string
                        ? new Date(issue.fields.duedate as string).toLocaleDateString()
                        : <span className="text-gray-400 italic">None</span>}
                    </button>
                  )}
                </div>

                {/* Actual End — auto-set when moved to Done, uses statuscategorychangedate */}
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Actual End</span>
                  <span className="text-gray-700 dark:text-gray-300">
                    {issue.fields.status.statusCategory?.name === 'Done' && issue.fields.statuscategorychangedate
                      ? new Date(issue.fields.statuscategorychangedate as string).toLocaleDateString()
                      : issue.fields.resolutiondate as string
                        ? new Date(issue.fields.resolutiondate as string).toLocaleDateString()
                        : <span className="text-gray-400 italic">Not completed</span>}
                  </span>
                  {issue.fields.status.statusCategory?.name === 'Done' && (issue.fields.statuscategorychangedate as string) && (
                    <span className="block text-xs text-gray-400 mt-0.5" title={new Date(issue.fields.statuscategorychangedate as string).toLocaleString()}>
                      {timeAgo(issue.fields.statuscategorychangedate as string)}
                    </span>
                  )}
                </div>

                <hr className="border-gray-100 dark:border-gray-800" />

                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Created</span>
                  <span className="text-gray-500" title={new Date(issue.fields.created).toLocaleString()}>
                    {new Date(issue.fields.created).toLocaleDateString()}
                  </span>
                </div>
                <div>
                  <span className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-1.5">Updated</span>
                  <span className="text-gray-500" title={new Date(issue.fields.updated).toLocaleString()}>
                    {timeAgo(issue.fields.updated)}
                  </span>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}
