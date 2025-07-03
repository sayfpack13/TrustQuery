# TrustQuery Elasticsearch Cluster Setup Guide

## Overview
This guide explains how to set up and manage an Elasticsearch cluster with TrustQuery, from OS-level installation to UI management.

## Part 1: Operating System Level Setup

### Single Node Setup (Development)
1. **Download Elasticsearch** from https://www.elastic.co/downloads/elasticsearch
2. **Extract** to `C:\elasticsearch`
3. **Edit Configuration** `C:\elasticsearch\config\elasticsearch.yml`:
   ```yaml
   cluster.name: trustquery-cluster
   node.name: node-1
   network.host: localhost
   http.port: 9200
   discovery.type: single-node
   ```
4. **Start Elasticsearch**:
   ```powershell
   C:\elasticsearch\bin\elasticsearch.bat
   ```

### Multi-Node Setup (Production)

#### Option 1: Multiple Nodes on Same Machine
Create separate directories for each node:

**Node 1 (`C:\elasticsearch\node-1\`):**
```yaml
# elasticsearch.yml
cluster.name: trustquery-cluster
node.name: node-1
network.host: localhost
http.port: 9200
transport.port: 9300
path.data: C:\elasticsearch\node-1\data
path.logs: C:\elasticsearch\node-1\logs
discovery.seed_hosts: ["localhost:9300", "localhost:9301"]
cluster.initial_master_nodes: ["node-1"]
node.roles: ["master", "data", "ingest"]
```

**Node 2 (`C:\elasticsearch\node-2\`):**
```yaml
# elasticsearch.yml
cluster.name: trustquery-cluster
node.name: node-2
network.host: localhost
http.port: 9201
transport.port: 9301
path.data: C:\elasticsearch\node-2\data
path.logs: C:\elasticsearch\node-2\logs
discovery.seed_hosts: ["localhost:9300", "localhost:9301"]
cluster.initial_master_nodes: ["node-1"]
node.roles: ["data", "ingest"]
```

**Start commands:**
```powershell
# Terminal 1
C:\elasticsearch\node-1\bin\elasticsearch.bat

# Terminal 2
C:\elasticsearch\node-2\bin\elasticsearch.bat
```

#### Option 2: Multiple Machines
Install Elasticsearch on each machine with appropriate IP addresses and discovery settings.

## Part 2: TrustQuery UI Management

### 1. Cluster Management Tab
Navigate to **Admin Dashboard > Cluster Management**:

- **View Cluster Info**: See cluster name, health, and node count
- **Set Cluster Name**: Change the cluster name
- **Add Nodes**: Connect TrustQuery to your running Elasticsearch nodes

### 2. Adding Nodes to TrustQuery

#### Quick Add:
1. Enter node URL (e.g., `http://localhost:9200`)
2. Click "Quick Add"

#### Advanced Add:
1. Click "Advanced Add" button
2. Configure:
   - **Node Name**: `node-1`
   - **Host**: `localhost`
   - **Port**: `9200`
   - **Transport Port**: `9300`
   - **Data Path**: `C:\elasticsearch\node-1\data`
   - **Logs Path**: `C:\elasticsearch\node-1\logs`
   - **Roles**: Master, Data, Ingest

### 3. Node Management
- **View Node Stats**: CPU, memory, disk usage
- **Set Write Node**: Choose which node handles write operations
- **Remove Nodes**: Disconnect nodes from TrustQuery

### 4. Disk Management
- **View Disk Usage**: See disk space per node
- **Set Preferred Paths**: Choose where to store indices
- **Monitor Storage**: Track disk utilization

## Part 3: Index Management

### Creating Indices
1. Go to **Elasticsearch Management** tab
2. Click "Create Index"
3. Configure:
   - **Index Name**: `my-documents`
   - **Shards**: Number of primary shards (1-1000)
   - **Replicas**: Number of replica shards (0-100)

### Index-to-Node Assignment
Elasticsearch automatically distributes shards across nodes based on:
- Available disk space
- Node roles (data nodes only)
- Cluster allocation settings

### Manual Index Management
- **Select Index**: Choose active index for new data
- **Reindex**: Move data between indices
- **Delete Index**: Remove indices (careful!)

## Part 4: Configuration Management

### Elasticsearch Configuration
1. Go to **Configuration Management** tab
2. **Configure Paths**: Set config file locations
3. **Edit Settings**: Modify elasticsearch.yml through UI
4. **Restart Service**: Apply configuration changes

### Data Flow
```
Upload Files → Parse → Index to Selected Index → Distribute to Nodes → Store on Preferred Disks
```

## Part 5: Common Scenarios

### Scenario 1: Development Setup
1. Install single Elasticsearch node
2. Add node to TrustQuery: `http://localhost:9200`
3. Create index: `accounts`
4. Upload and parse documents

### Scenario 2: Production Cluster
1. Install 3 Elasticsearch nodes (different machines)
2. Add all nodes to TrustQuery
3. Set one node as write node
4. Create indices with replicas
5. Monitor disk usage and performance

### Scenario 3: Adding Storage
1. Add new node with large disk
2. Set preferred disk path
3. Create new index on new node
4. Reindex old data if needed

## Part 6: Troubleshooting

### Common Issues:
- **Node not starting**: Check elasticsearch.yml syntax
- **Cluster not forming**: Verify discovery settings
- **Disk full**: Add nodes or clean old indices
- **Performance issues**: Check node roles and resources

### TrustQuery Integration:
- **Connection failed**: Verify Elasticsearch is running
- **Configuration errors**: Use UI validation tools
- **Task failures**: Check logs in Task Management

## Quick Start Commands

```powershell
# Start single node
C:\elasticsearch\bin\elasticsearch.bat

# Check cluster health
curl http://localhost:9200/_cluster/health

# List all nodes
curl http://localhost:9200/_cat/nodes?v

# List all indices
curl http://localhost:9200/_cat/indices?v
```

## Best Practices

1. **Always backup** before making changes
2. **Monitor disk space** regularly
3. **Use appropriate shard counts** (1 shard per GB of data)
4. **Set replica count** based on availability needs
5. **Test configurations** in development first
