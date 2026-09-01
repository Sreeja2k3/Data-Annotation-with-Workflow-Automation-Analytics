import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { SchemaVersion } from '../types';
import { apiFetch } from '../lib/api';
import { GitBranch, Plus, Trash2, CheckCircle2, History, AlertCircle, Save } from 'lucide-react';

export const SchemaEditor: React.FC = () => {
  const { currentProject, currentUserRole } = useProject();
  const [versions, setVersions] = useState<SchemaVersion[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [newCategory, setNewCategory] = useState<string>('');
  const [guidelines, setGuidelines] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const isPOOrAdmin = currentUserRole === 'Admin' || currentUserRole === 'Product Owner';

  const fetchSchemas = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const data = await apiFetch<SchemaVersion[]>(`/projects/${currentProject.id}/schemas`);
      setVersions(data);
      if (data.length > 0) {
        const latest = data[0];
        setGuidelines(latest.guidelines_text || '');
        try {
          const parsed = JSON.parse(latest.taxonomy_json);
          const cats = parsed.categories || parsed.classes || [];
          setCategories(cats);
        } catch {
          setCategories([]);
        }
      }
    } catch (err) {
      console.error('Failed to fetch schema versions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSchemas();
  }, [currentProject]);

  const handleAddCategory = () => {
    const trimmed = newCategory.trim();
    if (trimmed && !categories.includes(trimmed)) {
      setCategories([...categories, trimmed]);
      setNewCategory('');
    }
  };

  const handleRemoveCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const handleSaveRevision = async () => {
    if (!currentProject || !isPOOrAdmin) return;
    if (categories.length === 0) {
      setFeedback({ type: 'error', message: 'Schema must contain at least one taxonomy category.' });
      return;
    }

    setSaving(true);
    setFeedback(null);
    try {
      const taxonomy_json = JSON.stringify({ categories });
      await apiFetch<SchemaVersion>(`/projects/${currentProject.id}/schemas`, {
        method: 'POST',
        body: JSON.stringify({
          taxonomy_json,
          guidelines_text: guidelines,
        }),
      });
      setFeedback({ type: 'success', message: 'New schema revision successfully created and published.' });
      fetchSchemas();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Failed to save schema revision.' });
    } finally {
      setSaving(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading schema versions...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <GitBranch className="w-5 h-5 text-emerald-400" />
            Annotation Schema & Guidelines
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Define classification taxonomies and guidelines. Every revision is immutable and versioned.
          </p>
        </div>
        {isPOOrAdmin && (
          <button
            onClick={handleSaveRevision}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Publishing...' : 'Publish New Revision'}
          </button>
        )}
      </div>

      {feedback && (
        <div
          className={`p-3 rounded-lg text-xs flex items-center gap-2 ${
            feedback.type === 'success'
              ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              : 'bg-rose-500/10 border border-rose-500/30 text-rose-300'
          }`}
        >
          {feedback.type === 'success' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          {feedback.message}
        </div>
      )}

      {/* Editor Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Taxonomy Builder & Guidelines Editor */}
        <div className="lg:col-span-2 space-y-6">
          {/* Taxonomy Categories Card */}
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
            <h3 className="text-sm font-semibold text-slate-200">Classification Taxonomy (Categories)</h3>
            <p className="text-xs text-slate-400">
              Categories available to annotators and reviewers during label classification.
            </p>

            {isPOOrAdmin && (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                  placeholder="Add class category (e.g. Pedestrian, Stop Sign)..."
                  className="flex-1 bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleAddCategory}
                  className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition flex items-center gap-1 border border-slate-700"
                >
                  <Plus className="w-4 h-4" /> Add
                </button>
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              {categories.map((cat, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-850 border border-slate-750 text-xs text-slate-200 shadow-sm"
                >
                  <span className="font-mono text-emerald-400">#{idx + 1}</span>
                  <span className="font-medium">{cat}</span>
                  {isPOOrAdmin && (
                    <button
                      onClick={() => handleRemoveCategory(idx)}
                      className="text-slate-500 hover:text-rose-400 p-0.5 rounded transition"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Guidelines Text Editor */}
          <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl space-y-3">
            <h3 className="text-sm font-semibold text-slate-200">Annotation Guidelines</h3>
            <p className="text-xs text-slate-400">
              Clear instructions and edge-case definitions displayed directly in the annotator workspace.
            </p>
            <textarea
              rows={8}
              value={guidelines}
              onChange={(e) => setGuidelines(e.target.value)}
              disabled={!isPOOrAdmin}
              placeholder="Enter labeling guidelines, edge-case rules, and quality expectations..."
              className="w-full bg-slate-850 border border-slate-700 rounded-lg p-3 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 font-mono leading-relaxed disabled:opacity-60"
            />
          </div>
        </div>

        {/* Right: Revision History Timeline */}
        <div className="p-6 rounded-xl bg-slate-900 border border-slate-800 shadow-xl space-y-4">
          <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            Revision History
          </h3>
          <div className="space-y-3">
            {versions.map((ver) => (
              <div key={ver.id} className="p-3 rounded-lg bg-slate-850/80 border border-slate-750 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-emerald-400">Version {ver.version_number}</span>
                  <span className="text-[10px] text-slate-500">
                    {new Date(ver.created_at).toLocaleDateString()}
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">
                  Defined by: <span className="text-slate-200 font-medium">{ver.author?.name || 'Product Owner'}</span>
                </div>
                <div className="text-[11px] text-slate-400 font-mono truncate bg-slate-900 p-1.5 rounded border border-slate-800">
                  {ver.taxonomy_json}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
