// VPS Setup Wizard for TrustQuery Elasticsearch Configuration
const { isFirstTimeUse } = require("../utils/firstTimeCheck");
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const os = require("os");
const { exec } = require("child_process");
const { promisify } = require("util");
const { verifyJwt } = require("../middleware/auth");
const { getConfig, setConfig } = require("../config");
const clusterManager = require("../elasticsearch/cluster-manager");

const router = express.Router();
const execAsync = promisify(exec);

// Detect OS and provide platform-specific configurations
function detectOS() {
  const platform = os.platform();
  const arch = os.arch();
  const release = os.release();
  
  return {
    platform,
    arch,
    release,
    isWindows: platform === 'win32',
    isLinux: platform === 'linux',
    isMacOS: platform === 'darwin',
    hostname: os.hostname(),
    totalMemory: os.totalmem(),
    freeMemory: os.freemem(),
    cpus: os.cpus().length
  };
}

// Get default paths based on OS
function getDefaultPaths(osInfo) {
  if (osInfo.isWindows) {
    return {
      elasticsearchBase: 'C:\\elasticsearch',
      javaHome: process.env.JAVA_HOME || 'C:\\Program Files\\Java\\jdk-17',
      dataPath: 'C:\\elasticsearch\\data',
      logsPath: 'C:\\elasticsearch\\logs',
      configPath: 'C:\\elasticsearch\\config',
      serviceName: 'elasticsearch'
    };
  } else if (osInfo.isLinux) {
    return {
      elasticsearchBase: '/opt/elasticsearch',
      javaHome: process.env.JAVA_HOME || '/usr/lib/jvm/java-17-openjdk',
      dataPath: '/var/lib/elasticsearch',
      logsPath: '/var/log/elasticsearch',
      configPath: '/etc/elasticsearch',
      serviceName: 'elasticsearch'
    };
  } else if (osInfo.isMacOS) {
    return {
      elasticsearchBase: '/usr/local/elasticsearch',
      javaHome: process.env.JAVA_HOME || '/Library/Java/JavaVirtualMachines/openjdk-17.jdk/Contents/Home',
      dataPath: '/usr/local/var/lib/elasticsearch',
      logsPath: '/usr/local/var/log/elasticsearch',
      configPath: '/usr/local/etc/elasticsearch',
      serviceName: 'elasticsearch'
    };
  }
  
  // Default fallback
  return {
    elasticsearchBase: '/opt/elasticsearch',
    javaHome: '/usr/lib/jvm/default-java',
    dataPath: '/var/lib/elasticsearch',
    logsPath: '/var/log/elasticsearch',
    configPath: '/etc/elasticsearch',
    serviceName: 'elasticsearch'
  };
}

// Check system requirements
async function checkSystemRequirements(osInfo) {
  const requirements = {
    memory: {
      required: 2 * 1024 * 1024 * 1024, // 2GB
      recommended: 4 * 1024 * 1024 * 1024, // 4GB
      available: osInfo.freeMemory,
      total: osInfo.totalMemory
    },
    disk: {
      required: 5 * 1024 * 1024 * 1024, // 5GB
      recommended: 20 * 1024 * 1024 * 1024 // 20GB
    },
    java: {
      required: '11',
      recommended: '17'
    },
    network: {
      requiredPorts: [9200, 9300],
      recommendedFirewall: true
    }
  };

  const checks = {
    memory: {
      pass: osInfo.totalMemory >= requirements.memory.required,
      recommended: osInfo.totalMemory >= requirements.memory.recommended,
      message: `Total: ${Math.round(osInfo.totalMemory / 1024 / 1024 / 1024)}GB, Available: ${Math.round(osInfo.freeMemory / 1024 / 1024 / 1024)}GB`
    },
    java: {
      pass: false,
      version: null,
      message: 'Java check pending'
    },
    ports: {
      pass: false,
      available: [],
      message: 'Port check pending'
    },
    permissions: {
      pass: false,
      message: 'Permission check pending'
    }
  };

  // Check Java installation
  try {
    const { stdout } = await execAsync('java -version');
    const versionMatch = stdout.match(/version "([^"]+)"/);
    if (versionMatch) {
      const version = versionMatch[1];
      checks.java.version = version;
      checks.java.pass = parseFloat(version) >= 11;
      checks.java.message = `Java ${version} found`;
    }
  } catch (error) {
    checks.java.message = 'Java not found or not in PATH';
  }

  // Check port availability
  try {
    for (const port of requirements.network.requiredPorts) {
      try {
        if (osInfo.isWindows) {
          await execAsync(`netstat -an | findstr :${port}`);
          checks.ports.available.push({ port, status: 'in-use' });
        } else {
          await execAsync(`netstat -an | grep :${port}`);
          checks.ports.available.push({ port, status: 'in-use' });
        }
      } catch {
        checks.ports.available.push({ port, status: 'available' });
      }
    }
    checks.ports.pass = checks.ports.available.every(p => p.status === 'available');
    checks.ports.message = `Ports ${checks.ports.available.map(p => `${p.port}:${p.status}`).join(', ')}`;
  } catch (error) {
    checks.ports.message = 'Could not check port availability';
  }

  // Check write permissions for default paths
  const defaultPaths = getDefaultPaths(osInfo);
  try {
    // Try to create a test directory in the base path
    const testDir = path.join(defaultPaths.elasticsearchBase, 'test-permissions');
    await fs.mkdir(testDir, { recursive: true });
    await fs.rmdir(testDir);
    checks.permissions.pass = true;
    checks.permissions.message = 'Write permissions available';
  } catch (error) {
    checks.permissions.message = `No write permissions: ${error.message}`;
  }

  return { requirements, checks };
}

