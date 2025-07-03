# TrustQuery Elasticsearch Cluster Setup - Quick Start Guide

## ✅ Current Status
- **Backend**: ✅ Running on http://localhost:5000
- **Frontend**: ✅ Running on http://localhost:3000  
- **UI**: ✅ Enhanced with step-by-step cluster setup guide
- **API**: ✅ All cluster management endpoints working

## 🚀 Complete Workflow - How to Create and Manage Clusters

### Step 1: Operating System Level (Manual)
**You need to install Elasticsearch on your Windows machine first:**

1. **Download Elasticsearch**
   - Go to: https://www.elastic.co/downloads/elasticsearch
   - Download Windows ZIP file
   - Extract to `C:\elasticsearch`

2. **Basic Configuration** (for single node development)
   ```yaml
   # Edit C:\elasticsearch\config\elasticsearch.yml
   cluster.name: trustquery-cluster
   node.name: node-1
   network.host: localhost
   http.port: 9200
   discovery.type: single-node
   ```

3. **Start Elasticsearch**
   ```powershell
   # Open PowerShell as Administrator
   cd C:\elasticsearch
   bin\elasticsearch.bat
   ```

4. **Verify Running**
   - Visit: http://localhost:9200
   - Should see JSON response with cluster info

### Step 2: TrustQuery UI Management (Automated)
**Once Elasticsearch is running, use TrustQuery to manage it:**

1. **Open TrustQuery**
   - Go to: http://localhost:3000
   - Login as admin
   - Navigate to **Admin Dashboard → Cluster Management**

2. **Follow Visual Guide**
   - The top of the page shows a step-by-step guide
   - Clear instructions for download, install, and connect

3. **Add Your Node**
   - **Quick Add**: Enter `http://localhost:9200` and click "Quick Add"
   - **Advanced Add**: Click "Advanced Add" for full configuration:
     - Name: `node-1`
     - Host: `localhost`
     - Port: `9200`
     - Data Path: `C:\elasticsearch\data`
     - Roles: Master, Data, Ingest

### Step 3: Index and Data Management
**Create indices and manage data through TrustQuery:**

1. **Create Index**
   - Go to **Elasticsearch Management** tab
   - Click "Create Index"
   - Name: `my-documents`
   - Shards: `1` (for development)
   - Replicas: `0` (for single node)

2. **Upload Documents**
   - Go to **File Management** tab
   - Upload your files
   - Parse them to extract data
   - Data automatically goes to your selected index

3. **Manage Storage**
   - **Set Preferred Disks**: Choose where data is stored
   - **Monitor Usage**: View disk space per node
   - **Scale**: Add more nodes as needed

## 🎯 Key Concepts Explained

### **Cluster vs Node vs Index**
- **Cluster**: A group of Elasticsearch nodes working together
- **Node**: A single Elasticsearch instance (one per machine, or multiple per machine)
- **Index**: Like a database table where your documents are stored

### **Data Flow**
```
Your Files → TrustQuery Parser → Elasticsearch Index → Node Storage → Disk Path
```

### **Node Roles**
- **Master**: Manages cluster state and configuration
- **Data**: Stores and searches documents
- **Ingest**: Processes documents before indexing

### **Scaling**
- **Development**: 1 node with all roles
- **Production**: Multiple specialized nodes
  - 3 master nodes (cluster management)
  - Multiple data nodes (storage)
  - Ingest nodes (processing)

## 🛠️ Multi-Node Setup (Advanced)

### For Production or Learning:
1. **Create multiple node directories**:
   ```
   C:\elasticsearch\node-1\
   C:\elasticsearch\node-2\
   C:\elasticsearch\node-3\
   ```

2. **Configure each node**:
   - Different ports (9200, 9201, 9202)
   - Different data paths
   - Same cluster name
   - Discovery settings to find each other

3. **Add all nodes to TrustQuery**:
   - Use "Advanced Add" for each node
   - Set appropriate roles
   - Configure disk preferences

## 🔧 Common Scenarios

### **Scenario A: Development**
- 1 Elasticsearch node
- 1 index with 1 shard, 0 replicas
- All roles on same node

### **Scenario B: Small Production**
- 3 Elasticsearch nodes
- Indices with 2-5 shards, 1 replica
- Each node has all roles

### **Scenario C: Large Production**
- 10+ nodes with specialized roles
- Indices with many shards
- Dedicated master, data, and ingest nodes

## 📁 File and Directory Structure

### **Elasticsearch**
```
C:\elasticsearch\
├── bin\elasticsearch.bat          # Start script
├── config\elasticsearch.yml       # Main config
├── data\                          # Where indices are stored
├── logs\                          # Log files
└── plugins\                       # Extensions
```

### **TrustQuery**
```
TrustQuery\
├── backend\                       # API server
├── frontend\                      # Web UI
└── data\
    ├── pending\                   # Files waiting to be parsed
    ├── parsed\                    # Successfully processed files
    └── unparsed\                  # Files that failed parsing
```

## 🎮 Using the UI

### **Admin Dashboard Tabs**:
1. **File Management**: Upload, parse, move files
2. **Elasticsearch Management**: Create indices, reindex data
3. **Cluster Management**: Add nodes, set write node, disk preferences
4. **Configuration Management**: Edit Elasticsearch config files
5. **Accounts**: Manage user accounts

### **Cluster Management Features**:
- ✅ Visual setup guide
- ✅ Quick node add (just URL)
- ✅ Advanced node add (full configuration)
- ✅ Node health monitoring
- ✅ Disk usage tracking
- ✅ Write node selection
- ✅ Preferred disk path setting

## 🚨 Troubleshooting

### **Elasticsearch Won't Start**
- Check Windows firewall
- Verify Java is installed
- Check elasticsearch.yml syntax
- Look at logs in `C:\elasticsearch\logs\`

### **TrustQuery Can't Connect**
- Ensure Elasticsearch is running on expected port
- Check URL format: `http://localhost:9200`
- Verify no authentication is required

### **Performance Issues**
- Monitor disk space
- Check memory usage
- Consider adding more nodes
- Optimize shard/replica settings

## 📚 Next Steps

1. **Start with development setup** (1 node)
2. **Test with sample data** (upload small files)
3. **Monitor performance** (disk, memory, CPU)
4. **Scale up** (add nodes as needed)
5. **Optimize configuration** (shards, replicas, roles)

---

**The UI now provides everything you need!** No more manual config file editing or CLI commands once Elasticsearch is installed and running.
