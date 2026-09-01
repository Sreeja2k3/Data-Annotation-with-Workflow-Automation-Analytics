import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { ImportJob, TaskPriority } from '../types';
import { apiFetch } from '../lib/api';
import {
  UploadCloud,
  FileText,
  AlertCircle,
  CheckCircle2,
  AlertTriangle,
  Play,
  Layers,
  ArrowRight,
} from 'lucide-react';

export const ImportPage: React.FC = () => {
  const { currentProject } = useProject();
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState<boolean>(false);
  const [currentJob, setCurrentJob] = useState<ImportJob | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);
  const [datasetName, setDatasetName] = useState<string>('');
  const [priority, setPriority] = useState<TaskPriority>('Normal');
  const [autoAssign, setAutoAssign] = useState<boolean>(true);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [pastJobs, setPastJobs] = useState<ImportJob[]>([]);

  const fetchPastJobs = async () => {
    if (!currentProject) return;
    try {
      const data = await apiFetch<ImportJob[]>(`/projects/${currentProject.id}/imports`);
      setPastJobs(data);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchPastJobs();
  }, [currentProject]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setFeedback(null);
      setCurrentJob(null);
      setDatasetName(e.target.files[0].name.replace(/\.[^/.]+$/, '') + ' Batch');
    }
  };

  const handleUploadAndValidate = async () => {
    if (!file || !currentProject) return;
    setUploading(true);
    setFeedback(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const job = await apiFetch<ImportJob>(`/projects/${currentProject.id}/imports/upload`, {
        method: 'POST',
        body: formData,
      });
      setCurrentJob(job);
      fetchPastJobs();
      if (job.invalid_rows > 0) {
        setFeedback({
          type: 'error',
          message: `Validation found ${job.invalid_rows} row error(s) out of ${job.total_rows} total rows. Inspect errors below.`,
        });
      } else {
        setFeedback({
          type: 'success',
          message: `All ${job.valid_rows} rows successfully validated with zero format errors. Ready for ingestion.`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'File upload and validation failed.' });
    } finally {
      setUploading(false);
    }
  };

  const handleConfirmIngestion = async () => {
    if (!currentJob || !currentProject) return;
    setConfirming(true);
    try {
      const res: any = await apiFetch(`/projects/${currentProject.id}/imports/${currentJob.id}/confirm`, {
        method: 'POST',
        body: JSON.stringify({
          dataset_name: datasetName,
          priority,
          auto_assign: autoAssign,
        }),
      });
      setFeedback({
        type: 'success',
        message: `${res.message} (${res.tasks_auto_assigned} tasks auto-assigned).`,
      });
      setCurrentJob(null);
      setFile(null);
      fetchPastJobs();
    } catch (err: any) {
      setFeedback({ type: 'error', message: err.message || 'Ingestion failed.' });
    } finally {
      setConfirming(false);
    }
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <UploadCloud className="w-5 h-5 text-emerald-400" />
          Data Import & Ingestion Pipeline
        </h2>
        <p className="text-xs text-slate-400 mt-0.5">
          Staged batch upload for CSV, JSON, and media archives with pre-ingestion row-level error validation.
        </p>
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

      {/* Upload Dropzone */}
      <div className="p-8 rounded-2xl bg-slate-900 border-2 border-dashed border-slate-750 text-center hover:border-emerald-500/50 transition">
        <UploadCloud className="w-10 h-10 text-emerald-400 mx-auto mb-3" />
        <h3 className="text-sm font-semibold text-slate-200">Select Dataset File to Stage & Validate</h3>
        <p className="text-xs text-slate-400 mt-1">Supports CSV, JSON, JSONL, or ZIP archives containing media</p>

        <div className="mt-4 flex items-center justify-center gap-3">
          <input
            type="file"
            id="file-upload"
            onChange={handleFileChange}
            accept=".csv,.json,.jsonl,.zip"
            className="hidden"
          />
          <label
            htmlFor="file-upload"
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs transition cursor-pointer border border-slate-700"
          >
            {file ? file.name : 'Choose File'}
          </label>

          {file && (
            <button
              onClick={handleUploadAndValidate}
              disabled={uploading}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md disabled:opacity-50"
            >
              {uploading ? 'Validating Format...' : 'Validate Dataset'}
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Validation Inspector & Ingestion Confirmation */}
      {currentJob && (
        <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-xl space-y-6 animate-fade-in">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-400" />
                Pre-Ingestion Validation Report (Job #{currentJob.id})
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Review row error details before generating task records.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-semibold">
                Valid: {currentJob.valid_rows}
              </span>
              {currentJob.invalid_rows > 0 && (
                <span className="px-2.5 py-1 rounded bg-rose-950/80 border border-rose-800 text-rose-300 text-xs font-semibold">
                  Errors: {currentJob.invalid_rows}
                </span>
              )}
            </div>
          </div>

          {/* Row-Level Errors Inspector */}
          {currentJob.errors && currentJob.errors.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-semibold text-rose-400 uppercase tracking-wider flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" />
                Row-Level Validation Errors Detected:
              </h4>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-rose-900/50 bg-rose-950/20 divide-y divide-rose-900/30">
                {currentJob.errors.map((err) => (
                  <div key={err.id} className="p-2.5 text-xs text-rose-300 flex items-start gap-2">
                    <span className="font-mono font-bold text-rose-400 shrink-0">Row {err.row_index}:</span>
                    <span className="flex-1">{err.error_message}</span>
                    {err.raw_data_json && (
                      <span className="font-mono text-[10px] text-slate-400 truncate max-w-xs">{err.raw_data_json}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Ingestion Parameters Form */}
          {currentJob.valid_rows > 0 && (
            <div className="pt-4 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Dataset Name</label>
                <input
                  type="text"
                  value={datasetName}
                  onChange={(e) => setDatasetName(e.target.value)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Default Priority</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full bg-slate-850 border border-slate-700 rounded-lg px-3 py-2 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                >
                  <option value="Low">Low</option>
                  <option value="Normal">Normal</option>
                  <option value="High">High</option>
                  <option value="Urgent">Urgent</option>
                </select>
              </div>

              <div className="flex flex-col justify-end">
                <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={autoAssign}
                    onChange={(e) => setAutoAssign(e.target.checked)}
                    className="rounded bg-slate-850 border-slate-700 text-emerald-600 focus:ring-0"
                  />
                  <span>Auto load-balance tasks</span>
                </label>
                <button
                  onClick={handleConfirmIngestion}
                  disabled={confirming}
                  className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md disabled:opacity-50"
                >
                  <Play className="w-4 h-4" />
                  {confirming ? 'Ingesting Tasks...' : `Confirm & Ingest ${currentJob.valid_rows} Tasks`}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Past Import Jobs */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Import Job History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold">Job ID</th>
                <th className="px-6 py-3 font-semibold">Date</th>
                <th className="px-6 py-3 font-semibold">Total Rows</th>
                <th className="px-6 py-3 font-semibold">Valid Rows</th>
                <th className="px-6 py-3 font-semibold">Errors</th>
                <th className="px-6 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {pastJobs.map((j) => (
                <tr key={j.id} className="hover:bg-slate-850/50 transition">
                  <td className="px-6 py-3 font-mono font-semibold text-emerald-400">#{j.id}</td>
                  <td className="px-6 py-3">{new Date(j.created_at).toLocaleString()}</td>
                  <td className="px-6 py-3">{j.total_rows}</td>
                  <td className="px-6 py-3 text-emerald-400">{j.valid_rows}</td>
                  <td className="px-6 py-3 text-rose-400">{j.invalid_rows}</td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        j.status === 'Completed'
                          ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                          : 'bg-amber-950 text-amber-300 border border-amber-800'
                      }`}
                    >
                      {j.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