// Generate installation commands based on OS
function generateInstallationCommands(osInfo, config) {
  const commands = {
    downloadElasticsearch: [],
    installJava: [],
    createDirectories: [],
    setPermissions: [],
    configureFirewall: [],
    startService: []
  };

  if (osInfo.isWindows) {
    commands.downloadElasticsearch = [
      '# Download Elasticsearch for Windows',
      'Invoke-WebRequest -Uri "https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.3-windows-x86_64.zip" -OutFile "elasticsearch.zip"',
      'Expand-Archive -Path "elasticsearch.zip" -DestinationPath "C:\\"',
      'Rename-Item -Path "C:\\elasticsearch-8.11.3" -NewName "elasticsearch"',
      '# Alternative: Download manually from https://www.elastic.co/downloads/elasticsearch'
    ];

    commands.installJava = [
      '# Install Java 17+ (required for Elasticsearch 8.x)',
      'winget install Eclipse.Temurin.17.JDK',
      '# Or download from: https://adoptium.net/temurin/releases/',
      '# Verify installation: java -version'
    ];

    commands.createDirectories = [
      `New-Item -ItemType Directory -Force -Path "${config.dataPath}"`,
      `New-Item -ItemType Directory -Force -Path "${config.logsPath}"`,
      `New-Item -ItemType Directory -Force -Path "${config.configPath}"`,
      '# Directories will be created automatically on first run if they don\'t exist'
    ];

    commands.configureFirewall = [
      'New-NetFirewallRule -DisplayName "Elasticsearch HTTP" -Direction Inbound -Protocol TCP -LocalPort 9200 -Action Allow',
      'New-NetFirewallRule -DisplayName "Elasticsearch Transport" -Direction Inbound -Protocol TCP -LocalPort 9300 -Action Allow'
    ];

    commands.startService = [
      `cd "${config.elasticsearchBase}"`,
      'bin\\elasticsearch.bat'
    ];
  } else if (osInfo.isLinux) {
    const isDebian = false; // TODO: Detect actual distro
    const isRHEL = false;

    if (isDebian) {
      commands.downloadElasticsearch = [
        '# Download and install Elasticsearch (Debian/Ubuntu)',
        'wget -qO - https://artifacts.elastic.co/GPG-KEY-elasticsearch | sudo apt-key add -',
        'echo "deb https://artifacts.elastic.co/packages/8.x/apt stable main" | sudo tee /etc/apt/sources.list.d/elastic-8.x.list',
        'sudo apt-get update',
        'sudo apt-get install elasticsearch'
      ];

      commands.installJava = [
        'sudo apt-get update',
        'sudo apt-get install openjdk-17-jdk'
      ];
    } else {
      commands.downloadElasticsearch = [
        '# Download Elasticsearch (Generic Linux)',
        'wget https://artifacts.elastic.co/downloads/elasticsearch/elasticsearch-8.11.3-linux-x86_64.tar.gz',
        'tar -xzf elasticsearch-8.11.3-linux-x86_64.tar.gz',
        `sudo mv elasticsearch-8.11.3 ${config.elasticsearchBase}`
      ];

      commands.installJava = [
        '# Install Java 17+ (Generic Linux)',
        'sudo yum install java-17-openjdk-devel',
        '# Or for Debian/Ubuntu: sudo apt-get install openjdk-17-jdk',
        '# Verify installation: java -version'
      ];
    }

    commands.createDirectories = [
      `sudo mkdir -p ${config.dataPath}`,
      `sudo mkdir -p ${config.logsPath}`,
      `sudo mkdir -p ${config.configPath}`,
      `sudo chown -R elasticsearch:elasticsearch ${config.dataPath}`,
      `sudo chown -R elasticsearch:elasticsearch ${config.logsPath}`
    ];

    commands.setPermissions = [
      'sudo useradd elasticsearch',
      `sudo chown -R elasticsearch:elasticsearch ${config.elasticsearchBase}`,
      `sudo chmod -R 755 ${config.elasticsearchBase}`
    ];

    commands.configureFirewall = [
      'sudo ufw allow 9200/tcp',
      'sudo ufw allow 9300/tcp',
      '# Or for CentOS/RHEL: sudo firewall-cmd --permanent --add-port=9200/tcp',
      '# sudo firewall-cmd --permanent --add-port=9300/tcp',
      '# sudo firewall-cmd --reload'
    ];

    commands.startService = [
      'sudo systemctl daemon-reload',
      'sudo systemctl enable elasticsearch',
      'sudo systemctl start elasticsearch'
    ];
  }

  return commands;
}

