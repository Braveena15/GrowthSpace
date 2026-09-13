import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import { Link } from "react-router-dom";

import { PlannerTask, getPlannerTasks, updatePlannerTask } from "../api/planner";
import { formatTime, timeToMinutes } from "../utils/planner";
import { TodaysPlanExportCard } from "./TodaysPlanExportCard";

type TodaysPlanProps = {
  accessToken: string;
  dateKey: string;
  formattedDate: string;
};

type TaskState =
  | { status: "loading"; tasks: PlannerTask[] }
  | { status: "ready"; tasks: PlannerTask[] }
  | { status: "error"; tasks: PlannerTask[] };

export function TodaysPlan({ accessToken, dateKey, formattedDate }: TodaysPlanProps) {
  const [taskState, setTaskState] = useState<TaskState>({ status: "loading", tasks: [] });
  const [updatingTaskId, setUpdatingTaskId] = useState<number | null>(null);
  const [updateError, setUpdateError] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState("");
  const exportCardRef = useRef<HTMLDivElement>(null);

  const loadTasks = useCallback(
    async (signal?: AbortSignal) => {
      setTaskState((current) => ({ status: "loading", tasks: current.tasks }));

      try {
        const tasks = await getPlannerTasks(accessToken, dateKey, dateKey, signal);
        setTaskState({ status: "ready", tasks });
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }

        setTaskState({ status: "error", tasks: [] });
      }
    },
    [accessToken, dateKey],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTasks(controller.signal);
    return () => controller.abort();
  }, [loadTasks]);

  const orderedTasks = useMemo(
    () =>
      [...taskState.tasks].sort(
        (first, second) =>
          timeToMinutes(first.start_time) - timeToMinutes(second.start_time) ||
          timeToMinutes(first.end_time) - timeToMinutes(second.end_time) ||
          first.id - second.id,
      ),
    [taskState.tasks],
  );
  const completedCount = orderedTasks.filter((task) => task.is_completed).length;

  async function handleCompletionChange(task: PlannerTask) {
    if (updatingTaskId !== null) {
      return;
    }

    setUpdatingTaskId(task.id);
    setUpdateError("");

    try {
      await updatePlannerTask(accessToken, task.id, {
        is_completed: !task.is_completed,
      });
      await loadTasks();
    } catch {
      setUpdateError("Task completion could not be updated. Please try again.");
    } finally {
      setUpdatingTaskId(null);
    }
  }

  async function handleExport() {
    if (
      taskState.status !== "ready" ||
      orderedTasks.length === 0 ||
      isExporting ||
      !exportCardRef.current
    ) {
      return;
    }

    setIsExporting(true);
    setExportError("");
    let downloadLink: HTMLAnchorElement | null = null;

    try {
      const dataUrl = await toPng(exportCardRef.current, {
        backgroundColor: "#ffffff",
        cacheBust: true,
        pixelRatio: 2,
      });
      downloadLink = document.createElement("a");
      downloadLink.href = dataUrl;
      downloadLink.download = `growthspace-todays-plan-${dateKey}.png`;
      downloadLink.style.display = "none";
      document.body.appendChild(downloadLink);
      downloadLink.click();
    } catch {
      setExportError("The image could not be created. Please try again.");
    } finally {
      downloadLink?.remove();
      setIsExporting(false);
    }
  }

  const showTasks = orderedTasks.length > 0;

  return (
    <section className="content-panel todays-plan" aria-labelledby="plan-heading">
      <div className="todays-plan-heading-row">
        <h2 id="plan-heading">Today&apos;s Plan</h2>
        <div className="todays-plan-actions">
          <Link to="/weekly-planner" className="planner-link">Open Weekly Planner <span aria-hidden="true">→</span></Link>
          <button
            type="button"
            className="secondary-button"
            disabled={taskState.status !== "ready" || !showTasks || isExporting}
            onClick={() => void handleExport()}
          >
            {isExporting ? "Creating image…" : "Export as image"}
          </button>
        </div>
      </div>

      {taskState.status === "loading" && (
        <p className="todays-plan-status" role="status">
          {showTasks ? "Refreshing today's plan..." : "Loading today's plan..."}
        </p>
      )}

      {taskState.status === "error" && (
        <div className="error todays-plan-error" role="alert">
          <strong>Today&apos;s tasks could not be loaded.</strong>
          <p>Please try again.</p>
          <button type="button" onClick={() => void loadTasks()}>
            Retry
          </button>
        </div>
      )}

      {taskState.status === "ready" && !showTasks && (
        <div className="empty-state">
          <p className="empty-state-title">Nothing planned for today.</p>
          <p>Use the Weekly Planner to add a task.</p>
        </div>
      )}

      {showTasks && (
        <>
          <p className="todays-plan-progress" aria-live="polite">
            {completedCount} of {orderedTasks.length} completed
          </p>
          <ul className="today-task-list" aria-label="Today's tasks">
            {orderedTasks.map((task) => {
              const isUpdating = updatingTaskId === task.id;

              return (
                <li
                  key={task.id}
                  className={task.is_completed ? "today-task completed" : "today-task"}
                >
                  <label>
                    <input
                      type="checkbox"
                      checked={task.is_completed}
                      disabled={updatingTaskId !== null}
                      aria-label={`Mark ${task.title} ${
                        task.is_completed ? "incomplete" : "complete"
                      }`}
                      onChange={() => void handleCompletionChange(task)}
                    />
                    <span className="today-task-details">
                      <strong>{task.title}</strong>
                      <span>
                        {formatTime(task.start_time)}–{formatTime(task.end_time)}
                        {isUpdating ? " · Updating..." : ""}
                      </span>
                    </span>
                    <span className="today-task-completion">
                      {task.is_completed ? "Completed" : "Not completed"}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {updateError && (
        <p className="form-error todays-plan-update-error" role="alert">
          {updateError}
        </p>
      )}

      {exportError && (
        <p className="form-error todays-plan-export-error" role="alert">
          {exportError}
        </p>
      )}

      {showTasks && (
        <TodaysPlanExportCard
          ref={exportCardRef}
          formattedDate={formattedDate}
          tasks={orderedTasks}
          completedCount={completedCount}
        />
      )}
    </section>
  );
}
