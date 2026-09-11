const API_BASE_URL = "http://localhost:8000";

export type PlannerTask = {
  id: number;
  title: string;
  task_date: string;
  start_time: string;
  end_time: string;
  is_completed: boolean;
  created_at: string;
  updated_at: string;
};

export type PlannerTaskCreate = Pick<
  PlannerTask,
  "title" | "task_date" | "start_time" | "end_time"
>;

export type PlannerTaskUpdate = Partial<
  Pick<
    PlannerTask,
    "title" | "task_date" | "start_time" | "end_time" | "is_completed"
  >
>;

async function plannerRequest<T>(
  path: string,
  accessToken: string,
  init: RequestInit,
  errorMessage: string,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...init.headers,
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    throw new Error(errorMessage);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function getPlannerTasks(
  accessToken: string,
  startDate: string,
  endDate: string,
  signal?: AbortSignal,
): Promise<PlannerTask[]> {
  const query = new URLSearchParams({
    start_date: startDate,
    end_date: endDate,
  });
  return plannerRequest<PlannerTask[]>(
    `/api/planner/tasks?${query.toString()}`,
    accessToken,
    { method: "GET", signal },
    "Planner tasks could not be loaded.",
  );
}

export function createPlannerTask(
  accessToken: string,
  task: PlannerTaskCreate,
): Promise<PlannerTask> {
  return plannerRequest<PlannerTask>(
    "/api/planner/tasks",
    accessToken,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
    "The planner task could not be created.",
  );
}

export function updatePlannerTask(
  accessToken: string,
  taskId: number,
  task: PlannerTaskUpdate,
): Promise<PlannerTask> {
  return plannerRequest<PlannerTask>(
    `/api/planner/tasks/${taskId}`,
    accessToken,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(task),
    },
    "The planner task could not be updated.",
  );
}

export function deletePlannerTask(accessToken: string, taskId: number): Promise<void> {
  return plannerRequest<void>(
    `/api/planner/tasks/${taskId}`,
    accessToken,
    { method: "DELETE" },
    "The planner task could not be deleted.",
  );
}
