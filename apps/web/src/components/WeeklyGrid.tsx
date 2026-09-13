import { CSSProperties } from "react";

import { PlannerTask } from "../api/planner";
import {
  VISIBLE_END_MINUTES,
  VISIBLE_START_MINUTES,
  formatDateKey,
  formatDayHeading,
  formatTime,
  isOutsideVisibleHours,
  minutesToTimeValue,
  timeToMinutes,
} from "../utils/planner";

type WeeklyGridProps = {
  weekDays: Date[];
  tasks: PlannerTask[];
  todayKey: string;
  onTaskSelect: (task: PlannerTask) => void;
};

type PositionedTask = {
  task: PlannerTask;
  lane: number;
  laneCount: number;
};

// Full-hour rows keep the weekly overview quick to scan. Tasks retain exact times.
const GRID_SLOT_MINUTES = 60;
const SLOT_HEIGHT = 48;
const slotStarts = Array.from(
  { length: (VISIBLE_END_MINUTES - VISIBLE_START_MINUTES) / GRID_SLOT_MINUTES },
  (_, index) => VISIBLE_START_MINUTES + index * GRID_SLOT_MINUTES,
);
const timeBoundaries = [...slotStarts, VISIBLE_END_MINUTES];

function positionOverlappingTasks(tasks: PlannerTask[]): PositionedTask[] {
  const sortedTasks = [...tasks].sort(
    (first, second) =>
      timeToMinutes(first.start_time) - timeToMinutes(second.start_time) ||
      timeToMinutes(first.end_time) - timeToMinutes(second.end_time) ||
      first.id - second.id,
  );
  const groups: PlannerTask[][] = [];
  let currentGroup: PlannerTask[] = [];
  let groupEnd = -1;

  for (const task of sortedTasks) {
    const taskStart = timeToMinutes(task.start_time);
    if (currentGroup.length > 0 && taskStart >= groupEnd) {
      groups.push(currentGroup);
      currentGroup = [];
      groupEnd = -1;
    }
    currentGroup.push(task);
    groupEnd = Math.max(groupEnd, timeToMinutes(task.end_time));
  }
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups.flatMap((group) => {
    const laneEndTimes: number[] = [];
    const positioned = group.map((task) => {
      const taskStart = timeToMinutes(task.start_time);
      let lane = laneEndTimes.findIndex((endTime) => endTime <= taskStart);
      if (lane === -1) {
        lane = laneEndTimes.length;
      }
      laneEndTimes[lane] = timeToMinutes(task.end_time);
      return { task, lane, laneCount: 0 };
    });
    return positioned.map((item) => ({ ...item, laneCount: laneEndTimes.length }));
  });
}

function taskPositionStyle(positionedTask: PositionedTask): CSSProperties {
  const startMinutes = timeToMinutes(positionedTask.task.start_time);
  const endMinutes = timeToMinutes(positionedTask.task.end_time);
  const laneWidth = 100 / positionedTask.laneCount;
  return {
    top: ((startMinutes - VISIBLE_START_MINUTES) / GRID_SLOT_MINUTES) * SLOT_HEIGHT + 1,
    height: Math.max(((endMinutes - startMinutes) / GRID_SLOT_MINUTES) * SLOT_HEIGHT - 2, 24),
    left: `calc(${positionedTask.lane * laneWidth}% + 2px)`,
    width: `calc(${laneWidth}% - 4px)`,
  };
}

export function WeeklyGrid({ weekDays, tasks, todayKey, onTaskSelect }: WeeklyGridProps) {
  const outsideTasks = tasks.filter((task) =>
    isOutsideVisibleHours(task.start_time, task.end_time),
  );

  return (
    <>
      <div
        className="weekly-grid-scroll"
        tabIndex={0}
        aria-label="Weekly planner grid. Scroll horizontally to see every day."
      >
        <div className="weekly-grid">
          <div className="weekly-grid-corner">Time</div>
          {weekDays.map((day) => {
            const dateKey = formatDateKey(day);
            const isToday = dateKey === todayKey;
            return (
              <div
                className={`weekly-day-heading${isToday ? " today" : ""}`}
                key={dateKey}
                aria-label={`${formatDayHeading(day)}${isToday ? ", today" : ""}`}
              >
                {formatDayHeading(day)}
                {isToday && <span>Today</span>}
              </div>
            );
          })}

          <div
            className="weekly-time-column"
            style={{ height: slotStarts.length * SLOT_HEIGHT }}
            aria-hidden="true"
          >
            {timeBoundaries.map((minutes, index) => (
              <span
                key={minutes}
                className={
                  index === 0
                    ? "first"
                    : index === timeBoundaries.length - 1
                      ? "last"
                      : undefined
                }
                style={{ top: index * SLOT_HEIGHT }}
              >
                {formatTime(minutesToTimeValue(minutes))}
              </span>
            ))}
          </div>

          {weekDays.map((day) => {
            const dateKey = formatDateKey(day);
            const dayTasks = tasks.filter(
              (task) =>
                task.task_date === dateKey &&
                !isOutsideVisibleHours(task.start_time, task.end_time),
            );
            const positionedTasks = positionOverlappingTasks(dayTasks);
            const isToday = dateKey === todayKey;

            return (
              <div
                className={`weekly-day-column${isToday ? " today" : ""}`}
                key={dateKey}
                role="group"
                aria-label={`${formatDayHeading(day)} schedule`}
                style={{ height: slotStarts.length * SLOT_HEIGHT }}
              >
                {slotStarts.map((minutes) => (
                  <div className="weekly-time-slot" key={minutes} aria-hidden="true" />
                ))}
                {positionedTasks.map((positionedTask) => {
                  const { task } = positionedTask;
                  const timeLabel = `${formatTime(task.start_time)}–${formatTime(task.end_time)}`;
                  return (
                    <button
                      className={`planner-task-box${task.is_completed ? " completed" : ""}`}
                      style={taskPositionStyle(positionedTask)}
                      type="button"
                      key={task.id}
                      onClick={() => onTaskSelect(task)}
                      aria-label={`Edit ${task.title}, ${timeLabel}${task.is_completed ? ", completed" : ""}`}
                    >
                      <span className="planner-task-time">{timeLabel}</span>
                      <span className="planner-task-title">{task.title}</span>
                      {task.is_completed && <span className="planner-task-status">Completed</span>}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>

      {outsideTasks.length > 0 && (
        <section className="outside-hours" aria-labelledby="outside-hours-heading">
          <h2 id="outside-hours-heading">Outside visible hours</h2>
          <p>These tasks extend outside the 6:00 AM–10:00 PM grid.</p>
          <ul>
            {outsideTasks.map((task) => (
              <li key={task.id}>
                <button
                  className={task.is_completed ? "completed" : undefined}
                  type="button"
                  onClick={() => onTaskSelect(task)}
                >
                  <strong>{task.title}</strong>
                  <span>
                    {task.task_date} · {formatTime(task.start_time)}–{formatTime(task.end_time)}
                    {task.is_completed ? " · Completed" : ""}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
