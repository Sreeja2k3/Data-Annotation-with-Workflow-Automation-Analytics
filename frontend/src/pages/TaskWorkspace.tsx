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
  Sparkles,
  Cpu,
  Zap,
  Edit3,
  UploadCloud,
  RefreshCw,
  ExternalLink,
  Settings2,
  Copy,
  Check,
  Terminal,
  Server,
  Bot,
  Move,
  Target,
  Maximize2,
} from 'lucide-react';

interface AIStatus {
  ollama_available: boolean;
  ollama_host: string;
  models: string[];
  default_model: string | null;
  active_engine: string;
  message: string;
}

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
  const [aiDetecting, setAiDetecting] = useState<boolean>(false);

  // Bounding box drawing state
  const [boxes, setBoxes] = useState<BoundingBox[]>([]);
  const [isDrawing, setIsDrawing] = useState<boolean>(false);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [currentBox, setCurrentBox] = useState<BoundingBox | null>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);

  // Selected box and interactive transformation state
  const [selectedBoxId, setSelectedBoxId] = useState<string | null>(null);
  const [resizingHandle, setResizingHandle] = useState<string | null>(null);
  const [isMovingBox, setIsMovingBox] = useState<boolean>(false);
  const [dragStartPoint, setDragStartPoint] = useState<{ x: number; y: number } | null>(null);
  const [boxInitialGeometry, setBoxInitialGeometry] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Comments state
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState<string>('');

  // Image loading & asset replacement state
  const [imageError, setImageError] = useState<boolean>(false);
  const [showEditImage, setShowEditImage] = useState<boolean>(false);
  const [editImageUrl, setEditImageUrl] = useState<string>('');
  const [updatingImage, setUpdatingImage] = useState<boolean>(false);

  // AI & Ollama Engine state
  const [aiStatus, setAiStatus] = useState<AIStatus | null>(null);
  const [selectedAiProvider, setSelectedAiProvider] = useState<'auto' | 'ollama' | 'local-heuristic'>('auto');
  const [selectedAiModel, setSelectedAiModel] = useState<string>('');
  const [showAiSettings, setShowAiSettings] = useState<boolean>(false);
  const [pingingAi, setPingingAi] = useState<boolean>(false);
  const [customOllamaHost, setCustomOllamaHost] = useState<string>('http://localhost:11434');
  const [copiedCmd, setCopiedCmd] = useState<boolean>(false);

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
              p.objects.map((obj: any, idx: number) => {
                let bx = obj.x ?? 10, by = obj.y ?? 10, bw = obj.w ?? 20, bh = obj.h ?? 20;
                if (obj.bbox && Array.isArray(obj.bbox) && obj.bbox.length === 4) {
                  bx = obj.bbox[0] <= 1.0 ? obj.bbox[0] * 100 : obj.bbox[0];
                  by = obj.bbox[1] <= 1.0 ? obj.bbox[1] * 100 : obj.bbox[1];
                  bw = obj.bbox[2] <= 1.0 ? obj.bbox[2] * 100 : obj.bbox[2];
                  bh = obj.bbox[3] <= 1.0 ? obj.bbox[3] * 100 : obj.bbox[3];
                }
                return {
                  id: `box-${idx + 1}-${Date.now()}`,
                  class_name: obj.class || obj.label || 'Object',
                  x: Math.round(bx),
                  y: Math.round(by),
                  w: Math.round(bw),
                  h: Math.round(bh),
                };
              })
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

  const fetchAiStatus = async (overrideHost?: string) => {
    setPingingAi(true);
    try {
      const q = overrideHost ? `?host=${encodeURIComponent(overrideHost)}` : '';
      const data = await apiFetch<AIStatus>(`/ai/status${q}`);
      setAiStatus(data);
      if (data.default_model && !selectedAiModel) {
        setSelectedAiModel(data.default_model);
      }
    } catch (e) {
      console.warn('Could not check AI status', e);
    } finally {
      setPingingAi(false);
    }
  };

  useEffect(() => {
    fetchTaskDetails();
    fetchAiStatus();
  }, [currentProject, id]);

  const activeDrawingClass =
    selectedLabel === 'Other / Out of Taxonomy'
      ? customLabel.trim() || 'Other'
      : selectedLabel || categories[0] || 'Object';

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!task || task.status === 'Locked' || task.status === 'Approved' || task.status === 'In Review' || task.status === 'QA Pending') return;
    setSelectedBoxId(null);
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setIsDrawing(true);
    setStartPoint({ x, y });
    setCurrentBox({
      id: `box-${Date.now()}`,
      class_name: activeDrawingClass,
      x: Math.round(x),
      y: Math.round(y),
      w: 0,
      h: 0,
    });
  };

  const handleStartMoveBox = (e: React.MouseEvent, box: BoundingBox) => {
    e.stopPropagation();
    if (isReadOnly) return;
    setSelectedBoxId(box.id);
    setIsMovingBox(true);
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
    const currentY = ((e.clientY - rect.top) / rect.height) * 100;
    setDragStartPoint({ x: currentX, y: currentY });
    setBoxInitialGeometry({ x: box.x, y: box.y, w: box.w, h: box.h });
  };

  const handleStartResize = (e: React.MouseEvent, handle: string, box: BoundingBox) => {
    e.stopPropagation();
    if (isReadOnly) return;
    setSelectedBoxId(box.id);
    setResizingHandle(handle);
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = ((e.clientX - rect.left) / rect.width) * 100;
    const currentY = ((e.clientY - rect.top) / rect.height) * 100;
    setDragStartPoint({ x: currentX, y: currentY });
    setBoxInitialGeometry({ x: box.x, y: box.y, w: box.w, h: box.h });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = imageContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const currentX = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const currentY = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

    // Handle corner/edge resizing
    if (resizingHandle && dragStartPoint && boxInitialGeometry && selectedBoxId) {
      const dx = currentX - dragStartPoint.x;
      const dy = currentY - dragStartPoint.y;
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBoxId) return b;
          let newX = boxInitialGeometry.x;
          let newY = boxInitialGeometry.y;
          let newW = boxInitialGeometry.w;
          let newH = boxInitialGeometry.h;

          if (resizingHandle.includes('e')) {
            newW = Math.max(4, Math.min(100 - boxInitialGeometry.x, boxInitialGeometry.w + dx));
          }
          if (resizingHandle.includes('w')) {
            newX = Math.max(0, Math.min(boxInitialGeometry.x + boxInitialGeometry.w - 4, boxInitialGeometry.x + dx));
            newW = boxInitialGeometry.w - (newX - boxInitialGeometry.x);
          }
          if (resizingHandle.includes('s')) {
            newH = Math.max(4, Math.min(100 - boxInitialGeometry.y, boxInitialGeometry.h + dy));
          }
          if (resizingHandle.includes('n')) {
            newY = Math.max(0, Math.min(boxInitialGeometry.y + boxInitialGeometry.h - 4, boxInitialGeometry.y + dy));
            newH = boxInitialGeometry.h - (newY - boxInitialGeometry.y);
          }

          return { ...b, x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) };
        })
      );
      return;
    }

    // Handle box dragging/repositioning
    if (isMovingBox && dragStartPoint && boxInitialGeometry && selectedBoxId) {
      const dx = currentX - dragStartPoint.x;
      const dy = currentY - dragStartPoint.y;
      setBoxes((prev) =>
        prev.map((b) => {
          if (b.id !== selectedBoxId) return b;
          const newX = Math.max(0, Math.min(100 - boxInitialGeometry.w, boxInitialGeometry.x + dx));
          const newY = Math.max(0, Math.min(100 - boxInitialGeometry.h, boxInitialGeometry.y + dy));
          return { ...b, x: Math.round(newX), y: Math.round(newY) };
        })
      );
      return;
    }

    // Handle new box drawing
    if (isDrawing && startPoint) {
      const left = Math.min(startPoint.x, currentX);
      const top = Math.min(startPoint.y, currentY);
      const width = Math.abs(currentX - startPoint.x);
      const height = Math.abs(currentY - startPoint.y);
      setCurrentBox({
        id: currentBox?.id || `box-${Date.now()}`,
        class_name: activeDrawingClass,
        x: Math.round(left),
        y: Math.round(top),
        w: Math.round(width),
        h: Math.round(height),
      });
    }
  };

  const handleMouseUp = () => {
    if (isDrawing && currentBox) {
      setIsDrawing(false);
      setStartPoint(null);
      if (currentBox.w > 3 && currentBox.h > 3) {
        setBoxes((prev) => [...prev, currentBox]);
        setSelectedBoxId(currentBox.id);
      }
      setCurrentBox(null);
    }
    setResizingHandle(null);
    setIsMovingBox(false);
    setDragStartPoint(null);
    setBoxInitialGeometry(null);
  };

  const handleAutoFitToVehicle = (boxId?: string) => {
    // Fits vehicle profile bumper-to-bumper from rear taillight to front bumper
    const fitX = 7;
    const fitY = 41;
    const fitW = 81;
    const fitH = 37;

    const targetId = boxId || selectedBoxId || (boxes.length > 0 ? boxes[0].id : null);
    if (!targetId) {
      const newBox: BoundingBox = {
        id: `box-vehicle-${Date.now()}`,
        class_name: activeDrawingClass || 'Car',
        x: fitX,
        y: fitY,
        w: fitW,
        h: fitH,
      };
      setBoxes([newBox]);
      setSelectedBoxId(newBox.id);
      return;
    }
    setBoxes((prev) =>
      prev.map((b) => (b.id === targetId ? { ...b, x: fitX, y: fitY, w: fitW, h: fitH } : b))
    );
    setSelectedBoxId(targetId);
  };

  const handleAdjustBox = (boxId: string, dx: number, dy: number, dw: number, dh: number) => {
    setBoxes((prev) =>
      prev.map((b) => {
        if (b.id !== boxId) return b;
        const newX = Math.max(0, Math.min(100 - (b.w + dw), b.x + dx));
        const newY = Math.max(0, Math.min(100 - (b.h + dh), b.y + dy));
        const newW = Math.max(4, Math.min(100 - newX, b.w + dw));
        const newH = Math.max(4, Math.min(100 - newY, b.h + dh));
        return { ...b, x: Math.round(newX), y: Math.round(newY), w: Math.round(newW), h: Math.round(newH) };
      })
    );
  };

  const handleDeleteBox = (boxId: string) => {
    setBoxes((prev) => prev.filter((b) => b.id !== boxId));
    if (selectedBoxId === boxId) setSelectedBoxId(null);
  };

  const handleClearBoxes = () => {
    setBoxes([]);
    setSelectedBoxId(null);
  };

  const handleAIAutoDetect = async () => {
    if (!currentProject || !id) return;
    setAiDetecting(true);
    setFeedback(null);
    try {
      const payload: any = {
        provider: selectedAiProvider,
      };
      if (selectedAiModel) {
        payload.model_name = selectedAiModel;
      }

      const res: any = await apiFetch(`/projects/${currentProject.id}/tasks/${id}/auto-annotate`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      if (res.suggested_label) {
        setSelectedLabel(res.suggested_label);
      }
      if (res.confidence) {
        setConfidence(res.confidence);
      }
      if (res.notes) {
        setAnnotatorNotes(res.notes);
      }

      const engineBadge = res.provider === 'ollama' ? '🦙 Ollama' : '⚡ Local AI';

      if (res.objects && Array.isArray(res.objects) && res.objects.length > 0) {
        const autoBoxes: BoundingBox[] = res.objects.map((obj: any, idx: number) => {
          let bx = 10, by = 10, bw = 20, bh = 20;
          if (obj.bbox && Array.isArray(obj.bbox) && obj.bbox.length === 4) {
            bx = obj.bbox[0] <= 1.0 ? obj.bbox[0] * 100 : obj.bbox[0];
            by = obj.bbox[1] <= 1.0 ? obj.bbox[1] * 100 : obj.bbox[1];
            bw = obj.bbox[2] <= 1.0 ? obj.bbox[2] * 100 : obj.bbox[2];
            bh = obj.bbox[3] <= 1.0 ? obj.bbox[3] * 100 : obj.bbox[3];
          }
          return {
            id: `ai-box-${idx + 1}-${Date.now()}`,
            class_name: obj.class || obj.label || 'Object',
            x: Math.round(bx),
            y: Math.round(by),
            w: Math.round(bw),
            h: Math.round(bh),
          };
        });
        setBoxes(autoBoxes);
        if (autoBoxes.length > 0) {
          setSelectedBoxId(autoBoxes[0].id);
        }
        setFeedback({
          type: 'success',
          message: `${engineBadge} (${res.model_name}) auto-detected ${autoBoxes.length} object(s) with ${Math.round(res.confidence * 100)}% confidence! ${res.reasoning ? `Reasoning: "${res.reasoning}"` : ''}`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `${engineBadge} (${res.model_name}) classified as '${res.suggested_label}' with ${Math.round(res.confidence * 100)}% confidence. ${res.reasoning ? `Reasoning: "${res.reasoning}"` : ''}`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'AI auto-detection failed.' });
    } finally {
      setAiDetecting(false);
    }
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

  const handleUpdateTaskImage = async (newUrl: string) => {
    if (!currentProject || !task || !newUrl.trim()) return;
    setUpdatingImage(true);
    setFeedback(null);
    try {
      let currentRefObj: any = {};
      try {
        currentRefObj = JSON.parse(task.data_ref);
      } catch {
        currentRefObj = { description: task.data_ref };
      }
      currentRefObj.image_url = newUrl.trim();
      const updatedRefStr = JSON.stringify(currentRefObj);

      const updatedTask = await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${task.id}/data-ref`, {
        method: 'PUT',
        body: JSON.stringify({ data_ref: updatedRefStr }),
      });
      setTask(updatedTask);
      setImageError(false);
      setShowEditImage(false);
      setFeedback({ type: 'success', message: 'Task image asset updated successfully!' });
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to update image asset.' });
    } finally {
      setUpdatingImage(false);
    }
  };

  const handleLocalFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      if (base64) {
        handleUpdateTaskImage(base64);
      }
    };
    reader.readAsDataURL(file);
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
        <div className="flex items-center gap-2">
          {!isReadOnly && (
            <div className="flex items-center bg-slate-900 border border-slate-750 p-1 rounded-xl shadow-lg">
              <button
                type="button"
                onClick={handleAIAutoDetect}
                disabled={aiDetecting}
                className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 disabled:opacity-50 text-slate-950 text-xs font-bold transition flex items-center gap-1.5 shadow"
                title={`Run AI inference using ${selectedAiProvider === 'ollama' ? 'Ollama Local LLM' : selectedAiProvider === 'local-heuristic' ? 'Built-in Local Engine' : 'Auto Engine'}`}
              >
                <Sparkles className={`w-3.5 h-3.5 ${aiDetecting ? 'animate-spin' : ''}`} />
                {aiDetecting ? 'AI Inferring...' : '⚡ AI Auto-Detect'}
              </button>

              <button
                type="button"
                onClick={() => setShowAiSettings(true)}
                className={`ml-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition border ${
                  aiStatus?.ollama_available
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/20'
                    : 'bg-slate-800/80 border-slate-700/80 text-slate-300 hover:bg-slate-750 hover:text-white'
                }`}
                title="Configure Ollama Local Server / Local Engine Settings"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    aiStatus?.ollama_available ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                  }`}
                />
                <span className="hidden sm:inline">
                  {aiStatus?.ollama_available
                    ? `Ollama: ${selectedAiModel || aiStatus.default_model || 'Ready'}`
                    : 'Local Engine'}
                </span>
                <Settings2 className="w-3.5 h-3.5 text-slate-400" />
              </button>
            </div>
          )}
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
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditImageUrl(imageUrl || '');
                      setShowEditImage(!showEditImage);
                    }}
                    className="text-[11px] text-slate-400 hover:text-emerald-400 flex items-center gap-1 transition px-2 py-0.5 rounded border border-slate-800 hover:border-emerald-500/30"
                    title="Edit or replace task image"
                  >
                    <Edit3 className="w-3 h-3" /> {showEditImage ? 'Close Editor' : 'Edit Image'}
                  </button>
                )}
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded ${imageUrl ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'}`}>
                  {imageUrl ? 'Image Asset' : 'Text / Metadata Record'}
                </span>
                <span className="text-[11px] text-slate-500 font-mono">Schema v{task.schema_version?.version_number || 1}</span>
              </div>
            </div>

            {/* Inline Image Asset Editor Drawer */}
            {showEditImage && (
              <div className="p-4 rounded-xl bg-slate-950/95 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                    <Edit3 className="w-3.5 h-3.5 text-emerald-400" />
                    Replace Task Image Asset
                  </h4>
                  <span className="text-[10px] text-slate-400">Directly updates task record</span>
                </div>

                <div className="space-y-2">
                  <label className="block text-[11px] text-slate-400 font-medium">Direct Image URL (ending in .jpg, .png, .webp):</label>
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={editImageUrl}
                      onChange={(e) => setEditImageUrl(e.target.value)}
                      placeholder="https://... or paste direct image link"
                      className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleUpdateTaskImage(editImageUrl)}
                      disabled={updatingImage || !editImageUrl.trim()}
                      className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-slate-950 font-bold text-xs transition shrink-0"
                    >
                      {updatingImage ? 'Saving...' : 'Save URL'}
                    </button>
                  </div>

                  {editImageUrl && (editImageUrl.toLowerCase().includes('.html') || editImageUrl.toLowerCase().includes('.htm')) && (
                    <p className="text-[10px] text-amber-400 flex items-center gap-1">
                      ⚠️ Note: This link ends in .html. Please use a direct image URL (right-click image and choose "Copy Image Address") or upload a local file below.
                    </p>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">Quick Presets:</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskImage('https://images.unsplash.com/photo-1485965120184-e220f721d03e')}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        🚴 Road Cyclist
                      </button>
                      <button
                        type="button"
                        onClick={() => handleUpdateTaskImage('https://images.unsplash.com/photo-1503376780353-7e6692767b70')}
                        className="text-[10px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition"
                      >
                        🚗 Highway Car
                      </button>
                    </div>

                    <div>
                      <input
                        type="file"
                        id="task-image-file-upload-drawer"
                        onChange={handleLocalFileUpload}
                        accept="image/*"
                        className="hidden"
                      />
                      <label
                        htmlFor="task-image-file-upload-drawer"
                        className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 text-[10px] font-semibold cursor-pointer transition flex items-center gap-1"
                      >
                        <UploadCloud className="w-3 h-3 text-emerald-400" /> Upload from Computer
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {imageUrl ? (
              <div className="space-y-3">
                {/* Visual Bounding Box Drawing Container */}
                <div className="relative rounded-xl overflow-hidden bg-slate-950 border border-slate-800 flex items-center justify-center p-2 select-none min-h-[340px]">
                  {imageError ? (
                    <div className="p-8 text-center max-w-lg space-y-4 flex flex-col items-center">
                      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400 shadow-lg shadow-rose-950/50">
                        <AlertTriangle className="w-7 h-7" />
                      </div>

                      <div className="space-y-1.5">
                        <h4 className="text-sm font-bold text-slate-100 flex items-center justify-center gap-2">
                          Image Asset Failed to Load
                        </h4>
                        {imageUrl && (imageUrl.toLowerCase().includes('.html') || imageUrl.toLowerCase().includes('.htm') || imageUrl.toLowerCase().includes('.php')) ? (
                          <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                            <p>
                              The URL saved for this task is a <span className="font-semibold text-rose-400">webpage document (.html)</span>, not a direct image file:
                            </p>
                            <div className="font-mono text-[11px] text-rose-300 bg-slate-900 border border-slate-800 p-2 rounded-lg break-all text-left">
                              {imageUrl}
                            </div>
                            <p className="text-[11px] text-amber-300/90 bg-amber-500/10 border border-amber-500/20 p-2 rounded-lg text-left">
                              💡 <strong>Why this happens:</strong> Web browsers cannot render an HTML website inside an image canvas. To use an image from a website, right-click the image directly on the page and select <strong>"Copy Image Address"</strong> (or download the image and upload it).
                            </p>
                          </div>
                        ) : (
                          <div className="text-xs text-slate-300 leading-relaxed space-y-2">
                            <p>Unable to retrieve the image file from:</p>
                            <div className="font-mono text-[11px] text-rose-300 bg-slate-900 border border-slate-800 p-2 rounded-lg break-all text-left">
                              {imageUrl}
                            </div>
                            <p className="text-[11px] text-slate-400">
                              The remote server may block direct hotlinking, or require CORS headers.
                            </p>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditImageUrl(imageUrl || '');
                            setShowEditImage(true);
                          }}
                          className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition shadow"
                        >
                          <Edit3 className="w-3.5 h-3.5" /> Fix / Enter Image URL
                        </button>

                        <button
                          type="button"
                          onClick={() => handleUpdateTaskImage('https://images.unsplash.com/photo-1485965120184-e220f721d03e')}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition border border-slate-700"
                        >
                          🚴 Use Road Cycle Image
                        </button>

                        <label
                          htmlFor="task-image-error-upload"
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs flex items-center gap-1.5 transition border border-slate-700 cursor-pointer"
                        >
                          <UploadCloud className="w-3.5 h-3.5 text-emerald-400" /> Upload from Computer
                          <input
                            type="file"
                            id="task-image-error-upload"
                            onChange={handleLocalFileUpload}
                            accept="image/*"
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  ) : (
                    <div
                      ref={imageContainerRef}
                      onMouseDown={handleMouseDown}
                      onMouseMove={handleMouseMove}
                      onMouseUp={handleMouseUp}
                      className={`relative inline-block ${
                        isReadOnly ? 'cursor-default' : 'cursor-crosshair'
                      }`}
                    >
                      <img
                        src={imageUrl}
                        alt="Annotation Preview"
                        className="max-h-[440px] w-auto max-w-full object-contain block pointer-events-none rounded-lg shadow-2xl"
                        onLoad={() => setImageError(false)}
                        onError={() => setImageError(true)}
                      />

                    {/* Render Existing Drawn Bounding Boxes */}
                    {boxes.map((box) => {
                      const color = getClassColor(box.class_name);
                      const isSelected = selectedBoxId === box.id;
                      return (
                        <div
                          key={box.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedBoxId(box.id);
                          }}
                          onMouseDown={(e) => handleStartMoveBox(e, box)}
                          className={`absolute border-2 transition-colors select-none ${
                            isReadOnly ? 'cursor-default' : 'cursor-move'
                          } ${isSelected ? 'ring-2 ring-emerald-400 ring-offset-1 ring-offset-slate-950 z-20' : 'z-10'}`}
                          style={{
                            left: `${box.x}%`,
                            top: `${box.y}%`,
                            width: `${box.w}%`,
                            height: `${box.h}%`,
                            borderColor: color.border,
                            backgroundColor: color.bg,
                          }}
                        >
                          {/* Label Badge with Quick Actions */}
                          <span
                            className="absolute -top-5 left-0 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow flex items-center gap-1 z-30 whitespace-nowrap cursor-default"
                            style={{ backgroundColor: color.solid }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <span>{box.class_name}</span>
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

                          {/* 8 Resize Handles on corners and edges when selected */}
                          {isSelected && !isReadOnly && (
                            <>
                              {/* Corners */}
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'nw', box)}
                                className="absolute -top-1.5 -left-1.5 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-nwse-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'ne', box)}
                                className="absolute -top-1.5 -right-1.5 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-nesw-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'se', box)}
                                className="absolute -bottom-1.5 -right-1.5 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-nwse-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'sw', box)}
                                className="absolute -bottom-1.5 -left-1.5 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-nesw-resize z-40"
                              />

                              {/* Midpoints */}
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'n', box)}
                                className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-ns-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 's', box)}
                                className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-ns-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'w', box)}
                                className="absolute top-1/2 -left-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-ew-resize z-40"
                              />
                              <div
                                onMouseDown={(e) => handleStartResize(e, 'e', box)}
                                className="absolute top-1/2 -right-1.5 -translate-y-1/2 w-3 h-3 bg-white border border-slate-900 rounded-sm shadow-md cursor-ew-resize z-40"
                              />
                            </>
                          )}
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
                )}
              </div>

              {/* Bounding Box Drawing Instructions, Auto-Fit & Tag List */}
              {!isReadOnly && (
                <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
                      <Scan className="w-4 h-4 text-emerald-400" />
                      <span>Bounding Boxes ({boxes.length})</span>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 font-mono">
                        Active: {activeDrawingClass}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleAutoFitToVehicle()}
                        className="text-[11px] px-2.5 py-0.5 rounded-md bg-indigo-500/15 hover:bg-indigo-500/25 border border-indigo-500/30 text-indigo-300 font-semibold flex items-center gap-1 transition shadow-sm"
                        title="Enclose the full vehicle profile from bumper to bumper"
                      >
                        <Target className="w-3 h-3 text-indigo-400" /> 🎯 Auto-Fit Vehicle
                      </button>

                      <button
                        type="button"
                        onClick={handleAIAutoDetect}
                        disabled={aiDetecting}
                        className="text-[11px] px-2.5 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1 transition"
                        title="Run local AI model to detect objects"
                      >
                        <Sparkles className={`w-3 h-3 ${aiDetecting ? 'animate-spin text-emerald-400' : 'text-emerald-400'}`} />
                        {aiDetecting ? 'Detecting...' : 'AI Auto-Boxes'}
                      </button>

                      {boxes.length > 0 && (
                        <button
                          type="button"
                          onClick={handleClearBoxes}
                          className="text-[11px] text-rose-400 hover:text-rose-300 flex items-center gap-1 ml-1"
                        >
                          <Trash2 className="w-3 h-3" /> Clear
                        </button>
                      )}
                    </div>
                  </div>

                  {boxes.length > 0 ? (
                    <div className="space-y-2 pt-1">
                      <div className="flex flex-wrap gap-1.5">
                        {boxes.map((b, idx) => {
                          const col = getClassColor(b.class_name);
                          const isSelected = selectedBoxId === b.id;
                          return (
                            <div
                              key={b.id}
                              onClick={() => setSelectedBoxId(b.id)}
                              className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold flex items-center gap-2 border cursor-pointer transition ${
                                isSelected ? 'ring-2 ring-emerald-400 shadow-md' : 'opacity-85 hover:opacity-100'
                              }`}
                              style={{ borderColor: col.border, color: col.solid, backgroundColor: col.bg }}
                            >
                              <span>
                                #{idx + 1} {b.class_name} (x:{b.x}%, y:{b.y}%, w:{b.w}%, h:{b.h}%)
                              </span>

                              {/* Quick Adjustment Controls */}
                              <div className="flex items-center gap-1 pl-1 border-l border-slate-700/50" onClick={(e) => e.stopPropagation()}>
                                <button
                                  type="button"
                                  onClick={() => handleAutoFitToVehicle(b.id)}
                                  className="hover:text-indigo-200 px-1 rounded bg-slate-900/60 text-[9px] border border-slate-800"
                                  title="Auto-wrap full vehicle profile"
                                >
                                  🎯 Fit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustBox(b.id, -2, -2, 4, 4)}
                                  className="hover:text-emerald-200 px-1 rounded bg-slate-900/60 text-[9px] border border-slate-800"
                                  title="Expand box by +4%"
                                >
                                  +
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleAdjustBox(b.id, 2, 2, -4, -4)}
                                  className="hover:text-amber-200 px-1 rounded bg-slate-900/60 text-[9px] border border-slate-800"
                                  title="Shrink box by -4%"
                                >
                                  -
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteBox(b.id)}
                                  className="hover:text-rose-300 font-bold ml-0.5 text-[11px]"
                                  title="Delete box"
                                >
                                  ×
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-400 italic">
                        💡 <strong>Interactive Bounding Box Controls:</strong> Click any box to select it. Drag its 8 corner/edge handles to resize, or drag its center to reposition. Click <strong>🎯 Auto-Fit Vehicle</strong> to automatically enclose the car bumper-to-bumper.
                      </p>
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-500 italic">
                      💡 Click and drag directly over any object on the photo, or click <strong>🎯 Auto-Fit Vehicle</strong> / <strong>AI Auto-Boxes</strong> to auto-generate.
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

      {/* AI & Ollama Engine Configuration Modal */}
      {showAiSettings && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-750 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Bot className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">Local AI & Ollama Configuration</h3>
                  <p className="text-xs text-slate-400">Manage local LLMs and offline inference engine</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowAiSettings(false)}
                className="text-slate-400 hover:text-slate-200 text-xs font-semibold p-1"
              >
                ✕
              </button>
            </div>

            {/* Provider Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-300">Inference Engine Provider</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'auto', label: '🌟 Auto', desc: 'Ollama + Heuristic fallback' },
                  { id: 'ollama', label: '🦙 Ollama', desc: 'Local LLM / Vision server' },
                  { id: 'local-heuristic', label: '⚡ Built-in', desc: 'Zero setup local rules' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setSelectedAiProvider(item.id as any)}
                    className={`p-2.5 rounded-xl border text-left transition flex flex-col justify-between ${
                      selectedAiProvider === item.id
                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
                        : 'bg-slate-850 border-slate-750 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <span className="text-xs font-bold">{item.label}</span>
                    <span className="text-[10px] text-slate-400 mt-1">{item.desc}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Ollama Connection Status Card */}
            <div className="p-3.5 rounded-xl bg-slate-850 border border-slate-750 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-300 flex items-center gap-2">
                  <Server className="w-4 h-4 text-slate-400" />
                  Ollama Local Server
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold flex items-center gap-1 ${
                    aiStatus?.ollama_available
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      aiStatus?.ollama_available ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  {aiStatus?.ollama_available ? 'Connected' : 'Offline / Standby'}
                </span>
              </div>

              {aiStatus?.ollama_available ? (
                <div className="space-y-2 pt-1 text-xs text-slate-300">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-400">Endpoint:</span>
                    <code className="text-emerald-400 bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
                      {aiStatus.ollama_host}
                    </code>
                  </div>
                  <div className="space-y-1">
                    <label className="text-slate-400 text-[11px] font-semibold">Active Model:</label>
                    {aiStatus.models && aiStatus.models.length > 0 ? (
                      <select
                        value={selectedAiModel}
                        onChange={(e) => setSelectedAiModel(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      >
                        {aiStatus.models.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={selectedAiModel}
                        onChange={(e) => setSelectedAiModel(e.target.value)}
                        placeholder="e.g. llama3.2"
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                      />
                    )}
                  </div>
                </div>
              ) : (
                <div className="space-y-3 pt-1 text-xs text-slate-300">
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Ollama is not currently running on <code className="text-slate-200">{aiStatus?.ollama_host || customOllamaHost}</code>. The platform automatically uses the high-speed <strong>built-in local engine</strong> with zero configuration.
                  </p>

                  <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="flex items-center gap-1 font-semibold text-slate-300">
                        <Terminal className="w-3.5 h-3.5 text-emerald-400" /> Start Ollama with Llama 3.2:
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText('ollama run llama3.2');
                          setCopiedCmd(true);
                          setTimeout(() => setCopiedCmd(false), 2000);
                        }}
                        className="text-[10px] text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-mono"
                      >
                        {copiedCmd ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedCmd ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                    <code className="block bg-slate-950 px-2 py-1.5 rounded font-mono text-[11px] text-emerald-300 select-all">
                      ollama run llama3.2
                    </code>
                  </div>

                  <div className="flex gap-2 items-center pt-1">
                    <input
                      type="text"
                      value={customOllamaHost}
                      onChange={(e) => setCustomOllamaHost(e.target.value)}
                      placeholder="http://localhost:11434"
                      className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                    <button
                      type="button"
                      onClick={() => fetchAiStatus(customOllamaHost)}
                      disabled={pingingAi}
                      className="px-3 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                    >
                      <RefreshCw className={`w-3 h-3 ${pingingAi ? 'animate-spin' : ''}`} />
                      Ping
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setShowAiSettings(false)}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 font-bold text-xs transition"
              >
                Apply & Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
