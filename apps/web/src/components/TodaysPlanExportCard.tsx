import { forwardRef } from "react";

import { PlannerTask } from "../api/planner";
import { formatTime } from "../utils/planner";

type TodaysPlanExportCardProps = {
  formattedDate: string;
  tasks: PlannerTask[];
  completedCount: number;
};

export const TodaysPlanExportCard = forwardRef<HTMLDivElement, TodaysPlanExportCardProps>(
  function TodaysPlanExportCard({ formattedDate, tasks, completedCount }, ref) {
    return (
      <div className="today-export-card-host" aria-hidden="true" inert>
        <div ref={ref} className="today-export-card" data-testid="todays-plan-export-card">
          <p className="today-export-brand">GrowthSpace</p>
          <h2>Today&apos;s Plan</h2>
          <p className="today-export-date">{formattedDate}</p>
          <p className="today-export-progress">
            {completedCount} of {tasks.length} completed
          </p>
          <ul className="today-export-task-list">
            {tasks.map((task) => (
              <li
                key={task.id}
                className={
                  task.is_completed
                    ? "today-export-task completed"
                    : "today-export-task"
                }
              >
                <div>
                  <p className="today-export-task-time">
                    {formatTime(task.start_time)}–{formatTime(task.end_time)}
                  </p>
                  <p className="today-export-task-title">{task.title}</p>
                </div>
                <span>{task.is_completed ? "Completed" : "Not completed"}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  },
);
