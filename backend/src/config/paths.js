const os = require('os');
const path = require('path');

/**
 * Get the application data directory based on OS conventions
 */
function getAppDataDir() {
  const appName = 'trustquery';
  
  if (process.platform === 'win32') {
    // Windows: Use %APPDATA% or user home directory
    return process.env.TRUSTQUERY_DATA_DIR || 
           process.env.APPDATA ? path.join(process.env.APPDATA, appName) :
           path.join(os.homedir(), 'AppData', 'Roaming', appName);
  } else if (process.platform === 'darwin') {
    // macOS: Use ~/Library/Application Support
    return process.env.TRUSTQUERY_DATA_DIR ||
           path.join(os.homedir(), 'Library', 'Application Support', appName);
  } else {
    // Linux/Unix: Use XDG_DATA_HOME or ~/.local/share
    return process.env.TRUSTQUERY_DATA_DIR ||
           process.env.XDG_DATA_HOME ? path.join(process.env.XDG_DATA_HOME, appName) :
           path.join(os.homedir(), '.local', 'share', appName);
  }
}

/**
 * Get the default Elasticsearch paths based on OS conventions and environment variables
 */
function getElasticsearchPaths() {
  const platform = process.platform;
  const isDocker = process.env.CONTAINER_ENV === 'docker';
  const userHome = os.homedir();
  
  // Base paths can be overridden by environment variables
  const baseDir = process.env.ES_HOME || (platform === 'win32' ? 
    path.join(userHome, '.elasticsearch') :
    isDocker ? '/usr/share/elasticsearch' : '/opt/elasticsearch'
  );

  // Data directory can be on a different volume
  const dataDir = process.env.ES_DATA_DIR || (platform === 'win32' ?
    path.join(baseDir, 'data') :
    isDocker ? '/var/lib/elasticsearch' : '/var/lib/elasticsearch'
  );

  // Logs directory can be on a different volume
  const logsDir = process.env.ES_LOGS_DIR || (platform === 'win32' ?
    path.join(baseDir, 'logs') :
    isDocker ? '/var/log/elasticsearch' : '/var/log/elasticsearch'
  );

  // Config directory
  const configDir = process.env.ES_CONFIG_DIR || (platform === 'win32' ?
    path.join(baseDir, 'config') :
    isDocker ? '/etc/elasticsearch' : '/etc/elasticsearch'
  );

  return {
    base: baseDir,
    data: dataDir,
    logs: logsDir,
    config: configDir,
    plugins: path.join(baseDir, 'plugins'),
    bin: path.join(baseDir, 'bin')
  };
}

/**
 * Get Java home directory from environment or default locations
 */
function getJavaHome() {
  if (process.env.JAVA_HOME) {
    return process.env.JAVA_HOME;
  }

  const platform = process.platform;
  if (platform === 'win32') {
    // Check common Windows Java locations
    const windowsJavaLocations = [
      'C:\\Program Files\\Java',
      'C:\\Program Files (x86)\\Java',
      path.join(os.homedir(), 'java')
    ];
    
    for (const baseDir of windowsJavaLocations) {
      try {
        const versions = require('fs').readdirSync(baseDir);
        const jdkDirs = versions.filter(v => v.startsWith('jdk'));
        if (jdkDirs.length > 0) {
          // Use the highest version
          const latest = jdkDirs.sort().pop();
          return path.join(baseDir, latest);
        }
      } catch (err) {
        // Directory doesn't exist or can't be read
        continue;
      }
    }
  } else if (platform === 'darwin') {
    // macOS Java locations
    return '/Library/Java/JavaVirtualMachines/openjdk.jdk/Contents/Home';
  } else {
    // Linux/Unix Java locations
    return '/usr/lib/jvm/java-17-openjdk';
  }

  // Fallback
  return platform === 'win32' ? 
    'C:\\Program Files\\Java\\jdk-17' : 
    '/usr/lib/jvm/java-17-openjdk';
}

/**
 * Get all application paths
 */
function getPaths() {
  const appDataDir = getAppDataDir();
  const elasticsearchPaths = getElasticsearchPaths();
  const javaHome = getJavaHome();

  return {
    app: {
      data: appDataDir,
      config: path.join(appDataDir, 'config'),
      cache: path.join(appDataDir, 'cache'),
      logs: path.join(appDataDir, 'logs')
    },
    elasticsearch: elasticsearchPaths,
    java: {
      home: javaHome
    }
  };
}

module.exports = {
  getAppDataDir,
  getElasticsearchPaths,
  getJavaHome,
  getPaths
}; 