// GET system information
router.get('/system-info', verifyJwt, async (req, res) => {
  try {
    const osInfo = detectOS();
    const defaultPaths = getDefaultPaths(osInfo);
    const systemChecks = await checkSystemRequirements(osInfo);

    res.json({
      os: osInfo,
      defaultPaths,
      systemChecks,
      recommendations: {
        memory: osInfo.totalMemory >= 4 * 1024 * 1024 * 1024 ? 'sufficient' : 'upgrade-recommended',
        storage: 'external-check-required',
        security: 'firewall-configuration-recommended'
      }
    });
  } catch (error) {
    console.error('Error getting system info:', error);
    res.status(500).json({ error: 'Failed to get system information', details: error.message });
  }
});

// GET installation guide
router.get('/installation-guide/:os', verifyJwt, async (req, res) => {
  try {
    const { os } = req.params;
    const osInfo = detectOS();
    const customPaths = req.query;
    
    // Use custom paths if provided, otherwise use defaults
    const config = {
      ...getDefaultPaths(osInfo),
      ...customPaths
    };

    const commands = generateInstallationCommands(osInfo, config);
    
    const guide = {
      os: os,
      currentOS: osInfo.platform,
      steps: [
        {
          step: 1,
          title: 'System Preparation',
          description: 'Ensure your system meets the requirements',
          commands: [
            '# Check system requirements',
            `# RAM: ${Math.round(osInfo.totalMemory / 1024 / 1024 / 1024)}GB available`,
            `# CPU: ${osInfo.cpus} cores`,
            '# Minimum: 2GB RAM, 5GB disk space',
            '# Recommended: 4GB+ RAM, 20GB+ disk space'
          ]
        },
        {
          step: 2,
          title: 'Install Java',
          description: 'Java 11+ is required for Elasticsearch',
          commands: commands.installJava
        },
        {
          step: 3,
          title: 'Download Elasticsearch',
          description: 'Download and extract Elasticsearch',
          commands: commands.downloadElasticsearch
        },
        {
          step: 4,
          title: 'Create Directories',
          description: 'Create required directories with proper permissions',
          commands: commands.createDirectories
        },
        {
          step: 5,
          title: 'Set Permissions',
          description: 'Configure file permissions and ownership',
          commands: commands.setPermissions
        },
        {
          step: 6,
          title: 'Configure Firewall',
          description: 'Open required ports for Elasticsearch',
          commands: commands.configureFirewall
        },
        {
          step: 7,
          title: 'Start Elasticsearch',
          description: 'Start the Elasticsearch service',
          commands: commands.startService
        }
      ],
      config,
      validation: {
        testConnection: `curl -X GET "localhost:9200/_cluster/health?pretty"`,
        checkLogs: osInfo.isWindows ? 
          `type "${config.logsPath}\\elasticsearch.log"` : 
          `tail -f ${config.logsPath}/elasticsearch.log`
      }
    };

    res.json(guide);
  } catch (error) {
    console.error('Error generating installation guide:', error);
    res.status(500).json({ error: 'Failed to generate installation guide', details: error.message });
  }
});

