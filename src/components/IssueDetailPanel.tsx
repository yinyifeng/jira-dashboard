import { useState, useEffect, useRef, useMemo } from 'react';
import {
  fetchIssueDetail,
  fetchComments,
  fetchChangelog,
  fetchWorklog,
  fetchPriorities,
  fetchIssueTypes,
  fetchTransitions,
  fetchIssueLinkTypes,
  fetchIssues,
  createIssueLink,
  deleteIssueLink,
  transitionIssue,
  searchUsers,
  addComment,
  editComment,
  deleteComment,
  updateIssue,
  uploadAttachments,
  deleteAttachment,
  getAttachmentProxyUrl,
  addWorklog,
  type JiraIssue,
  type JiraComment,
  type IssueLink,
  type IssueLinkType,
  type ChangelogEntry,
  type WorklogEntry,
} from '../api';
import StatusBadge from './StatusBadge';

interface IssueDetailPanelProps {
  issueKey: string;
  onClose: () => void;
  onUpdated: () => void;
  onSelectIssue?: (key: string) => void;
}

// --- Shared sub-components ---

function Avatar({ author, size = 'md' }: { author: { displayName: string; avatarUrls?: Record<string, string> }; size?: 'sm' | 'md' }) {
  const px = size === 'sm' ? 'w-6 h-6' : 'w-8 h-8';
  const textSize = size === 'sm' ? 'text-[9px]' : 'text-xs';
  if (author.avatarUrls?.['24x24']) {
    return <img src={author.avatarUrls['24x24']} alt="" className={`${px} rounded-full flex-shrink-0`} />;
  }
  return (
    <div className={`${px} rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center ${textSize} font-semibold text-gray-500 flex-shrink-0`}>
      {author.displayName.charAt(0)}
    </div>
  );
}

