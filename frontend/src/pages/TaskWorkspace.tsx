import React, { useState, useEffect, useRef } from 'react';
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
  Scan,
  Trash2,
  Layers,
} from 'lucide-react';

interface BoundingBox {
  id: string;
  class_name: string;
  x: number; // 0 to 100 percentage
  y: number; // 0 to 100 percentage
  w: number; // 0 to 100 percentage
  h: number; // 0 to 100 percentage
}

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

export const TaskWorkspace: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [customLabel, setCustomLabel] = useState<string>('');
  const [annotatorNotes, setAnnotatorNotes] = useState<string>('');
  const [confidence, setConfidence] = useState<number>(1.0);
  const [categories, setCategories] = useState<string[]>([]);
  const [guidelines, setGuidelines] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Bounding box drawing state
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

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
          const cats = parsed.categories || parsed.classes || [];
          setCategories(cats);
          if (cats.length > 0 && !selectedLabel) {
            setSelectedLabel(cats[0]);
          }
        } catch {
          setCategories([]);
        }
      }

      // Preload latest submission value if exists
      if (data.versions && data.versions.length > 0) {
        const latest = data.versions[data.versions.length - 1];
        try {
          const p = JSON.parse(latest.payload_json);
          if (p.raw_label) setSelectedLabel(p.raw_label);
          else if (p.label) setSelectedLabel(p.label);
          if (p.custom_label) setCustomLabel(p.custom_label);
          if (p.notes) setAnnotatorNotes(p.notes);
          if (p.confidence) setConfidence(p.confidence);
          if (p.objects && Array.isArray(p.objects)) {
            setBoxes(
              p.objects.map((obj: any, idx: number) => ({
                id: `box-${idx + 1}-${Date.now()}`,
                class_name: obj.class || obj.label || 'Object',
                x: obj.bbox ? obj.bbox[0] * 100 : (obj.x || 10),
                y: obj.bbox ? obj.bbox[1] * 100 : (obj.y || 10),
                w: obj.bbox ? obj.bbox[2] * 100 : (obj.w || 20),
                h: obj.bbox ? obj.bbox[3] * 100 : (obj.h || 20),
              }))
            );
          }
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

  const activeDrawingClass =
    selectedLabel === 'Other / Out of Taxonomy'
      ? customLabel.trim() || 'Other'
      : selectedLabel || categories[0] || 'Object';

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!task || task.status === 'Locked' || task.status === 'Approved' || task.status === 'In Review' || task.status === 'QA Pending') return;
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentBox({
      id: `box-${Date.now()}`,
      class_name: activeDrawingClass,
      x,
      y,
      w: 0,
      h: 0,
    });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !startPoint) return;
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    const left = Math.min(startPoint.x, currentX);
    const top = Math.min(startPoint.y, currentY);
    const width = Math.abs(currentX - startPoint.x);
    const height = Math.abs(currentY - startPoint.y);
    setCurrentBox({
      id: currentBox?.id || `box-${Date.now()}`,
      class_name: activeDrawingClass,
      x: left,
      y: top,
      w: width,
      h: height,
    });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentBox) return;
    setIsDrawing(false);
    setStartPoint(null);
    if (currentBox.w > 3 && currentBox.h > 3) {
      setBoxes((prev) => [...prev, currentBox]);
    }
    setCurrentBox(null);
  };

  const handleDeleteBox = (boxId: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== boxId));
  };

  const handleClearBoxes = () => {
    setBoxes([]);
  };

  const handleSubmitAnnotation = async () => {
    if (!currentProject || !id || !selectedLabel) {
      setFeedback({ type: 'error', message: 'Please select a classification label before submitting.' });
      return;
    }

    if (selectedLabel === 'Other / Out of Taxonomy' && !customLabel.trim()) {
      setFeedback({ type: 'error', message: 'Please specify what the object contains in the custom label box.' });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const finalLabel = selectedLabel === 'Other / Out of Taxonomy' ? (customLabel.trim() || 'Other') : selectedLabel;
      const payload_json = JSON.stringify({
        label: finalLabel,
        raw_label: selectedLabel,
        custom_label: customLabel.trim() || undefined,
        notes: annotatorNotes.trim() || undefined,
        confidence: Number(confidence),
        timestamp: new Date().toISOString(),
        objects: boxes.map((b) => ({
          class: b.class_name,
          bbox: [
            Number((b.x / 100).toFixed(4)),
            Number((b.y / 100).toFixed(4)),
            Number((b.w / 100).toFixed(4)),
            Number((b.h / 100).toFixed(4)),
          ],
          confidence: Number(confidence),
        })),
        bboxes: boxes.map((b) => [
          Number((b.x / 100).toFixed(4)),
          Number((b.y / 100).toFixed(4)),
          Number((b.w / 100).toFixed(4)),
          Number((b.h / 100).toFixed(4)),
        ]),
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

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading task workspace...</div>;
  }

  if (!task) {
    return <div className="p-8 text-center text-slate-500 text-xs">Task not found.</div>;
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
                {/* Visual Bounding Box Drawing Container */}
                <div
                  ref={imageContainerRef}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  className={`relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center select-none ${
                    isReadOnly ? 'cursor-default' : 'cursor-crosshair'
                  }`}
                  style={{ minHeight: '320px', maxHeight: '450px' }}
                >
                  <img
                    src={imageUrl}
                    alt="Annotation Preview"
                    className="max-h-[420px] w-auto max-w-full object-contain pointer-events-none"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Render Existing Drawn Bounding Boxes */}
                  {boxes.map((box) => {
                    const color = getClassColor(box.class_name);
                    return (
                      <div
                        key={box.id}
                        className="absolute border-2 transition-all group/box"
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
                          className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow flex items-center gap-1 z-10 whitespace-nowrap"
                          style={{ backgroundColor: color.solid }}
                        >
                          {box.class_name}
                          {!isReadOnly && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteBox(box.id);
                              }}
                              className="hover:text-rose-200 ml-1 font-bold text-[11px]"
                              title="Delete box"
                            >
                              ×
                            </button>
                          )}
                        </span>
                      </div>
                    );
                  })}

                  {/* Render Current Active Drawing Box */}
                  {isDrawing && currentBox && (
                    <div
                      className="absolute border-2 border-dashed border-white bg-white/20 pointer-events-none"
                      style={{
                        left: `${currentBox.x}%`,
                        top: `${currentBox.y}%`,
                        width: `${currentBox.w}%`,
                        height: `${currentBox.h}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-white text-slate-900 shadow">
                        {currentBox.class_name}
                      </span>
                    </div>
                  )}
                </div>

                {/* Bounding Box Drawing Instructions & Tag List */}
                {!isReadOnly && (
                  <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                        <Scan className="w-4 h-4 text-emerald-400" />
                        <span>Draw Bounding Boxes (Click & Drag on Image)</span>
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                          Active Class: {activeDrawingClass}
                        </span>
                      </div>
                      {boxes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearBoxes}
                          className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1"
                        >
                          <Trash2 className="w-3 h-3" /> Clear All ({boxes.length})
                        </button>
                      )}
                    </div>

                    {boxes.length > 0 ? (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {boxes.map((b, idx) => {
                          const col = getClassColor(b.class_name);
                          return (
                            <span
                              key={b.id}
                              className="px-2 py-0.5 rounded-md text-[10px] font-semibold flex items-center gap-1.5 border"
                              style={{ borderColor: col.border, color: col.solid, backgroundColor: col.bg }}
                            >
                              #{idx + 1} {b.class_name} (x:{b.x.toFixed(0)}%, y:{b.y.toFixed(0)}%, w:{b.w.toFixed(0)}%, h:{b.h.toFixed(0)}%)
                              <button
                                type="button"
                                onClick={() => handleDeleteBox(b.id)}
                                className="hover:text-rose-300 font-bold ml-0.5"
                              >
                                ×
                              </button>
                            </span>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic">
                        💡 Click and drag directly over any object on the photo to mark its bounding box.
                      </p>
                    )}
                  </div>
                )}

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

              {/* Other / Out of Taxonomy Button */}
              <button
                type="button"
                disabled={isReadOnly}
                onClick={() => setSelectedLabel('Other / Out of Taxonomy')}
                className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-semibold transition flex items-center justify-between ${
                  selectedLabel === 'Other / Out of Taxonomy'
                    ? 'bg-amber-500/20 border-amber-500 text-amber-300 shadow-md ring-1 ring-amber-500/50'
                    : 'bg-slate-850 border-dashed border-slate-700 text-slate-400 hover:bg-slate-800 hover:border-slate-600 hover:text-slate-200'
                } disabled:opacity-60`}
              >
                <span>🏷️ Other / Out of Scope (Custom Label)</span>
                {selectedLabel === 'Other / Out of Taxonomy' && <CheckCircle2 className="w-4 h-4 text-amber-400" />}
              </button>

              {/* Custom Label Input if Other selected */}
              {selectedLabel === 'Other / Out of Taxonomy' && (
                <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/40 space-y-2 mt-2">
                  <label className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5 text-amber-400" />
                    Specify what the image/item contains:
                  </label>
                  <input
                    type="text"
                    value={customLabel}
                    disabled={isReadOnly}
                    onChange={(e) => setCustomLabel(e.target.value)}
                    placeholder="e.g. Clock / Watch (Unrelated asset), Construction Barrier, Dog, Glare..."
                    className="w-full bg-slate-900 border border-amber-500/60 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400 ring-1 ring-amber-500/20 font-medium"
                  />
                  <p className="text-[10px] text-slate-400">
                    This custom label will be submitted to the reviewer and logged in the QA audit trail.
                  </p>
                </div>
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

            {/* Annotator Notes (Optional) */}
            <div className="pt-3 border-t border-slate-800 space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                Annotator Notes & Observations (Optional):
              </label>
              <textarea
                rows={2}
                value={annotatorNotes}
                disabled={isReadOnly}
                onChange={(e) => setAnnotatorNotes(e.target.value)}
                placeholder="Add any edge-case observations, sensor issues, or comments for the reviewer..."
                className="w-full bg-slate-850 border border-slate-750 rounded-xl p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none disabled:opacity-60"
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
