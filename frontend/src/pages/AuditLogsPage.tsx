import React, { useState, useEffect } from 'react';
import { AuditLog } from '../types';
import { apiFetch } from '../lib/api';
import { ShieldAlert, Download, Search, Filter } from 'lucide-react';

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [entityFilter, setEntityFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<AuditLog[]>('/audit-logs?limit=200');
      setLogs(data);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, []);

  const handleExportCSV = () => {
    window.open('/api/audit-logs/export-csv', '_blank');
  };

  const filteredLogs = logs.filter((l) => {
    if (entityFilter !== 'all' && l.entity_type !== entityFilter) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchAction = l.action.toLowerCase().includes(term);
      const matchActor = l.actor?.name?.toLowerCase().includes(term);
      const matchMeta = l.metadata_json?.toLowerCase().includes(term);
      if (!matchAction && !matchActor && !matchMeta) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-emerald-400" />
            Append-Only System Audit Trail
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Immutable, non-repudiable audit logs of every state-changing action, user login, and schema update.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs transition border border-slate-700 shadow-sm"
        >
          <Download className="w-4 h-4 text-emerald-400" /> Export Audit CSV
        </button>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by action, actor, or metadata..."
            className="w-full bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 pl-9 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
          />
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
        </div>

        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="bg-slate-900 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
        >
          <option value="all">All Entity Types</option>
          <option value="project">Projects</option>
          <option value="task">Tasks</option>
          <option value="schema">Schemas</option>
          <option value="dataset">Datasets</option>
          <option value="snapshot">Snapshots</option>
          <option value="membership">Memberships</option>
          <option value="user">Users</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-6 py-3.5 font-semibold">Log ID</th>
                <th className="px-6 py-3.5 font-semibold">Timestamp (UTC)</th>
                <th className="px-6 py-3.5 font-semibold">Actor</th>
                <th className="px-6 py-3.5 font-semibold">Action</th>
                <th className="px-6 py-3.5 font-semibold">Entity</th>
                <th className="px-6 py-3.5 font-semibold">Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200 font-mono text-[11px]">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    Loading audit events...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-500">
                    No matching audit records found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-850/50 transition">
                    <td className="px-6 py-3 font-bold text-emerald-400">#{log.id}</td>
                    <td className="px-6 py-3 text-slate-400">{new Date(log.timestamp).toISOString()}</td>
                    <td className="px-6 py-3 font-sans font-medium text-slate-200">{log.actor?.name || 'System'}</td>
                    <td className="px-6 py-3">
                      <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-bold">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-slate-300 font-semibold">
                      {log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}
                    </td>
                    <td className="px-6 py-3 text-slate-400 truncate max-w-sm">{log.metadata_json || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
