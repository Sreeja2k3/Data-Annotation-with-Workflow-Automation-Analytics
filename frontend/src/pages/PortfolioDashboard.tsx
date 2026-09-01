import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useProject } from '../context/ProjectContext';
import { PortfolioProject } from '../types';
import { apiFetch } from '../lib/api';
import { Layers, ArrowUpRight, TrendingUp, AlertTriangle, ShieldCheck, CheckCircle2 } from 'lucide-react';

export const PortfolioDashboard: React.FC = () => {
  const [portfolio, setPortfolio] = useState<PortfolioProject[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const { setCurrentProject, projects } = useProject();
  const navigate = useNavigate();

  const fetchPortfolio = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PortfolioProject[]>('/analytics/portfolio');
      setPortfolio(data);
    } catch (err) {
      console.error('Failed to load portfolio metrics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPortfolio();
  }, []);

  const handleOpenProject = (projectId: number) => {
    const proj = projects.find((p) => p.id === projectId);
    if (proj) {
      setCurrentProject(proj);
      navigate('/dashboard');
    }
  };

  if (loading) {
    return <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Loading portfolio rollup...</div>;
  }

  // Summary aggregates
  const totalProjects = portfolio.length;
  const totalTasks = portfolio.reduce((acc, p) => acc + p.total_tasks, 0);
  const avgCompletion = totalProjects > 0 ? (portfolio.reduce((acc, p) => acc + p.completion_percentage, 0) / totalProjects).toFixed(1) : '0';
  const avgRejection = totalProjects > 0 ? (portfolio.reduce((acc, p) => acc + p.rejection_rate, 0) / totalProjects).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      {/* Portfolio Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-emerald-400" />
            Product Owner Portfolio Rollup
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-project visibility into progress, quality, and agreement across all owned initiatives.
          </p>
        </div>
      </div>

      {/* Aggregate Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Owned Projects</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{totalProjects}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Total Portfolio Tasks</p>
          <p className="text-2xl font-bold text-slate-100 mt-1">{totalTasks}</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Avg Completion</p>
          <p className="text-2xl font-bold text-emerald-400 mt-1">{avgCompletion}%</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
          <p className="text-[11px] font-semibold text-slate-400 uppercase">Avg Rejection Rate</p>
          <p className="text-2xl font-bold text-rose-400 mt-1">{avgRejection}%</p>
        </div>
      </div>

      {/* Projects Rollup Table */}
      <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
        <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
          <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Active Projects Status</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
              <tr>
                <th className="px-6 py-3 font-semibold">Project Name</th>
                <th className="px-6 py-3 font-semibold">Total Tasks</th>
                <th className="px-6 py-3 font-semibold">Completion %</th>
                <th className="px-6 py-3 font-semibold">Rejection Rate</th>
                <th className="px-6 py-3 font-semibold">Agreement (Kappa)</th>
                <th className="px-6 py-3 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {portfolio.map((item) => (
                <tr key={item.project_id} className="hover:bg-slate-850/50 transition">
                  <td className="px-6 py-4 font-semibold text-slate-100">
                    <div>{item.project_name}</div>
                    <div className="text-[11px] text-slate-400 font-normal truncate max-w-xs">{item.description}</div>
                  </td>
                  <td className="px-6 py-4">{item.total_tasks}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 bg-slate-800 rounded-full h-2 overflow-hidden">
                        <div
                          className="bg-emerald-500 h-full rounded-full"
                          style={{ width: `${item.completion_percentage}%` }}
                        />
                      </div>
                      <span className="font-semibold text-emerald-400">{item.completion_percentage}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`font-semibold ${item.rejection_rate > 15 ? 'text-rose-400' : 'text-slate-300'}`}>
                      {item.rejection_rate}%
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <span className="font-mono text-emerald-400 font-semibold">{item.cohens_kappa.toFixed(2)}</span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button
                      onClick={() => handleOpenProject(item.project_id)}
                      className="inline-flex items-center gap-1 px-3 py-1 rounded bg-slate-800 hover:bg-emerald-600 hover:text-slate-950 text-slate-200 font-medium transition text-xs"
                    >
                      Open <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
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
