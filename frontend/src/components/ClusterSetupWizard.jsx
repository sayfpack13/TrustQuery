import React, { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faServer, 
  faPlay, 
  faStop, 
  faTrash, 
  faCog, 
  faInfoCircle, 
  faCheckCircle, 
  faExclamationTriangle,
  faPlus,
  faMinus,
  faDatabase,
  faFolder,
  faCircleNotch,
  faDownload,
  faTerminal,
  faClipboard,
  faLightbulb,
  faArrowRight,
  faArrowLeft,
  faTimes
} from '@fortawesome/free-solid-svg-icons';
import axiosClient from '../api/axiosClient';

const ClusterSetupWizard = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [setupType, setSetupType] = useState('vps-setup'); // 'vps-setup', 'local-cluster', or 'production'
  // Removed deploymentType state
  const [systemInfo, setSystemInfo] = useState(null);
  const [setupPaths, setSetupPaths] = useState(null);
  const [basePath, setBasePath] = useState('');
  // Removed installationGuide state
  const [validationResult, setValidationResult] = useState(null);
  const [connectionTest, setConnectionTest] = useState(null);
  
  // Enhanced loading states with progress tracking
  const [loadingStates, setLoadingStates] = useState({
    systemInfo: false,
    installationGuide: false,
    validation: false,
    connectionTest: false,
    initialization: false
  });
  
  // Progress tracking with detailed status
  const [stepProgress, setStepProgress] = useState({
    1: { completed: false, validated: false, progress: 0 },
    2: { completed: false, validated: false, progress: 0 },
    3: { completed: false, validated: false, progress: 0 },
    4: { completed: false, validated: false, progress: 0 }
  });
  
  // Auto-save state with conflict detection
  const [saveConflict, setSaveConflict] = useState(false);
  
  // Enhanced error handling with categorization
  const [errors, setErrors] = useState({});
  const [retryCount, setRetryCount] = useState({});
  const [criticalError, setCriticalError] = useState(null);
  
  // Real-time validation with suggestions
  const [realtimeValidation, setRealtimeValidation] = useState({
    basePath: { valid: null, message: '', checking: false, suggestions: [] }
  });
  
  // Performance metrics
  const [performanceMetrics, setPerformanceMetrics] = useState({
    stepTimes: {},
    totalTime: null,
    avgStepTime: null
  });
  
  // Background tasks
  const [backgroundTasks, setBackgroundTasks] = useState([]);
  const [healthChecks, setHealthChecks] = useState({
    system: null,
    elasticsearch: null,
    network: null,
    permissions: null
  });
  
  // UI state

  const [clusterConfig, setClusterConfig] = useState({
    clusterName: 'trustquery-cluster',
    nodes: [
      {
        name: 'node-1',
        host: 'localhost',
        port: 9200,
        transportPort: 9300,
        dataPath: 'C:\\elasticsearch\\nodes\\node-1\\data',
        logsPath: 'C:\\elasticsearch\\nodes\\node-1\\logs',
        roles: { master: true, data: true, ingest: true }
      }
    ]
  });
  const [loading, setLoading] = useState(false);
  const [activeNodes, setActiveNodes] = useState([]);
  const [connectionTests, setConnectionTests] = useState({});
  const [localNodes, setLocalNodes] = useState([]);
  const [setupGuide, setSetupGuide] = useState(null);

  // Enhanced utility functions for advanced UX
  const updateLoadingState = (key, value, progress = null) => {
    setLoadingStates(prev => ({ ...prev, [key]: value }));
    if (progress !== null) {
      updateStepProgress(getCurrentStep(), { progress });
    }
  };

  const updateStepProgress = (step, updates) => {
    setStepProgress(prev => ({
      ...prev,
      [step]: { ...prev[step], ...updates }
    }));
  };

  const getCurrentStep = () => {
    if (setupType === 'vps-setup') return currentStep;
    return Math.min(currentStep, 3);
  };

  const setError = (key, message, isCritical = false) => {
    setErrors(prev => ({ ...prev, [key]: message }));
    if (isCritical) {
      setCriticalError({ key, message, timestamp: Date.now() });
    }
  };

  const clearError = (key) => {
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors[key];
      return newErrors;
    });
    if (criticalError?.key === key) {
      setCriticalError(null);
    }
  };

  const incrementRetry = (key) => {
    setRetryCount(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
  };

  const addBackgroundTask = (task) => {
    const newTask = { ...task, id: Date.now(), startTime: Date.now() };
    setBackgroundTasks(prev => [...prev, newTask]);
    return newTask.id;
  };

  const removeBackgroundTask = (id) => {
    setBackgroundTasks(prev => prev.filter(task => task.id !== id));
  };

  const trackStepTime = (step, action = 'start') => {
    const now = Date.now();
    if (action === 'start') {
      setPerformanceMetrics(prev => ({
        ...prev,
        stepTimes: { ...prev.stepTimes, [step]: { start: now } }
      }));
    } else if (action === 'end') {
      setPerformanceMetrics(prev => {
        const stepTime = prev.stepTimes[step];
        if (stepTime?.start) {
          const duration = now - stepTime.start;
          const newStepTimes = {
            ...prev.stepTimes,
            [step]: { ...stepTime, end: now, duration }
          };
          const completedSteps = Object.values(newStepTimes).filter(t => t.duration);
          const avgStepTime = completedSteps.length > 0 
            ? completedSteps.reduce((sum, t) => sum + t.duration, 0) / completedSteps.length 
            : null;
          
          return {
            ...prev,
            stepTimes: newStepTimes,
            avgStepTime,
            totalTime: Object.values(newStepTimes).reduce((sum, t) => sum + (t.duration || 0), 0)
          };
        }
        return prev;
      });
    }
  };

  const loadSavedState = () => {
    try {
      const saved = localStorage.getItem('trustquery-setup-state');
      if (saved) {
        const state = JSON.parse(saved);
        // Only restore if saved within last 24 hours
        const savedTime = new Date(state.timestamp);
        const now = new Date();
        if (now - savedTime < 24 * 60 * 60 * 1000) {
          setCurrentStep(state.currentStep || 1);
          setSetupType(state.setupType || 'vps-setup');
          setBasePath(state.basePath || '');
          setStepProgress(state.stepProgress || {});
          if (state.performanceMetrics) setPerformanceMetrics(state.performanceMetrics);
          return true;
        }
      }
    } catch (error) {
      console.warn('Failed to load saved state:', error);
    }
    return false;
  };

  const validateElasticsearchInstallation = async (path, retry = false) => {
    // INSTANT loading state for validation
    setRealtimeValidation(prev => ({
      ...prev,
      basePath: { valid: null, message: 'Checking...', checking: true, suggestions: [] }
    }));
    if (!path || path.length < 3) {
      setRealtimeValidation(prev => ({
        ...prev,
        basePath: { valid: false, message: 'Path too short', checking: false, suggestions: [] }
      }));
      return;
    }
    try {
      // Enhanced client-side validation
      const isValidPath = /^[a-zA-Z]:|^\//.test(path); // Windows drive or Unix root
      if (!isValidPath) {
        setRealtimeValidation(prev => ({
          ...prev,
          basePath: { 
            valid: false, 
            message: 'Invalid path format', 
            checking: false,
            suggestions: systemInfo?.isWindows ? ['C:\\elasticsearch', 'D:\\elasticsearch'] : ['/opt/elasticsearch', '/usr/share/elasticsearch']
          }
        }));
        return;
      }
      // Use the comprehensive validation endpoint
      try {
        const response = await axiosClient.post('/api/setup-wizard/validate-elasticsearch', { basePath: path }, { timeout: 10000 });
        setRealtimeValidation(prev => ({
          ...prev,
          basePath: { 
            valid: response.data.valid, 
            message: response.data.message || 'Validation complete', 
            checking: false,
            suggestions: response.data.pathValidation?.suggestions || []
          }
        }));
        // Update validation result for the configuration step
        setValidationResult(response.data);
        return response.data;
      } catch (error) {
        // Handle validation errors gracefully
        console.warn('Elasticsearch validation failed:', error);
        setRealtimeValidation(prev => ({
          ...prev,
          basePath: { 
            valid: false, 
            message: error.response?.data?.error || 'Validation failed', 
            checking: false,
            suggestions: systemInfo?.isWindows ? ['C:\\elasticsearch', 'D:\\elasticsearch'] : ['/opt/elasticsearch', '/usr/share/elasticsearch']
          }
        }));
        return null;
      }
    } catch (error) {
      setRealtimeValidation(prev => ({
        ...prev,
        basePath: { valid: false, message: 'Validation error', checking: false, suggestions: [] }
      }));
      return null;
    }
  };

  // Load saved state on mount
  useEffect(() => {
    if (isOpen) {
      loadSavedState();
    }
  }, [isOpen]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (event) => {
      if (!isOpen || Object.values(loadingStates).some(Boolean)) return;

      if (event.key === 'Escape') {
        onClose();
      } else if (event.key === 'Enter' && event.ctrlKey) {
        // Ctrl+Enter to proceed to next step
        if (setupType === 'vps-setup') {
          if (currentStep < 4 && stepProgress[currentStep]?.validated) {
            setCurrentStep(prev => prev + 1);
          }
        }
      } else if (event.key === 'ArrowRight' && event.ctrlKey) {
        // Ctrl+Right Arrow to go to next step
        if (setupType === 'vps-setup' && currentStep < 4) {
          setCurrentStep(prev => prev + 1);
        }
      } else if (event.key === 'ArrowLeft' && event.ctrlKey) {
        // Ctrl+Left Arrow to go to previous step
        if (currentStep > 1) {
          setCurrentStep(prev => prev - 1);
        }
      }
    };

    document.addEventListener('keydown', handleKeyPress);
    return () => document.removeEventListener('keydown', handleKeyPress);
  }, [isOpen, currentStep, stepProgress, setupType, loadingStates]);

  // Real-time path validation
  useEffect(() => {
    const timer = setTimeout(() => validateElasticsearchInstallation(basePath), 800);
    return () => clearTimeout(timer);
  }, [basePath]);

  // Enhanced API functions with detailed progress tracking
  const fetchSystemInfo = async (retry = false) => {
    const maxRetries = 3;
    const retryKey = 'systemInfo';
    const step = 1;
    // INSTANT loading state
    updateLoadingState('systemInfo', true, 5);
    if (!retry && retryCount[retryKey] >= maxRetries) {
      setError(retryKey, `Failed after ${maxRetries} attempts. Please check your connection.`, true);
      updateLoadingState('systemInfo', false);
      return;
    }
    let healthTaskId = null;
    let progressInterval = null;
    try {
      trackStepTime(step, 'start');
      clearError(retryKey);
      // Add background task for system health monitoring
      healthTaskId = addBackgroundTask({
        name: 'System Health Check',
        type: 'health-check',
        progress: 0
      });
      // Simulate progressive loading for better UX
      progressInterval = setInterval(() => {
        updateLoadingState('systemInfo', true, Math.min(90, (Date.now() % 5000) / 50));
      }, 100);
      const response = await axiosClient.get('/api/setup-wizard/system-info', {
        timeout: 15000,
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 50) / progressEvent.total);
          updateLoadingState('systemInfo', true, progress);
        }
      });
      clearInterval(progressInterval);
      updateLoadingState('systemInfo', true, 100);
      setSystemInfo(response.data);
      // Enhanced system information processing
      const defaultBasePath = response.data.isWindows ? 'C:\\elasticsearch' : '/opt/elasticsearch';
      setBasePath(defaultBasePath);
      setSetupPaths(response.data.defaultPaths);
      // Update health checks
      setHealthChecks(prev => ({
        ...prev,
        system: response.data.systemChecks || { status: 'unknown' }
      }));
      updateStepProgress(step, { completed: true, validated: true, progress: 100 });
      trackStepTime(step, 'end');
      if (healthTaskId) removeBackgroundTask(healthTaskId);
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      trackStepTime(step, 'end');
      console.error('Error fetching system info:', error);
      incrementRetry(retryKey);
      const errorMessage = error.code === 'ECONNABORTED' 
        ? 'Request timed out. Please check your connection.'
        : error.response?.data?.error || error.message;
      setError(retryKey, `Failed to get system information: ${errorMessage}`, error.code === 'NETWORK_ERROR');
      // Intelligent auto-retry with exponential backoff
      if ((error.code === 'NETWORK_ERROR' || error.code === 'ECONNABORTED') && retryCount[retryKey] < maxRetries) {
        const retryDelay = Math.min(5000, 1000 * Math.pow(2, retryCount[retryKey]));
        setTimeout(() => fetchSystemInfo(true), retryDelay);
      }
    } finally {
      updateLoadingState('systemInfo', false);
    }
  };

  // Removed fetchInstallationGuide

  const validateConfiguration = async (retry = false) => {
    const maxRetries = 2;
    const retryKey = 'validation';
    
    if (!basePath.trim()) {
      setError(retryKey, 'Please enter the Elasticsearch base path');
      return;
    }
    
    if (!retry && retryCount[retryKey] >= maxRetries) {
      setError(retryKey, `Validation failed after ${maxRetries} attempts.`);
      return;
    }

    try {
      updateLoadingState('validation', true);
      clearError(retryKey);
      
      // Use the comprehensive validation function
      const validationData = await validateElasticsearchInstallation(basePath.trim(), retry);
      
      if (validationData && validationData.valid) {
        updateStepProgress(3, { completed: true, validated: true });
        // Auto-proceed to completion step since all files are validated
        setTimeout(() => {
          if (currentStep === 3) {
            setCurrentStep(4);
          }
        }, 1500);
      } else {
        updateStepProgress(3, { completed: true, validated: false });
        if (validationData && validationData.errors.length > 0) {
          setError(retryKey, validationData.errors.join('; '));
        }
      }
      
    } catch (error) {
      console.error('Error validating configuration:', error);
      incrementRetry(retryKey);
      const errorMessage = error.response?.data?.error || error.message;
      setError(retryKey, `Failed to validate configuration: ${errorMessage}`);
    } finally {
      updateLoadingState('validation', false);
    }
  };

  const testElasticsearchConnection = async (host = 'localhost', port = 9200, retry = false) => {
    const maxRetries = 3;
    const retryKey = 'connectionTest';
    
    if (!retry && retryCount[retryKey] >= maxRetries) {
      setError(retryKey, `Connection test failed after ${maxRetries} attempts.`);
      return;
    }

    try {
      updateLoadingState('connectionTest', true);
      clearError(retryKey);
      
      const response = await axiosClient.post('/api/setup-wizard/test-connection', {
        host,
        port
      });
      
      setConnectionTest(response.data);
      
      if (response.data.connected) {
        updateStepProgress(4, { completed: true, validated: true });
        // Auto-proceed if connection successful
        setTimeout(() => {
          if (currentStep === 4) {
            setCurrentStep(5);
          }
        }, 1500);
      } else {
        updateStepProgress(4, { completed: true, validated: false });
      }
      
    } catch (error) {
      console.error('Error testing connection:', error);
      incrementRetry(retryKey);
      const errorMessage = error.response?.data?.error || error.message;
      setConnectionTest({
        connected: false,
        message: `Connection test failed: ${errorMessage}`
      });
      setError(retryKey, `Connection test failed: ${errorMessage}`);
    } finally {
      updateLoadingState('connectionTest', false);
    }
  };

  const initializeSetup = async (retry = false) => {
    const maxRetries = 2;
    const retryKey = 'initialization';
    
    if (!basePath.trim()) {
      setError(retryKey, 'Please enter the Elasticsearch base path');
      return;
    }
    
    if (!retry && retryCount[retryKey] >= maxRetries) {
      setError(retryKey, `Setup initialization failed after ${maxRetries} attempts.`);
      return;
    }

    try {
      updateLoadingState('initialization', true);
      clearError(retryKey);
      
      const response = await axiosClient.post('/api/setup-wizard/initialize', {
        basePath: basePath.trim()
      });
      
      updateStepProgress(4, { completed: true, validated: true });
      
      // Clear saved state on successful completion
      localStorage.removeItem('trustquery-setup-state');
      
      // Show success message with animation
      setTimeout(() => {
        if (onComplete) onComplete();
      }, 2000);
      
    } catch (error) {
      console.error('Error initializing setup:', error);
      incrementRetry(retryKey);
      const errorMessage = error.response?.data?.error || error.message;
      setError(retryKey, `Failed to initialize setup: ${errorMessage}`);
    } finally {
      updateLoadingState('initialization', false);
    }
  };

  // Enhanced Progress indicator component with animations and detailed status
  const ProgressIndicator = () => {
    const steps = [
      { number: 1, title: 'System Info', icon: faInfoCircle, description: 'Detect system configuration' },
      { number: 2, title: 'Installation', icon: faDownload, description: 'Generate setup guide' },
      { number: 3, title: 'Validation', icon: faCog, description: 'Validate Elasticsearch files' },
      { number: 4, title: 'Complete', icon: faCheckCircle, description: 'Finalize setup' }
    ];

    const getStepStatus = (step) => {
      const progress = stepProgress[step.number];
      if (progress?.completed && progress?.validated) return 'completed';
      if (currentStep === step.number) return 'active';
      if (currentStep > step.number) return 'passed';
      return 'pending';
    };

    const getStepColor = (status) => {
      switch (status) {
        case 'completed': return 'border-green-500 bg-green-500 text-white';
        case 'active': return 'border-blue-500 bg-blue-500 text-white';
        case 'passed': return 'border-yellow-500 bg-yellow-500 text-white';
        default: return 'border-neutral-600 bg-neutral-700 text-neutral-400';
      }
    };

    const getConnectorColor = (fromStep, toStep) => {
      const fromStatus = getStepStatus(fromStep);
      const toStatus = getStepStatus(toStep);
      if (fromStatus === 'completed' || (fromStatus === 'active' && toStatus !== 'pending')) {
        return 'bg-green-500';
      }
      if (fromStatus === 'active') return 'bg-blue-500';
      return 'bg-neutral-600';
    };

    return (
      <div className="mb-8">
        {/* Main Progress Bar */}
        <div className="relative mb-6">
          <div className="absolute top-5 left-0 w-full h-0.5 bg-neutral-600"></div>
          <div 
            className="absolute top-5 left-0 h-0.5 bg-gradient-to-r from-blue-500 to-green-500 transition-all duration-1000 ease-out"
            style={{ width: `${(currentStep - 1) * 33.33}%` }}
          ></div>
          
          <div className="flex items-center justify-between relative">
            {steps.map((step, index) => {
              const status = getStepStatus(step);
              const progress = stepProgress[step.number]?.progress || 0;
              
              return (
                <div key={step.number} className="flex items-center">
                  <div className="relative">
                    {/* Step Circle */}
                    <div className={`relative flex items-center justify-center w-10 h-10 rounded-full border-2 transition-all duration-500 ${getStepColor(status)}`}>
                      {status === 'completed' ? (
                        <FontAwesomeIcon icon={faCheckCircle} className="text-sm" />
                      ) : status === 'active' && Object.values(loadingStates).some(Boolean) ? (
                        <FontAwesomeIcon icon={faCircleNotch} spin className="text-sm" />
                      ) : (
                        <FontAwesomeIcon icon={step.icon} className="text-sm" />
                      )}
                      
                      {/* Active step pulse animation */}
                      {status === 'active' && (
                        <>
                          <div className="absolute inset-0 rounded-full border-2 border-blue-300 animate-pulse"></div>
                          <div className="absolute inset-0 rounded-full border border-blue-400 animate-ping"></div>
                        </>
                      )}
                    </div>
                    
                    {/* Progress Ring for Active Step */}
                    {status === 'active' && progress > 0 && (
                      <svg className="absolute inset-0 w-10 h-10 transform -rotate-90">
                        <circle
                          cx="20"
                          cy="20"
                          r="18"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          className="text-blue-200 opacity-25"
                        />
                        <circle
                          cx="20"
                          cy="20"
                          r="18"
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeDasharray={`${2 * Math.PI * 18}`}
                          strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress / 100)}`}
                          className="text-blue-400 transition-all duration-300"
                        />
                      </svg>
                    )}
                  </div>
                  
                  {/* Step Details */}
                  <div className="ml-3 hidden sm:block">
                    <div className={`text-sm font-medium transition-colors duration-300 ${
                      status === 'active' ? 'text-blue-400' : 
                      status === 'completed' ? 'text-green-400' : 
                      status === 'passed' ? 'text-yellow-400' : 'text-neutral-400'
                    }`}>
                      {step.title}
                    </div>
                    <div className="text-xs text-neutral-500">
                      {step.description}
                    </div>
                    {status === 'active' && performanceMetrics.stepTimes[step.number]?.start && (
                      <div className="text-xs text-blue-400">
                        {Math.floor((Date.now() - performanceMetrics.stepTimes[step.number].start) / 1000)}s
                      </div>
                    )}
                  </div>
                  
                  {/* Connector Line */}
                  {index < steps.length - 1 && (
                    <div 
                      className={`flex-1 h-0.5 mx-4 transition-all duration-700 ${
                        getConnectorColor(step, steps[index + 1])
                      }`}
                    ></div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        
        {/* Performance Metrics */}
        {performanceMetrics.totalTime && (
          <div className="mb-4 p-3 bg-neutral-800 border border-neutral-700 rounded-lg">
            <div className="flex items-center justify-between text-xs text-neutral-400">
              <span>Total Time: {Math.floor(performanceMetrics.totalTime / 1000)}s</span>
              {performanceMetrics.avgStepTime && (
                <span>Avg Step: {Math.floor(performanceMetrics.avgStepTime / 1000)}s</span>
              )}
            </div>
          </div>
        )}
        
        {/* Critical Error Alert */}
        {criticalError && (
          <div className="mb-4 p-4 bg-red-900/40 border border-red-600 rounded-lg animate-pulse">
            <div className="flex items-center text-red-300 font-medium mb-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2 text-red-400" />
              Critical Error Detected
            </div>
            <div className="text-red-200 text-sm mb-3">{criticalError.message}</div>
            <div className="flex space-x-2">
              <button
                onClick={() => setCriticalError(null)}
                className="text-xs bg-red-700 hover:bg-red-600 text-white px-3 py-1 rounded transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={() => window.location.reload()}
                className="text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1 rounded transition-colors"
              >
                Restart Wizard
              </button>
            </div>
          </div>
        )}
        
        {/* Regular Error Summary */}
        {Object.keys(errors).length > 0 && !criticalError && (
          <div className="mb-4 p-3 bg-red-900/30 border border-red-700 rounded-lg">
            <div className="flex items-center justify-between text-red-400 text-sm font-medium mb-2">
              <span>
                <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
                Issues Found ({Object.keys(errors).length})
              </span>
              <button
                onClick={() => setErrors({})}
                className="text-xs text-red-300 hover:text-red-200"
              >
                Clear All
              </button>
            </div>
            {Object.entries(errors).map(([key, message]) => (
              <div key={key} className="flex items-center justify-between text-red-300 text-xs ml-6 mb-1">
                <span>• {message}</span>
                <button
                  onClick={() => clearError(key)}
                  className="text-red-400 hover:text-red-300 ml-2"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Background Tasks Indicator */}
        {backgroundTasks.length > 0 && (
          <div className="mb-4 p-3 bg-blue-900/30 border border-blue-700 rounded-lg">
            <div className="text-blue-400 text-sm font-medium mb-2">
              <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
              Background Tasks ({backgroundTasks.length})
            </div>
            {backgroundTasks.map((task) => (
              <div key={task.id} className="text-blue-300 text-xs ml-6 flex items-center justify-between">
                <span>• {task.name}</span>
                <span>{Math.floor((Date.now() - task.startTime) / 1000)}s</span>
              </div>
            ))}
          </div>
        )}

        {/* Save Conflict Warning */}
        {saveConflict && (
          <div className="mb-4 p-3 bg-yellow-900/30 border border-yellow-700 rounded-lg">
            <div className="flex items-center text-yellow-400 text-sm font-medium mb-2">
              <FontAwesomeIcon icon={faExclamationTriangle} className="mr-2" />
              Save Conflict Detected
            </div>
            <div className="text-yellow-300 text-xs mb-2">
              Another tab or session has modified the setup state. Your changes may be overwritten.
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => {
                  localStorage.removeItem('trustquery-setup-state');
                  setSaveConflict(false);
                }}
                className="text-xs bg-yellow-700 hover:bg-yellow-600 text-white px-3 py-1 rounded transition-colors"
              >
                Force Save
              </button>
              <button
                onClick={() => setSaveConflict(false)}
                className="text-xs bg-neutral-700 hover:bg-neutral-600 text-white px-3 py-1 rounded transition-colors"
              >
                Ignore
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Enhanced Help Tooltip Component with interactive features
  const HelpTooltip = ({ content, children, position = 'bottom', interactive = false }) => {
    const [show, setShow] = useState(false);
    const [userDismissed, setUserDismissed] = useState(false);
    
    const positionClasses = {
      top: 'bottom-full mb-2',
      bottom: 'top-full mt-2',
      left: 'right-full mr-2',
      right: 'left-full ml-2'
    };
    
    const arrowClasses = {
      top: 'top-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-neutral-600',
      bottom: 'bottom-full left-1/2 transform -translate-x-1/2 border-l-4 border-r-4 border-b-4 border-l-transparent border-r-transparent border-b-neutral-600',
      left: 'left-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-l-4 border-t-transparent border-b-transparent border-l-neutral-600',
      right: 'right-full top-1/2 transform -translate-y-1/2 border-t-4 border-b-4 border-r-4 border-t-transparent border-b-transparent border-r-neutral-600'
    };
    
    const shouldShow = show && !userDismissed;
    
    return (
      <div className="relative inline-block">
        <div
          onMouseEnter={() => setShow(true)}
          onMouseLeave={() => !interactive && setShow(false)}
          onClick={() => interactive && setShow(!show)}
          className="cursor-help"
        >
          {children}
        </div>
        {shouldShow && (
          <div className={`absolute z-50 w-80 p-4 bg-neutral-900 border border-neutral-600 rounded-lg shadow-xl ${positionClasses[position]} transform transition-all duration-200`}>
            <div className="flex items-start justify-between mb-2">
              <div className="text-sm text-neutral-300 flex-1 pr-2">
                {typeof content === 'string' ? content : (content?.text || String(content || ''))}
              </div>
              {interactive && (
                <button
                  onClick={() => {
                    setUserDismissed(true);
                    setShow(false);
                  }}
                  className="text-neutral-500 hover:text-neutral-300 text-xs"
                >
                  ✕
                </button>
              )}
            </div>
            
            {/* Additional help features */}
            {typeof content === 'object' && content.links && (
              <div className="mt-3 space-y-2">
                {content.links.map((link, index) => (
                  <a
                    key={index}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-xs text-blue-400 hover:text-blue-300 underline"
                  >
                    {link.text} →
                  </a>
                ))}
              </div>
            )}
            
            <div className={`absolute ${arrowClasses[position]} w-0 h-0`}></div>
          </div>
        )}
      </div>
    );
  };

  // Enhanced loading overlay with progress animations and details
  const LoadingOverlay = ({ show, message, progress, details }) => {
    if (!show) return null;
    
    const currentTask = backgroundTasks.find(task => task.type === 'active') || {};
    const displayProgress = progress !== undefined ? progress : currentTask.progress || 0;
    
    return (
      <div className="absolute inset-0 bg-black bg-opacity-85 flex items-center justify-center z-50 rounded-xl backdrop-blur-sm">
        <div className="bg-neutral-800 p-8 rounded-xl border border-neutral-700 text-center min-w-80 max-w-md shadow-2xl">
          {/* Main Loading Animation */}
          <div className="relative mb-6">
            <div className="w-16 h-16 mx-auto relative">
              <FontAwesomeIcon 
                icon={faCircleNotch} 
                spin 
                className="text-4xl text-blue-500 absolute inset-0" 
              />
              <div className="absolute inset-0 rounded-full border-4 border-blue-200 opacity-25 animate-pulse"></div>
              <div className="absolute inset-2 rounded-full border-2 border-blue-400 opacity-50 animate-spin-slow"></div>
            </div>
          </div>
          
          {/* Message */}
          <div className="text-white font-medium mb-4 text-lg">{message}</div>
          
          {/* Details */}
          {details && (
            <div className="text-neutral-400 text-sm mb-4">{details}</div>
          )}
          
          {/* Progress Bar */}
          {displayProgress !== undefined && displayProgress > 0 && (
            <div className="mb-4">
              <div className="w-full bg-neutral-700 rounded-full h-3 mb-2 overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-blue-500 to-blue-400 h-3 rounded-full transition-all duration-500 ease-out relative"
                  style={{ width: `${Math.min(100, Math.max(0, displayProgress))}%` }}
                >
                  <div className="absolute inset-0 bg-white opacity-30 animate-pulse rounded-full"></div>
                </div>
              </div>
              <div className="text-neutral-400 text-sm">
                {Math.round(displayProgress)}% complete
              </div>
            </div>
          )}
          
          {/* Background Tasks */}
          {backgroundTasks.length > 0 && (
            <div className="mb-4 text-left">
              <div className="text-neutral-400 text-xs mb-2">Background tasks:</div>
              {backgroundTasks.slice(0, 3).map((task, index) => (
                <div key={task.id} className="flex items-center justify-between text-xs text-neutral-500 mb-1">
                  <span className="truncate">• {task.name}</span>
                  <span>{Math.floor((Date.now() - task.startTime) / 1000)}s</span>
                </div>
              ))}
              {backgroundTasks.length > 3 && (
                <div className="text-xs text-neutral-600">
                  ...and {backgroundTasks.length - 3} more
                </div>
              )}
            </div>
          )}
          
          {/* Estimated Time */}
          {performanceMetrics.avgStepTime && displayProgress > 0 && displayProgress < 100 && (
            <div className="text-neutral-500 text-xs">
              Estimated time remaining: {Math.ceil((100 - displayProgress) * performanceMetrics.avgStepTime / 100 / 1000)}s
            </div>
          )}
          
          {/* Cancel Option for Long Running Tasks */}
          {currentTask.cancelable && (
            <button
              onClick={() => {
                // Implement cancellation logic
                removeBackgroundTask(currentTask.id);
                setErrors({});
                clearError('all');
              }}
              className="mt-4 text-xs text-red-400 hover:text-red-300 underline"
            >
              Cancel Operation
            </button>
          )}
          
          <div className="text-neutral-500 text-sm mt-4">Please wait...</div>
        </div>
      </div>
    );
  };

  const checkActiveNodes = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster');
      // Extract nodes from the cluster response
      const nodes = response.data.nodes || [];
      setActiveNodes(nodes);
    } catch (error) {
      console.error('Error checking active nodes:', error);
      setActiveNodes([]);
    }
  };

  const testNodeConnection = async (nodeUrl) => {
    setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'testing' }));
    try {
      const response = await fetch(`${nodeUrl}/_cluster/health`);
      if (response.ok) {
        setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'success' }));
        return true;
      } else {
        setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'failed' }));
        return false;
      }
    } catch (error) {
      setConnectionTests(prev => ({ ...prev, [nodeUrl]: 'failed' }));
      return false;
    }
  };

  const fetchLocalNodes = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/local-nodes');
      setLocalNodes(response.data.nodes || []);
    } catch (error) {
      console.error('Error fetching local nodes:', error);
    }
  };

  const fetchSetupGuide = async () => {
    try {
      const response = await axiosClient.get('/api/admin/cluster-advanced/setup-guide');
      setSetupGuide(response.data);
    } catch (error) {
      console.error('Error fetching setup guide:', error);
      // Set a default setup guide if the API is not available
      setSetupGuide({
        steps: [
          {
            step: 1,
            title: "Download Elasticsearch",
            description: "Download Elasticsearch from the official website",
            commands: [
              "Visit https://www.elastic.co/downloads/elasticsearch",
              "Download the Windows ZIP file",
              "Extract to C:\\elasticsearch"
            ]
          },
          {
            step: 2,
            title: "Configure Elasticsearch",
            description: "Edit the elasticsearch.yml configuration file",
            commands: [
              "Edit C:\\elasticsearch\\config\\elasticsearch.yml",
              "Set cluster.name: trustquery-cluster",
              "Set node.name: node-1"
            ]
          },
          {
            step: 3,
            title: "Start Elasticsearch",
            description: "Run Elasticsearch from the command line",
            commands: [
              "Open PowerShell as Administrator",
              "cd C:\\elasticsearch",
              "bin\\elasticsearch.bat"
            ]
          }
        ]
      });
    }
  };

  useEffect(() => {
    if (isOpen) {
      // Load different data based on setup type
      if (setupType === 'vps-setup') {
        fetchSystemInfo();
      } else {
        checkActiveNodes();
        fetchLocalNodes();
        fetchSetupGuide();
      }
    }
  }, [isOpen, setupType]);

  // Handle escape key to close modal
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      return () => document.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const addNode = () => {
    const newNodeIndex = clusterConfig.nodes.length + 1;
    const newNode = {
      name: `node-${newNodeIndex}`,
      host: 'localhost',
      port: 9200 + newNodeIndex - 1,
      transportPort: 9300 + newNodeIndex - 1,
      dataPath: `C:\\elasticsearch\\node-${newNodeIndex}\\data`,
      logsPath: `C:\\elasticsearch\\node-${newNodeIndex}\\logs`,
      roles: { master: true, data: true, ingest: true }
    };
    setClusterConfig(prev => ({
      ...prev,
      nodes: [...prev.nodes, newNode]
    }));
  };

  const removeNode = (index) => {
    if (clusterConfig.nodes.length > 1) {
      setClusterConfig(prev => ({
        ...prev,
        nodes: prev.nodes.filter((_, i) => i !== index)
      }));
    }
  };

  const updateNode = (index, field, value) => {
    setClusterConfig(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, i) => 
        i === index ? { ...node, [field]: value } : node
      )
    }));
  };

  const updateNodeRole = (index, role, value) => {
    setClusterConfig(prev => ({
      ...prev,
      nodes: prev.nodes.map((node, i) => 
        i === index ? { 
          ...node, 
          roles: { ...node.roles, [role]: value } 
        } : node
      )
    }));
  };

  const createCluster = async () => {
    setLoading(true);
    try {
      const response = await axiosClient.post('/api/admin/cluster-advanced/create', clusterConfig);
      onComplete(response.data);
    } catch (error) {
      console.error('Error creating cluster:', error);
      alert('Failed to create cluster: ' + (error.response?.data?.error || error.message));
    } finally {
      setLoading(false);
    }
  };

  const startNode = async (nodeName) => {
    try {
      // Call the start endpoint
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/start`);
      
      // Poll for actual running status
      const pollForNodeStart = async (maxAttempts = 20, interval = 3000) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, interval));
          
          try {
            // Fetch updated node status
            await fetchLocalNodes();
            
            // Check if node is actually running
            const updatedNodes = await axiosClient.get('/api/admin/cluster-advanced/local-nodes?forceRefresh=false');
            const targetNode = updatedNodes.data.nodes?.find(n => n.name === nodeName);
            
            if (targetNode?.isRunning) {
              return true;
            }
          } catch (error) {
            console.warn(`Poll attempt ${attempt + 1} failed:`, error);
          }
        }
        
        // If we get here, the node didn't start within the timeout
        console.error(`Node "${nodeName}" failed to start within expected time`);
        await fetchLocalNodes(); // Final refresh to get actual status
        return false;
      };
      
      // Start polling and wait for result
      await pollForNodeStart();
      
    } catch (error) {
      console.error('Error starting node:', error);
      alert('Failed to start node: ' + (error.response?.data?.error || error.message));
    }
  };

  const stopNode = async (nodeName) => {
    try {
      // Call the stop endpoint
      await axiosClient.post(`/api/admin/cluster-advanced/nodes/${nodeName}/stop`);
      
      // Poll for actual stopped status
      const pollForNodeStop = async (maxAttempts = 10, interval = 2000) => {
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          await new Promise(resolve => setTimeout(resolve, interval));
          
          try {
            // Fetch updated node status
            await fetchLocalNodes();
            
            // Check if node is actually stopped
            const updatedNodes = await axiosClient.get('/api/admin/cluster-advanced/local-nodes?forceRefresh=false');
            const targetNode = updatedNodes.data.nodes?.find(n => n.name === nodeName);
            
            if (!targetNode?.isRunning) {
              return true;
            }
          } catch (error) {
            console.warn(`Poll attempt ${attempt + 1} failed:`, error);
          }
        }
        
        // If we get here, the node didn't stop within the timeout
        console.error(`Node "${nodeName}" failed to stop within expected time`);
        await fetchLocalNodes(); // Final refresh to get actual status
        return false;
      };
      
      // Start polling and wait for result
      await pollForNodeStop();
      
    } catch (error) {
      console.error('Error stopping node:', error);
      alert('Failed to stop node: ' + (error.response?.data?.error || error.message));
    }
  };

  const deleteNode = async (nodeName) => {
    if (window.confirm(`Are you sure you want to delete node "${nodeName}"?`)) {
      try {
        await axiosClient.delete(`/api/admin/cluster-advanced/nodes/${nodeName}`);
        await fetchLocalNodes();
      } catch (error) {
        console.error('Error deleting node:', error);
        alert('Failed to delete node: ' + (error.response?.data?.error || error.message));
      }
    }
  };

  // VPS Setup Step Renderers
  const renderVPSSystemInfoStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faServer} className="text-4xl text-blue-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">VPS Deployment Setup</h3>
        <p className="text-neutral-400">
          Configure TrustQuery for deployment on your VPS (Windows/Linux)
        </p>
      </div>

      {/* System Information */}
      {systemInfo && (
        <div className="bg-neutral-700 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-white mb-4">System Information</h4>
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-neutral-400">Platform:</span>
              <span className="text-white ml-2 font-mono">
                {systemInfo.os.platform} ({systemInfo.os.arch})
              </span>
            </div>
            <div>
              <span className="text-neutral-400">Memory:</span>
              <span className="text-white ml-2">
                {Math.round(systemInfo.os.totalMemory / 1024 / 1024 / 1024)}GB
              </span>
            </div>
            <div>
              <span className="text-neutral-400">CPUs:</span>
              <span className="text-white ml-2">{systemInfo.os.cpus}</span>
            </div>
            <div>
              <span className="text-neutral-400">Hostname:</span>
              <span className="text-white ml-2 font-mono">{systemInfo.os.hostname}</span>
            </div>
          </div>

          {/* System Requirements */}
          {systemInfo.systemChecks && (
            <div className="mt-4 space-y-2">
              <h5 className="font-medium text-white">System Requirements</h5>
              {Object.entries(systemInfo.systemChecks.checks).map(([key, check]) => (
                <div key={key} className="flex items-center space-x-2">
                  <FontAwesomeIcon 
                    icon={check.pass ? faCheckCircle : faExclamationTriangle} 
                    className={check.pass ? 'text-green-400' : 'text-yellow-400'} 
                  />
                  <span className="text-sm text-neutral-300 capitalize">{key}:</span>
                  <span className="text-sm text-neutral-400">{check.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* System Health Check (moved here) */}
          {systemInfo.systemChecks && (
            <div className="mt-4 space-y-2">
              <h5 className="font-medium text-white">System Health Check</h5>
              <div className="text-sm text-neutral-400">{systemInfo.systemChecks.checks.permissions.message}</div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          disabled={!systemInfo || loading}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg disabled:bg-neutral-600"
        >
          {loading ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
              Loading...
            </>
          ) : (
            'Next: Configuration'
          )}
        </button>
      </div>
    </div>
  );

  // Removed Installation Guide step entirely

  const renderVPSConfigurationStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faCog} className="text-4xl text-blue-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Configuration</h3>
        <p className="text-neutral-400">
          Configure paths and test your Elasticsearch installation
        </p>
      </div>

      {/* Enhanced Base Path Configuration */}
      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4 flex items-center">
          <FontAwesomeIcon icon={faFolder} className="mr-2 text-blue-400" />
          Elasticsearch Configuration
        </h4>
        <p className="text-neutral-300 mb-4">
          Enter the base path where Elasticsearch is installed. All other paths (config, data, logs) will be automatically detected.
        </p>
        <div className="mb-4">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Elasticsearch Base Path <span className="text-red-400">*</span>
          </label>
          <div className="relative">
            <input
              type="text"
              value={basePath}
              onChange={(e) => setBasePath(e.target.value)}
              placeholder={systemInfo?.isWindows ? 'C:\\elasticsearch' : '/opt/elasticsearch'}
              className={`w-full px-3 py-2 pr-10 bg-neutral-600 border rounded-md text-white focus:outline-none focus:ring-2 font-mono text-sm transition-all ${
                realtimeValidation.basePath.valid === true 
                  ? 'border-green-500 focus:ring-green-500' 
                  : realtimeValidation.basePath.valid === false
                    ? 'border-red-500 focus:ring-red-500'
                    : 'border-neutral-500 focus:ring-blue-500'
              }`}
            />
            <div className="absolute inset-y-0 right-0 flex items-center pr-3">
              {realtimeValidation.basePath.checking ? (
                <FontAwesomeIcon icon={faCircleNotch} spin className="text-blue-400" />
              ) : realtimeValidation.basePath.valid === true ? (
                <FontAwesomeIcon icon={faCheckCircle} className="text-green-400" />
              ) : realtimeValidation.basePath.valid === false ? (
                <FontAwesomeIcon icon={faExclamationTriangle} className="text-red-400" />
              ) : null}
            </div>
          </div>
          {/* Real-time validation feedback */}
          {realtimeValidation.basePath.message && (
            <div className={`text-xs mt-1 flex items-center ${
              realtimeValidation.basePath.valid === true 
                ? 'text-green-400' 
                : realtimeValidation.basePath.valid === false
                  ? 'text-red-400'
                  : 'text-blue-400'
            }`}>
              <FontAwesomeIcon 
                icon={realtimeValidation.basePath.checking ? faCircleNotch : faInfoCircle} 
                className={`mr-1 ${realtimeValidation.basePath.checking ? 'animate-spin' : ''}`} 
              />
              {realtimeValidation.basePath.message}
            </div>
          )}
          <p className="text-xs text-neutral-400 mt-1">
            This should be the root directory containing 'bin', 'config', 'data', and 'logs' folders
          </p>
          {/* Path suggestions from real-time validation */}
          {realtimeValidation.basePath.suggestions && realtimeValidation.basePath.suggestions.length > 0 && (
            <div className="mt-3">
              <p className="text-xs text-neutral-400 mb-2">Suggestions:</p>
              <div className="space-y-1">
                {realtimeValidation.basePath.suggestions.map((suggestion, index) => (
                  <div key={index} className="text-xs text-blue-400 bg-blue-900/20 px-2 py-1 rounded">
                    {suggestion}
                  </div>
                ))}
              </div>
            </div>
          )}
          {/* Common paths based on detected OS */}
          {systemInfo && (
            <div className="mt-3">
              <p className="text-xs text-neutral-400 mb-2">Common paths for {systemInfo.os.platform}:</p>
              <div className="flex flex-wrap gap-2">
                {(systemInfo.isWindows ? [
                  'C:\\elasticsearch',
                  'C:\\Program Files\\Elasticsearch',
                  'D:\\elasticsearch'
                ] : [
                  '/opt/elasticsearch',
                  '/usr/share/elasticsearch',
                  '/home/elastic/elasticsearch'
                ]).map((suggestedPath) => (
                  <button
                    key={suggestedPath}
                    onClick={() => setBasePath(suggestedPath)}
                    className="text-xs bg-neutral-800 hover:bg-neutral-600 text-neutral-300 px-2 py-1 rounded transition-colors"
                  >
                    {suggestedPath}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        {/* Loading indicator for automatic validation */}
        {loadingStates.validation && (
          <div className="flex items-center space-x-2 mt-4">
            <FontAwesomeIcon icon={faCircleNotch} spin className="text-blue-400" />
            <span className="text-blue-300 text-sm">Validating Elasticsearch installation...</span>
          </div>
        )}
      </div>

      {/* Validation Results */}
      {validationResult && (
        <div className={`rounded-lg p-6 ${
          validationResult.valid 
            ? 'bg-green-900/30 border border-green-700' 
            : 'bg-red-900/30 border border-red-700'
        }`}>
          <h4 className={`text-lg font-semibold mb-4 ${
            validationResult.valid ? 'text-green-400' : 'text-red-400'
          }`}>
            <FontAwesomeIcon 
              icon={validationResult.valid ? faCheckCircle : faExclamationTriangle} 
              className="mr-2" 
            />
            Validation {validationResult.valid ? 'Passed' : 'Failed'}
          </h4>
          
          <p className="text-neutral-300 mb-4">{validationResult.message}</p>

          {/* Detected Paths */}
          {validationResult.detectedPaths && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-neutral-200 mb-2">Detected Paths:</h5>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {Object.entries(validationResult.detectedPaths).map(([key, path]) => (
                  <div key={key} className="bg-neutral-800 px-2 py-1 rounded">
                    <span className="text-neutral-400">{key}:</span>
                    <span className="text-neutral-200 ml-1 font-mono">{path}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Elasticsearch Info */}
          {validationResult.elasticsearchInfo && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-neutral-200 mb-2">Elasticsearch Info:</h5>
              <div className="bg-neutral-800 px-3 py-2 rounded text-xs">
                {validationResult.elasticsearchInfo.version && (
                  <div>Version: <span className="text-green-400">{validationResult.elasticsearchInfo.version}</span></div>
                )}
                <div>Status: <span className={validationResult.elasticsearchInfo.detected ? 'text-green-400' : 'text-yellow-400'}>
                  {validationResult.elasticsearchInfo.detected ? 'Detected' : 'Not Running'}
                </span></div>
              </div>
            </div>
          )}

          {/* Errors */}
          {validationResult.errors && validationResult.errors.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-red-400 mb-2">Errors:</h5>
              <ul className="text-xs text-red-300 space-y-1">
                {validationResult.errors.map((error, index) => (
                  <li key={index}>• {error}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Warnings */}
          {validationResult.warnings && validationResult.warnings.length > 0 && (
            <div className="mb-4">
              <h5 className="text-sm font-semibold text-yellow-400 mb-2">Warnings:</h5>
              <ul className="text-xs text-yellow-300 space-y-1">
                {validationResult.warnings.map((warning, index) => (
                  <li key={index}>• {warning}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Enhanced File & Directory Checks */}
          {validationResult.checks && (
            <div>
              <h5 className="text-sm font-semibold text-neutral-200 mb-2">File & Directory Checks:</h5>
              <div className="grid grid-cols-1 gap-2 text-xs">
                {Object.entries(validationResult.checks).map(([key, check]) => (
                  <div key={key} className="flex items-center justify-between bg-neutral-800 px-3 py-2 rounded">
                    <div className="flex items-center space-x-2">
                      <FontAwesomeIcon 
                        icon={check.exists ? faCheckCircle : faExclamationTriangle} 
                        className={check.exists ? 'text-green-400' : 'text-red-400'} 
                      />
                      <span className="text-neutral-300 capitalize">
                        {key.replace(/_/g, ' ').replace('dir', 'directory')}:
                      </span>
                    </div>
                    <div className="text-right">
                      <div className={check.exists ? 'text-green-400' : 'text-red-400'}>
                        {check.exists ? 'Found' : 'Missing'}
                      </div>
                      {check.exists && check.size && (
                        <div className="text-neutral-500 text-xs">
                          {(check.size / 1024).toFixed(1)}KB
                        </div>
                      )}
                      {check.exists && check.isExecutable === false && key.includes('executable') && (
                        <div className="text-yellow-400 text-xs">
                          No exec permission
                        </div>
                      )}
                      {check.writable === false && key.includes('dir') && (
                        <div className="text-yellow-400 text-xs">
                          Read-only
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(4)}
          disabled={!validationResult?.valid}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg disabled:bg-neutral-600 disabled:cursor-not-allowed"
        >
          Next: Complete Setup
        </button>
      </div>
    </div>
  );

  // VPS Connection Test Step
  const renderVPSConnectionTestStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faServer} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Test Elasticsearch Connection</h3>
        <p className="text-neutral-300">
          Let's verify that Elasticsearch is running and accessible.
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Connection Test</h4>
        
        <div className="flex space-x-3 mb-4">
          <button
            onClick={() => testElasticsearchConnection()}
            disabled={loading}
            className="bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg disabled:bg-neutral-600 text-sm flex-1"
          >
            {loading ? (
              <>
                <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
                Testing Connection...
              </>
            ) : (
              <>
                <FontAwesomeIcon icon={faServer} className="mr-2" />
                Test Connection
              </>
            )}
          </button>
        </div>

        {/* Connection Test Results */}
        {connectionTest && (
          <div className={`rounded-lg p-4 ${
            connectionTest.connected 
              ? 'bg-green-900/30 border border-green-700' 
              : 'bg-red-900/30 border border-red-700'
          }`}>
            <div className="flex items-center space-x-2 mb-2">
              <FontAwesomeIcon 
                icon={connectionTest.connected ? faCheckCircle : faExclamationTriangle} 
                className={connectionTest.connected ? 'text-green-400' : 'text-red-400'} 
              />
              <span className="text-white font-semibold">
                {connectionTest.connected ? 'Connection Successful!' : 'Connection Failed'}
              </span>
            </div>
            <p className="text-neutral-300 text-sm">{connectionTest.message}</p>
            
            {connectionTest.connected && connectionTest.cluster && (
              <div className="mt-3 p-3 bg-neutral-800 rounded text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>Cluster: <span className="text-green-400">{connectionTest.cluster.name}</span></div>
                  <div>Status: <span className="text-green-400">{connectionTest.cluster.status}</span></div>
                  <div>Nodes: <span className="text-green-400">{connectionTest.cluster.nodes}</span></div>
                  <div>Version: <span className="text-green-400">{connectionTest.version}</span></div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(3)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(5)}
          disabled={!connectionTest?.connected}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg disabled:bg-neutral-600 disabled:cursor-not-allowed"
        >
          Next: Complete Setup
        </button>
      </div>
    </div>
  );

  // VPS Setup Complete Step
  const renderVPSSetupCompleteStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Complete Setup</h3>
        <p className="text-neutral-300">
          Finalize your Elasticsearch configuration and start using TrustQuery.
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Initialize Configuration</h4>
        <p className="text-neutral-300 mb-4">
          This will save your Elasticsearch configuration and complete the setup process.
        </p>
        
        <button
          onClick={initializeSetup}
          disabled={loading}
          className="w-full bg-green-600 hover:bg-green-500 text-white px-6 py-3 rounded-lg disabled:bg-neutral-600 text-lg font-semibold"
        >
          {loading ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
              Initializing Setup...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faCheckCircle} className="mr-2" />
              Complete Setup
            </>
          )}
        </button>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(3)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={onClose}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Close Wizard
        </button>
      </div>
    </div>
  );

  const renderStep1 = () => {
    // Show setup type selection first
    if (setupType === 'vps-setup') {
      return renderVPSSystemInfoStep();
    }
    
    // Original step 1 for local cluster setup
    return (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faInfoCircle} className="text-4xl text-blue-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Setup Type Selection</h3>
        <p className="text-neutral-400">
          Choose how you want to set up TrustQuery
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div 
          className={`p-6 rounded-lg border-2 cursor-pointer transition-colors ${
            setupType === 'vps-setup' 
              ? 'border-blue-500 bg-blue-900/30' 
              : 'border-neutral-600 bg-neutral-700'
          }`}
          onClick={() => setSetupType('vps-setup')}
        >
          <FontAwesomeIcon icon={faServer} className="text-3xl text-blue-400 mb-4" />
          <h4 className="text-lg font-semibold text-white mb-2">VPS Deployment</h4>
          <p className="text-sm text-neutral-400 mb-4">
            Set up TrustQuery on your VPS or dedicated server with guided installation
          </p>
          <ul className="text-xs text-neutral-400 space-y-1">
            <li>• Platform detection (Windows/Linux)</li>
            <li>• Automated installation guide</li>
            <li>• Path configuration wizard</li>
            <li>• Production-ready setup</li>
          </ul>
        </div>

        <div 
          className={`p-6 rounded-lg border-2 cursor-pointer transition-colors ${
            setupType === 'local-cluster' 
              ? 'border-blue-500 bg-blue-900/30' 
              : 'border-neutral-600 bg-neutral-700'
          }`}
          onClick={() => setSetupType('local-cluster')}
        >
          <FontAwesomeIcon icon={faDatabase} className="text-3xl text-green-400 mb-4" />
          <h4 className="text-lg font-semibold text-white mb-2">Local Cluster</h4>
          <p className="text-sm text-neutral-400 mb-4">
            Create and manage local Elasticsearch nodes for development
          </p>
          <ul className="text-xs text-neutral-400 space-y-1">
            <li>• Quick setup for testing</li>
            <li>• Multiple node configuration</li>
            <li>• Local file management</li>
            <li>• Development environment</li>
          </ul>
        </div>
      </div>

      {setupGuide && setupType === 'local-cluster' && (
        <div className="bg-neutral-700 rounded-lg p-6">
          <h4 className="text-lg font-semibold text-white mb-4">Prerequisites</h4>
          <div className="space-y-4">
            {setupGuide.steps.map((step, index) => (
              <div key={index} className="flex items-start space-x-3">
                <div className="bg-blue-600 text-white rounded-full w-8 h-8 flex items-center justify-center text-sm font-bold">
                  {step.step}
                </div>
                <div className="flex-1">
                  <h5 className="font-medium text-white">{step.title}</h5>
                  <p className="text-sm text-neutral-400 mb-2">{step.description}</p>
                  <div className="bg-neutral-800 rounded p-2">
                    {step.commands.map((cmd, idx) => (
                      <div key={idx} className="text-xs text-neutral-300 font-mono">
                        {cmd}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Cancel
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Next: Configure
        </button>
      </div>
    </div>
  );
  };

  const renderStep2 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faDatabase} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Cluster Configuration</h3>
        <p className="text-neutral-400">
          Configure your cluster name and node settings
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <div className="mb-6">
          <label className="block text-sm font-medium text-neutral-300 mb-2">
            Cluster Name
          </label>
          <input
            type="text"
            value={clusterConfig.clusterName}
            onChange={(e) => setClusterConfig(prev => ({...prev, clusterName: e.target.value}))}
            className="w-full px-3 py-2 bg-neutral-600 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="trustquery-cluster"
          />
        </div>

        <div className="mb-4">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-lg font-semibold text-white">Nodes Configuration</h4>
            <button
              onClick={addNode}
              className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm"
            >
              <FontAwesomeIcon icon={faPlus} className="mr-1" />
              Add Node
            </button>
          </div>

          <div className="space-y-4">
            {clusterConfig.nodes.map((node, index) => (
              <div key={index} className="bg-neutral-600 rounded-lg p-4">
                <div className="flex items-center justify-between mb-4">
                  <h5 className="font-medium text-white">Node {index + 1}</h5>
                  {clusterConfig.nodes.length > 1 && (
                    <button
                      onClick={() => removeNode(index)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <FontAwesomeIcon icon={faMinus} />
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Node Name
                    </label>
                    <input
                      type="text"
                      value={node.name}
                      onChange={(e) => updateNode(index, 'name', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Host
                    </label>
                    <input
                      type="text"
                      value={node.host}
                      onChange={(e) => updateNode(index, 'host', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      HTTP Port
                    </label>
                    <input
                      type="number"
                      value={node.port}
                      onChange={(e) => updateNode(index, 'port', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Transport Port
                    </label>
                    <input
                      type="number"
                      value={node.transportPort}
                      onChange={(e) => updateNode(index, 'transportPort', parseInt(e.target.value))}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Data Path
                    </label>
                    <input
                      type="text"
                      value={node.dataPath}
                      onChange={(e) => updateNode(index, 'dataPath', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-neutral-300 mb-1">
                      Logs Path
                    </label>
                    <input
                      type="text"
                      value={node.logsPath}
                      onChange={(e) => updateNode(index, 'logsPath', e.target.value)}
                      className="w-full px-3 py-2 bg-neutral-700 border border-neutral-500 rounded-md text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="mt-4">
                  <label className="block text-sm font-medium text-neutral-300 mb-2">
                    Node Roles
                  </label>
                  <div className="flex space-x-4">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.master}
                        onChange={(e) => updateNodeRole(index, 'master', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Master</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.data}
                        onChange={(e) => updateNodeRole(index, 'data', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Data</span>
                    </label>
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={node.roles.ingest}
                        onChange={(e) => updateNodeRole(index, 'ingest', e.target.checked)}
                        className="w-4 h-4 text-blue-600 bg-neutral-700 border-neutral-600 rounded focus:ring-blue-500"
                      />
                      <span className="text-white">Ingest</span>
                    </label>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(1)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
        >
          Next: Review & Create
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faCheckCircle} className="text-4xl text-green-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Review & Create</h3>
        <p className="text-neutral-400">
          Review your cluster configuration and create the cluster
        </p>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Cluster Summary</h4>
        <div className="space-y-3">
          <div className="flex justify-between">
            <span className="text-neutral-300">Cluster Name:</span>
            <span className="text-white font-medium">{clusterConfig.clusterName}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Total Nodes:</span>
            <span className="text-white font-medium">{clusterConfig.nodes.length}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Master Nodes:</span>
            <span className="text-white font-medium">
              {clusterConfig.nodes.filter(n => n.roles.master).length}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-300">Data Nodes:</span>
            <span className="text-white font-medium">
              {clusterConfig.nodes.filter(n => n.roles.data).length}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-neutral-700 rounded-lg p-6">
        <h4 className="text-lg font-semibold text-white mb-4">Nodes Details</h4>
        <div className="space-y-3">
          {clusterConfig.nodes.map((node, index) => (
            <div key={index} className="bg-neutral-600 rounded p-3">
              <div className="flex justify-between items-center mb-2">
                <span className="text-white font-medium">{node.name}</span>
                <span className="text-neutral-300">{node.host}:{node.port}</span>
              </div>
              <div className="text-sm text-neutral-400">
                <div>Data: {node.dataPath}</div>
                <div>Roles: {Object.entries(node.roles).filter(([, enabled]) => enabled).map(([role]) => role).join(', ')}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-between">
        <button
          onClick={() => setCurrentStep(2)}
          className="bg-neutral-600 hover:bg-neutral-500 text-white px-6 py-2 rounded-lg"
        >
          Back
        </button>
        <button
          onClick={createCluster}
          disabled={loading}
          className="bg-green-600 hover:bg-green-500 text-white px-6 py-2 rounded-lg disabled:opacity-50"
        >
          {loading ? (
            <>
              <FontAwesomeIcon icon={faCircleNotch} className="fa-spin mr-2" />
              Creating Cluster...
            </>
          ) : (
            'Create Cluster'
          )}
        </button>
      </div>
    </div>
  );

  const renderLocalNodes = () => (
    <div className="mt-8">
      <h4 className="text-lg font-semibold text-white mb-4">Local Nodes Management</h4>
      {localNodes.length === 0 ? (
        <p className="text-neutral-400">No local nodes configured</p>
      ) : (
        <div className="space-y-3">
          {localNodes.map((node, index) => (
            <div key={index} className="bg-neutral-700 rounded-lg p-4 flex items-center justify-between">
              <div>
                <h5 className="font-medium text-white">{node.name}</h5>
                <p className="text-sm text-neutral-400">
                  {node['network.host'] || 'localhost'}:{node['http.port'] || 'N/A'}
                </p>
                <p className="text-sm text-neutral-400">
                  Status: <span className={`font-medium ${node.isRunning ? 'text-green-400' : 'text-red-400'}`}>
                    {node.status}
                  </span>
                </p>
              </div>
              <div className="flex space-x-2">
                {node.isRunning ? (
                  <button
                    onClick={() => stopNode(node.name)}
                    className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
                  >
                    <FontAwesomeIcon icon={faStop} className="mr-1" />
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={() => startNode(node.name)}
                    className="bg-green-600 hover:bg-green-500 text-white px-3 py-1 rounded text-sm"
                  >
                    <FontAwesomeIcon icon={faPlay} className="mr-1" />
                    Start
                  </button>
                )}
                <button
                  onClick={() => deleteNode(node.name)}
                  className="bg-red-600 hover:bg-red-500 text-white px-3 py-1 rounded text-sm"
                >
                  <FontAwesomeIcon icon={faTrash} className="mr-1" />
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // Don't render if not open
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-85 flex items-center justify-center z-[60] p-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        // Only close if clicking the backdrop, not if focusing an input
        if (e.target === e.currentTarget && !Object.values(loadingStates).some(Boolean)) {
          onClose();
        }
      }}
    >
      <div className="bg-neutral-800 rounded-xl shadow-2xl w-full max-w-6xl border border-neutral-700 relative max-h-[95vh] flex flex-col">
        {/* Enhanced Loading Overlay */}
        <LoadingOverlay 
          show={Object.values(loadingStates).some(Boolean)} 
          message={
            loadingStates.systemInfo ? 'Detecting system information...' :
            loadingStates.installationGuide ? 'Generating installation guide...' :
            loadingStates.validation ? 'Validating Elasticsearch installation...' :
            loadingStates.connectionTest ? 'Testing connection to Elasticsearch...' :
            loadingStates.initialization ? 'Initializing setup...' :
            'Processing...'
          }
          details={
            loadingStates.systemInfo ? 'Scanning system configuration and requirements' :
            loadingStates.installationGuide ? 'Preparing platform-specific installation instructions' :
            loadingStates.validation ? 'Checking Elasticsearch files and configuration' :
            loadingStates.connectionTest ? 'Attempting to connect to Elasticsearch cluster' :
            loadingStates.initialization ? 'Finalizing setup and configuration' :
            undefined
          }
          progress={stepProgress[getCurrentStep()]?.progress}
        />

        {/* Header with enhanced controls */}
        <div className="flex items-center justify-between p-6 border-b border-neutral-700 flex-shrink-0">
          <div className="flex items-center">
            <FontAwesomeIcon icon={faCog} className="text-3xl text-blue-500 mr-3" />
            <div>
              <h2 className="text-2xl font-bold text-white">TrustQuery Setup Wizard</h2>
              <p className="text-neutral-400 text-sm">
                {setupType === 'vps-setup' 
                  ? 'Guided VPS setup for Elasticsearch installation and configuration'
                  : 'Configure your Elasticsearch cluster for TrustQuery'
                }
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Help Button */}
            <HelpTooltip 
              content={{
                text: "Use Ctrl+← and Ctrl+→ to navigate between steps. Press Ctrl+Enter to proceed when step is validated. Press Escape to close the wizard.",
                links: [
                  { text: "TrustQuery Documentation", url: "#" },
                  { text: "Elasticsearch Setup Guide", url: "https://www.elastic.co/guide/en/elasticsearch/reference/current/setup.html" }
                ]
              }}
              position="bottom"
              interactive={true}
            >
              <button className="text-neutral-400 hover:text-blue-400 transition-colors">
                <FontAwesomeIcon icon={faLightbulb} className="text-xl" />
              </button>
            </HelpTooltip>
            
            {/* Close Button */}
            <button
              onClick={onClose}
              disabled={Object.values(loadingStates).some(Boolean)}
              className="text-neutral-400 hover:text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <FontAwesomeIcon icon={faTimes} className="text-xl" />
            </button>
          </div>
        </div>

        {/* Main Content Area with Proper Scrolling */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <div className="p-6 overflow-y-auto flex-1">
            {/* Progress Indicator */}
            {setupType === 'vps-setup' && <ProgressIndicator />}

            {/* Step Content */}
            <div className="bg-neutral-900 rounded-lg p-6 min-h-96 relative">
            {setupType === 'vps-setup' ? (
              <>
            {currentStep === 1 && renderVPSSystemInfoStep()}
            {currentStep === 2 && renderVPSConfigurationStep()}
            {currentStep === 3 && renderVPSSetupCompleteStep()}
            {currentStep > 3 && (
              <div className="flex flex-col items-center justify-center min-h-64">
                <FontAwesomeIcon icon={faCheckCircle} className="text-5xl text-green-500 mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
                <p className="text-neutral-300 mb-4">TrustQuery is now configured and ready to use.</p>
                <button
                  onClick={onClose}
                  className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg"
                >
                  Close Wizard
                </button>
              </div>
            )}
              </>
            ) : (
              <>
                {currentStep === 1 && renderStep1()}
                {currentStep === 2 && renderStep2()}
                {currentStep === 3 && renderStep3()}
              </>
            )}
          </div>

          {/* Enhanced Footer with statistics */}
          <div className="mt-4 text-center space-y-2">
            
            {performanceMetrics.totalTime && (
              <div className="text-xs text-neutral-600">
                Setup time: {Math.floor(performanceMetrics.totalTime / 1000)}s
                {performanceMetrics.avgStepTime && ` • Avg step: ${Math.floor(performanceMetrics.avgStepTime / 1000)}s`}
              </div>
            )}
            
            {/* Quick actions */}
            <div className="flex items-center justify-center space-x-4 text-xs">
              
              {currentStep > 1 && setupType === 'vps-setup' && (
                <button
                  onClick={() => setCurrentStep(prev => Math.max(1, prev - 1))}
                  disabled={Object.values(loadingStates).some(Boolean)}
                  className="text-neutral-500 hover:text-blue-400 disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="mr-1" />
                  Previous
                </button>
              )}
              
              {setupType === 'vps-setup' && currentStep < 4 && stepProgress[currentStep]?.validated && (
                <button
                  onClick={() => setCurrentStep(prev => Math.min(4, prev + 1))}
                  disabled={Object.values(loadingStates).some(Boolean)}
                  className="text-neutral-500 hover:text-blue-400 disabled:opacity-50"
                >
                  Next
                  <FontAwesomeIcon icon={faArrowRight} className="ml-1" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
     </div>
  );
};

export default ClusterSetupWizard;