// POST comprehensive validation (combines path and config validation)
router.post('/validate-elasticsearch', verifyJwt, async (req, res) => {
  try {
    const { basePath } = req.body;
    const osInfo = detectOS();
    
    const validation = {
      valid: false,
      errors: [],
      warnings: [],
      detectedPaths: {},
      elasticsearchInfo: {},
      checks: {},
      pathValidation: {
        exists: false,
        isDirectory: false,
        writable: false,
        suggestions: []
      }
    };

    if (!basePath) {
      validation.errors.push('Elasticsearch base path is required');
      validation.pathValidation.suggestions = osInfo.isWindows 
        ? ['C:\\elasticsearch', 'C:\\Program Files\\Elasticsearch', 'D:\\elasticsearch']
        : ['/opt/elasticsearch', '/usr/share/elasticsearch', '/home/elasticsearch'];
      return res.json(validation);
    }

    // Basic path format validation
    const isValidFormat = osInfo.isWindows 
      ? /^[a-zA-Z]:\\/.test(basePath) 
      : /^\//.test(basePath);

    if (!isValidFormat) {
      validation.errors.push(osInfo.isWindows 
        ? 'Path must start with a drive letter (e.g., C:\\)' 
        : 'Path must start with root directory (/)');
      validation.pathValidation.suggestions = osInfo.isWindows 
        ? ['C:\\elasticsearch', 'D:\\elasticsearch'] 
        : ['/opt/elasticsearch', '/usr/share/elasticsearch'];
      return res.json(validation);
    }

    // Check if path is absolute
    if (!path.isAbsolute(basePath)) {
      validation.errors.push('Base path must be an absolute path');
      return res.json(validation);
    }

    // Check if base path exists
    try {
      const stats = await fs.stat(basePath);
      validation.pathValidation.exists = true;
      validation.pathValidation.isDirectory = stats.isDirectory();
      
      if (!stats.isDirectory()) {
        validation.errors.push('Base path must be a directory');
        return res.json(validation);
      }
    } catch (error) {
      validation.pathValidation.exists = false;
      validation.errors.push(`Base path does not exist: ${basePath}`);
      
      // Check if parent directory exists for suggestions
      const parentDir = path.dirname(basePath);
      try {
        await fs.stat(parentDir);
        validation.pathValidation.suggestions.push('Path can be created (parent directory exists)');
      } catch {
        validation.pathValidation.suggestions.push('Parent directory does not exist');
      }
      return res.json(validation);
    }

    // Auto-detect Elasticsearch structure based on base path
    const detectedPaths = {
      base: basePath,
      bin: path.join(basePath, 'bin'),
      config: path.join(basePath, 'config'),
      data: path.join(basePath, 'data'),
      logs: path.join(basePath, 'logs'),
      lib: path.join(basePath, 'lib'),
      plugins: path.join(basePath, 'plugins')
    };

    // Define required files for Elasticsearch validation with better detection
    const requiredFiles = {
      elasticsearch_executable: osInfo.isWindows 
        ? [
            path.join(detectedPaths.bin, 'elasticsearch.bat'),
            path.join(detectedPaths.bin, 'elasticsearch.cmd')
          ]
        : [
            path.join(detectedPaths.bin, 'elasticsearch'),
            path.join(detectedPaths.bin, 'elasticsearch.sh')
          ],
      elasticsearch_yml: path.join(detectedPaths.config, 'elasticsearch.yml'),
      jvm_options: path.join(detectedPaths.config, 'jvm.options'),
      log4j_config: [
        path.join(detectedPaths.config, 'log4j2.properties'),
        path.join(detectedPaths.config, 'log4j.properties')
      ]
    };

    // Helper function to check multiple possible file paths
    const checkFileExists = async (filePaths) => {
      const paths = Array.isArray(filePaths) ? filePaths : [filePaths];
      for (const filePath of paths) {
        try {
          const stats = await fs.stat(filePath);
          return { 
            path: filePath, 
            exists: true, 
            size: stats.size,
            isFile: stats.isFile(),
            isExecutable: !osInfo.isWindows && (stats.mode & parseInt('111', 8)) !== 0
          };
        } catch (error) {
          // Continue to next path
        }
      }
      return { 
        path: Array.isArray(filePaths) ? filePaths[0] : filePaths, 
        exists: false, 
        error: 'File not found in any expected location'
      };
    };

    // Check for Elasticsearch files with improved detection
    for (const [key, filePaths] of Object.entries(requiredFiles)) {
      const result = await checkFileExists(filePaths);
      validation.checks[key] = result;
      
      if (!result.exists) {
        if (key === 'elasticsearch_executable') {
          validation.errors.push(`Elasticsearch executable not found. Expected locations: ${Array.isArray(filePaths) ? filePaths.join(' or ') : filePaths}`);
        } else if (key === 'elasticsearch_yml') {
          validation.errors.push(`Elasticsearch configuration file not found: ${result.path}`);
        } else {
          validation.warnings.push(`Optional file not found: ${result.path}`);
        }
      } else {
        // Additional validation for executable
        if (key === 'elasticsearch_executable' && !osInfo.isWindows && !result.isExecutable) {
          validation.warnings.push(`Elasticsearch executable may not have execute permissions: ${result.path}`);
        }
      }
    }

    // Check directory structure
    for (const [dirName, dirPath] of Object.entries(detectedPaths)) {
      try {
        const stats = await fs.stat(dirPath);
        validation.checks[`${dirName}_dir`] = { 
          path: dirPath, 
          exists: true, 
          isDirectory: stats.isDirectory(),
          writable: false
        };

        // Test write permissions for data and logs directories
        if (dirName === 'data' || dirName === 'logs') {
          try {
            const testFile = path.join(dirPath, '.write-test-' + Date.now());
            await fs.writeFile(testFile, 'test');
            await fs.unlink(testFile);
            validation.checks[`${dirName}_dir`].writable = true;
          } catch (writeError) {
            validation.checks[`${dirName}_dir`].writable = false;
            validation.warnings.push(`No write permission for ${dirName} directory: ${dirPath}`);
          }
        }
      } catch (error) {
        validation.checks[`${dirName}_dir`] = { 
          path: dirPath, 
          exists: false, 
          error: error.code 
        };
        
        if (dirName === 'bin' || dirName === 'config') {
          validation.errors.push(`Required directory not found: ${dirPath}`);
        } else {
          validation.warnings.push(`Directory not found (will be created): ${dirPath}`);
        }
      }
    }

    // Try to detect Elasticsearch version with improved command execution
    try {
      if (validation.checks.elasticsearch_executable.exists) {
        const executablePath = validation.checks.elasticsearch_executable.path;
        
        // Different approaches to get version
        const versionCommands = [
          `"${executablePath}" --version`,
          `"${executablePath}" -V`,
          osInfo.isWindows ? `powershell -Command "& '${executablePath}' --version"` : `bash -c '"${executablePath}" --version'`
        ];
        
        let versionDetected = false;
        for (const versionCommand of versionCommands) {
          try {
            const { stdout, stderr } = await execAsync(versionCommand, { 
              timeout: 15000,
              env: { ...process.env, ES_JAVA_OPTS: '-Xms64m -Xmx64m' } // Minimal memory for version check
            });
            
            const output = stdout + stderr;
            const versionMatch = output.match(/Version: ([^\s,\n]+)|elasticsearch[:\s]+([^\s,\n]+)/i);
            if (versionMatch) {
              validation.elasticsearchInfo.version = versionMatch[1] || versionMatch[2];
              validation.elasticsearchInfo.detected = true;
              versionDetected = true;
              break;
            }
          } catch (cmdError) {
            // Continue to next command
            console.log(`Version command failed: ${versionCommand}`, cmdError.message);
          }
        }
        
        if (!versionDetected) {
          validation.warnings.push('Could not detect Elasticsearch version - this may indicate a configuration issue');
        }
      }
    } catch (error) {
      validation.warnings.push('Could not detect Elasticsearch version: ' + error.message);
      validation.elasticsearchInfo.detected = false;
    }

    // Try to read existing configuration
    try {
      if (validation.checks.elasticsearch_yml.exists) {
        const configContent = await fs.readFile(requiredFiles.elasticsearch_yml, 'utf8');
        const config = {};
        
        // Simple YAML parsing for common settings
        const lines = configContent.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed && !trimmed.startsWith('#')) {
            const [key, ...valueParts] = trimmed.split(':');
            if (key && valueParts.length > 0) {
              const value = valueParts.join(':').trim();
              config[key.trim()] = value;
            }
          }
        }
        
        validation.elasticsearchInfo.currentConfig = config;
        validation.elasticsearchInfo.configDetected = true;
      }
    } catch (error) {
      validation.warnings.push('Could not read existing Elasticsearch configuration');
    }

    // Store detected paths for frontend use
    validation.detectedPaths = detectedPaths;

    // Determine if validation passed
    const hasRequiredFiles = validation.checks.elasticsearch_executable.exists && 
                            validation.checks.elasticsearch_yml.exists;
    const hasRequiredDirs = validation.checks.bin_dir.exists && 
                           validation.checks.config_dir.exists;

    validation.valid = hasRequiredFiles && hasRequiredDirs && validation.errors.length === 0;

    if (validation.valid) {
      validation.message = 'Elasticsearch installation detected and validated successfully';
    } else if (validation.errors.length === 0 && validation.warnings.length > 0) {
      validation.message = 'Elasticsearch installation detected with warnings';
    } else {
      validation.message = 'Elasticsearch installation validation failed';
    }

    res.json(validation);
  } catch (error) {
    console.error('Error validating configuration:', error);
    res.status(500).json({ error: 'Failed to validate configuration', details: error.message });
  }
});

