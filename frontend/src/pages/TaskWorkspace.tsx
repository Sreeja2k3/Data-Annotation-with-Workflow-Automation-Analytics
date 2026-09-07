import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { Task, TaskVersion, Comment } from '../types';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PriorityBadge } from '../components/ui/PriorityBadge';
import {
  CheckSquare,
  ArrowLeft,
  Send,
  HelpCircle,
  History,
  MessageSquare,
  AlertTriangle,
  FileText,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';

export const TaskWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(1.0);
  const [categories, setCategories] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
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

      // Extract categories from schema
      if (data.schema_version) {
        setGuidelines(data.schema_version.guidelines_text || '');
        try {
          const parsed = JSON.parse(data.schema_version.taxonomy_json);
          setCategories(parsed.categories || parsed.classes || []);
        } catch {
          setCategories([]);
        }
      }

      // Preload latest submission value if exists
      if (data.versions && data.versions.length > 0) {
        const latest = data.versions[data.versions.length - 1];
        try {
          const p = JSON.parse(latest.payload_json);
          if (p.label) setSelectedLabel(p.label);
          if (p.confidence) setConfidence(p.confidence);
        } catch {
          // Ignored
        }
      }

      // Fetch comments
      const commentData = await apiFetch<Comment[]>(`/projects/${currentProject.id}/tasks/${id}/comments`);
      setComments(commentData);
    } catch (err: any) {
      console.error('Failed to load task details:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
  }, [currentProject, id]);

  const handleSubmitAnnotation = async () => {
    if (!currentProject || !id || !selectedLabel) {
      setFeedback({ type: 'error', message: 'Please select a classification label before submitting.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const payload_json = JSON.stringify({
        label: selectedLabel,
        confidence: Number(confidence),
        timestamp: new Date().toISOString(),
      });

      await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify({ payload_json }),
      });

      setFeedback({ type: 'success', message: 'Annotation submitted successfully! Task moved to review queue.' });
      setTimeout(() => {
        navigate('/my-tasks');
      }, 1200);
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Submission failed.' });
    } finally {
      setSubmitting(false);
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
    return <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading task workspace...</div>;
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

  const isReadOnly = task.status === 'Locked' || task.status === 'Approved' || task.status === 'In Review' || task.status === 'QA Pending';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Top Action Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate(-1)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Tasks
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

      {/* Rejection Alert Banner if status is Rejected */}
      {task.status === 'Rejected' && task.reviews && task.reviews.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-xs text-rose-200 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-bold text-rose-300">Task Rejected by Reviewer ({task.reviews[task.reviews.length - 1].reviewer?.name || 'Reviewer'})</p>
            <p className="italic">"{task.reviews[task.reviews.length - 1].comment}"</p>
            <p className="text-[11px] text-rose-400">Please correct the label according to the feedback and submit again.</p>
          </div>
        </div>
      )}

      {/* Main Workspace Split: Media Preview on Left, Label Taxonomy on Right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Media & Data Content Preview (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Media Box */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                {imageUrl ? <ImageIcon className="w-4 h-4 text-emerald-400" /> : <FileText className="w-4 h-4 text-blue-400" />}
                Data Reference (Task #{task.id})
              </h3>
              <div className="flex items-center gap-2">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${imageUrl ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                  {imageUrl ? 'Image Asset' : 'Text / Metadata Record'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Schema v{task.schema_version?.version_number || 1}</span>
              </div>
            </div>

            {imageUrl ? (
              <div className="space-y-3">
                <div className="rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center max-h-96">
                  <img
                    src={imageUrl}
                    alt="Annotation Preview"
                    className="max-h-96 w-auto object-contain rounded-lg"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />
                </div>
                {dataContent.description && (
                  <div className="px-3 py-2 rounded-lg bg-slate-950/80 border border-slate-800 text-xs text-slate-300 font-mono flex items-center gap-2">
                    <span className="text-emerald-400 font-semibold">Asset Description:</span>
                    <span>{dataContent.description}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-200 font-mono whitespace-pre-wrap leading-relaxed">
                  {textContent}
                </div>
                <p className="text-[11px] text-slate-500 italic">
                  💡 Note: This task was created from a text record. To annotate images, open tasks with image URLs (like Tasks #1 to #6) or import an image dataset (e.g. sample_1_autonomous_vehicles.csv).
                </p>
              </div>
            )}
          </div>

          {/* Guidelines Box */}
          {guidelines && (
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Labeling Guidelines & Definitions
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{guidelines}</p>
            </div>
          )}

          {/* Submission History / Immutable Versions Timeline */}
          {task.versions && task.versions.length > 0 && (
            <div className="p-5 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <h4 className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-emerald-400" />
                Submission Version History (Immutable)
              </h4>
              <div className="space-y-2">
                {task.versions.map((ver) => (
                  <div key={ver.id} className="p-2.5 rounded-lg bg-slate-850 border border-slate-750 text-xs flex items-center justify-between">
                    <div>
                      <span className="font-bold text-emerald-400 mr-2">Version {ver.version_number}</span>
                      <span className="font-mono text-slate-300">{ver.payload_json}</span>
                    </div>
                    <span className="text-[10px] text-slate-500">{new Date(ver.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right: Label Selection, Confidence & Submit (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Classification Selection Box */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <CheckSquare className="w-4 h-4 text-emerald-400" />
              Select Label Classification
            </h3>

            <div className="space-y-2">
              {categories.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No taxonomy categories defined.</div>
              ) : (
                categories.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    disabled={isReadOnly}
                    onClick={() => setSelectedLabel(cat)}
                    className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-semibold transition flex items-center justify-between ${
                      selectedLabel === cat
                        ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300 shadow-md ring-1 ring-emerald-500/50'
                        : 'bg-slate-850 border-slate-750 text-slate-300 hover:bg-slate-800 hover:border-slate-600'
                    } disabled:opacity-60`}
                  >
                    <span>{cat}</span>
                    {selectedLabel === cat && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                  </button>
                ))
              )}
            </div>

            {/* Confidence Slider */}
            <div className="pt-3 border-t border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400 font-medium">Confidence Score:</span>
                <span className="font-mono font-bold text-emerald-400">{Math.round(confidence * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="1.0"
                step="0.05"
                disabled={isReadOnly}
                value={confidence}
                onChange={(e) => setConfidence(parseFloat(e.target.value))}
                className="w-full accent-emerald-500 cursor-pointer disabled:opacity-50"
              />
            </div>

            {/* Action Buttons */}
            {!isReadOnly && (
              <button
                type="button"
                onClick={handleSubmitAnnotation}
                disabled={submitting || !selectedLabel}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-lg disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {submitting ? 'Submitting...' : 'Submit Annotation Label'}
              </button>
            )}

            {isReadOnly && (
              <div className="p-3 rounded-lg bg-slate-800/80 border border-slate-700 text-xs text-slate-400 text-center">
                Task is currently in <span className="font-semibold text-slate-200">{task.status}</span> state (Read-Only).
              </div>
            )}
          </div>

          {/* Threaded Comments Panel */}
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-400" />
              Task Discussion ({comments.length})
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
                placeholder="Leave feedback or question..."
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
    </div>
  );
};
