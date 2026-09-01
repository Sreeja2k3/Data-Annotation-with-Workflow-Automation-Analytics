import React, { createContext, useContext, useState, useEffect } from 'react';
import { Project, ProjectRole } from '../types';
import { apiFetch } from '../lib/api';
import { useAuth } from './AuthContext';

interface ProjectContextType {
  projects: Project[];
  currentProject: Project | null;
  currentUserRole: ProjectRole | null;
  isLoadingProjects: boolean;
  setCurrentProject: (proj: Project | null) => void;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextType | undefined>(undefined);

export const ProjectProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, token } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProject, setCurrentProject] = useState<Project | null>(null);
  const [isLoadingProjects, setIsLoadingProjects] = useState<boolean>(false);

  const refreshProjects = async () => {
    if (!token) {
      setProjects([]);
      setCurrentProject(null);
      return;
    }
    setIsLoadingProjects(true);
    try {
      const data = await apiFetch<Project[]>('/projects');
      setProjects(data);
      if (data.length > 0) {
        if (!currentProject || !data.some((p) => p.id === currentProject.id)) {
          setCurrentProject(data[0]);
        } else {
          const updated = data.find((p) => p.id === currentProject.id);
          if (updated) setCurrentProject(updated);
        }
      } else {
        setCurrentProject(null);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setIsLoadingProjects(false);
    }
  };

  useEffect(() => {
    refreshProjects();
  }, [token]);

  // Derive current user's role on the active project
  const currentUserRole: ProjectRole | null = React.useMemo(() => {
    if (!user || !currentProject) return null;
    if (user.global_role === 'admin') return 'Admin';

    if (currentProject.memberships) {
      const membership = currentProject.memberships.find((m) => m.user_id === user.id);
      if (membership) return membership.project_role;
    }
    return null;
  }, [user, currentProject]);

  return (
    <ProjectContext.Provider
      value={{
        projects,
        currentProject,
        currentUserRole,
        isLoadingProjects,
        setCurrentProject,
        refreshProjects,
      }}
    >
      {children}
    </ProjectContext.Provider>
  );
};

export const useProject = () => {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectProvider');
  }
  return context;
};
