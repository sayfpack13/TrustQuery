# TrustQuery Elasticsearch Cluster Management Guide

## Understanding Elasticsearch Clusters

### What is an Elasticsearch Cluster?
An Elasticsearch cluster is a collection of one or more nodes (servers) that work together to store data and provide search capabilities. Each node is a separate Elasticsearch process that can run on the same machine or different machines.

### Key Concepts

#### 1. **Nodes**
- **Master Node**: Responsible for cluster-wide management (creating/deleting indices, tracking nodes)
- **Data Node**: Stores data and performs search operations
- **Ingest Node**: Processes documents before indexing
- **Coordinating Node**: Routes requests and aggregates results

#### 2. **Indices and Shards**
- **Index**: A collection of documents (like a database table)
- **Shard**: A piece of an index that can be stored on different nodes
- **Replica**: A copy of a shard for redundancy and performance

#### 3. **Data Paths**
- **Data Path**: Where Elasticsearch stores index data (`path.data`)
- **Logs Path**: Where Elasticsearch writes log files (`path.logs`)

## Setting Up Your First Cluster

### Prerequisites

1. **Java Installation**
   ```cmd
   # Check if Java is installed
   java -version
   
   # Should show Java 11 or higher
   ```

2. **Download Elasticsearch**
   - Go to https://www.elastic.co/downloads/elasticsearch
   - Download the Windows ZIP file
   - Extract to `C:\elasticsearch`

3. **System Requirements**
   - At least 4GB RAM (8GB+ recommended)
   - At least 10GB free disk space per node
   - Windows 10/11 or Windows Server

### Method 1: Using TrustQuery Cluster Wizard (Recommended)

1. **Open TrustQuery Admin Dashboard**
   - Navigate to "Cluster Management" tab
   - Click "Setup New Cluster" button

2. **Follow the Wizard Steps**
   - **Step 1**: Review prerequisites
   - **Step 2**: Configure cluster name and nodes
   - **Step 3**: Review and create

3. **Configure Nodes**
   ```
   Example 3-Node Cluster:
   
   Node 1 (Master + Data):
   - Name: master-node-1
   - Host: localhost
   - HTTP Port: 9200
   - Transport Port: 9300
   - Data Path: C:\elasticsearch-data\node-1
   - Logs Path: C:\elasticsearch\logs\node-1
   
   Node 2 (Data):
   - Name: data-node-1
   - Host: localhost
   - HTTP Port: 9201
   - Transport Port: 9301
   - Data Path: C:\elasticsearch-data\node-2
   - Logs Path: C:\elasticsearch\logs\node-2
   
   Node 3 (Data):
   - Name: data-node-2
   - Host: localhost
   - HTTP Port: 9202
   - Transport Port: 9302
   - Data Path: C:\elasticsearch-data\node-3
   - Logs Path: C:\elasticsearch\logs\node-3
   ```

4. **Start Nodes**
   - The wizard creates start scripts for each node
   - Use the UI to start/stop nodes
   - Or run the generated `.bat` files manually

### Method 2: Manual Setup

#### Step 1: Create Node Directories
```cmd
mkdir C:\elasticsearch-data\node-1
mkdir C:\elasticsearch-data\node-2
mkdir C:\elasticsearch-data\node-3
mkdir C:\elasticsearch\logs\node-1
mkdir C:\elasticsearch\logs\node-2
mkdir C:\elasticsearch\logs\node-3
mkdir C:\elasticsearch-config\node-1
mkdir C:\elasticsearch-config\node-2
mkdir C:\elasticsearch-config\node-3
```

#### Step 2: Create Configuration Files

**Node 1 Configuration** (`C:\elasticsearch-config\node-1\elasticsearch.yml`):
```yaml
# Cluster settings
cluster.name: trustquery-cluster
node.name: master-node-1

# Network settings
network.host: localhost
http.port: 9200
transport.port: 9300

# Path settings
path.data: C:\elasticsearch-data\node-1
path.logs: C:\elasticsearch\logs\node-1

# Node roles
node.roles: [master, data, ingest]

# Discovery settings
discovery.seed_hosts: ["localhost:9300", "localhost:9301", "localhost:9302"]
cluster.initial_master_nodes: ["master-node-1"]

# Memory settings
bootstrap.memory_lock: false

# Security settings (basic)
xpack.security.enabled: false
```

**Node 2 Configuration** (`C:\elasticsearch-config\node-2\elasticsearch.yml`):
```yaml
cluster.name: trustquery-cluster
node.name: data-node-1
network.host: localhost
http.port: 9201
transport.port: 9301
path.data: C:\elasticsearch-data\node-2
path.logs: C:\elasticsearch\logs\node-2
node.roles: [data, ingest]
discovery.seed_hosts: ["localhost:9300", "localhost:9301", "localhost:9302"]
cluster.initial_master_nodes: ["master-node-1"]
bootstrap.memory_lock: false
xpack.security.enabled: false
```

**Node 3 Configuration** (similar to Node 2, adjust ports and paths)

#### Step 3: Create Start Scripts

**Start Node 1** (`C:\elasticsearch-config\node-1\start-node.bat`):
```batch
@echo off
echo Starting Elasticsearch Node 1 (Master + Data)
set ES_HOME=C:\elasticsearch
set ES_PATH_CONF=C:\elasticsearch-config\node-1
set ES_JAVA_OPTS=-Xms2g -Xmx2g
"%ES_HOME%\bin\elasticsearch.bat"
```

