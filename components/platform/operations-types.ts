export type OperationTask = {
  id: string;
  task_number: string | null;
  scheduled_date: string | null;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  project_id: string;
  project_name: string;
  work_type_id: string;
  work_type_name: string;
  location_id: string;
  location_name: string;
  location_code: string | null;
  current_actor_role: string | null;
  current_step_name: string | null;
  total_steps: number;
  completed_steps: number;
  last_updated: string;
  attachment_count: number;
};

export type OperationFilters = {
  projectId: string;
  workTypeId: string;
  status: string;
  actorRole: string;
  query: string;
};

export const STATUS_LABELS: Record<string, string> = {
  pending: 'جديدة',
  in_progress: 'قيد التنفيذ',
  under_review: 'تحت المراجعة',
  approved: 'معتمدة',
  completed: 'مكتملة',
  rejected: 'مرفوضة',
  cancelled: 'ملغاة',
};

export const ROLE_LABELS: Record<string, string> = {
  contractor: 'المقاول',
  supervisor: 'المشرف',
  manager: 'المدير',
  system: 'النظام',
};

export function taskProgress(task: OperationTask) {
  return task.total_steps ? Math.round((task.completed_steps / task.total_steps) * 100) : 0;
}
