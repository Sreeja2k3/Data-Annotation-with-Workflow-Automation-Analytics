export type ProjectRole = 'Admin' | 'Product Owner' | 'Project Manager' | 'Annotator' | 'Reviewer';

export type TaskStatus = 
  | 'Unassigned'
  | 'Assigned'
  | 'In Progress'
  | 'Submitted'
  | 'In Review'
  | 'Rejected'
  | 'Resubmitted'
  | 'QA Pending'
  | 'Approved'
  | 'Locked';

export type TaskPriority = 'Low' | 'Normal' | 'High' | 'Urgent';

export interface User {
  id: number;
  name: string;
  email: string;
  global_role: 'admin' | 'user';
  is_active: boolean;
  created_at: string;
}

export interface Token {
  access_token: string;
  token_type: string;
  user: User;
}

export interface ProjectMembership {
  id: number;
  user_id: number;
  project_id: number;
  project_role: ProjectRole;
  user?: User;
  created_at: string;
}

export interface ProjectSetting {
  id: number;
  project_id: number;
  review_mode: 'single' | 'dual';
  auto_assignment_enabled: boolean;
  batch_size: number;
  default_priority: TaskPriority;
  sla_hours: number;
}

export interface Project {
  id: number;
  name: string;
  description?: string;
  schema_json?: string;
  settings_json?: string;
  created_by?: number;
  is_archived: boolean;
  archived_at?: string;
  is_deleted: boolean;
  deleted_at?: string;
  created_at: string;
  updated_at: string;
  memberships?: ProjectMembership[];
  settings?: ProjectSetting;
}

export interface SchemaVersion {
  id: number;
  project_id: number;
  version_number: number;
  taxonomy_json: string;
  guidelines_text?: string;
  defined_by: number;
  author?: User;
  created_at: string;
}

export interface TaskVersion {
  id: number;
  task_id: number;
  submitted_by: number;
  payload_json: string;
  version_number: number;
  created_at: string;
  user?: User;
}

export interface Review {
  id: number;
  task_id: number;
  reviewer_id: number;
  decision: 'Accept' | 'Reject';
  comment?: string;
  review_round: number;
  created_at: string;
  reviewer?: User;
}

export interface Comment {
  id: number;
  task_id: number;
  author_id: number;
  content: string;
  parent_id?: number;
  created_at: string;
  updated_at: string;
  author?: User;
  replies?: Comment[];
}

export interface TaskStatusHistory {
  id: number;
  task_id: number;
  old_status?: string;
  new_status: string;
  changed_by?: number;
  reason?: string;
  created_at: string;
  user?: User;
}

export interface Task {
  id: number;
  project_id: number;
  dataset_id?: number;
  data_ref: string;
  status: TaskStatus;
  priority: TaskPriority;
  assigned_to?: number;
  schema_version_id?: number;
  assigned_at?: string;
  submitted_at?: string;
  reviewed_at?: string;
  approved_at?: string;
  locked_at?: string;
  created_at: string;
  updated_at: string;
  assignee?: User;
  schema_version?: SchemaVersion;
  versions?: TaskVersion[];
  reviews?: Review[];
  comments?: Comment[];
  status_history?: TaskStatusHistory[];
}

export interface Dataset {
  id: number;
  project_id: number;
  name: string;
  description?: string;
  total_items: number;
  created_at: string;
}

export interface DatasetSnapshot {
  id: number;
  project_id: number;
  name: string;
  created_by?: number;
  version_manifest_json: string;
  created_at: string;
  author?: User;
}

export interface ImportError {
  id: number;
  row_index: number;
  error_message: string;
  raw_data_json?: string;
  created_at: string;
}

export interface ImportJob {
  id: number;
  project_id: number;
  dataset_id?: number;
  status: string;
  total_rows: number;
  valid_rows: number;
  invalid_rows: number;
  created_at: string;
  errors?: ImportError[];
}

export interface Notification {
  id: number;
  user_id: number;
  title: string;
  message: string;
  type: 'assignment' | 'rejection' | 'reassignment' | 'sla_warning' | 'qa_pending' | 'approved';
  read: boolean;
  created_at: string;
}

export interface AuditLog {
  id: number;
  actor_id?: number;
  action: string;
  entity_type: string;
  entity_id?: number;
  timestamp: string;
  metadata_json?: string;
  actor?: User;
}

export interface DashboardStats {
  total_tasks: number;
  completion_percentage: number;
  status_counts: Record<string, number>;
  average_time_to_completion: number;
  cohens_kappa: number;
  active_workload: number;
  reviewer_backlog: number;
  pending_qa: number;
  urgent_tasks: number;
  rejection_rate: number;
}

export interface AnnotatorStat {
  user_id: number;
  name: string;
  email: string;
  tasks_completed: number;
  total_submissions: number;
  average_time_seconds: number;
  rejection_rate: number;
}

export interface ReviewerStat {
  reviewer_id: number;
  name: string;
  email: string;
  tasks_reviewed: number;
  accepted_count: number;
  rejected_count: number;
  acceptance_ratio: number;
  average_review_time_seconds: number;
}

export interface PortfolioProject {
  project_id: number;
  project_name: string;
  description?: string;
  is_archived: boolean;
  completion_percentage: number;
  rejection_rate: number;
  cohens_kappa: number;
  total_tasks: number;
  active_workload: number;
  created_at: string;
}
