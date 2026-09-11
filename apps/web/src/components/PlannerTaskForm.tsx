import { FormEvent, useState } from "react";

import { PlannerTask } from "../api/planner";
import { buildTimeOptions, timeToMinutes } from "../utils/planner";

export type PlannerTaskFormValues = {
  title: string;
  taskDate: string;
  startTime: string;
  endTime: string;
  isCompleted: boolean;
};

type PlannerTaskFormProps = {
  task?: PlannerTask;
  initialDate: string;
  onSubmit: (values: PlannerTaskFormValues) => Promise<void>;
  onDelete?: () => Promise<void>;
  onCancel: () => void;
};

const timeOptions = buildTimeOptions();

export function PlannerTaskForm({
  task,
  initialDate,
  onSubmit,
  onDelete,
  onCancel,
}: PlannerTaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "");
  const [taskDate, setTaskDate] = useState(task?.task_date ?? initialDate);
  const [startTime, setStartTime] = useState(task?.start_time ?? "09:00:00");
  const [endTime, setEndTime] = useState(task?.end_time ?? "09:30:00");
  const [isCompleted, setIsCompleted] = useState(task?.is_completed ?? false);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedTitle = title.trim();

    if (!normalizedTitle) {
      setFormError("Enter a task title.");
      return;
    }
    if (normalizedTitle.length > 200) {
      setFormError("Task titles cannot exceed 200 characters.");
      return;
    }
    if (timeToMinutes(endTime) <= timeToMinutes(startTime)) {
      setFormError("End time must be later than start time.");
      return;
    }

    setFormError("");
    setIsSubmitting(true);
    try {
      await onSubmit({
        title: normalizedTitle,
        taskDate,
        startTime,
        endTime,
        isCompleted,
      });
    } catch {
      setFormError(
        task
          ? "The task could not be updated. Please try again."
          : "The task could not be created. Please try again.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    if (!onDelete) {
      return;
    }

    setFormError("");
    setIsSubmitting(true);
    try {
      await onDelete();
    } catch {
      setFormError("The task could not be deleted. Please try again.");
      setIsConfirmingDelete(false);
    } finally {
      setIsSubmitting(false);
    }
  }

  const formTitle = task ? "Edit task" : "Add task";

  return (
    <section className="planner-form-panel" aria-labelledby="planner-form-heading">
      <div className="planner-form-heading-row">
        <h2 id="planner-form-heading">{formTitle}</h2>
        <button className="text-button" type="button" onClick={onCancel} disabled={isSubmitting}>
          Close
        </button>
      </div>

      <form
        className="planner-task-form"
        aria-label={task ? "Edit planner task" : "Add planner task"}
        onSubmit={handleSubmit}
      >
        <div className="field planner-title-field">
          <label htmlFor="planner-task-title">Task title</label>
          <input
            id="planner-task-title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={200}
            autoFocus
            required
          />
        </div>

        <div className="field">
          <label htmlFor="planner-task-date">Task date</label>
          <input
            id="planner-task-date"
            type="date"
            value={taskDate}
            onChange={(event) => setTaskDate(event.target.value)}
            required
          />
        </div>

        <div className="field">
          <label htmlFor="planner-start-time">Start time</label>
          <select
            id="planner-start-time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            required
          >
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="planner-end-time">End time</label>
          <select
            id="planner-end-time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            required
          >
            {timeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {task && (
          <label className="checkbox-field">
            <input
              type="checkbox"
              checked={isCompleted}
              onChange={(event) => setIsCompleted(event.target.checked)}
            />
            Completed
          </label>
        )}

        {formError && (
          <p className="form-error planner-form-error" role="alert">
            {formError}
          </p>
        )}

        <div className="planner-form-actions">
          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Saving..." : task ? "Save changes" : "Create task"}
          </button>
          <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
            Cancel
          </button>
          {task && onDelete && !isConfirmingDelete && (
            <button
              className="danger-text-button"
              type="button"
              onClick={() => setIsConfirmingDelete(true)}
              disabled={isSubmitting}
            >
              Delete task
            </button>
          )}
        </div>

        {isConfirmingDelete && (
          <div
            className="delete-confirmation"
            role="alertdialog"
            aria-labelledby="delete-confirmation-heading"
            aria-describedby="delete-confirmation-description"
          >
            <h3 id="delete-confirmation-heading">Delete this task?</h3>
            <p id="delete-confirmation-description">This action cannot be undone.</p>
            <div className="delete-confirmation-actions">
              <button
                className="danger-button"
                type="button"
                onClick={() => void handleDelete()}
                disabled={isSubmitting}
              >
                {isSubmitting ? "Deleting..." : "Confirm delete"}
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={() => setIsConfirmingDelete(false)}
                disabled={isSubmitting}
              >
                Keep task
              </button>
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
