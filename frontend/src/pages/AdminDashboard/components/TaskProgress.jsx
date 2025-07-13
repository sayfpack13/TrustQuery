import React, { useEffect } from 'react';
import TaskDetails from './TaskDetails';
import { useAdminDashboard } from '../hooks/useAdminDashboard';

const TaskProgress = () => {
  const { tasksList, fetchAllTasks, removeTask, estimateRemainingTime } = useAdminDashboard();

  useEffect(() => {
    fetchAllTasks();
    const interval = setInterval(fetchAllTasks, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchAllTasks]);

  return (
    <div className="p-4">
      <TaskDetails
        tasks={tasksList}
        removeTask={removeTask}
        estimateRemainingTime={estimateRemainingTime}
      />
    </div>
  );
};

export default TaskProgress; 