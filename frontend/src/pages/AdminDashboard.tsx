import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { useAuth } from '../context/AuthContext';
import { Project, User } from '../types';
import { apiFetch } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import {
  Settings,
  Plus,
  Trash2,
  RotateCcw,
  Archive,
  CheckCircle2,
  AlertCircle,
  FolderPlus,
  Shield,
  Layers,
  Users,
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const { user } = useAuth();
  const { projects, refreshProjects } = useProject();
  const [allProjects, setAllProjects] = useState<Project[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // New Project Form
  const [projectName, setProjectName] = useState<string>('');
  const [projectDesc, setProjectDesc] = useState<string>('');
  const [initialCategories, setInitialCategories] = useState<string>('Car, Pedestrian, Bicycle');
  const [poId, setPoId] = useState<string>('');
  const [pmId, setPmId] = useState<string>('');

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [projList, userList] = await Promise.all([
        apiFetch<Project[]>('/projects?include_archived=true'),
        apiFetch<User[]>('/users'),
      ]);
      setAllProjects(projList);
      setUsers(userList);
    } catch (err) {
      console.error('Failed to load admin data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;

    setActionLoading(true);
    setFeedback(null);
    try {
      const cats = initialCategories.split(',').map((c) => c.trim()).filter(Boolean);
      await apiFetch<Project>('/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDesc.trim() || null,
          schema_json: JSON.stringify({ categories: cats }),
          po_id: poId ? Number(poId) : null,
          pm_id: pmId ? Number(pmId) : null,
        }),
      });

      setCreateModalOpen(false);
      setProjectName('');
      setProjectDesc('');
      setFeedback({ type: 'success', message: 'New project provisioned and team roles assigned.' });
      fetchAllData();
      refreshProjects();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Project creation failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSoftDelete = async (projectId: number) => {
    if (!window.confirm('Are you sure you want to soft-delete this project? It can be recovered within 30 days.')) return;
    setActionLoading(true);
    try {
      await apiFetch(`/projects/${projectId}/delete`, { method: 'POST' });
      setFeedback({ type: 'success', message: 'Project moved to soft-delete state (30-day recovery window).' });
      fetchAllData();
      refreshProjects();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Soft delete failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleArchive = async (projectId: number) => {
    setActionLoading(true);
    try {
      await apiFetch(`/projects/${projectId}/archive`, { method: 'POST' });
      setFeedback({ type: 'success', message: 'Project archived successfully.' });
      fetchAllData();
      refreshProjects();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Archive failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRecover = async (projectId: number) => {
    setActionLoading(true);
    try {
      await apiFetch(`/projects/${projectId}/recover`, { method: 'POST' });
      setFeedback({ type: 'success', message: 'Project successfully recovered and restored.' });
      fetchAllData();
      refreshProjects();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Recovery failed.' });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Settings className="w-5 h-5 text-emerald-400" />
            System Administration Center
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Global project provisioning, lifecycle management, soft-delete recovery, and role governance.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md"
        >
          <FolderPlus className="w-4 h-4" /> Provision New Project
        </button>
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

      {/* Projects Management Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">All System Projects</h3>
          <span className="text-xs text-slate-400">{allProjects.length} Projects Total</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Project</th>
                <th className="px-6 py-3.5 font-semibold">Status</th>
                <th className="px-6 py-3.5 font-semibold">Created Date</th>
                <th className="px-6 py-3.5 font-semibold">Team Members</th>
                <th className="px-6 py-3.5 font-semibold text-right">Lifecycle Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {allProjects.map((p) => (
                <tr key={p.id} className="hover:bg-slate-850/50 transition">
                  <td className="px-6 py-4">
                    <div className="font-semibold text-slate-100">{p.name}</div>
                    <div className="text-[11px] text-slate-400 truncate max-w-xs">{p.description}</div>
                  </td>
                  <td className="px-6 py-4">
                    {p.is_deleted ? (
                      <span className="px-2 py-0.5 rounded bg-rose-950 border border-rose-800 text-rose-300 text-[10px] font-bold uppercase">
                        Soft-Deleted
                      </span>
                    ) : p.is_archived ? (
                      <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[10px] font-bold uppercase">
                        Archived
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800 text-emerald-300 text-[10px] font-bold uppercase">
                        Active
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-slate-400">{new Date(p.created_at).toLocaleDateString()}</td>
                  <td className="px-6 py-4">{p.memberships?.length || 0} Members</td>
                  <td className="px-6 py-4 text-right space-x-2">
                    {p.is_deleted ? (
                      <button
                        onClick={() => handleRecover(p.id)}
                        className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-emerald-300 font-semibold transition text-xs"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> Recover
                      </button>
                    ) : (
                      <>
                        {!p.is_archived && (
                          <button
                            onClick={() => handleArchive(p.id)}
                            className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-slate-700 text-amber-300 text-xs font-semibold transition"
                          >
                            <Archive className="w-3.5 h-3.5" /> Archive
                          </button>
                        )}
                        <button
                          onClick={() => handleSoftDelete(p.id)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-rose-900/60 text-rose-400 text-xs font-semibold transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> Delete
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Provision New Project Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Provision New Annotation Project">
        <form onSubmit={handleCreateProject} className="space-y-4 text-xs">
          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Project Name</label>
            <input
              type="text"
              required
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Autonomous Driving 2D Detection"
              className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Description</label>
            <textarea
              rows={2}
              value={projectDesc}
              onChange={(e) => setProjectDesc(e.target.value)}
              placeholder="Scope, dataset origin, and operational targets..."
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Initial Taxonomy Classes (Comma-separated)</label>
            <input
              type="text"
              value={initialCategories}
              onChange={(e) => setInitialCategories(e.target.value)}
              placeholder="Car, Pedestrian, Bicycle, Motorcycle"
              className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">Assign Product Owner</label>
              <select
                value={poId}
                onChange={(e) => setPoId(e.target.value)}
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- None --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-200 mb-1">Assign Project Manager</label>
              <select
                value={pmId}
                onChange={(e) => setPmId(e.target.value)}
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">-- None --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-3">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || !projectName.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition shadow-md disabled:opacity-50"
            >
              {actionLoading ? 'Provisioning...' : 'Provision Project'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
