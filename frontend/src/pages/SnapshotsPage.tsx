import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { DatasetSnapshot } from '../types';
import { apiFetch } from '../lib/api';
import { Modal } from '../components/ui/Modal';
import { FolderKanban, Plus, CheckCircle2, AlertCircle, Eye, Download, ShieldCheck } from 'lucide-react';

export const SnapshotsPage: React.FC = () => {
  const { currentProject } = useProject();
  const [snapshots, setSnapshots] = useState<DatasetSnapshot[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [createModalOpen, setCreateModalOpen] = useState<boolean>(false);
  const [snapshotName, setSnapshotName] = useState<string>('');
  const [actionLoading, setActionLoading] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Inspector Modal
  const [inspectSnapshot, setInspectSnapshot] = useState<DatasetSnapshot | null>(null);

  const fetchSnapshots = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const data = await apiFetch<DatasetSnapshot[]>(`/projects/${currentProject.id}/snapshots`);
      setSnapshots(data);
    } catch (err) {
      console.error('Failed to load snapshots:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, [currentProject]);

  const handleCreateSnapshot = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentProject || !snapshotName.trim()) return;

    setActionLoading(true);
    setFeedback(null);
    try {
      await apiFetch<DatasetSnapshot>(`/projects/${currentProject.id}/snapshots`, {
        method: 'POST',
        body: JSON.stringify({ name: snapshotName.trim() }),
      });
      setCreateModalOpen(false);
      setSnapshotName('');
      setFeedback({ type: 'success', message: 'Dataset snapshot created and version manifest saved successfully.' });
      fetchSnapshots();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to create dataset snapshot.' });
    } finally {
      setActionLoading(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <FolderKanban className="w-5 h-5 text-emerald-400" />
            Dataset Snapshots
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable dataset releases capturing approved/locked tasks and metadata for reproducible ML training.
          </p>
        </div>
        <button
          onClick={() => setCreateModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md"
        >
          <Plus className="w-4 h-4" /> Create Snapshot
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

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading dataset snapshots...</div>
      ) : snapshots.length === 0 ? (
        <div className="p-12 text-center rounded-2xl bg-slate-900 border border-slate-800">
          <FolderKanban className="w-10 h-10 text-slate-600 mx-auto mb-2" />
          <h3 className="text-sm font-semibold text-slate-200">No snapshots created yet</h3>
          <p className="text-xs text-slate-400 mt-1">Take a snapshot of approved tasks to create a frozen ML release.</p>
        </div>
      ) : (
        <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                <tr>
                  <th className="px-6 py-3.5 font-semibold">Snapshot ID</th>
                  <th className="px-6 py-3.5 font-semibold">Snapshot Name</th>
                  <th className="px-6 py-3.5 font-semibold">Created Date</th>
                  <th className="px-6 py-3.5 font-semibold">Task Count</th>
                  <th className="px-6 py-3.5 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-slate-200">
                {snapshots.map((snap) => {
                  let count = 0;
                  try {
                    const parsed = JSON.parse(snap.version_manifest_json);
                    count = Array.isArray(parsed) ? parsed.length : 0;
                  } catch {
                    count = 0;
                  }

                  return (
                    <tr key={snap.id} className="hover:bg-slate-850/50 transition">
                      <td className="px-6 py-4 font-mono font-bold text-emerald-400">#{snap.id}</td>
                      <td className="px-6 py-4 font-semibold text-slate-100">{snap.name}</td>
                      <td className="px-6 py-4 text-slate-400">{new Date(snap.created_at).toLocaleString()}</td>
                      <td className="px-6 py-4 font-mono text-emerald-300 font-bold">{count} Approved Tasks</td>
                      <td className="px-6 py-4 text-right space-x-2">
                        <button
                          onClick={() => setInspectSnapshot(snap)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition"
                        >
                          <Eye className="w-3.5 h-3.5" /> Manifest
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

      {/* Create Snapshot Modal */}
      <Modal isOpen={createModalOpen} onClose={() => setCreateModalOpen(false)} title="Create Dataset Snapshot">
        <form onSubmit={handleCreateSnapshot} className="space-y-4 text-xs">
          <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-300 flex items-start gap-2.5">
            <ShieldCheck className="w-5 h-5 shrink-0 mt-0.5" />
            <p>
              This captures all current <span className="font-bold">Approved</span> and <span className="font-bold">Locked</span> tasks into an immutable release version.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-200 mb-1">Snapshot Tag / Name</label>
            <input
              type="text"
              required
              value={snapshotName}
              onChange={(e) => setSnapshotName(e.target.value)}
              placeholder="e.g. training-v1.0-golden, release-2026-q1"
              className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setCreateModalOpen(false)}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={actionLoading || !snapshotName.trim()}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold transition shadow-md disabled:opacity-50"
            >
              {actionLoading ? 'Creating Snapshot...' : 'Save Snapshot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Manifest Inspector Modal */}
      <Modal
        isOpen={!!inspectSnapshot}
        onClose={() => setInspectSnapshot(null)}
        title={`Snapshot Manifest: ${inspectSnapshot?.name}`}
        maxWidth="max-w-2xl"
      >
        <div className="space-y-3 text-xs">
          <p className="text-slate-400">Captured version manifest payload:</p>
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-emerald-300 font-mono text-[11px] max-h-96 overflow-y-auto leading-relaxed">
            {inspectSnapshot
              ? JSON.stringify(JSON.parse(inspectSnapshot.version_manifest_json), null, 2)
              : ''}
          </pre>
        </div>
      </Modal>
    </div>
  );
};
