import React, { useEffect } from 'react';
import TaskDetails from './TaskDetails';
import { useAdminDashboard } from '../hooks/useAdminDashboard';
import buttonStyles from '../../../components/ButtonStyles';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faSpinner } from '@fortawesome/free-solid-svg-icons';

const TaskProgress = () => {
  const { tasksList, fetchAllTasks, removeTask, estimateRemainingTime, clearAllTasks } = useAdminDashboard();
  const [clearing, setClearing] = React.useState(false);

  useEffect(() => {
    fetchAllTasks();
    const interval = setInterval(fetchAllTasks, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [fetchAllTasks]);

  const handleClearAll = async () => {
    setClearing(true);
    await clearAllTasks();
    setClearing(false);
  };

  return (
    <div className="p-4">
      <div className="flex justify-end mb-4">
        <button
          onClick={handleClearAll}
          disabled={tasksList.length === 0 || clearing}
          className={buttonStyles.delete}
        >
          {clearing ? (
            <FontAwesomeIcon icon={faSpinner} spin className="mr-2" />
          ) : null}
          Clear All Tasks
        </button>
      </div>
      <TaskDetails
        tasks={tasksList}
        removeTask={removeTask}
        estimateRemainingTime={estimateRemainingTime}
      />
    </div>
  );
};

export default TaskProgress; 