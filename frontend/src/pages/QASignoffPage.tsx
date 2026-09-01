import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { Task } from '../types';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PriorityBadge } from '../components/ui/PriorityBadge';
import { Modal } from '../components/ui/Modal';
import {
  FileCheck2,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Eye,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';

export const QASignoffPage: React.FC = () => {
  const { currentProject } = useProject();
  const { user } = useAuth();
  const [qaTasks, setQaTasks] = useState<Task[]>([]);
  const [lockedTasks, setLockedTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Admin Reopen modal state
  const [showReopenModal, setShowReopenModal] = useState<boolean>(false);
  const [selectedTaskToReopen, setSelectedTaskToReopen] = useState<Task | null>(null);
  const [reopenReason, setReopenReason] = useState<string>('');

  const fetchTasks = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [pending, locked] = await Promise.all([
        apiFetch<Task[]>(`/projects/${currentProject.id}/tasks/qa-queue`),
        apiFetch<Task[]>(`/projects/${currentProject.id}/tasks?status=Locked&limit=20`),
      ]);
      setQaTasks(pending);
      setLockedTasks(locked);
    } catch (err) {
      console.error('Failed to load QA queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [currentProject]);

  const handleSignoff = async (taskId: number) => {
    if (!currentProject) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${taskId}/qa-signoff`, {
        method: 'POST',
      });
      setFeedback({ type: 'success', message: `Task #${taskId} signed off, approved, and permanently locked.` });
      fetchTasks();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'QA Sign-off failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReopen = async () => {
    if (!currentProject || !selectedTaskToReopen || !reopenReason.trim()) return;
    setActionLoading(true);
    setFeedback(null);
    try {
      await apiFetch<Task>(`/projects/${currentProject.id}/tasks/${selectedTaskToReopen.id}/reopen`, {
        method: 'POST',
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      setShowReopenModal(false);
      setSelectedTaskToReopen(null);
      setReopenReason('');
      setFeedback({ type: 'success', message: `Locked task #${selectedTaskToReopen.id} reopened and set to In Progress.` });
      fetchTasks();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to reopen task.' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  const isAdmin = user?.global_role === 'admin';

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FileCheck2 className="w-5 h-5 text-emerald-400" />
            QA Sign-off & Task Lock Management
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Project Managers and Admins perform final quality sign-off. Approved tasks transition into Locked (read-only) state.
          </p>
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

      {/* SECTION 1: QA Pending Tasks */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400" />
            QA Pending Sign-off ({qaTasks.length})
          </h3>
        </div>

        {loading ? (
          <div className="p-8 text-center text-slate-400 text-xs animate-pulse">Loading QA queue...</div>
        ) : qaTasks.length === 0 ? (
          <div className="p-8 text-center rounded-xl bg-slate-900 border border-slate-800 text-slate-400 text-xs">
            No tasks currently pending QA sign-off.
          </div>
        ) : (
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Task ID</th>
                    <th className="px-6 py-3.5 font-semibold">Annotator</th>
                    <th className="px-6 py-3.5 font-semibold">Verified Label</th>
                    <th className="px-6 py-3.5 font-semibold">Review History</th>
                    <th className="px-6 py-3.5 font-semibold">Priority</th>
                    <th className="px-6 py-3.5 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {qaTasks.map((task) => {
                    let label = 'N/A';
                    if (task.versions && task.versions.length > 0) {
                      try {
                        const payload = JSON.parse(task.versions[task.versions.length - 1].payload_json);
                        label = payload.label || JSON.stringify(payload);
                      } catch {
                        label = task.versions[task.versions.length - 1].payload_json;
                      }
                    }

                    const lastReview = task.reviews && task.reviews.length > 0 ? task.reviews[task.reviews.length - 1] : null;

                    return (
                      <tr key={task.id} className="hover:bg-slate-850/50 transition">
                        <td className="px-6 py-4 font-mono font-bold text-emerald-400">#{task.id}</td>
                        <td className="px-6 py-4">{task.assignee?.name || 'Annotator'}</td>
                        <td className="px-6 py-4 font-mono text-emerald-300 font-bold">{label}</td>
                        <td className="px-6 py-4 text-slate-400">
                          {lastReview ? `Reviewed by ${lastReview.reviewer?.name || 'Reviewer'}` : 'Accepted'}
                        </td>
                        <td className="px-6 py-4">
                          <PriorityBadge priority={task.priority} />
                        </td>
                        <td className="px-6 py-4 text-right">
                          <button
                            onClick={() => handleSignoff(task.id)}
                            disabled={actionLoading}
                            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md disabled:opacity-50"
                          >
                            <Lock className="w-3.5 h-3.5" /> Sign-off & Lock
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: Locked Tasks & Admin Reopen */}
      <div className="space-y-4 pt-4 border-t border-slate-800">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
            <Lock className="w-4 h-4 text-teal-400" />
            Finalized & Locked Tasks (Read-Only)
          </h3>
          <span className="text-[11px] text-slate-400">Only System Admins can reopen locked tasks</span>
        </div>

        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3 font-semibold">Task ID</th>
                  <th className="px-6 py-3 font-semibold">Final Label</th>
                  <th className="px-6 py-3 font-semibold">Status</th>
                  <th className="px-6 py-3 font-semibold">Locked At</th>
                  <th className="px-6 py-3 font-semibold text-right">Admin Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {lockedTasks.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-6 py-6 text-center text-slate-500">
                      No locked tasks yet.
                    </td>
                  </tr>
                ) : (
                  lockedTasks.map((task) => {
                    let label = 'N/A';
                    if (task.versions && task.versions.length > 0) {
                      try {
                        const payload = JSON.parse(task.versions[task.versions.length - 1].payload_json);
                        label = payload.label || JSON.stringify(payload);
                      } catch {
                        label = task.versions[task.versions.length - 1].payload_json;
                      }
                    }

                    return (
                      <tr key={task.id} className="hover:bg-slate-850/50 transition">
                        <td className="px-6 py-3.5 font-mono font-bold text-teal-300">#{task.id}</td>
                        <td className="px-6 py-3.5 font-mono font-semibold text-slate-200">{label}</td>
                        <td className="px-6 py-3.5">
                          <StatusBadge status={task.status} size="sm" />
                        </td>
                        <td className="px-6 py-3.5 text-slate-400">
                          {task.locked_at ? new Date(task.locked_at).toLocaleString() : 'N/A'}
                        </td>
                        <td className="px-6 py-3.5 text-right">
                          {isAdmin ? (
                            <button
                              onClick={() => {
                                setSelectedTaskToReopen(task);
                                setShowReopenModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-amber-600 hover:text-slate-950 text-amber-300 text-xs font-semibold transition"
                            >
                              <Unlock className="w-3.5 h-3.5" /> Reopen Task
                            </button>
                          ) : (
                            <span className="text-[11px] text-slate-500 italic">Locked</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Admin Reopen Modal (FR-3.5) */}
      <Modal
        isOpen={showReopenModal}
        onClose={() => setShowReopenModal(false)}
        title={`Reopen Locked Task #${selectedTaskToReopen?.id}`}
      >
        <div className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              Reopening a locked task transitions it back to <span className="font-bold">In Progress</span> and records an immutable audit event. A documented justification is required.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1.5">
              Reason for Reopening (Mandatory) <span className="text-rose-400">*</span>
            </label>
            <textarea
              rows={4}
              required
              value={reopenReason}
              onChange={(e) => setReopenReason(e.target.value)}
              placeholder="Provide explicit operational or audit reason for unlocking this finalized task..."
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setShowReopenModal(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!reopenReason.trim() || actionLoading}
              onClick={handleReopen}
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-bold transition shadow-md disabled:opacity-50"
            >
              {actionLoading ? 'Reopening...' : 'Confirm Reopen'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
