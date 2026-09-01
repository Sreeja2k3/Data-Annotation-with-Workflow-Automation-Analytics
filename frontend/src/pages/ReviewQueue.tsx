import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { Task } from '../types';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import { PriorityBadge } from '../components/ui/PriorityBadge';
import { ClipboardList, ArrowRight, CheckCircle2, AlertCircle } from 'lucide-react';

export const ReviewQueue: React.FC = () => {
  const { currentProject } = useProject();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const navigate = useNavigate();

  const fetchReviewTasks = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const data = await apiFetch<Task[]>(`/projects/${currentProject.id}/tasks/review-queue`);
      setTasks(data);
    } catch (err) {
      console.error('Failed to load review queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReviewTasks();
  }, [currentProject]);

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-5 h-5 text-emerald-400" />
            Review Queue
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Submitted annotations awaiting quality review, acceptance, or correction feedback.
          </p>
        </div>
        <span className="px-3 py-1 rounded-full bg-slate-900 border border-slate-800 text-slate-300 text-xs font-semibold">
          {tasks.length} Pending Reviews
        </span>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading review queue...</div>
      ) : tasks.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800">
          <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2 opacity-50" />
          <h3 className="text-sm font-semibold text-slate-200">You have no pending reviews</h3>
          <p className="text-xs text-slate-400 mt-1">All submitted tasks have been inspected.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Task ID</th>
                  <th className="px-6 py-3.5 font-semibold">Annotator</th>
                  <th className="px-6 py-3.5 font-semibold">Submitted Label</th>
                  <th className="px-6 py-3.5 font-semibold">Priority</th>
                  <th className="px-6 py-3.5 font-semibold">Status</th>
                  <th className="px-6 py-3.5 font-semibold">Submission Time</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {tasks.map((task) => {
                  let submittedLabel = 'N/A';
                  if (task.versions && task.versions.length > 0) {
                    try {
                      const payload = JSON.parse(task.versions[task.versions.length - 1].payload_json);
                      submittedLabel = payload.label || JSON.stringify(payload);
                    } catch {
                      submittedLabel = task.versions[task.versions.length - 1].payload_json;
                    }
                  }

                  return (
                    <tr key={task.id} className="hover:bg-slate-850/50 transition">
                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">#{task.id}</td>
                      <td className="px-6 py-4 font-medium text-slate-200">{task.assignee?.name || 'Annotator'}</td>
                      <td className="px-6 py-4 font-mono text-emerald-300 font-semibold">{submittedLabel}</td>
                      <td className="px-6 py-4">
                        <PriorityBadge priority={task.priority} />
                      </td>
                      <td className="px-6 py-4">
                        <StatusBadge status={task.status} size="sm" />
                      </td>
                      <td className="px-6 py-4 text-slate-400">
                        {task.submitted_at ? new Date(task.submitted_at).toLocaleString() : 'N/A'}
                      </td>
                      <td className="px-6 py-4 text-right">
                        <button
                          onClick={() => navigate(`/review/${task.id}`)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-sm"
                        >
                          Review Task <ArrowRight className="w-3.5 h-3.5" />
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
  );
};
