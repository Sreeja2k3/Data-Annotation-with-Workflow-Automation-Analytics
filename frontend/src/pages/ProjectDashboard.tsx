import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { DashboardStats, Task } from '../types';
import { apiFetch } from '../lib/api';
import { StatusBadge } from '../components/ui/StatusBadge';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Layers,
  FileCheck2,
  TrendingUp,
  Activity,
  ArrowUpRight,
  ShieldCheck,
  CheckSquare,
  ClipboardList,
  AlertCircle,
  RefreshCw,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export const ProjectDashboard: React.FC = () => {
  const { currentProject, currentUserRole } = useProject();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    if (!currentProject) return;
    setLoading(true);
    setError(null);
    try {
      const [statsData, activityData] = await Promise.all([
        apiFetch<DashboardStats>(`/projects/${currentProject.id}/analytics/dashboard`),
        apiFetch<any[]>(`/projects/${currentProject.id}/activity?limit=15`),
      ]);
      setStats(statsData);
      setActivity(activityData);
    } catch (err: any) {
      console.error('Failed to load dashboard:', err);
      setError(err?.message || 'Failed to load project dashboard metrics.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [currentProject]);

  if (!currentProject) {
    return (
      <div className="p-12 text-center text-slate-500">
        <Layers className="w-12 h-12 mx-auto mb-3 opacity-30" />
        <h3 className="text-base font-semibold text-slate-300">No project selected</h3>
        <p className="text-xs text-slate-500 mt-1">Please select or create a project to view the dashboard.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400 text-xs animate-pulse space-y-3">
        <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
        <span>Loading project metrics...</span>
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="p-8 max-w-lg mx-auto text-center rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
        <AlertCircle className="w-10 h-10 text-rose-400 mx-auto" />
        <h3 className="text-sm font-bold text-slate-200">Unable to load dashboard metrics</h3>
        <p className="text-xs text-slate-400">{error || 'An unexpected error occurred while fetching metrics.'}</p>
        <button
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-md"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry
        </button>
      </div>
    );
  }

  const statusColors: Record<string, string> = {
    Unassigned: '#64748b',
    Assigned: '#38bdf8',
    'In Progress': '#3b82f6',
    Submitted: '#6366f1',
    'In Review': '#a855f7',
    Rejected: '#f43f5e',
    Resubmitted: '#f59e0b',
    'QA Pending': '#06b6d4',
    Approved: '#10b981',
    Locked: '#14b8a6',
  };

  const chartData = Object.entries(stats.status_counts).map(([name, count]) => ({
    name,
    count,
    color: statusColors[name] || '#64748b',
  }));

  return (
    <div className="space-y-6">
      {/* Annotator Quick-Action Banner */}
      {currentUserRole === 'Annotator' && (
        <div className="p-4 rounded-xl bg-emerald-950/30 border border-emerald-800/60 shadow-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-600/20 text-emerald-400">
              <CheckSquare className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Welcome, {user?.name || 'Annotator'}!</h4>
              <p className="text-[11px] text-slate-400">You have priority tasks assigned to you in this project.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/my-tasks')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs transition shadow-sm shrink-0"
          >
            Go to My Assigned Queue <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Reviewer Quick-Action Banner */}
      {currentUserRole === 'Reviewer' && (
        <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/60 shadow-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-600/20 text-purple-400">
              <ClipboardList className="w-5 h-5" />
            </div>
            <div>
              <h4 className="text-xs font-bold text-slate-200">Welcome, {user?.name || 'Reviewer'}!</h4>
              <p className="text-[11px] text-slate-400">Submitted annotations are waiting for your quality review.</p>
            </div>
          </div>
          <button
            onClick={() => navigate('/review-queue')}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition shadow-sm shrink-0"
          >
            Go to Review Queue <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Project Overview Card */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2 py-0.5 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-[10px] font-bold uppercase tracking-wider">
              Active Project
            </span>
            {currentProject.is_archived && (
              <span className="px-2 py-0.5 rounded bg-amber-950 border border-amber-800 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                Archived
              </span>
            )}
          </div>
          <h2 className="text-xl font-bold text-slate-100">{currentProject.name}</h2>
          <p className="text-xs text-slate-400 mt-1 max-w-2xl">{currentProject.description || 'No description provided.'}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <p className="text-[10px] text-slate-400 font-semibold uppercase">Overall Completion</p>
            <p className="text-2xl font-black text-emerald-400">{stats.completion_percentage}%</p>
          </div>
          <div className="w-16 h-16 relative flex items-center justify-center">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
              <path
                className="text-slate-800"
                strokeWidth="3.5"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="text-emerald-500"
                strokeDasharray={`${stats.completion_percentage}, 100`}
                strokeWidth="3.5"
                strokeLinecap="round"
                stroke="currentColor"
                fill="none"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
            </svg>
          </div>
        </div>
      </div>

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {/* Total Tasks */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">Total Tasks</span>
            <Layers className="w-4 h-4 text-slate-500" />
          </div>
          <p className="text-xl font-bold text-slate-100">{stats.total_tasks}</p>
        </div>

        {/* Active Workload */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">In Progress</span>
            <Activity className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-xl font-bold text-blue-400">{stats.active_workload}</p>
        </div>

        {/* Reviewer Backlog */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">In Review</span>
            <Clock className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-xl font-bold text-purple-400">{stats.reviewer_backlog}</p>
        </div>

        {/* Pending QA */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">QA Pending</span>
            <FileCheck2 className="w-4 h-4 text-cyan-400" />
          </div>
          <p className="text-xl font-bold text-cyan-400">{stats.pending_qa}</p>
        </div>

        {/* Rejection Rate */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">Rejection Rate</span>
            <AlertTriangle className="w-4 h-4 text-rose-400" />
          </div>
          <p className="text-xl font-bold text-rose-400">{stats.rejection_rate}%</p>
        </div>

        {/* Cohen's Kappa Agreement */}
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-[11px] font-semibold uppercase">Cohen's Kappa</span>
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-emerald-400">{stats.cohens_kappa.toFixed(2)}</p>
        </div>
      </div>

      {/* CHARTS & ACTIVITY FEED */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Status Breakdown Bar Chart */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-slate-900 border border-slate-800">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-400" />
            Task Status Distribution
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 20 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: '#94a3b8', fontSize: 10 }}
                  interval={0}
                  angle={-25}
                  textAnchor="end"
                />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '8px', fontSize: '12px' }}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Activity Feed */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 flex flex-col">
          <h3 className="text-sm font-semibold text-slate-200 mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Live Project Activity
          </h3>
          <div className="flex-1 overflow-y-auto space-y-3 pr-1 max-h-72">
            {activity.length === 0 ? (
              <div className="text-center text-xs text-slate-500 py-8">No recent activity recorded.</div>
            ) : (
              activity.map((item) => (
                <div key={item.id} className="p-2.5 rounded-lg bg-slate-850/70 border border-slate-800 text-xs">
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="font-semibold text-slate-200">{item.actor}</span>
                    <span className="text-[10px]">
                      {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-slate-400">Task #{item.task_id}</span>
                    {item.old_status && (
                      <>
                        <StatusBadge status={item.old_status} size="sm" />
                        <span className="text-slate-500">→</span>
                      </>
                    )}
                    <StatusBadge status={item.new_status} size="sm" />
                  </div>
                  {item.reason && <p className="text-[11px] text-slate-400 mt-1 italic">"{item.reason}"</p>}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
