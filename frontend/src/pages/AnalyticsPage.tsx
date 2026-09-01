import React, { useState, useEffect } from 'react';
import { useProject } from '../context/ProjectContext';
import { AnnotatorStat, ReviewerStat } from '../types';
import { apiFetch } from '../lib/api';
import {
  BarChart3,
  Download,
  Users,
  Eye,
  ShieldCheck,
  Calendar,
  Clock,
  AlertTriangle,
  TrendingUp,
} from 'lucide-react';

export const AnalyticsPage: React.FC = () => {
  const { currentProject } = useProject();
  const [annotatorStats, setAnnotatorStats] = useState<AnnotatorStat[]>([]);
  const [reviewerStats, setReviewerStats] = useState<ReviewerStat[]>([]);
  const [agreementData, setAgreementData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const fetchAnalytics = async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [ann, rev, agr] = await Promise.all([
        apiFetch<AnnotatorStat[]>(`/projects/${currentProject.id}/analytics/annotators`),
        apiFetch<ReviewerStat[]>(`/projects/${currentProject.id}/analytics/reviewers`),
        apiFetch<any>(`/projects/${currentProject.id}/analytics/agreement`),
      ]);
      setAnnotatorStats(ann);
      setReviewerStats(rev);
      setAgreementData(agr);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [currentProject]);

  const handleExportCSV = () => {
    if (!currentProject) return;
    window.open(`/api/projects/${currentProject.id}/analytics/export`, '_blank');
  };

  if (!currentProject) {
    return <div className="p-8 text-center text-slate-500 text-xs">No project selected.</div>;
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-400" />
            Quality & Productivity Analytics
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Individual throughput benchmarks, reviewer turnarounds, and mathematical Cohen's Kappa agreement.
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-750 text-slate-200 font-semibold text-xs transition border border-slate-700 shadow-sm"
        >
          <Download className="w-4 h-4 text-emerald-400" /> Export CSV Report
        </button>
      </div>

      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs animate-pulse">Computing analytics...</div>
      ) : (
        <>
          {/* SECTION 1: Inter-Annotator Agreement (Cohen's Kappa) */}
          <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100 uppercase tracking-wider">
                  Inter-Annotator Agreement (Cohen's Kappa)
                </h3>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                Computed mathematically across all dual-annotated categorical items. Evaluates guideline clarity and labeling consistency.
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <span className="text-[11px] font-semibold text-slate-400 uppercase">Cohen's Kappa ($\kappa$)</span>
                <p className="text-3xl font-black text-emerald-400 font-mono">
                  {agreementData?.cohens_kappa !== undefined ? agreementData.cohens_kappa.toFixed(2) : '0.00'}
                </p>
                <span className="text-[11px] text-emerald-300 font-semibold">{agreementData?.interpretation || 'Standard'}</span>
              </div>
            </div>
          </div>

          {/* SECTION 2: Annotator Productivity Table (FR-6.2) */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-emerald-400" />
                Annotator Productivity & Rejection Rates
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Annotator</th>
                    <th className="px-6 py-3.5 font-semibold">Email</th>
                    <th className="px-6 py-3.5 font-semibold">Completed Tasks</th>
                    <th className="px-6 py-3.5 font-semibold">Total Submissions</th>
                    <th className="px-6 py-3.5 font-semibold">Avg Turnaround</th>
                    <th className="px-6 py-3.5 font-semibold">Rejection Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {annotatorStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                        No annotators assigned to this project yet.
                      </td>
                    </tr>
                  ) : (
                    annotatorStats.map((stat) => (
                      <tr key={stat.user_id} className="hover:bg-slate-850/50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-100">{stat.name}</td>
                        <td className="px-6 py-4 text-slate-400">{stat.email}</td>
                        <td className="px-6 py-4 font-bold text-emerald-400">{stat.tasks_completed}</td>
                        <td className="px-6 py-4">{stat.total_submissions}</td>
                        <td className="px-6 py-4 text-slate-300">{stat.average_time_seconds.toFixed(1)}s</td>
                        <td className="px-6 py-4">
                          <span
                            className={`font-semibold ${
                              stat.rejection_rate > 15 ? 'text-rose-400' : 'text-slate-300'
                            }`}
                          >
                            {stat.rejection_rate}%
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* SECTION 3: Reviewer Statistics Table (FR-6.3) */}
          <div className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden shadow-xl">
            <div className="px-6 py-4 border-b border-slate-800 bg-slate-850 flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider flex items-center gap-2">
                <Eye className="w-4 h-4 text-purple-400" />
                Reviewer Turnaround & Acceptance Ratios
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase text-[10px] border-b border-slate-800">
                  <tr>
                    <th className="px-6 py-3.5 font-semibold">Reviewer</th>
                    <th className="px-6 py-3.5 font-semibold">Tasks Reviewed</th>
                    <th className="px-6 py-3.5 font-semibold">Accepted</th>
                    <th className="px-6 py-3.5 font-semibold">Rejected</th>
                    <th className="px-6 py-3.5 font-semibold">Acceptance Ratio</th>
                    <th className="px-6 py-3.5 font-semibold">Avg Review Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-200">
                  {reviewerStats.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-6 py-6 text-center text-slate-500">
                        No reviewers assigned to this project yet.
                      </td>
                    </tr>
                  ) : (
                    reviewerStats.map((stat) => (
                      <tr key={stat.reviewer_id} className="hover:bg-slate-850/50 transition">
                        <td className="px-6 py-4 font-semibold text-slate-100">{stat.name}</td>
                        <td className="px-6 py-4 font-bold text-slate-200">{stat.tasks_reviewed}</td>
                        <td className="px-6 py-4 text-emerald-400 font-semibold">{stat.accepted_count}</td>
                        <td className="px-6 py-4 text-rose-400 font-semibold">{stat.rejected_count}</td>
                        <td className="px-6 py-4 font-bold text-purple-400">{stat.acceptance_ratio}%</td>
                        <td className="px-6 py-4 text-slate-300">{stat.average_review_time_seconds.toFixed(1)}s</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
