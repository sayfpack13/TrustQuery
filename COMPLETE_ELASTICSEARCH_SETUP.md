# Complete Elasticsearch Multi-Node Setup Guide

## The Issue You Encountered

The error `ERROR: Missing logging config file at C:\elasticsearch\config\node-1\log4j2.properties` occurs because Elasticsearch requires specific configuration files for each node, including logging configuration.

## Complete Setup Process

### 1. Create Directory Structure

First, create the proper directory structure for multi-node setup:

```
C:\elasticsearch\
├── bin\                          (Elasticsearch binaries)
├── lib\                          (Elasticsearch libraries) 
├── config\                       (Node configurations)
│   ├── node-1\
│   │   ├── elasticsearch.yml
│   │   ├── jvm.options
│   │   ├── log4j2.properties    (THIS WAS MISSING!)
│   │   └── start-node.bat
│   ├── node-2\
│   │   ├── elasticsearch.yml
│   │   ├── jvm.options
│   │   ├── log4j2.properties
│   │   └── start-node.bat
│   └── node-3\
│       ├── elasticsearch.yml
│       ├── jvm.options
│       ├── log4j2.properties
│       └── start-node.bat
├── data\                         (Data directories)
│   ├── node-1\
│   ├── node-2\
│   └── node-3\
└── logs\                         (Log directories)
    ├── node-1\
    ├── node-2\
    └── node-3\
```

### 2. Required Configuration Files

#### For Node 1 (`C:\elasticsearch\config\node-1\`)

**elasticsearch.yml:**
```yaml
# Cluster settings
cluster.name: trustquery-cluster
node.name: node-1

# Network settings
network.host: localhost
http.port: 9200
transport.port: 9300

# Path settings
path.data: C:\elasticsearch\data\node-1
path.logs: C:\elasticsearch\logs\node-1

# Node roles
node.roles: [master, data, ingest]

# Discovery settings
discovery.seed_hosts: ["localhost:9300", "localhost:9301", "localhost:9302"]
cluster.initial_master_nodes: ["node-1"]

# Security settings
xpack.security.enabled: false
bootstrap.memory_lock: false
```

**jvm.options:**
```
# Heap size
-Xms1g
-Xmx1g

# GC Settings
-XX:+UseG1GC
-XX:G1HeapRegionSize=4m

# Memory
-XX:+HeapDumpOnOutOfMemoryError
-XX:HeapDumpPath=C:\elasticsearch\data\node-1

# Locale
-Dfile.encoding=UTF-8
-Duser.timezone=UTC
```

**log4j2.properties:**
```properties
# Log4j2 Configuration for Node 1

status = error
name = ESJsonLayout

# Console appender
appender.console.type = Console
appender.console.name = console
appender.console.layout.type = PatternLayout
appender.console.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %m%n

# Rolling file appender
appender.rolling.type = RollingFile
appender.rolling.name = rolling
appender.rolling.fileName = C:/elasticsearch/logs/node-1/elasticsearch.log
appender.rolling.filePattern = C:/elasticsearch/logs/node-1/elasticsearch-%i.log.gz
appender.rolling.layout.type = PatternLayout
appender.rolling.layout.pattern = [%d{ISO8601}][%-5p][%-25c{1.}] [%node_name]%marker %m%n
appender.rolling.policies.type = Policies
appender.rolling.policies.size.type = SizeBasedTriggeringPolicy
appender.rolling.policies.size.size = 128MB
appender.rolling.strategy.type = DefaultRolloverStrategy
appender.rolling.strategy.max = 32

# Root logger
rootLogger.level = info
rootLogger.appenderRef.console.ref = console
rootLogger.appenderRef.rolling.ref = rolling
```

**start-node.bat:**
```batch
@echo off
REM Start Elasticsearch Node 1

echo Starting Elasticsearch node-1...
echo Config directory: C:\elasticsearch\config\node-1
echo Port: 9200

REM Set environment variables
set ES_HOME=C:\elasticsearch
set ES_PATH_CONF=C:\elasticsearch\config\node-1
set ES_JAVA_OPTS=-Xms1g -Xmx1g

REM Start Elasticsearch
"%ES_HOME%\bin\elasticsearch.bat"

pause
```

### 3. For Additional Nodes

Repeat the same configuration for node-2 and node-3, changing:
- `node.name: node-2` / `node-3`
- `http.port: 9201` / `9202`
- `transport.port: 9301` / `9302`
- Update all paths to reference the correct node directory

### 4. Using TrustQuery's Cluster Setup

The **good news** is that TrustQuery now automatically creates all these files for you! I've just fixed the backend to include the missing `log4j2.properties` file.

#### To use TrustQuery's cluster setup:

1. **Go to Admin Dashboard** → **Cluster Management** tab
2. **Click "Setup New Cluster"** button  
3. **Follow the wizard** to:
   - Choose development or production setup
   - Configure node names, ports, and paths
   - TrustQuery will create all config files automatically
4. **Start nodes** using the generated batch files or through the UI

### 5. Manual Setup (Alternative)

If you prefer manual setup:

1. **Create directories** as shown above
2. **Copy the configuration files** from the templates above
3. **Adjust paths and ports** for each node
4. **Run the start-node.bat files** or use TrustQuery's UI

### 6. Verification

After starting nodes:

1. **Check cluster health:**
   ```
   curl http://localhost:9200/_cluster/health
   ```

2. **List all nodes:**
   ```
   curl http://localhost:9200/_cat/nodes?v
   ```

3. **In TrustQuery:** Go to Cluster Management and click "Refresh" to see all active nodes

### 7. Troubleshooting

If you still get the log4j2.properties error:

1. **Ensure the file exists** in the node-specific config directory
2. **Check the ES_PATH_CONF** environment variable points to the right directory
3. **Verify file permissions** - Elasticsearch needs read access
4. **Use TrustQuery's cluster setup** which now creates all required files

### 8. Data Management

Once your cluster is running:

1. **Create indices** through TrustQuery's Elasticsearch Management tab
2. **Upload documents** through the File Management tab
3. **Monitor disk usage** in the Cluster Management tab
4. **Set preferred disk paths** for each node

This complete setup ensures all required files are present and your multi-node Elasticsearch cluster will start successfully!