// POST initialize setup
router.post('/initialize', verifyJwt, async (req, res) => {
  try {
    const { basePath, skipElasticsearchInstall } = req.body;
    const osInfo = detectOS();
    if (!basePath) {
      return res.status(400).json({ error: 'Elasticsearch base path is required' });
    }

    // Auto-detect paths based on base path
    const detectedPaths = {
      elasticsearchBase: basePath,
      binPath: path.join(basePath, 'bin'),
      configPath: path.join(basePath, 'config'),
      dataPath: path.join(basePath, 'data'),
      logsPath: path.join(basePath, 'logs'),
      libPath: path.join(basePath, 'lib'),
      pluginsPath: path.join(basePath, 'plugins')
    };

    // Update cluster manager base path
    clusterManager.baseElasticsearchPath = basePath;


    // Save configuration using setConfig to persist changes
    const { setConfig } = require("../config");
    await setConfig({
      'setupWizard': {
        completed: true,
        completedAt: new Date().toISOString(),
        os: osInfo.platform,
        basePath: basePath,
        detectedPaths: detectedPaths,
        skipElasticsearchInstall: skipElasticsearchInstall || false
      },
      'elasticsearchConfig.basePath': basePath,
      'elasticsearchConfig.configFilePath': path.join(detectedPaths.configPath, 'elasticsearch.yml'),
      'elasticsearchConfig.dataPath': detectedPaths.dataPath,
      'elasticsearchConfig.logsPath': detectedPaths.logsPath,
      'elasticsearchConfig.jvmOptionsPath': path.join(detectedPaths.configPath, 'jvm.options'),
      'elasticsearchConfig.executable': osInfo.isWindows 
        ? path.join(detectedPaths.binPath, 'elasticsearch.bat')
        : path.join(detectedPaths.binPath, 'elasticsearch')
    });

    // Mark first run complete (create .first_run file)
    const { markFirstRunComplete } = require("../utils/firstTimeCheck");
    markFirstRunComplete();

    // Create necessary directories if they don't exist
    const directoriesToCreate = [
      detectedPaths.dataPath,
      detectedPaths.logsPath
    ];

    for (const dir of directoriesToCreate) {
      try {
        await fs.mkdir(dir, { recursive: true });
        console.log(`Created directory: ${dir}`);
      } catch (error) {
        if (error.code !== 'EEXIST') {
          console.warn(`Warning: Could not create directory ${dir}:`, error.message);
        }
      }
    }

    console.log('[SetupWizard] Setup completed and config saved:', {
      basePath,
      detectedPaths
    });

    res.json({
      success: true,
      message: 'Setup wizard completed successfully',
      config: {
        basePath: basePath,
        detectedPaths: detectedPaths,
        os: osInfo.platform
      }
    });
  } catch (error) {
    console.error('Error initializing setup:', error);
    res.status(500).json({ error: 'Failed to initialize setup', details: error.message });
  }
});

