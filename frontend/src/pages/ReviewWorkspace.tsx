import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { Task, TaskVersion, Comment } from '../types';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PriorityBadge } from '../components/ui/PriorityBadge';
import { Modal } from '../components/ui/Modal';
import {
  ClipboardList,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  MessageSquare,
  HelpCircle,
  History,
  Image as ImageIcon,
  FileText,
  AlertCircle,
  Layers,
  Scan,
} from 'lucide-react';

const getClassColor = (name: string) => {
  const n = (name || '').toLowerCase();
  if (n.includes('car') || n.includes('sedan')) return { border: '#10b981', bg: 'rgba(16, 185, 129, 0.20)', solid: '#10b981' };
  if (n.includes('bus')) return { border: '#f59e0b', bg: 'rgba(245, 158, 11, 0.20)', solid: '#f59e0b' };
  if (n.includes('pedestrian') || n.includes('person') || n.includes('walk')) return { border: '#06b6d4', bg: 'rgba(6, 182, 212, 0.20)', solid: '#06b6d4' };
  if (n.includes('cyclist') || n.includes('bike') || n.includes('motor')) return { border: '#a855f7', bg: 'rgba(168, 85, 247, 0.20)', solid: '#a855f7' };
  if (n.includes('light') || n.includes('signal')) return { border: '#10b981', bg: 'rgba(16, 185, 129, 0.20)', solid: '#059669' };
  if (n.includes('sign') || n.includes('stop')) return { border: '#ef4444', bg: 'rgba(239, 68, 68, 0.20)', solid: '#ef4444' };
  if (n.includes('truck')) return { border: '#f97316', bg: 'rgba(249, 115, 22, 0.20)', solid: '#f97316' };
  return { border: '#8b5cf6', bg: 'rgba(139, 92, 246, 0.20)', solid: '#8b5cf6' };
};