#### Step 4: Start the Cluster
1. Open 3 separate Command Prompt windows as Administrator
2. Run each start script in its own window
3. Wait for all nodes to start (check logs for "started" messages)
4. Verify cluster health: `curl http://localhost:9200/_cluster/health`

## Managing Your Cluster

### Using TrustQuery UI

1. **Monitor Cluster Health**
   - Cluster Management tab shows real-time status
   - Green = healthy, Yellow = warning, Red = critical

2. **Add/Remove Nodes**
   - Use "Advanced Add" for detailed node configuration
   - Specify custom data paths for each node
   - Set appropriate node roles

3. **Manage Data Paths**
   - View disk usage per node
   - Set preferred disk paths for new indices
   - Monitor available storage

4. **Index Management**
   - Create indices with specific shard/replica settings
   - Choose which nodes store data
   - Reindex data between clusters

### Data Path Strategy

#### Single Node (Development)
```
C:\elasticsearch-data\single-node\
├── indices/
├── nodes/
└── _state/
```

#### Multi-Node Cluster (Production)
```
Node 1: C:\elasticsearch-data\node-1\    (Master + Data)
Node 2: C:\elasticsearch-data\node-2\    (Data)
Node 3: C:\elasticsearch-data\node-3\    (Data)
Node 4: D:\elasticsearch-data\node-4\    (Data - Different disk)
```

#### Best Practices for Data Paths
1. **Use separate disks** for different nodes when possible
2. **SSD for hot data**, HDD for cold data
3. **Monitor disk space** - Elasticsearch needs 15% free space minimum
4. **Backup data paths** regularly

### Index-to-Disk Mapping

#### How TrustQuery Maps Indices to Disks

1. **Node Selection**: Choose which nodes store your index
2. **Disk Preferences**: Set preferred disk paths per node
3. **Shard Allocation**: Elasticsearch distributes shards across nodes
4. **Replication**: Replicas are stored on different nodes

#### Example: Creating an Index with Specific Data Path

1. **Set Preferred Disk Path**:
   ```
   Node: data-node-1
   Preferred Path: D:\elasticsearch-data\fast-storage\
   ```

2. **Create Index**:
   ```
   Index Name: user-accounts-2024
   Shards: 3
   Replicas: 1
   Target Node: data-node-1
   ```

3. **Result**: 
   - Primary shards stored on data-node-1 (D:\elasticsearch-data\fast-storage\)
   - Replica shards distributed to other nodes

## Troubleshooting

### Common Issues

#### 1. **Node Won't Start**
```cmd
# Check Java version
java -version

# Check configuration syntax
type C:\elasticsearch-config\node-1\elasticsearch.yml

# Check logs
type C:\elasticsearch\logs\node-1\trustquery-cluster.log
```

#### 2. **Cluster Health Red**
- Check if all master nodes are running
- Verify network connectivity between nodes
- Check disk space (needs >15% free)

#### 3. **Cannot Create Index**
- Verify cluster health is green or yellow
- Check if you have sufficient data nodes
- Ensure disk space is available

#### 4. **High Memory Usage**
- Adjust heap size in start scripts (`-Xms2g -Xmx2g`)
- Monitor JVM garbage collection
- Consider adding more nodes

### Monitoring Commands

```cmd
# Cluster health
curl http://localhost:9200/_cluster/health?pretty

# Node information
curl http://localhost:9200/_nodes?pretty

# Index information
curl http://localhost:9200/_cat/indices?v

# Disk usage
curl http://localhost:9200/_cat/allocation?v
```

## Advanced Configuration

### Production Cluster Setup

#### Hardware Recommendations
- **Master Nodes**: 3 dedicated masters (small VMs: 2 CPU, 4GB RAM)
- **Data Nodes**: 3+ data nodes (8+ CPU, 32GB+ RAM, SSD storage)
- **Network**: Gigabit Ethernet minimum

#### Security Configuration
```yaml
# Enable security
xpack.security.enabled: true
xpack.security.transport.ssl.enabled: true
xpack.security.http.ssl.enabled: true

# Configure certificates
xpack.security.transport.ssl.keystore.path: certs/elastic-certificates.p12
xpack.security.transport.ssl.truststore.path: certs/elastic-certificates.p12
```

#### Memory Configuration
```yaml
# Set heap size to 50% of available RAM (max 32GB)
# In jvm.options:
-Xms16g
-Xmx16g
```

### Multi-Datacenter Setup

#### Cross-Zone Awareness
```yaml
# Node attributes for zone awareness
node.attr.zone: zone1
cluster.routing.allocation.awareness.attributes: zone

# Force awareness
cluster.routing.allocation.awareness.force.zone.values: zone1,zone2
```

## Integration with TrustQuery

### Search Index Configuration
1. **Create search-optimized indices**
2. **Configure analyzers** for text processing
3. **Set up index templates** for consistent mapping
4. **Monitor search performance**

### Data Ingestion
1. **Bulk indexing** for large datasets
2. **Real-time indexing** for live data
3. **Index lifecycle management** for data retention
4. **Monitoring ingestion rates**

This guide provides comprehensive information for setting up and managing Elasticsearch clusters with TrustQuery. Use the UI wizard for quick setup, or follow manual steps for custom configurations.