function InlineAttachment({ att, onView, onDelete }: { att: { id: string; filename: string; mimeType: string; content: string }; onView: (src: string) => void; onDelete?: (id: string) => void }) {
  const isImage = att.mimeType?.startsWith('image/');
  return (
    <div style={{ position: 'relative', margin: '8px 0' }}>
      {isImage ? (
        <img
          src={att.content}
          alt={att.filename}
          data-att-action="view"
          className="adf-media-img"
          style={{ maxWidth: '100%', borderRadius: 6, cursor: 'zoom-in' }}
          onClick={(e) => { e.stopPropagation(); onView(att.content); }}
        />
      ) : (
        <a
          href={att.content}
          target="_blank"
          rel="noopener noreferrer"
          data-att-action="download"
          onClick={(e) => e.stopPropagation()}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 8px', background: '#f3f4f6', borderRadius: 6, fontSize: 12, textDecoration: 'none', color: '#374151' }}
        >
          {att.filename}
        </a>
      )}
      {onDelete && (
        <button
          data-att-action="delete"
          onClick={(e) => { e.stopPropagation(); e.preventDefault(); onDelete(att.id); }}
          style={{ position: 'absolute', top: 4, right: 4, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.5)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'white', zIndex: 10 }}
          title="Delete attachment"
        >
          <svg width="14" height="14" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}

function FilePreviewList({ files, onRemove }: { files: File[]; onRemove: (index: number) => void }) {
  if (files.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {files.map((file, i) => (
        <div key={i} className="relative group">
          {file.type.startsWith('image/') ? (
            <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <img src={URL.createObjectURL(file)} alt={file.name} className="w-full h-full object-cover" />
              <button
                onClick={() => onRemove(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg px-2.5 py-1.5 text-xs">
              <span className="truncate max-w-[150px]">{file.name}</span>
              <span className="text-gray-400">({(file.size / 1024).toFixed(0)}KB)</span>
              <button onClick={() => onRemove(i)} className="text-gray-400 hover:text-red-500 ml-0.5">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AttachButton({ inputRef, onFiles }: { inputRef: React.RefObject<HTMLInputElement | null>; onFiles: (files: File[]) => void }) {
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          if (e.target.files) {
            onFiles(Array.from(e.target.files));
            e.target.value = '';
          }
        }}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="text-xs px-2.5 py-1.5 border border-gray-200 dark:border-gray-700 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-500 dark:text-gray-400 flex items-center gap-1.5"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
        </svg>
        Attach
      </button>
    </>
  );
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
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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

interface AttachmentInfo {
  id: string;
  filename: string;
  mimeType: string;
  content: string;
  thumbnail?: string;
  created?: string;
}

type AttachmentMap = Map<string, AttachmentInfo>;

function adfBlockToHtml(block: unknown, attachments?: AttachmentMap): string {
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
      return `<ul>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</ul>`;
    case 'orderedList':
      return `<ol>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</ol>`;
    case 'listItem':
      return `<li>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</li>`;
    case 'codeBlock':
      return `<pre class="adf-codeblock"><code>${inlines}</code></pre>`;
    case 'blockquote':
      return `<blockquote class="adf-blockquote">${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</blockquote>`;
    case 'rule':
      return '<hr/>';
    case 'mediaSingle':
    case 'mediaGroup':
      return (b.content || []).map(c => adfBlockToHtml(c, attachments)).join('');
    case 'media': {
      const mediaId = b.attrs?.id as string;
      const mediaAlt = b.attrs?.alt as string | undefined;
      const att = attachments?.get(mediaId) || (mediaAlt ? attachments?.get(mediaAlt) : undefined);
      if (att && att.mimeType?.startsWith('image/')) {
        return `<img src="${escHtml(att.content)}" alt="${escHtml(att.filename)}" data-full-src="${escHtml(att.content)}" class="adf-media-img" style="max-width:100%;border-radius:6px;margin:8px 0;cursor:zoom-in;" />`;
      }
      if (att) {
        return `<a href="${escHtml(att.content)}" target="_blank" rel="noopener" class="adf-link" style="display:inline-flex;align-items:center;gap:4px;padding:4px 8px;background:#f3f4f6;border-radius:6px;font-size:12px;text-decoration:none;color:#374151;">${escHtml(att.filename)}</a>`;
      }
      return '<p class="adf-media">[media attachment]</p>';
    }
    case 'table':
      return `<table class="adf-table">${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</table>`;
    case 'tableRow':
      return `<tr>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</tr>`;
    case 'tableHeader':
      return `<th>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</th>`;
    case 'tableCell':
      return `<td>${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</td>`;
    case 'panel':
      return `<div class="adf-panel">${(b.content || []).map(c => adfBlockToHtml(c, attachments)).join('')}</div>`;
    default:
      return inlines || '';
  }
}

function adfToHtml(doc: unknown, attachments?: AttachmentMap): string {
  if (!doc || typeof doc !== 'object') return '';
  const d = doc as { content?: unknown[] };
  if (!Array.isArray(d.content)) return '';
  return d.content.map(c => adfBlockToHtml(c, attachments)).join('');
}

// Collect all media IDs and alt texts referenced in ADF so we can find unreferenced attachments
function collectAdfMediaRefs(node: unknown): Set<string> {
  const refs = new Set<string>();
  if (!node || typeof node !== 'object') return refs;
  const n = node as { type?: string; attrs?: Record<string, unknown>; content?: unknown[] };
  if (n.type === 'media') {
    if (n.attrs?.id) refs.add(String(n.attrs.id));
    if (n.attrs?.alt) refs.add(String(n.attrs.alt));
  }
  if (Array.isArray(n.content)) {
    for (const child of n.content) {
      for (const ref of collectAdfMediaRefs(child)) refs.add(ref);
    }
  }
  return refs;
}

// Extract pasted files from clipboard event
function extractPastedFiles(e: React.ClipboardEvent): File[] {
  const items = e.clipboardData?.items;
  if (!items) return [];
  const files: File[] = [];
  for (const item of items) {
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        const ext = file.type.split('/')[1] || 'png';
        files.push(new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type }));
      }
    }
  }
  return files;
}

// Find attachments created within a time window of a given timestamp (for associating with comments)
function findAttachmentsByTime(
  allAtts: AttachmentInfo[],
  timestamp: string,
  windowMs = 30000, // 30 second window
  adfMediaRefs?: Set<string>,
): AttachmentInfo[] {
  const target = new Date(timestamp).getTime();
  return allAtts.filter((att) => {
    if (!att.created) return false;
    // Skip attachments already referenced in ADF
    if (adfMediaRefs && (adfMediaRefs.has(att.id) || adfMediaRefs.has(att.filename))) return false;
    const diff = Math.abs(new Date(att.created).getTime() - target);
    return diff < windowMs;
  });
}

export default function IssueDetailPanel({ issueKey, onClose, onUpdated, onSelectIssue }: IssueDetailPanelProps) {
  const [issue, setIssue] = useState<JiraIssue | null>(null);
  const [comments, setComments] = useState<JiraComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Build attachment lookup maps from issue data (by ID and by filename)
  // Rewrite content URLs to use our proxy (Jira URLs require auth)
  const attachmentMap = useMemo(() => {
    const map: AttachmentMap = new Map();
    const atts = issue?.fields?.attachment as AttachmentInfo[] | undefined;
    if (atts) {
      for (const raw of atts) {
        const att = { ...raw, content: getAttachmentProxyUrl(raw.id) };
        map.set(att.id, att);
        map.set(att.filename, att);
      }
    }
    return map;
  }, [issue]);

  // Map comment IDs to their associated attachments (uploaded at same time, not in ADF)
  const commentAttachments = useMemo(() => {
    const result = new Map<string, AttachmentInfo[]>();
    const allAtts = (issue?.fields?.attachment || []) as AttachmentInfo[];
    if (allAtts.length === 0 || comments.length === 0) return result;

    // Collect all ADF media refs across all comments and description
    const allMediaRefs = new Set<string>();
    for (const ref of collectAdfMediaRefs(issue?.fields?.description)) allMediaRefs.add(ref);
    for (const c of comments) {
      for (const ref of collectAdfMediaRefs(c.body)) allMediaRefs.add(ref);
    }

    for (const c of comments) {
      const matched = findAttachmentsByTime(allAtts, c.created, 30000, allMediaRefs);
      if (matched.length > 0) {
        result.set(c.id, matched);
      }
    }
    return result;
  }, [issue, comments]);

  // Explicitly tracked comment attachment IDs (survives across refreshes within session)
  const [commentAttIds, setCommentAttIds] = useState<Set<string>>(new Set());

  // Set of attachment IDs associated with comments (to exclude from description)
  const commentAttachmentIds = useMemo(() => {
    const ids = new Set(commentAttIds);
    for (const atts of commentAttachments.values()) {
      for (const att of atts) ids.add(att.id);
    }
    return ids;
  }, [commentAttachments, commentAttIds]);

  // Description editing
  const [editingDesc, setEditingDesc] = useState(false);
  const [descDraft, setDescDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  // New comment
  const [newComment, setNewComment] = useState('');
  const [addingComment, setAddingComment] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [descFiles, setDescFiles] = useState<File[]>([]);
  const descFileInputRef = useRef<HTMLInputElement>(null);

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

  // Activity tabs
  const [activityTab, setActivityTab] = useState<'all' | 'comments' | 'history' | 'worklog'>('comments');
  const [changelog, setChangelog] = useState<ChangelogEntry[]>([]);
  const [worklog, setWorklog] = useState<WorklogEntry[]>([]);

  // Linked issues
  const [addingLink, setAddingLink] = useState(false);
  const [linkTypes, setLinkTypes] = useState<IssueLinkType[]>([]);
  const [selectedLinkType, setSelectedLinkType] = useState('');
  const [linkDirection, setLinkDirection] = useState<'outward' | 'inward'>('outward');
  const [linkSearchQuery, setLinkSearchQuery] = useState('');
  const [linkSearchResults, setLinkSearchResults] = useState<JiraIssue[]>([]);
  const [linkSearching, setLinkSearching] = useState(false);
  const [savingLink, setSavingLink] = useState(false);

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

      // Load changelog and worklog in the background (non-blocking)
      fetchChangelog(issueKey).then(setChangelog).catch(() => setChangelog([]));
      fetchWorklog(issueKey).then(setWorklog).catch(() => setWorklog([]));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load issue');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); setCommentAttIds(new Set()); }, [issueKey]);

  const handleSaveDescription = async () => {
    setSavingDesc(true);
    try {
      // Upload any pending description files as issue attachments
      if (descFiles.length > 0) {
        await uploadAttachments(issueKey, descFiles);
        setDescFiles([]);
      }

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
    if (!newComment.trim() && pendingFiles.length === 0) return;
    setAddingComment(true);
    try {
      if (pendingFiles.length > 0) {
        const uploaded = await uploadAttachments(issueKey, pendingFiles);
        // Track these attachment IDs as comment-associated
        setCommentAttIds(prev => {
          const next = new Set(prev);
          for (const att of uploaded) next.add(att.id);
          return next;
        });
        setPendingFiles([]);
      }
      if (newComment.trim()) {
        await addComment(issueKey, newComment);
        setNewComment('');
      }
      const [updated, refreshed] = await Promise.all([fetchComments(issueKey), fetchIssueDetail(issueKey)]);
      setComments(updated);
      setIssue(refreshed);
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
    // Optimistically remove from UI first
    setComments((prev) => prev.filter((c) => c.id !== commentId));
    try {
      await deleteComment(issueKey, commentId);
    } catch {
      // Comment may already be deleted — ignore errors since UI already updated
    }
    // Refresh to sync state
    try {
      const [updated, refreshed] = await Promise.all([fetchComments(issueKey), fetchIssueDetail(issueKey)]);
      setComments(updated);
      setIssue(refreshed);
    } catch {
      // ignore refresh errors
    }
  };

  const handleDeleteAttachment = async (attachmentId: string) => {
    try {
      await deleteAttachment(attachmentId);
    } catch {
      // ignore — may already be deleted
    }
    try {
      const refreshed = await fetchIssueDetail(issueKey);
      setIssue(refreshed);
    } catch {
      // ignore refresh errors
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
      if (field === 'timeSpent') {
        // Time spent must be logged via the worklog API
        await addWorklog(issueKey, value);
      } else {
        await updateIssue(issueKey, { timetracking: { [field]: value } });
      }
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

  // Linked issues handlers
  const handleOpenAddLink = async () => {
    setAddingLink(true);
    if (linkTypes.length === 0) {
      const types = await fetchIssueLinkTypes();
      setLinkTypes(types);
      if (types.length > 0) {
        setSelectedLinkType(types[0].name);
      }
    }
  };

  const handleSearchLinkedIssue = async (query: string) => {
    setLinkSearchQuery(query);
    if (query.length < 2) { setLinkSearchResults([]); return; }
    setLinkSearching(true);
    try {
      const trimmed = query.trim().toUpperCase();
      // Try multiple strategies: project key, issue key prefix, and text search
      const clauses: string[] = [];
      // If it looks like a project key (all letters), include project match
      if (/^[A-Z]+$/.test(trimmed)) {
        clauses.push(`project = "${trimmed}"`);
      }
      // If it looks like a partial issue key (e.g. WDD-1), search that project with key sorting
      if (/^[A-Z]+-\d*$/.test(trimmed)) {
        const [proj] = trimmed.split('-');
        clauses.push(`project = "${proj}"`);
      }
      // Always include text search as fallback
      clauses.push(`text ~ "${query.trim()}*"`);
      const jql = `(${clauses.join(' OR ')}) ORDER BY updated DESC`;
      const data = await fetchIssues(jql, undefined, 8);
      setLinkSearchResults(data.issues.filter(i => i.key !== issueKey));
    } catch {
      setLinkSearchResults([]);
    } finally {
      setLinkSearching(false);
    }
  };

  const handleCreateLink = async (targetKey: string) => {
    setSavingLink(true);
    try {
      if (linkDirection === 'outward') {
        await createIssueLink(selectedLinkType, issueKey, targetKey);
      } else {
        await createIssueLink(selectedLinkType, targetKey, issueKey);
      }
      setAddingLink(false);
      setLinkSearchQuery('');
      setLinkSearchResults([]);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create link');
    } finally {
      setSavingLink(false);
    }
  };

  const handleDeleteLink = async (linkId: string) => {
    try {
      await deleteIssueLink(linkId);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete link');
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
              <a
                href={issue?.self ? `${new URL(issue.self).origin}/browse/${issueKey}` : `#`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-blue-600 dark:text-blue-400 font-semibold hover:underline"
              >
                {issueKey}
              </a>
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
              <div
                className="flex-1 px-6 py-5 space-y-5 md:border-r border-gray-200 dark:border-gray-800 min-w-0 overflow-y-auto"
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.classList.contains('adf-media-img')) {
                    e.preventDefault();
                    const src = target.getAttribute('data-full-src') || target.getAttribute('src');
                    if (src) setLightboxSrc(src);
                  }
                }}
              >
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
                        onPaste={(e) => {
                          const files = extractPastedFiles(e);
                          if (files.length > 0) { e.preventDefault(); setDescFiles(prev => [...prev, ...files]); }
                        }}
                        rows={8}
                        autoFocus
                        placeholder="Write a description... (paste images here)"
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                      />
                      <FilePreviewList files={descFiles} onRemove={(i) => setDescFiles(prev => prev.filter((_, j) => j !== i))} />
                      <div className="flex items-center gap-2">
                        <AttachButton inputRef={descFileInputRef} onFiles={(f) => setDescFiles(prev => [...prev, ...f])} />
                        <button onClick={handleSaveDescription} disabled={savingDesc} className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50">
                          {savingDesc ? 'Saving...' : 'Save'}
                        </button>
                        <button onClick={() => { setEditingDesc(false); setDescDraft(adfToPlainText(issue.fields.description)); setDescFiles([]); }} className="text-xs px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-100 dark:hover:bg-gray-800">
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                      onClick={(e) => {
                        // Don't enter edit mode if clicking a delete button or image
                        const target = e.target as HTMLElement;
                        if (target.closest('[data-att-action]')) return;
                        setEditingDesc(true);
                      }}
                      title="Click to edit"
                    >
                      {(() => {
                        const descHtml = adfToHtml(issue.fields.description, attachmentMap);
                        const rawAtts = (issue.fields.attachment || []) as { id: string; filename: string; mimeType: string; content: string; thumbnail?: string; created: string }[];
                        const allAtts = rawAtts.map(a => ({ ...a, content: getAttachmentProxyUrl(a.id) }));
                        // Find attachments not already rendered via ADF media nodes
                        const mediaRefs = collectAdfMediaRefs(issue.fields.description);
                        const unreferencedAtts = allAtts.filter((att) => !mediaRefs.has(att.id) && !mediaRefs.has(att.filename) && !commentAttachmentIds.has(att.id));

                        if (!descHtml && unreferencedAtts.length === 0) {
                          return (
                            <div className="text-sm bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-h-[40px]">
                              <span className="text-gray-400 italic">Click to add description...</span>
                            </div>
                          );
                        }

                        return (
                          <div className="adf-content text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 min-h-[40px]">
                            {descHtml && <div dangerouslySetInnerHTML={{ __html: descHtml }} />}
                            {unreferencedAtts.map((att) => (
                              <InlineAttachment key={att.id} att={att} onView={setLightboxSrc} onDelete={handleDeleteAttachment} />
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>

                {/* Child Work Items (Subtasks) */}
                {(() => {
                  const subtasks = (issue.fields.subtasks || []) as { key: string; fields: { summary: string; status: { name: string; statusCategory: { name: string; colorName: string } }; issuetype: { name: string; iconUrl: string }; priority?: { name: string; iconUrl: string } } }[];
                  const doneCount = subtasks.filter(s => s.fields.status.statusCategory?.name === 'Done').length;
                  const progressPct = subtasks.length > 0 ? Math.round((doneCount / subtasks.length) * 100) : 0;
                  return (
                    <div>
                      <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                        Child Issues
                        {subtasks.length > 0 && <span className="text-gray-300 dark:text-gray-600"> ({doneCount}/{subtasks.length})</span>}
                      </h3>
                      {subtasks.length > 0 ? (
                        <>
                          {/* Progress bar */}
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                              <div
                                className="h-1.5 rounded-full bg-green-500 transition-all"
                                style={{ width: `${progressPct}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-500">{progressPct}%</span>
                          </div>
                          {/* Subtask list */}
                          <div className="space-y-1">
                            {subtasks.map((st) => (
                              <div
                                key={st.key}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer"
                                onClick={() => onSelectIssue?.(st.key)}
                              >
                                {st.fields.issuetype?.iconUrl && <img src={st.fields.issuetype.iconUrl} alt="" className="w-3.5 h-3.5 flex-shrink-0" />}
                                <span className="font-mono text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">{st.key}</span>
                                <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{st.fields.summary}</span>
                                {st.fields.priority?.iconUrl && <img src={st.fields.priority.iconUrl} alt="" className="w-3.5 h-3.5 flex-shrink-0" />}
                                <StatusBadge name={st.fields.status.name} colorName={st.fields.status.statusCategory?.colorName || 'blue-gray'} />
                              </div>
                            ))}
                          </div>
                        </>
                      ) : (
                        <p className="text-xs text-gray-400 italic">No child issues</p>
                      )}
                    </div>
                  );
                })()}

                {/* Linked Issues */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                      Linked Issues
                      {(() => {
                        const links = (issue.fields.issuelinks || []) as IssueLink[];
                        return links.length > 0 ? <span className="text-gray-300 dark:text-gray-600"> ({links.length})</span> : null;
                      })()}
                    </h3>
                    <button
                      onClick={handleOpenAddLink}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      + Link issue
                    </button>
                  </div>

                  {/* Add link form */}
                  {addingLink && (
                    <div className="mb-3 p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={`${selectedLinkType}:${linkDirection}`}
                          onChange={(e) => {
                            const [type, dir] = e.target.value.split(':');
                            setSelectedLinkType(type);
                            setLinkDirection(dir as 'outward' | 'inward');
                          }}
                          className="text-xs border border-gray-300 dark:border-gray-600 rounded px-2 py-1.5 bg-white dark:bg-gray-800"
                        >
                          {linkTypes.map((lt) => (
                            <optgroup key={lt.id} label={lt.name}>
                              <option value={`${lt.name}:outward`}>{lt.outward}</option>
                              <option value={`${lt.name}:inward`}>{lt.inward}</option>
                            </optgroup>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={linkSearchQuery}
                          onChange={(e) => handleSearchLinkedIssue(e.target.value)}
                          placeholder="Search issue key or summary..."
                          autoFocus
                          className="flex-1 text-xs border border-gray-300 dark:border-gray-600 rounded px-2.5 py-1.5 bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                      {linkSearching && <div className="text-xs text-gray-400 animate-pulse">Searching...</div>}
                      {linkSearchResults.length > 0 && (
                        <div className="max-h-40 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded bg-white dark:bg-gray-800">
                          {linkSearchResults.map((r) => (
                            <button
                              key={r.key}
                              onClick={() => handleCreateLink(r.key)}
                              disabled={savingLink}
                              className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center gap-2 disabled:opacity-50"
                            >
                              <span className="font-mono text-blue-600 dark:text-blue-400 flex-shrink-0">{r.key}</span>
                              <span className="truncate text-gray-700 dark:text-gray-300">{r.fields.summary}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <button onClick={() => { setAddingLink(false); setLinkSearchQuery(''); setLinkSearchResults([]); }} className="text-xs text-gray-400 hover:underline">
                        Cancel
                      </button>
                    </div>
                  )}

                  {/* Existing links */}
                  {(() => {
                    const links = (issue.fields.issuelinks || []) as IssueLink[];
                    if (links.length === 0 && !addingLink) {
                      return <p className="text-xs text-gray-400 italic">No linked issues</p>;
                    }
                    // Group by relationship label
                    const grouped = new Map<string, { link: IssueLink; targetKey: string; targetSummary: string; targetStatus: { name: string; statusCategory?: { name: string; colorName: string } }; targetType?: { name: string; iconUrl: string } }[]>();
                    for (const link of links) {
                      if (link.outwardIssue) {
                        const label = link.type.outward;
                        if (!grouped.has(label)) grouped.set(label, []);
                        grouped.get(label)!.push({
                          link,
                          targetKey: link.outwardIssue.key,
                          targetSummary: link.outwardIssue.fields?.summary || '',
                          targetStatus: link.outwardIssue.fields?.status || { name: 'Unknown' },
                          targetType: link.outwardIssue.fields?.issuetype,
                        });
                      }
                      if (link.inwardIssue) {
                        const label = link.type.inward;
                        if (!grouped.has(label)) grouped.set(label, []);
                        grouped.get(label)!.push({
                          link,
                          targetKey: link.inwardIssue.key,
                          targetSummary: link.inwardIssue.fields?.summary || '',
                          targetStatus: link.inwardIssue.fields?.status || { name: 'Unknown' },
                          targetType: link.inwardIssue.fields?.issuetype,
                        });
                      }
                    }
                    return (
                      <div className="space-y-2">
                        {Array.from(grouped.entries()).map(([label, items]) => (
                          <div key={label}>
                            <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{label}</span>
                            <div className="mt-1 space-y-1">
                              {items.map(({ link, targetKey, targetSummary, targetStatus, targetType }) => (
                                <div key={link.id} className="group flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors cursor-pointer" onClick={() => onSelectIssue?.(targetKey)}>
                                  {targetType?.iconUrl && <img src={targetType.iconUrl} alt="" className="w-3.5 h-3.5 flex-shrink-0" />}
                                  <span className="font-mono text-xs text-blue-600 dark:text-blue-400 flex-shrink-0">{targetKey}</span>
                                  <span className="text-xs text-gray-700 dark:text-gray-300 truncate flex-1">{targetSummary}</span>
                                  <StatusBadge name={targetStatus.name} colorName={targetStatus.statusCategory?.colorName || 'blue-gray'} />
                                  <button
                                    onClick={() => handleDeleteLink(link.id)}
                                    className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-500 transition-opacity ml-1"
                                    title="Remove link"
                                  >
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                    </svg>
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Activity */}
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">Activity</h3>

                  {/* Tab bar */}
                  <div className="flex gap-1 mb-3 border-b border-gray-200 dark:border-gray-700">
                    {([
                      { key: 'all', label: 'All' },
                      { key: 'comments', label: `Comments (${comments.length})` },
                      { key: 'history', label: `History (${changelog.length})` },
                      { key: 'worklog', label: `Work log (${worklog.length})` },
                    ] as { key: typeof activityTab; label: string }[]).map((tab) => (
                      <button
                        key={tab.key}
                        onClick={() => setActivityTab(tab.key)}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-colors -mb-px ${
                          activityTab === tab.key
                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                            : 'border-transparent text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Add comment (shown on All and Comments tabs) */}
                  {(activityTab === 'all' || activityTab === 'comments') && (
                    <div className="flex gap-3 mb-4">
                      <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 dark:text-blue-400 text-xs font-semibold flex-shrink-0">
                        You
                      </div>
                      <div className="flex-1">
                        <textarea
                          value={newComment}
                          onChange={(e) => setNewComment(e.target.value)}
                          onPaste={(e) => {
                            const files = extractPastedFiles(e);
                            if (files.length > 0) { e.preventDefault(); setPendingFiles(prev => [...prev, ...files]); }
                          }}
                          placeholder="Add a comment... (paste images here)"
                          rows={2}
                          className="w-full border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
                        />
                        <FilePreviewList files={pendingFiles} onRemove={(i) => setPendingFiles(prev => prev.filter((_, j) => j !== i))} />
                        <div className="flex items-center gap-2 mt-2">
                          <AttachButton inputRef={fileInputRef} onFiles={(f) => setPendingFiles(prev => [...prev, ...f])} />
                          {(newComment.trim() || pendingFiles.length > 0) && (
                            <>
                              <button
                                onClick={handleAddComment}
                                disabled={addingComment}
                                className="text-xs px-3 py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                              >
                                {addingComment ? 'Saving...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setNewComment(''); setPendingFiles([]); }}
                                className="text-xs px-3 py-1.5 text-gray-500 hover:text-gray-700"
                              >
                                Cancel
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Activity content */}
                  <div className="space-y-0">
                    {/* All tab: merge comments + history + worklog sorted by date */}
                    {activityTab === 'all' && (() => {
                      type ActivityItem =
                        | { type: 'comment'; date: string; data: JiraComment }
                        | { type: 'changelog'; date: string; data: ChangelogEntry }
                        | { type: 'worklog'; date: string; data: WorklogEntry };
                      const items: ActivityItem[] = [
                        ...comments.map((c) => ({ type: 'comment' as const, date: c.created, data: c })),
                        ...changelog.map((ch) => ({ type: 'changelog' as const, date: ch.created, data: ch })),
                        ...worklog.map((w) => ({ type: 'worklog' as const, date: w.started, data: w })),
                      ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                      if (items.length === 0) return <p className="text-sm text-gray-400 italic py-2">No activity</p>;

                      return items.map((item, i) => {
                        if (item.type === 'comment') {
                          const c = item.data;
                          return (
                            <div key={`c-${c.id}`} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                              <Avatar author={c.author} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.author.displayName}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded">comment</span>
                                  <span className="text-xs text-gray-400" title={new Date(c.created).toLocaleString()}>{timeAgo(c.created)}</span>
                                </div>
                                <div className="adf-content text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: adfToHtml(c.body, attachmentMap) }} />
                                {commentAttachments.get(c.id)?.map((att) => (
                                  <InlineAttachment key={att.id} att={att} onView={setLightboxSrc} />
                                ))}
                              </div>
                            </div>
                          );
                        }
                        if (item.type === 'changelog') {
                          const ch = item.data;
                          return (
                            <div key={`h-${ch.id}`} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                              <Avatar author={ch.author} />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{ch.author.displayName}</span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded">history</span>
                                  <span className="text-xs text-gray-400" title={new Date(ch.created).toLocaleString()}>{timeAgo(ch.created)}</span>
                                </div>
                                <div className="space-y-0.5">
                                  {ch.items.map((item, j) => (
                                    <p key={j} className="text-xs text-gray-600 dark:text-gray-400">
                                      <span className="font-medium">{item.field}</span>
                                      {item.fromString && <> from <span className="line-through text-gray-400">{item.fromString}</span></>}
                                      {item.toString && <> to <span className="font-medium text-gray-700 dark:text-gray-300">{item.toString}</span></>}
                                    </p>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        }
                        // worklog
                        const w = item.data;
                        return (
                          <div key={`w-${w.id}`} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                            <Avatar author={w.author} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{w.author.displayName}</span>
                                <span className="text-[10px] px-1.5 py-0.5 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded">work log</span>
                                <span className="text-xs text-gray-400" title={new Date(w.started).toLocaleString()}>{timeAgo(w.started)}</span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Logged <span className="font-medium text-gray-700 dark:text-gray-300">{w.timeSpent}</span>
                                {' '}on {new Date(w.started).toLocaleDateString()}
                              </p>
                            </div>
                          </div>
                        );
                      });
                    })()}

                    {/* Comments tab */}
                    {activityTab === 'comments' && (
                      <>
                        {comments.map((c, i) => (
                          <div key={c.id} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                            <Avatar author={c.author} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{c.author.displayName}</span>
                                <span className="text-xs text-gray-400" title={new Date(c.created).toLocaleString()}>{timeAgo(c.created)}</span>
                                {c.updated !== c.created && (
                                  <span className="text-xs text-gray-400 italic" title={new Date(c.updated).toLocaleString()}>(edited)</span>
                                )}
                              </div>
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
                                    <button onClick={() => setEditingCommentId(null)} className="text-xs px-2.5 py-1 text-gray-500 hover:text-gray-700">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <div className="group">
                                  <div className="adf-content text-sm text-gray-700 dark:text-gray-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: adfToHtml(c.body, attachmentMap) }} />
                                  {commentAttachments.get(c.id)?.map((att) => (
                                    <InlineAttachment key={att.id} att={att} onView={setLightboxSrc} />
                                  ))}
                                  <div className="flex gap-3 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={() => startEditComment(c)} className="text-xs text-gray-400 hover:text-blue-600">Edit</button>
                                    <button onClick={() => handleDeleteComment(c.id)} className="text-xs text-gray-400 hover:text-red-500">Delete</button>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                        {comments.length === 0 && <p className="text-sm text-gray-400 italic py-2">No comments yet</p>}
                      </>
                    )}

                    {/* History tab */}
                    {activityTab === 'history' && (
                      <>
                        {changelog.map((ch, i) => (
                          <div key={ch.id} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                            <Avatar author={ch.author} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{ch.author.displayName}</span>
                                <span className="text-xs text-gray-400" title={new Date(ch.created).toLocaleString()}>{timeAgo(ch.created)}</span>
                              </div>
                              <div className="space-y-0.5">
                                {ch.items.map((item, j) => (
                                  <p key={j} className="text-xs text-gray-600 dark:text-gray-400">
                                    Changed <span className="font-medium">{item.field}</span>
                                    {item.fromString && <> from <span className="line-through text-gray-400">{item.fromString}</span></>}
                                    {item.toString && <> to <span className="font-medium text-gray-700 dark:text-gray-300">{item.toString}</span></>}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        ))}
                        {changelog.length === 0 && <p className="text-sm text-gray-400 italic py-2">No history</p>}
                      </>
                    )}

                    {/* Work log tab */}
                    {activityTab === 'worklog' && (
                      <>
                        {worklog.map((w, i) => (
                          <div key={w.id} className={`flex gap-3 py-3 ${i > 0 ? 'border-t border-gray-100 dark:border-gray-800' : ''}`}>
                            <Avatar author={w.author} />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{w.author.displayName}</span>
                                <span className="text-xs text-gray-400" title={new Date(w.started).toLocaleString()}>{timeAgo(w.started)}</span>
                              </div>
                              <p className="text-xs text-gray-600 dark:text-gray-400">
                                Logged <span className="font-medium text-gray-700 dark:text-gray-300">{w.timeSpent}</span>
                                {' '}on {new Date(w.started).toLocaleDateString()}
                              </p>
                              {!!w.comment && (
                                <div className="adf-content text-xs text-gray-500 mt-1" dangerouslySetInnerHTML={{ __html: adfToHtml(w.comment as Record<string, unknown>, attachmentMap) }} />
                              )}
                            </div>
                          </div>
                        ))}
                        {worklog.length === 0 && <p className="text-sm text-gray-400 italic py-2">No work logged</p>}
                      </>
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
                      <Avatar author={{ displayName: issue.fields.assignee?.displayName || 'Unassigned', avatarUrls: issue.fields.assignee?.avatarUrls }} size="sm" />
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
                    <Avatar author={{ displayName: (issue.fields.reporter as { displayName?: string })?.displayName || 'None', avatarUrls: (issue.fields.reporter as { avatarUrls?: Record<string, string> })?.avatarUrls }} size="sm" />
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
      {/* Image lightbox */}
      {lightboxSrc && (
        <div
          className="fixed inset-0 z-[60] bg-black/80 flex items-center justify-center p-8"
          onClick={() => setLightboxSrc(null)}
        >
          <button
            onClick={() => setLightboxSrc(null)}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={lightboxSrc}
            alt=""
            className="max-w-full max-h-full object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}
