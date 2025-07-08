import React from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faListCheck,
  faExclamationTriangle,
  faCheckCircle,
  faCircleNotch,
  faTimes,
} from "@fortawesome/free-solid-svg-icons";

export default function TaskDetails({ tasks, removeTask, estimateRemainingTime }) {
  // Sort tasks to show most recent first
  const sortedTasks = [...tasks].sort((a, b) => b.startTime - a.startTime);

  // Show all tasks (in-progress, completed, errored) with no time limitation
  const recentTasks = sortedTasks.slice(0, 20); // Show up to 20 tasks for UI sanity

  if (!recentTasks.length) return null;

  return (
    <div className="mb-8 p-4 bg-gradient-to-br from-neutral-800 to-neutral-900 rounded-lg shadow-xl border border-neutral-700">
      <h3 className="text-xl font-semibold text-white mb-4 flex items-center">
        <FontAwesomeIcon icon={faListCheck} className="mr-2 text-blue-400" /> All Tasks
      </h3>
      <ul className="space-y-4 max-h-60 overflow-y-auto pr-2">
        {recentTasks.map((task) => {
          const isCompleted = task.completed;
          const percent = task.total > 0 ? Math.round((task.progress / task.total) * 100) : 0;
          let statusColorClass = "text-neutral-400";
          if (isCompleted) {
            statusColorClass = task.status === "completed" ? "text-green-400" : "text-red-400";
          } else if (
            task.status === "processing" ||
            task.status === "parsing" ||
            task.status === "moving" ||
            task.status === "deleting" ||
            task.status === "counting lines" ||
            task.status === "initializing"
          ) {
            statusColorClass = "text-blue-400";
          } else if (task.status === "error") {
            statusColorClass = "text-red-400";
          }
          return (
            <li key={task.taskId} className="border border-neutral-700 rounded-lg p-4 relative bg-neutral-800 hover:bg-neutral-700 transition duration-200 ease-in-out shadow-md">
              <div className="flex justify-between items-center mb-2">
                <span className={`text-sm font-semibold ${statusColorClass}`}>
                  <FontAwesomeIcon
                    icon={
                      task.status === "error"
                        ? faExclamationTriangle
                        : isCompleted
                        ? faCheckCircle
                        : faCircleNotch
                    }
                    className={!isCompleted && task.status !== "error" ? "fa-spin mr-1" : "mr-1"}
                  />
                  {task.type} {task.filename ? `(${task.filename})` : ""}
                </span>
                {/* Only allow delete for completed tasks */}
                {isCompleted && (
                  <button
                    onClick={() => removeTask(task.taskId)}
                    className="text-neutral-400 hover:text-white transition-colors duration-150"
                    title="Dismiss task"
                  >
                    <FontAwesomeIcon icon={faTimes} />
                  </button>
                )}
              </div>
              <div className="w-full bg-neutral-700 rounded-full h-2.5">
                <div
                  className="bg-blue-600 h-2.5 rounded-full"
                  style={{ width: `${percent}%` }}
                ></div>
              </div>
              <div className="flex justify-between text-xs mt-2 text-neutral-400">
                <span>
                  {task.message}
                  {task.total > 0 && ` (${task.progress}/${task.total})`}
                </span>
                <span>
                  {estimateRemainingTime(task.startTime, task.progress, task.total) && (
                    <span className="ml-2">
                      ETA: {estimateRemainingTime(task.startTime, task.progress, task.total)}
                    </span>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