// GET current setup status
router.get('/status', verifyJwt, async (req, res) => {
  try {
    const config = getConfig();
    const setupConfig = config.setupWizard || {};
    const osInfo = detectOS();

    // Check if setup was completed
    const isCompleted = setupConfig.completed || false;

    // Check current system status
    const systemChecks = await checkSystemRequirements(osInfo);

    // Check if Elasticsearch is running
    let elasticsearchStatus = 'not-installed';

    try {
      const { getES, isElasticsearchAvailable } = require('../elasticsearch/client');
      const isAvailable = await isElasticsearchAvailable();
      elasticsearchStatus = isAvailable ? 'running' : 'installed-not-running';
    } catch (error) {
      elasticsearchStatus = 'not-installed';
    }

    // Detect first time use (file-based, not just config)
    const isFirstTime = isFirstTimeUse() && !isCompleted;

    res.json({
      setupCompleted: isCompleted,
      setupConfig,
      currentOS: osInfo,
      systemChecks,
      elasticsearchStatus,
      recommendations: generateRecommendations(systemChecks, elasticsearchStatus),
      isFirstTimeUse: isFirstTime
    });
  } catch (error) {
    console.error('Error getting setup status:', error);
    res.status(500).json({ error: 'Failed to get setup status', details: error.message });
  }
});

