import { useCallback, useEffect, useMemo, useState } from "react";

import {
  PlannerTask,
  createPlannerTask,
  deletePlannerTask,
  getPlannerTasks,
  updatePlannerTask,
} from "../api/planner";
import {
  PlannerTaskForm,
  PlannerTaskFormValues,
} from "../components/PlannerTaskForm";
import { WeeklyGrid } from "../components/WeeklyGrid";
import {
  addDays,
  addWeeks,
  formatDateKey,
  formatWeekRange,
  getWeekDays,
  startOfWeekMonday,
} from "../utils/planner";

type WeeklyPlannerPageProps = {
  accessToken: string;
};

type TaskState =
  | { status: "loading"; tasks: PlannerTask[] }
  | { status: "ready"; tasks: PlannerTask[] }
  | { status: "error"; tasks: PlannerTask[]; message: string };

type FormState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; task: PlannerTask };

export function WeeklyPlannerPage({ accessToken }: WeeklyPlannerPageProps) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekMonday(new Date()));
  const [taskState, setTaskState] = useState<TaskState>({ status: "loading", tasks: [] });
  const [formState, setFormState] = useState<FormState>({ mode: "closed" });
  const weekDays = useMemo(() => getWeekDays(weekStart), [weekStart]);
  const todayKey = formatDateKey(new Date());
  const currentWeekStartKey = formatDateKey(startOfWeekMonday(new Date()));
  const isCurrentWeek = formatDateKey(weekStart) === currentWeekStartKey;

  const loadTasks = useCallback(
    async (signal?: AbortSignal) => {
      setTaskState((current) => ({ status: "loading", tasks: current.tasks }));
      try {
        const tasks = await getPlannerTasks(
          accessToken,
          formatDateKey(weekStart),
          formatDateKey(addDays(weekStart, 6)),
          signal,
        );
        setTaskState({ status: "ready", tasks });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setTaskState({
          status: "error",
          tasks: [],
          message: error instanceof Error ? error.message : "Planner tasks could not be loaded.",
        });
      }
    },
    [accessToken, weekStart],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTasks(controller.signal);
    return () => controller.abort();
  }, [loadTasks]);

  async function handleCreate(values: PlannerTaskFormValues) {
    await createPlannerTask(accessToken, {
      title: values.title,
      task_date: values.taskDate,
      start_time: values.startTime,
      end_time: values.endTime,
    });
    setFormState({ mode: "closed" });
    await loadTasks();
  }

  async function handleUpdate(values: PlannerTaskFormValues) {
    if (formState.mode !== "edit") {
      return;
    }
    await updatePlannerTask(accessToken, formState.task.id, {
      title: values.title,
      task_date: values.taskDate,
      start_time: values.startTime,
      end_time: values.endTime,
      is_completed: values.isCompleted,
    });
    setFormState({ mode: "closed" });
    await loadTasks();
  }

  async function handleDelete() {
    if (formState.mode !== "edit") {
      return;
    }
    await deletePlannerTask(accessToken, formState.task.id);
    setFormState({ mode: "closed" });
    await loadTasks();
  }

  function changeWeek(amount: number) {
    setFormState({ mode: "closed" });
    setWeekStart((current) => addWeeks(current, amount));
  }

  function goToCurrentWeek() {
    setFormState({ mode: "closed" });
    setWeekStart(startOfWeekMonday(new Date()));
  }

  return (
    <section className="page weekly-planner-page" aria-labelledby="weekly-planner-heading">
      <header className="planner-page-header">
        <div>
          <p className="eyebrow">Plan your time</p>
          <h1 id="weekly-planner-heading">Weekly Planner</h1>
          <p className="week-range" aria-live="polite">{formatWeekRange(weekStart)}</p>
        </div>
        <button type="button" onClick={() => setFormState({ mode: "create" })}>
          Add task
        </button>
      </header>

      <nav className="week-navigation" aria-label="Week navigation">
        <button className="secondary-button" type="button" onClick={() => changeWeek(-1)}>
          Previous week
        </button>
        <button
          className="secondary-button"
          type="button"
          onClick={goToCurrentWeek}
          disabled={isCurrentWeek}
        >
          Current week
        </button>
        <button className="secondary-button" type="button" onClick={() => changeWeek(1)}>
          Next week
        </button>
      </nav>

      {formState.mode !== "closed" && (
        <PlannerTaskForm
          key={formState.mode === "edit" ? formState.task.id : `new-${formatDateKey(weekStart)}`}
          task={formState.mode === "edit" ? formState.task : undefined}
          initialDate={isCurrentWeek ? todayKey : formatDateKey(weekStart)}
          onSubmit={formState.mode === "edit" ? handleUpdate : handleCreate}
          onDelete={formState.mode === "edit" ? handleDelete : undefined}
          onCancel={() => setFormState({ mode: "closed" })}
        />
      )}

      {taskState.status === "loading" && (
        <p className="planner-status" role="status">Loading planner tasks…</p>
      )}

      {taskState.status === "error" && (
        <div className="error planner-load-error" role="alert">
          <strong>Unable to load this week</strong>
          <p>{taskState.message}</p>
          <button type="button" onClick={() => void loadTasks()}>Try again</button>
        </div>
      )}

      {taskState.status === "ready" && taskState.tasks.length === 0 && (
        <div className="empty-state planner-empty-state">
          <p className="empty-state-title">No tasks scheduled this week.</p>
          <p>Add a task when you’re ready to plan.</p>
        </div>
      )}

      {taskState.status !== "error" && (
        <WeeklyGrid
          weekDays={weekDays}
          tasks={taskState.tasks}
          todayKey={isCurrentWeek ? todayKey : ""}
          onTaskSelect={(task) => setFormState({ mode: "edit", task })}
        />
      )}
    </section>
  );
}
