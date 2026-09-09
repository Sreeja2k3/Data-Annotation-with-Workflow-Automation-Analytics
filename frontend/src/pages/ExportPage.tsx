import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { DatasetSnapshot } from '../types';
import { apiFetch } from '../lib/api';
import { Download, FileCode, CheckCircle2, ShieldCheck, Layers, ArrowRight } from 'lucide-react';

export const ExportPage: React.FC = () => {
  const { currentProject } = useProject();
  const [snapshots, setSnapshots] = useState<DatasetSnapshot[]>([]);
  const [selectedFormat, setSelectedFormat] = useState<string>('COCO');
  const [selectedSnapshotId, setSelectedSnapshotId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [downloading, setDownloading] = useState<boolean>(false);

  const fetchSnapshots = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const data = await apiFetch<DatasetSnapshot[]>(`/projects/${currentProject.id}/snapshots`);
      setSnapshots(data);
    } catch {
      // Ignored
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSnapshots();
  }, [currentProject]);

  const handleExportDownload = async () => {
    if (!currentProject) return;
    setDownloading(true);
    try {
      const token = localStorage.getItem('token');
      let url = `/api/projects/${currentProject.id}/export?format=${selectedFormat}`;
      if (selectedSnapshotId) {
        url += `&snapshot_id=${selectedSnapshotId}`;
      }
      
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Export download failed. Please verify you have approved tasks to export.');
      }
      
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `project_${currentProject.id}_${selectedFormat.toLowerCase()}_export.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  const exportFormats = [
    { id: 'COCO', name: 'COCO Format (JSON)', domain: 'Computer Vision', desc: 'Standard Microsoft COCO dataset annotations and category indices.' },
    { id: 'YOLO', name: 'YOLO Format (Darknet)', domain: 'Computer Vision', desc: 'Normalized bounding box annotations per image and classes.txt index.' },
    { id: 'VOC', name: 'Pascal VOC (XML)', domain: 'Computer Vision', desc: 'XML-structured annotations with size, bounding boxes, and object tags.' },
    { id: 'CONLL', name: 'CoNLL Format (NLP)', domain: 'Natural Language Processing', desc: 'Tab-delimited token and entity classification format for NLP models.' },
    { id: 'JSONL', name: 'JSON Lines (JSONL)', domain: 'Universal ML', desc: 'One JSON record per line containing data reference and validated payload.' },
  ];

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Download className="w-5 h-5 text-emerald-400" />
          ML Dataset Export Center
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Package and download approved annotations into standard ML training formats with complete traceability manifests.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Format Selector List (7 cols) */}
        <div className="md:col-span-7 space-y-4">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Select Export Target Format</h3>
          <div className="space-y-3">
            {exportFormats.map((fmt) => (
              <div
                key={fmt.id}
                onClick={() => setSelectedFormat(fmt.id)}
                className={`p-4 rounded-xl border cursor-pointer transition flex items-start justify-between ${
                  selectedFormat === fmt.id
                    ? 'bg-emerald-950/30 border-emerald-500/80 shadow-md ring-1 ring-emerald-500/40'
                    : 'bg-slate-900 border-slate-800 hover:bg-slate-850 hover:border-slate-700'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-100">{fmt.name}</span>
                    <span className="px-2 py-0.5 rounded bg-slate-800 text-slate-400 text-[10px] font-semibold font-mono">
                      {fmt.domain}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 leading-relaxed">{fmt.desc}</p>
                </div>
                {selectedFormat === fmt.id && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />}
              </div>
            ))}
          </div>
        </div>

        {/* Configuration & Download Panel (5 cols) */}
        <div className="md:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-5">
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Export Scope & Manifest</h3>

            {/* Scope Selection */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">Dataset Scope</label>
              <select
                value={selectedSnapshotId}
                onChange={(e) => setSelectedSnapshotId(e.target.value)}
                className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
              >
                <option value="">Latest Approved / Locked Tasks</option>
                {snapshots.map((s) => (
                  <option key={s.id} value={s.id}>
                    Snapshot: {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Manifest Summary Box */}
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                Manifest Traceability Preview
              </span>
              <div className="space-y-1 text-slate-300 font-mono text-[11px]">
                <div>Format: <span className="text-emerald-400 font-bold">{selectedFormat}</span></div>
                <div>Project: <span className="text-slate-200">{currentProject.name}</span></div>
                <div>Scope: <span className="text-slate-200">{selectedSnapshotId ? `Snapshot #${selectedSnapshotId}` : 'Current Approved'}</span></div>
                <div>Manifest: <span className="text-emerald-400">manifest.json included in ZIP</span></div>
              </div>
            </div>

            <button
              onClick={handleExportDownload}
              disabled={downloading}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-lg disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              {downloading ? 'Preparing ZIP Package...' : `Download ${selectedFormat} Package (.zip)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
