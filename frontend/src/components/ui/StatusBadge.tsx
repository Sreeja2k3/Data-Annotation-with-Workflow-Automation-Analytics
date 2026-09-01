import React from 'react';
import { TaskStatus } from '../../types';

interface StatusBadgeProps {
  status: TaskStatus | string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const getStyle = (s: string) => {
    switch (s) {
      case 'Unassigned':
        return 'bg-slate-800 text-slate-300 border-slate-700';
      case 'Assigned':
        return 'bg-sky-950/80 text-sky-300 border-sky-800';
      case 'In Progress':
        return 'bg-blue-950/80 text-blue-300 border-blue-800';
      case 'Submitted':
        return 'bg-indigo-950/80 text-indigo-300 border-indigo-800';
      case 'In Review':
        return 'bg-purple-950/80 text-purple-300 border-purple-800';
      case 'Rejected':
        return 'bg-rose-950/80 text-rose-300 border-rose-800';
      case 'Resubmitted':
        return 'bg-amber-950/80 text-amber-300 border-amber-800';
      case 'QA Pending':
        return 'bg-cyan-950/80 text-cyan-300 border-cyan-800';
      case 'Approved':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-800';
      case 'Locked':
        return 'bg-teal-950 text-teal-200 border-teal-700 font-semibold';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border ${sizeClass} ${getStyle(status)}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-75" />
      {status}
    </span>
  );
};
