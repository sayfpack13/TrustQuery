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
import buttonStyles from './ButtonStyles';

const ClusterSetupWizard = ({ isOpen, onClose, onComplete }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [systemInfo, setSystemInfo] = useState(null);
  const [basePath, setBasePath] = useState('');
  const [backendBasePath, setBackendBasePath] = useState('');
  const [validationResult, setValidationResult] = useState(null);
  const [loadingStates, setLoadingStates] = useState({
    systemInfo: false,
    validation: false,
    connectionTest: false,
    initialization: false
  });
  const [stepProgress, setStepProgress] = useState({
    1: { completed: false, validated: false, progress: 0 },
    2: { completed: false, validated: false, progress: 0 },
    3: { completed: false, validated: false, progress: 0 }
  });
  const [saveConflict, setSaveConflict] = useState(false);
  const [errors, setErrors] = useState({});
  const [retryCount, setRetryCount] = useState({});
  const [criticalError, setCriticalError] = useState(null);
  const [realtimeValidation, setRealtimeValidation] = useState({
    basePath: { valid: null, message: '', checking: false, suggestions: [] }
  });
  // Removed performanceMetrics state (no timing/metrics in minimal wizard)
  const [loading, setLoading] = useState(false);

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
    return currentStep;
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
          setBasePath(state.basePath || '');
          setStepProgress(state.stepProgress || {});
          // Removed setPerformanceMetrics (no metrics in minimal wizard)
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

  // Fetch backend-configured base path
  const fetchBackendBasePath = async () => {
    try {
      const response = await axiosClient.get('/api/admin/es/config/base-path');
      if (response.data && response.data.basePath) {
        setBackendBasePath(response.data.basePath);
        setBasePath((prev) => prev || response.data.basePath);
      }
    } catch (e) {
      // fallback: do nothing
    }
  };

  // Load saved state on mount
  useEffect(() => {
    if (isOpen) {
      loadSavedState();
      fetchBackendBasePath();
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
        if (currentStep < 4 && stepProgress[currentStep]?.validated) {
          setCurrentStep(prev => prev + 1);
        }
      } else if (event.key === 'ArrowRight' && event.ctrlKey) {
        // Ctrl+Right Arrow to go to next step
        if (currentStep < 4) {
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
  }, [isOpen, currentStep, stepProgress, loadingStates]);

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
    let progressInterval = null;
    try {
      // Removed trackStepTime (no metrics in minimal wizard)
      clearError(retryKey);
      // Add background task for system health monitoring
      // Removed addBackgroundTask (no background tasks in minimal wizard)
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
      // Removed setHealthChecks (no health checks in minimal wizard)
      updateStepProgress(step, { completed: true, validated: true, progress: 100 });
      // Removed trackStepTime (no metrics in minimal wizard)
      // Removed removeBackgroundTask (no background tasks in minimal wizard)
    } catch (error) {
      if (progressInterval) clearInterval(progressInterval);
      // Removed trackStepTime (no metrics in minimal wizard)
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
      
      // Only send elasticsearch base path entered by user
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
                    {/* Removed performanceMetrics display (no metrics in minimal wizard) */}
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

        {/* Removed Background Tasks Indicator (no background tasks in minimal wizard) */}

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


  // Enhanced loading overlay with progress animations and details
  const LoadingOverlay = ({ show, message, progress, details }) => {
    if (!show) return null;
    const displayProgress = progress !== undefined ? progress : 0;
    return (
      <div className="absolute inset-0 bg-black bg-opacity-85 flex items-center justify-center z-50 rounded-xl backdrop-blur-sm">
        <div className="bg-neutral-800 p-8 rounded-xl border border-neutral-700 text-center min-w-80 max-w-md shadow-2xl">
          {/* Main Loading Animation */}
          <div className="relative mb-6">
            <div className="w-16 h-16 mx-auto relative">
              <FontAwesomeIcon 
                icon={faCircleNotch} 
                spin 
                className="text-4xl text-blue-500 absolute inset-0 mx-auto my-auto" 
              />
              <div className="absolute inset-0 rounded-full border-4 border-blue-200 opacity-25 animate-pulse"></div>
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
          <div className="text-neutral-500 text-sm mt-4">Please wait...</div>
        </div>
      </div>
    );
  };

  // Removed all node/cluster management and setup guide fetching (minimal wizard)

  useEffect(() => {
    if (isOpen) {
      // Load system info on open
      fetchSystemInfo();
    }
  }, [isOpen]);

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



  // Removed all node management functions (minimal wizard)

  // Step 1: System Info
  const renderSystemInfoStep = () => (
    <div className="space-y-6">
      <div className="text-center">
        <FontAwesomeIcon icon={faServer} className="text-4xl text-blue-500 mb-4" />
        <h3 className="text-2xl font-bold text-white mb-2">Deployment Setup</h3>
        <p className="text-neutral-400">
          Configure TrustQuery for deployment on your machine (Windows/Linux/MacOS)
        </p>
      </div>

      {/* System Information + System Requirements Check */}
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

          {/* System Requirements Check */}
          {systemInfo.systemChecks && (
            <div className="mt-6">
              <h5 className="font-medium text-white mb-2">System Requirements Check</h5>
              <ul className="space-y-2">
                {/* Memory */}
                <li className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={systemInfo.systemChecks.checks.memory.pass ? faCheckCircle : faExclamationTriangle} className={systemInfo.systemChecks.checks.memory.pass ? 'text-green-400' : 'text-yellow-400'} />
                  <span className="text-sm text-neutral-300">Memory:</span>
                  <span className="text-sm text-neutral-400">{systemInfo.systemChecks.checks.memory.message}</span>
                  <span className="text-xs text-neutral-500 ml-2">(Required: 2GB, Recommended: 4GB+)</span>
                </li>
                {/* Java */}
                <li className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={systemInfo.systemChecks.checks.java.pass ? faCheckCircle : faExclamationTriangle} className={systemInfo.systemChecks.checks.java.pass ? 'text-green-400' : 'text-yellow-400'} />
                  <span className="text-sm text-neutral-300">Java:</span>
                  <span className="text-sm text-neutral-400">{systemInfo.systemChecks.checks.java.message}</span>
                  <span className="text-xs text-neutral-500 ml-2">(Required: 11+, Recommended: 17+)</span>
                </li>
                {/* Ports */}
                <li className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={systemInfo.systemChecks.checks.ports.pass ? faCheckCircle : faExclamationTriangle} className={systemInfo.systemChecks.checks.ports.pass ? 'text-green-400' : 'text-yellow-400'} />
                  <span className="text-sm text-neutral-300">Ports:</span>
                  <span className="text-sm text-neutral-400">{systemInfo.systemChecks.checks.ports.message}</span>
                  <span className="text-xs text-neutral-500 ml-2">(Required: 9200, 9300 open)</span>
                </li>
                {/* Permissions */}
                <li className="flex items-center space-x-2">
                  <FontAwesomeIcon icon={systemInfo.systemChecks.checks.permissions.pass ? faCheckCircle : faExclamationTriangle} className={systemInfo.systemChecks.checks.permissions.pass ? 'text-green-400' : 'text-yellow-400'} />
                  <span className="text-sm text-neutral-300">Permissions:</span>
                  <span className="text-sm text-neutral-400">{systemInfo.systemChecks.checks.permissions.message}</span>
                </li>
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="flex justify-between">
        <button
          onClick={onClose}
          className={buttonStyles.cancel }
        >
          Cancel
        </button>
        <button
          onClick={() => setCurrentStep(2)}
          disabled={!systemInfo || loading}
          className={buttonStyles.primary + " px-6 py-2 disabled:bg-neutral-600"}
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

  // Step 2: Configuration/Validation
  const renderConfigurationStep = () => (
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
              placeholder={backendBasePath || (systemInfo?.isWindows ? 'C:\\elasticsearch' : '/opt/elasticsearch')}
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
          {/* Backend-configured base path suggestion */}
          {backendBasePath && (
            <div className="mt-3">
              <p className="text-xs text-neutral-400 mb-2">Configured base path from backend:</p>
              <div className="flex flex-wrap gap-2">
                <button
                  key={backendBasePath}
                  onClick={() => setBasePath(backendBasePath)}
                  className="text-xs bg-neutral-800 hover:bg-neutral-600 text-neutral-300 px-2 py-1 rounded transition-colors"
                >
                  {backendBasePath}
                </button>
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
          className={buttonStyles.cancel + " px-6 py-2"}
        >
          Back
        </button>
        <button
          onClick={() => setCurrentStep(3)}
          disabled={!validationResult?.valid}
          className={buttonStyles.primary + " px-6 py-2 disabled:bg-neutral-600 disabled:cursor-not-allowed"}
        >
          Next: Complete Setup
        </button>
      </div>
    </div>
  );



  // VPS Setup Complete Step
  // Step 3: Complete Setup
  const renderCompleteStep = () => {
    const isDisabled = Object.values(loadingStates).some(Boolean) || loading;
    // Handler to show loader and close wizard after /initialize
    const handleCompleteSetup = async () => {
      setLoading(true);
      try {
        await initializeSetup();
        setTimeout(() => {
          setLoading(false);
          if (typeof onComplete === 'function') onComplete();
        }, 300);
      } catch (e) {
        setLoading(false);
        // Optionally show a minimal error, but do not block completion
      }
    };
    return (
      <div className="space-y-6" style={isDisabled ? { pointerEvents: 'none', opacity: 0.6 } : {}}>
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
            onClick={handleCompleteSetup}
            disabled={isDisabled || loading}
            className="w-full bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded-lg disabled:bg-neutral-600 text-lg font-semibold flex items-center justify-center"
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
      </div>
    );
  };



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
                Guided setup for Elasticsearch installation and configuration
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-3">
            {/* Help Button */}
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
            <ProgressIndicator />

            {/* Step Content */}
            <div className="bg-neutral-900 rounded-lg p-6 min-h-96 relative">
              {currentStep === 1 && renderSystemInfoStep()}
              {currentStep === 2 && renderConfigurationStep()}
              {currentStep === 3 && renderCompleteStep()}
              {currentStep > 3 && (
                <div className="flex flex-col items-center justify-center min-h-64">
                  <FontAwesomeIcon icon={faCheckCircle} className="text-5xl text-green-500 mb-4" />
                  <h2 className="text-2xl font-bold text-white mb-2">Setup Complete!</h2>
                  <p className="text-neutral-300 mb-4">TrustQuery is now configured and ready to use.</p>
                </div>
              )}
            </div>

            {/* Enhanced Footer with statistics */}
            <div className="mt-4 text-center space-y-2">
              <div className="text-red-400 text-sm font-semibold mb-2">
                The TrustQuery setup wizard must be completed before you can use the admin dashboard.<br />
                <span className="text-neutral-300 font-normal">Please follow the guided setup to configure your environment.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClusterSetupWizard;