export const ReviewWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [reviewing, setReviewing] = useState<boolean>(false);
  const [showRejectModal, setShowRejectModal] = useState<boolean>(false);
  const [rejectComment, setRejectComment] = useState<string>('');
  const [acceptComment, setAcceptComment] = useState<string>('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState<string>('');

  const fetchTaskDetails = async () => {
    if (!currentProject || !id) return;
    setLoading(true);
    try {
      const data = await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${id}`);
      setTask(data);

      const commentData = await apiFetch<Comment[]>(`/projects/${currentProject.id}/tasks/${id}/comments`);
      setComments(commentData);
    } catch (err) {
      console.error('Failed to load review task details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
  }, [currentProject, id]);

  const handleDecision = async (decision: 'Accept' | 'Reject', commentText?: string) => {
    if (!currentProject || !id) return;
    if (decision === 'Reject' && (!commentText || !commentText.trim())) {
      setFeedback({ type: 'error', message: 'A mandatory comment is required when rejecting a task.' });
      return;
    }

    setReviewing(true);
    setFeedback(null);
    try {
      await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({
          decision,
          comment: commentText?.trim() || null,
        }),
      });

      setShowRejectModal(false);
      setFeedback({
        type: 'success',
        message:
          decision === 'Accept'
            ? 'Submission accepted! Task transitioned to QA Pending queue.'
            : 'Submission rejected with feedback. Task returned to annotator.',
      });

      setTimeout(() => {
        navigate('/review-queue');
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Review action failed.' });
    } finally {
      setReviewing(false);
    }
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || !currentProject || !id) return;
    try {
      const c = await apiFetch<Comment>(`/projects/${currentProject.id}/tasks/${id}/comments`, {
        method: 'POST',
        body: JSON.stringify({ content: newComment.trim() }),
      });
      setComments([...comments, c]);
      setNewComment('');
    } catch (err) {
      console.error('Failed to post comment:', err);
    }
  };

  if (!currentProject || !id) {
    return <div className="p-8 text-center text-slate-500 text-xs">No task specified.</div>;
  }

  if (loading || !task) {
    return <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading review workspace...</div>;
  }

  // Parse data reference
  let dataContent: any = {};
  try {
    dataContent = JSON.parse(task.data_ref);
  } catch {
    dataContent = { text: task.data_ref };
  }

  const imageUrl = dataContent.image_url || (dataContent.filename && dataContent.filename.match(/\.(jpg|jpeg|png|webp|gif)$/i) ? dataContent.filename : null);
  const textContent = dataContent.text || dataContent.description || (!imageUrl ? JSON.stringify(dataContent, null, 2) : null);

  const latestVersion = task.versions && task.versions.length > 0 ? task.versions[task.versions.length - 1] : null;
  let latestPayload: any = {};
  if (latestVersion) {
    try {
      latestPayload = JSON.parse(latestVersion.payload_json);
    } catch {
      latestPayload = { label: latestVersion.payload_json };
    }
  }

  const reviewBoxes: { id: string; class_name: string; x: number; y: number; w: number; h: number }[] = [];
  if (latestPayload.objects && Array.isArray(latestPayload.objects)) {
    latestPayload.objects.forEach((obj: any, idx: number) => {
      reviewBoxes.push({
        id: `review-box-${idx + 1}`,
        class_name: obj.class || obj.label || 'Object',
        x: obj.bbox ? obj.bbox[0] * 100 : (obj.x || 10),
        y: obj.bbox ? obj.bbox[1] * 100 : (obj.y || 10),
        w: obj.bbox ? obj.bbox[2] * 100 : (obj.w || 20),
        h: obj.bbox ? obj.bbox[3] * 100 : (obj.h || 20),
      });
    });
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/review-queue')}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Review Queue
        </button>
        <div className="flex items-center gap-3">
          <PriorityBadge priority={task.priority} />
          <StatusBadge status={task.status} />
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Main Workspace Split */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Media Preview & Guidelines (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-emerald-400" />
                Data Reference (Task #{task.id})
              </h3>
              <span className="text-[11px] text-slate-400 font-mono">Annotator: {task.assignee?.name || 'Assigned Annotator'}</span>
            </div>

            {imageUrl && (
              <div className="space-y-3">
                <div
                  className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center select-none"
                  style={{ minHeight: '320px', maxHeight: '450px' }}
                >
                  <img
                    src={imageUrl}
                    alt="Review Target"
                    className="max-h-[420px] w-auto max-w-full object-contain pointer-events-none"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Render Visual Bounding Boxes in Review Mode */}
                  {reviewBoxes.map((box) => {
                    const color = getClassColor(box.class_name);
                    return (
                      <div
                        key={box.id}
                        className="absolute border-2 transition-all"
                        style={{
                          left: `${box.x}%`,
                          top: `${box.y}%`,
                          width: `${box.w}%`,
                          height: `${box.h}%`,
                          borderColor: color.border,
                          backgroundColor: color.bg,
                        }}
                      >
                        <span
                          className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow z-10 whitespace-nowrap"
                          style={{ backgroundColor: color.solid }}
                        >
                          {box.class_name}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Marked Objects Summary */}
                {reviewBoxes.length > 0 && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1.5">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <Scan className="w-4 h-4 text-emerald-400" />
                      <span>Marked Objects in Scene ({reviewBoxes.length})</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {reviewBoxes.map((b, idx) => {
                        const col = getClassColor(b.class_name);
                        return (
                          <span
                            key={b.id}
                            className="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1.5 border"
                            style={{ borderColor: col.border, color: col.solid, backgroundColor: col.bg }}
                          >
                            #{idx + 1} {b.class_name} (x:{b.x.toFixed(0)}%, y:{b.y.toFixed(0)}%, w:{b.w.toFixed(0)}%, h:{b.h.toFixed(0)}%)
                          </span>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {textContent && (
              <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                {textContent}
              </div>
            )}
          </div>

          {/* Guidelines Box */}
          {task.schema_version?.guidelines_text && (
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Project Guidelines Reference
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">
                {task.schema_version.guidelines_text}
              </p>
            </div>
          )}

          {/* Version Diff History */}
          {task.versions && task.versions.length > 0 && (
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-400" />
                Submission Diff & Version History
              </h4>
              <div className="space-y-2">
                {task.versions.map((ver, idx) => (
                  <div
                    key={ver.id}
                    className={`p-3 rounded-lg border text-xs space-y-1 ${
                      idx === task.versions!.length - 1
                        ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-300'
                        : 'bg-slate-850 border-slate-750 text-slate-400'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold">
                        Version {ver.version_number} {idx === task.versions!.length - 1 ? '(Current)' : '(Prior)'}
                      </span>
                      <span className="text-[10px] text-slate-500">{new Date(ver.created_at).toLocaleString()}</span>
                    </div>
                    <div className="font-mono text-slate-200 text-xs">{ver.payload_json}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Submission Details, Decision Buttons & Comments (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Submission Inspection Box */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-emerald-400" />
              Inspect Annotator Submission
            </h3>

            <div className="p-4 rounded-xl bg-slate-850 border border-slate-750 space-y-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Assigned Label:</span>
                <p className="text-lg font-black text-emerald-400 mt-0.5">{latestPayload.label || 'None'}</p>
                {latestPayload.custom_label && (
                  <span className="inline-block mt-1 px-2 py-0.5 rounded bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] font-medium">
                    🏷️ Custom / Out-of-Scope: {latestPayload.custom_label}
                  </span>
                )}
              </div>

              {latestPayload.notes && (
                <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-slate-400">Annotator Notes:</span>
                  <p className="text-xs text-slate-200 italic">"{latestPayload.notes}"</p>
                </div>
              )}

              {latestPayload.confidence !== undefined && (
                <div>
                  <span className="text-[10px] uppercase font-bold text-slate-400">Confidence:</span>
                  <p className="text-xs font-mono font-semibold text-slate-200 mt-0.5">
                    {Math.round(latestPayload.confidence * 100)}%
                  </p>
                </div>
              )}

              <div>
                <span className="text-[10px] uppercase font-bold text-slate-400">Submitted At:</span>
                <p className="text-xs text-slate-300 mt-0.5">
                  {latestVersion ? new Date(latestVersion.created_at).toLocaleString() : 'N/A'}
                </p>
              </div>
            </div>

            {/* Accept / Reject Action Buttons */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                type="button"
                onClick={() => handleDecision('Accept', acceptComment || 'Verified accuracy.')}
                disabled={reviewing}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {reviewing ? 'Accepting...' : 'Accept (QA)'}
              </button>

              <button
                type="button"
                onClick={() => setShowRejectModal(true)}
                disabled={reviewing}
                className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/40 font-bold text-xs transition shadow-md disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                Reject Task
              </button>
            </div>
          </div>

          {/* Comments Box */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Task Comments ({comments.length})
            </h3>

            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
              {comments.length === 0 ? (
                <div className="text-center text-xs text-slate-500 py-4">No comments yet.</div>
              ) : (
                comments.map((c) => (
                  <div key={c.id} className="p-3 rounded-lg bg-slate-850 border border-slate-750 text-xs space-y-1">
                    <div className="flex items-center justify-between text-slate-400 text-[11px]">
                      <span className="font-semibold text-slate-200">{c.author?.name || 'User'}</span>
                      <span>{new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p className="text-slate-300 leading-relaxed">{c.content}</p>
                  </div>
                ))
              )}
            </div>

            <form onSubmit={handlePostComment} className="flex gap-2 pt-2 border-t border-slate-800">
              <input
                type="text"
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Add reviewer notes or question..."
                className="flex-1 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition border border-slate-700"
              >
                Post
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* Mandatory Rejection Comment Modal (FR-3.3) */}
      <Modal isOpen={showRejectModal} onClose={() => setShowRejectModal(false)} title="Reject Task Submission">
        <div className="space-y-4 text-xs">
          <p className="text-slate-300 leading-relaxed">
            Rejection returns this task to the annotator with mandatory actionable feedback. Please describe the required correction.
          </p>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Rejection Comment (Mandatory) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={rejectComment}
              onChange={(e) => setRejectComment(e.target.value)}
              placeholder="Explain why this annotation is incorrect and how the annotator should fix it..."
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-rose-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowRejectModal(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!rejectComment.trim() || reviewing}
              onClick={() => handleDecision('Reject', rejectComment)}
              className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold transition shadow-md disabled:opacity-50"
            >
              {reviewing ? 'Rejecting...' : 'Confirm Rejection'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
