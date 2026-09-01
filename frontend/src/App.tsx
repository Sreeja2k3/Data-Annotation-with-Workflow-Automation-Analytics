import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProjectProvider } from './context/ProjectContext';
import { AppLayout } from './components/layout/AppLayout';

import { Login } from './pages/Login';
import { ProjectDashboard } from './pages/ProjectDashboard';
import { PortfolioDashboard } from './pages/PortfolioDashboard';
import { SchemaEditor } from './pages/SchemaEditor';
import { ImportPage } from './pages/ImportPage';
import { TaskQueue } from './pages/TaskQueue';
import { TaskWorkspace } from './pages/TaskWorkspace';
import { ReviewQueue } from './pages/ReviewQueue';
import { ReviewWorkspace } from './pages/ReviewWorkspace';
import { QASignoffPage } from './pages/QASignoffPage';
import { KanbanBoard } from './pages/KanbanBoard';
import { AnalyticsPage } from './pages/AnalyticsPage';
import { SnapshotsPage } from './pages/SnapshotsPage';
import { ExportPage } from './pages/ExportPage';
import { AdminDashboard } from './pages/AdminDashboard';
import { AuditLogsPage } from './pages/AuditLogsPage';
import { UserManagement } from './pages/UserManagement';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-slate-400 text-xs animate-pulse">
        Initializing platform...
      </div>
    );
  }

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export const App: React.FC = () => {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <ProjectProvider>
            <Routes>
              {/* Public Auth */}
              <Route path="/login" element={<Login />} />

              {/* Protected Application Workspace */}
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="dashboard" element={<ProjectDashboard />} />
                <Route path="portfolio" element={<PortfolioDashboard />} />
                <Route path="schema" element={<SchemaEditor />} />
                <Route path="import" element={<ImportPage />} />
                <Route path="my-tasks" element={<TaskQueue />} />
                <Route path="tasks/:id" element={<TaskWorkspace />} />
                <Route path="review-queue" element={<ReviewQueue />} />
                <Route path="review/:id" element={<ReviewWorkspace />} />
                <Route path="qa" element={<QASignoffPage />} />
                <Route path="kanban" element={<KanbanBoard />} />
                <Route path="analytics" element={<AnalyticsPage />} />
                <Route path="snapshots" element={<SnapshotsPage />} />
                <Route path="export" element={<ExportPage />} />
                <Route path="admin" element={<AdminDashboard />} />
                <Route path="audit" element={<AuditLogsPage />} />
                <Route path="users" element={<UserManagement />} />
              </Route>

              {/* Catch-all fallback */}
              <Route path="*" element={<Navigate to="/dashboard" replace />} />
            </Routes>
          </ProjectProvider>
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
};