// Generate recommendations based on system status
function generateRecommendations(systemChecks, elasticsearchStatus) {
  const recommendations = [];

  if (!systemChecks.checks.memory.pass) {
    recommendations.push({
      priority: 'high',
      category: 'memory',
      message: 'Insufficient memory detected. Consider upgrading to at least 2GB RAM.',
      action: 'upgrade-memory'
    });
  }

  if (!systemChecks.checks.java.pass) {
    recommendations.push({
      priority: 'high',
      category: 'java',
      message: 'Java 11+ is required. Install OpenJDK 17 for best performance.',
      action: 'install-java'
    });
  }

  if (!systemChecks.checks.ports.pass) {
    recommendations.push({
      priority: 'medium',
      category: 'network',
      message: 'Required ports (9200, 9300) are in use. Consider stopping conflicting services.',
      action: 'configure-ports'
    });
  }

  if (!systemChecks.checks.permissions.pass) {
    recommendations.push({
      priority: 'high',
      category: 'permissions',
      message: 'Insufficient write permissions. Run as administrator or adjust directory permissions.',
      action: 'fix-permissions'
    });
  }

  if (elasticsearchStatus === 'not-installed') {
    recommendations.push({
      priority: 'high',
      category: 'elasticsearch',
      message: 'Elasticsearch is not installed. Follow the installation guide for your OS.',
      action: 'install-elasticsearch'
    });
  } else if (elasticsearchStatus === 'installed-not-running') {
    recommendations.push({
      priority: 'medium',
      category: 'elasticsearch',
      message: 'Elasticsearch is installed but not running. Start the service.',
      action: 'start-elasticsearch'
    });
  }

  return recommendations;
}

// POST test connection to Elasticsearch
router.post('/test-connection', verifyJwt, async (req, res) => {
  try {
    const { host = 'localhost', port = 9200 } = req.body;
    
    const testUrl = `http://${host}:${port}`;
    const { getES, isElasticsearchAvailable } = require('../elasticsearch/client');
    
    // Try to connect
    const isAvailable = await isElasticsearchAvailable();
    
    if (isAvailable) {
      const es = getES();
      const health = await es.cluster.health();
      const info = await es.info();
      
      res.json({
        connected: true,
        url: testUrl,
        cluster: {
          name: health.cluster_name,
          status: health.status,
          nodes: health.number_of_nodes
        },
        version: info.version.number,
        message: 'Successfully connected to Elasticsearch'
      });
    } else {
      res.json({
        connected: false,
        url: testUrl,
        message: 'Could not connect to Elasticsearch. Check if the service is running.'
      });
    }
  } catch (error) {
    console.error('Error testing connection:', error);
    res.json({
      connected: false,
      url: `http://${req.body.host || 'localhost'}:${req.body.port || 9200}`,
      message: `Connection failed: ${error.message}`
    });
  }
});

module.exports = router;
