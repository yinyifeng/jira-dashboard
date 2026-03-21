import { useState, useEffect } from 'react';
import {
  fetchIssueDetail,
  fetchComments,
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
      if (b.type === 'paragraph' && Array.isArray(b.content)) {
        return b.content.map(adfToText).join('');
      }
      if (b.type === 'heading' && Array.isArray(b.content)) {
        return b.content.map(adfToText).join('');
      }
      if (b.type === 'bulletList' || b.type === 'orderedList') {
        const items = (b as { content?: unknown[] }).content || [];
        return items
          .map((item) => {
            const li = item as { content?: unknown[] };
            return '  - ' + (li.content || []).map((p) => {
              const para = p as { content?: unknown[] };
              return (para.content || []).map(adfToText).join('');
            }).join('');
          })
          .join('\n');
      }
      if (b.type === 'codeBlock' && Array.isArray(b.content)) {
        return b.content.map(adfToText).join('');
      }
      return adfToText(block);
    })
    .join('\n');
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

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/30 z-40" onClick={onClose} />

      {/* Panel */}
      <div className="fixed inset-0 md:inset-auto md:right-0 md:top-0 md:bottom-0 md:w-full md:max-w-2xl bg-white dark:bg-gray-900 z-50 shadow-2xl overflow-y-auto md:border-l border-gray-200 dark:border-gray-800">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <span className="font-mono text-blue-600 dark:text-blue-400 font-semibold text-lg">
              {issueKey}
            </span>
            {issue && (
              <StatusBadge
                name={issue.fields.status.name}
                colorName={issue.fields.status.statusCategory?.colorName || 'blue-gray'}
              />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors text-gray-500"
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
        ) : error ? (
          <div className="m-6 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
            {error}
          </div>
        ) : issue ? (
          <div className="px-6 py-4 space-y-6">
            {/* Summary */}
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
              {issue.fields.summary}
            </h2>

            {/* Meta row */}
            <div className="flex flex-wrap gap-4 text-sm text-gray-500">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Type: </span>
                {issue.fields.issuetype?.name}
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Priority: </span>
                {issue.fields.priority?.name || 'None'}
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Assignee: </span>
                {issue.fields.assignee?.displayName || 'Unassigned'}
              </div>
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">Project: </span>
                {issue.fields.project?.name}
              </div>
            </div>

            {/* Description */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Description</h3>
                {!editingDesc && (
                  <button
                    onClick={() => setEditingDesc(true)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Edit
                  </button>
                )}
              </div>
              {editingDesc ? (
                <div className="space-y-2">
                  <textarea
                    value={descDraft}
                    onChange={(e) => setDescDraft(e.target.value)}
                    rows={8}
                    className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={handleSaveDescription}
                      disabled={savingDesc}
                      className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {savingDesc ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      onClick={() => {
                        setEditingDesc(false);
                        setDescDraft(adfToPlainText(issue.fields.description));
                      }}
                      className="text-sm px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-h-[60px]">
                  {adfToPlainText(issue.fields.description) || (
                    <span className="text-gray-400 italic">No description</span>
                  )}
                </div>
              )}
            </div>

            {/* Comments */}
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wider text-gray-500 mb-3">
                Comments ({comments.length})
              </h3>

              {/* Comment list */}
              <div className="space-y-3 mb-4">
                {comments.map((c) => (
                  <div key={c.id} className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        {c.author.avatarUrls?.['16x16'] && (
                          <img src={c.author.avatarUrls['16x16']} alt="" className="w-4 h-4 rounded-full" />
                        )}
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {c.author.displayName}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(c.created).toLocaleString()}
                        </span>
                        {c.updated !== c.created && (
                          <span className="text-xs text-gray-400 italic">edited</span>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => startEditComment(c)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeleteComment(c.id)}
                          className="text-xs text-red-500 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {editingCommentId === c.id ? (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={editCommentDraft}
                          onChange={(e) => setEditCommentDraft(e.target.value)}
                          rows={3}
                          className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                        />
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditComment(c.id)}
                            disabled={savingComment}
                            className="text-xs px-2.5 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                          >
                            {savingComment ? 'Saving...' : 'Save'}
                          </button>
                          <button
                            onClick={() => setEditingCommentId(null)}
                            className="text-xs px-2.5 py-1 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                        {adfToPlainText(c.body)}
                      </div>
                    )}
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-sm text-gray-400 italic">No comments yet</p>
                )}
              </div>

              {/* Add comment */}
              <div className="space-y-2">
                <textarea
                  value={newComment}
                  onChange={(e) => setNewComment(e.target.value)}
                  placeholder="Add a comment..."
                  rows={3}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <button
                  onClick={handleAddComment}
                  disabled={addingComment || !newComment.trim()}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {addingComment ? 'Adding...' : 'Add Comment'}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
