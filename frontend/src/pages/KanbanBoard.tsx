import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { Task, TaskPriority, TaskStatus, ProjectMembership } from '../types';
import { apiFetch } from '../lib/api';
import { PriorityBadge } from '../components/ui/PriorityBadge';
import { StatusBadge } from '../components/ui/StatusBadge';
import { Modal } from '../components/ui/Modal';
import {
  Kanban,
  Filter,
  Play,
  UserCheck,
  ArrowRight,
  RefreshCw,
  SlidersHorizontal,
  Plus,
  CheckCircle2,
  AlertCircle,
  Info,
} from 'lucide-react';

const STATUS_COLUMNS: TaskStatus[] = [
  'Unassigned',
  'Assigned',
  'In Progress',
  'Submitted',
  'In Review',
  'Rejected',
  'Resubmitted',
  'QA Pending',
  'Approved',
  'Locked',
];

export const KanbanBoard: React.FC = () => {
  const { currentProject } = useProject();
  const navigate = useNavigate();

  const [boardData, setBoardData] = useState<Record<string, any[]>>({});
  const [members, setMembers] = useState<ProjectMembership[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedPriority, setSelectedPriority] = useState<string>('all');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('all');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'info' | 'error'; message: string } | null>(null);

  // Manual Reassignment Modal
  const [reassignModalOpen, setReassignModalOpen] = useState<boolean>(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [newAssigneeId, setNewAssigneeId] = useState<number | ''>('');
  const [reassignReason, setReassignReason] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);

  // Create Task Modal
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState<boolean>(false);
  const [newTaskDataRef, setNewTaskDataRef] = useState<string>('');
  const [newTaskPriority, setNewTaskPriority] = useState<TaskPriority>('Normal');
  const [newTaskAssigneeId, setNewTaskAssigneeId] = useState<number | ''>('');

  const fetchKanban = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [board, memberList] = await Promise.all([
        apiFetch<Record<string, any[]>>(`/projects/${currentProject.id}/tasks/kanban`),
        apiFetch<ProjectMembership[]>(`/projects/${currentProject.id}/members`),
      ]);
      setBoardData(board);
      setMembers(memberList.filter((m) => m.project_role === 'Annotator'));
    } catch (err) {
      console.error('Failed to load kanban:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKanban();
  }, [currentProject]);

  const handleAutoAssign = async () => {
    if (!currentProject) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const res: any = await apiFetch(`/projects/${currentProject.id}/assignments/auto`, { method: 'POST' });
      const count = res?.assigned_count ?? 0;
      if (count > 0) {
        setFeedback({
          type: 'success',
          message: `Successfully auto-assigned ${count} task(s) to eligible annotators using load-balancing!`,
        });
      } else {
        setFeedback({
          type: 'info',
          message: `No unassigned tasks found in this project. All tasks are currently assigned or in flight. Click "+ Add Task" to create an unassigned task!`,
        });
      }
      fetchKanban();
    } catch (err: any) {
      console.error('Auto-assignment failed:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Auto-assignment failed.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateTaskSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !newTaskDataRef.trim()) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      const created: any = await apiFetch(`/projects/${currentProject.id}/tasks`, {
        method: 'POST',
        body: JSON.stringify({
          data_ref: newTaskDataRef.trim(),
          priority: newTaskPriority,
          assigned_to: newTaskAssigneeId ? Number(newTaskAssigneeId) : null,
        }),
      });
      setCreateTaskModalOpen(false);
      setNewTaskDataRef('');
      setNewTaskPriority('Normal');
      setNewTaskAssigneeId('');
      setFeedback({
        type: 'success',
        message: `Task #${created.id} successfully created in "${created.status}" state!`,
      });
      fetchKanban();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err?.message || 'Failed to create task.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReassignSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !selectedTaskId || !newAssigneeId || !reassignReason.trim()) return;

    setActionLoading(true);
    setFeedback(null);
    try {
      await apiFetch(`/projects/${currentProject.id}/tasks/${selectedTaskId}/reassign`, {
        method: 'POST',
        body: JSON.stringify({
          new_assignee_id: Number(newAssigneeId),
          reason: reassignReason.trim(),
        }),
      });
      setReassignModalOpen(false);
      setSelectedTaskId(null);
      setNewAssigneeId('');
      setReassignReason('');
      setFeedback({
        type: 'success',
        message: `Task #${selectedTaskId} successfully reassigned!`,
      });
      fetchKanban();
    } catch (err: any) {
      console.error('Reassignment failed:', err);
      setFeedback({
        type: 'error',
        message: err?.message || 'Reassignment failed.',
      });
    } finally {
      setActionLoading(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  return (
    <div className="space-y-6 flex flex-col h-full">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Kanban className="w-5 h-5 text-emerald-400" />
            Operations Kanban Board
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Monitor workflow stages, detect bottlenecks, and balance annotator workloads in real time.
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Priority Filter */}
          <select
            value={selectedPriority}
            onChange={(e) => setSelectedPriority(e.target.value)}
            className="bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Priorities</option>
            <option value="Urgent">Urgent</option>
            <option value="High">High</option>
            <option value="Normal">Normal</option>
            <option value="Low">Low</option>
          </select>

          {/* Assignee Filter */}
          <select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            className="bg-slate-850 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
          >
            <option value="all">All Assignees</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.user?.name || `User #${m.user_id}`}
              </option>
            ))}
          </select>

          {/* Add Task Button */}
          <button
            onClick={() => setCreateTaskModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 font-semibold text-xs transition shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-400" /> Add Task
          </button>

          {/* Auto Assign Trigger */}
          <button
            onClick={handleAutoAssign}
            disabled={actionLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-sm disabled:opacity-50"
          >
            <Play className="w-3.5 h-3.5" /> Auto-Assign
          </button>

          <button
            onClick={fetchKanban}
            className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-300 transition"
            title="Refresh board"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center justify-between gap-2 animate-fade-in ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : feedback.type === 'info'
              ? 'bg-sky-500/10 border border-sky-500/30 text-sky-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />}
            {feedback.type === 'info' && <Info className="w-4 h-4 shrink-0 text-sky-400" />}
            {feedback.type === 'error' && <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />}
            <span>{feedback.message}</span>
          </div>
          <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-slate-200 text-xs">✕</button>
        </div>
      )}

      {/* 10-COLUMN KANBAN BOARD */}
      <div className="flex-1 overflow-x-auto pb-4">
        <div className="flex gap-4 min-w-[2200px] h-[calc(100vh-240px)]">
          {STATUS_COLUMNS.map((status) => {
            const rawCards = boardData[status] || [];
            const filteredCards = rawCards.filter((card) => {
              if (selectedPriority !== 'all' && card.priority !== selectedPriority) return false;
              if (selectedAssignee !== 'all' && String(card.assigned_to) !== selectedAssignee) return false;
              return true;
            });

            return (
              <div
                key={status}
                className="w-56 flex flex-col rounded-xl bg-slate-900/90 border border-slate-800 shadow-md shrink-0 overflow-hidden"
              >
                {/* Column Header */}
                <div className="px-3.5 py-2.5 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    <StatusBadge status={status} size="sm" />
                  </div>
                  <span className="text-[11px] font-bold text-slate-400">{filteredCards.length}</span>
                </div>

                {/* Cards Container */}
                <div className="flex-1 p-2 space-y-2.5 overflow-y-auto">
                  {filteredCards.length === 0 ? (
                    <div className="p-4 text-center text-[11px] text-slate-600 italic">No tasks</div>
                  ) : (
                    filteredCards.map((card) => {
                      let snippet = card.data_ref;
                      try {
                        const parsed = JSON.parse(card.data_ref);
                        snippet = parsed.text || parsed.description || parsed.filename || parsed.image_url || card.data_ref;
                      } catch {
                        // Raw string
                      }

                      return (
                        <div
                          key={card.id}
                          className="p-3 rounded-lg bg-slate-850/90 border border-slate-750/80 shadow-sm hover:border-slate-600 transition space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-bold text-emerald-400">#{card.id}</span>
                            <PriorityBadge priority={card.priority} />
                          </div>

                          <p className="text-[11px] text-slate-300 line-clamp-2 leading-relaxed font-sans">{snippet}</p>

                          <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400">
                            <span className="truncate max-w-[100px]">{card.assignee_name}</span>
                            <button
                              onClick={() => {
                                setSelectedTaskId(card.id);
                                setReassignModalOpen(true);
                              }}
                              className="text-slate-400 hover:text-emerald-400 font-semibold"
                            >
                              Reassign
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Manual Reassignment Modal (FR-2.3) */}
      <Modal
        isOpen={reassignModalOpen}
        onClose={() => setReassignModalOpen(false)}
        title={`Reassign Task #${selectedTaskId}`}
      >
        <form onSubmit={handleReassignSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Select New Annotator</label>
            <select
              required
              value={newAssigneeId}
              onChange={(e) => setNewAssigneeId(Number(e.target.value))}
              className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            >
              <option value="">-- Choose Annotator --</option>
              {members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.user?.name} ({m.user?.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Reason for Reassignment (Mandatory) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={reassignReason}
              onChange={(e) => setReassignReason(e.target.value)}
              placeholder="Explain why this task is being reassigned (recorded in audit trail & assignment history)..."
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setReassignModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || !newAssigneeId || !reassignReason.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition shadow-md disabled:opacity-50"
            >
              {actionLoading ? 'Reassigning...' : 'Confirm Reassign'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Create Task Modal */}
      <Modal
        isOpen={createTaskModalOpen}
        onClose={() => setCreateTaskModalOpen(false)}
        title="Create New Project Task"
      >
        <form onSubmit={handleCreateTaskSubmit} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">
              Data Reference / Content <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={3}
              required
              value={newTaskDataRef}
              onChange={(e) => setNewTaskDataRef(e.target.value)}
              placeholder='Enter sentence, image URL, or JSON e.g. {"text": "Speeding car near pedestrian crossing"}'
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">Priority</label>
              <select
                value={newTaskPriority}
                onChange={(e) => setNewTaskPriority(e.target.value as TaskPriority)}
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="Low">Low</option>
                <option value="Normal">Normal</option>
                <option value="High">High</option>
                <option value="Urgent">Urgent</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">Initial Assignee</label>
              <select
                value={newTaskAssigneeId}
                onChange={(e) => setNewTaskAssigneeId(e.target.value ? Number(e.target.value) : '')}
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- Unassigned (For Auto-Assign) --</option>
                {members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.user?.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateTaskModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || !newTaskDataRef.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition shadow-md disabled:opacity-50"
            >
              {actionLoading ? 'Creating...' : 'Create Task'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
