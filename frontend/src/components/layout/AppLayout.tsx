import React, { useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Kanban,
  CheckSquare,
  ClipboardList,
  UploadCloud,
  FileCheck2,
  BarChart3,
  GitBranch,
  Download,
  ShieldAlert,
  Users,
  Settings,
  Bell,
  LogOut,
  FolderKanban,
  CheckCircle2,
  Layers,
  ChevronDown,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useProject } from '../../context/ProjectContext';
import { Notification } from '../../types';
import { apiFetch } from '../../lib/api';

export const AppLayout: React.FC = () => {
  const { user, logout } = useAuth();
  const { projects, currentProject, currentUserRole, setCurrentProject } = useProject();
  const navigate = useNavigate();
  const location = useLocation();

  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const fetchNotifications = async () => {
    try {
      const data = await apiFetch<Notification[]>('/notifications');
      setNotifications(data);
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 15000);
    return () => clearInterval(interval);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllAsRead = async () => {
    try {
      await apiFetch('/notifications/read-all', { method: 'PUT' });
      setNotifications(notifications.map((n) => ({ ...n, read: true })));
    } catch {
      // Ignored
    }
  };

  const markOneRead = async (id: number) => {
    try {
      await apiFetch(`/notifications/${id}/read`, { method: 'PUT' });
      setNotifications(notifications.map((n) => (n.id === id ? { ...n, read: true } : n)));
    } catch {
      // Ignored
    }
  };

  const navItems = [
    // Project Dashboard
    { path: '/dashboard', label: 'Project Dashboard', icon: LayoutDashboard, roles: ['Admin', 'Product Owner', 'Project Manager', 'Annotator', 'Reviewer'] },
    // Product Owner Portfolio
    { path: '/portfolio', label: 'Portfolio Rollup', icon: Layers, roles: ['Admin', 'Product Owner'] },
    // Schema & Guidelines
    { path: '/schema', label: 'Schema & Guidelines', icon: GitBranch, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    // Annotator
    { path: '/my-tasks', label: 'My Assigned Queue', icon: CheckSquare, roles: ['Admin', 'Annotator'] },
    // Reviewer
    { path: '/review-queue', label: 'Review Queue', icon: ClipboardList, roles: ['Admin', 'Reviewer', 'Project Manager'] },
    // Project Manager QA
    { path: '/qa', label: 'QA Sign-off', icon: FileCheck2, roles: ['Admin', 'Project Manager'] },
    // PM Kanban
    { path: '/kanban', label: 'PM Kanban Board', icon: Kanban, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    // Import
    { path: '/import', label: 'Data Import & Ingest', icon: UploadCloud, roles: ['Admin', 'Project Manager'] },
    // Analytics
    { path: '/analytics', label: 'Analytics & Agreement', icon: BarChart3, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    // Snapshots
    { path: '/snapshots', label: 'Dataset Snapshots', icon: FolderKanban, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    // Export
    { path: '/export', label: 'ML Dataset Export', icon: Download, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    // Admin
    { path: '/admin', label: 'System Admin Center', icon: Settings, roles: ['Admin'] },
    { path: '/audit', label: 'Audit Trail', icon: ShieldAlert, roles: ['Admin', 'Product Owner', 'Project Manager'] },
    { path: '/users', label: 'User Directory', icon: Users, roles: ['Admin'] },
  ];

  // Filter items according to the current user's role on this project
  const visibleNavItems = navItems.filter((item) => {
    if (user?.global_role === 'admin') return true;
    if (!currentUserRole) return item.roles.includes('Annotator') || item.roles.includes('Reviewer');
    return item.roles.includes(currentUserRole);
  });

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      {/* SIDEBAR */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 transform transition-transform duration-200 ease-in-out md:static md:translate-x-0 flex flex-col ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-0 md:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-800 bg-slate-950/50">
          <div className="h-9 w-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-bold shadow-inner">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-bold text-slate-100 leading-none tracking-tight">Annotation Ops</h1>
            <span className="text-[11px] text-emerald-400 font-mono font-medium">v1.1 Enterprise</span>
          </div>
        </div>

        {/* Project Selector Mini-Widget */}
        <div className="px-4 py-3 border-b border-slate-800/80 bg-slate-900/80">
          <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
            Active Project
          </label>
          {projects.length > 0 ? (
            <div className="relative">
              <select
                value={currentProject?.id || ''}
                onChange={(e) => {
                  const selected = projects.find((p) => p.id === Number(e.target.value));
                  if (selected) setCurrentProject(selected);
                }}
                className="w-full bg-slate-850 border border-slate-700 text-xs text-slate-200 rounded-lg px-3 py-2 pr-8 appearance-none focus:outline-none focus:border-emerald-500 font-medium"
              >
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
            </div>
          ) : (
            <div className="text-xs text-slate-500 italic">No projects found</div>
          )}
          {currentUserRole && (
            <div className="mt-2 flex items-center justify-between text-[11px]">
              <span className="text-slate-400">Your Project Role:</span>
              <span className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-800/60 text-emerald-300 font-semibold">
                {currentUserRole}
              </span>
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={() => setMobileMenuOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-emerald-600/15 text-emerald-300 border border-emerald-500/30 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        {/* User Profile / Logout */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center justify-between p-2 rounded-lg bg-slate-850/60 border border-slate-800">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-200 shrink-0 uppercase">
                {user?.name?.charAt(0) || 'U'}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-200 truncate">{user?.name}</p>
                <p className="text-[10px] text-slate-400 truncate">{user?.email}</p>
              </div>
            </div>
            <button
              onClick={() => {
                logout();
                navigate('/login');
              }}
              title="Log out"
              className="text-slate-400 hover:text-rose-400 p-1.5 rounded hover:bg-slate-800 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* MAIN CONTENT AREA */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Header */}
        <header className="h-16 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-6 flex items-center justify-between shrink-0 z-30">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden text-slate-400 hover:text-slate-200"
            >
              {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span>Annotation Ops</span>
              <span>/</span>
              <span className="text-slate-200 font-medium">
                {currentProject ? currentProject.name : 'No Active Project'}
              </span>
            </div>
          </div>

          {/* Right Header Actions */}
          <div className="flex items-center gap-3">
            {/* Notifications Bell */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className="relative p-2 rounded-lg bg-slate-800/80 border border-slate-700/60 text-slate-300 hover:text-white hover:bg-slate-800 transition"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 h-4 min-w-4 px-1 rounded-full bg-emerald-500 text-[10px] font-bold text-slate-950 flex items-center justify-center">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-750 rounded-xl shadow-2xl overflow-hidden z-50 animate-fade-in">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-850">
                    <span className="text-xs font-semibold text-slate-200">Notifications</span>
                    {unreadCount > 0 && (
                      <button
                        onClick={markAllAsRead}
                        className="text-[11px] text-emerald-400 hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-800/60">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-500">No notifications</div>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => markOneRead(n.id)}
                          className={`p-3 text-xs transition cursor-pointer hover:bg-slate-800/60 ${
                            n.read ? 'opacity-60' : 'bg-emerald-950/20'
                          }`}
                        >
                          <div className="flex items-center justify-between font-medium text-slate-200">
                            <span>{n.title}</span>
                            <span className="text-[10px] text-slate-500">
                              {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                          <p className="text-slate-400 mt-1 text-[11px] leading-relaxed">{n.message}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* View Outlet */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8 bg-slate-950">
          <Outlet />
        </main>
      </div>
    </div>
  );
};
