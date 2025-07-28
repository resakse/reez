# Orthanc Storage Configuration Troubleshooting Guide

## Key Settings to Check in orthanc.json

### 1. **StorageDirectory** (Most Important)
```json
{
  "StorageDirectory": "/var/lib/orthanc/db"
}
```
**Check for:**
- Directory exists and is accessible
- Correct permissions (orthanc user can read/write)
- Sufficient disk space
- Not a broken symlink

### 2. **Storage Compression**
```json
{
  "StorageCompression": false
}
```
**Issues if:**
- Set to `true` but compression library missing
- Corrupted compressed files

### 3. **File Permissions**
```json
{
  "FileSystemRoot": "/var/lib/orthanc/db"
}
```
**Check:**
- Directory ownership: `chown -R orthanc:orthanc /var/lib/orthanc/db`
- Permissions: `chmod -R 755 /var/lib/orthanc/db`

### 4. **Storage Plugin Configuration**
```json
{
  "Plugins": [
    "/usr/share/orthanc/plugins"
  ],
  "StorageAreaPlugin": null
}
```
**If using plugins:**
- AWS S3, Google Cloud, etc.
- Plugin must be properly loaded
- Credentials and configuration correct

## Common Problems & Solutions

### Problem 1: Directory Not Accessible
```bash
# Check if directory exists
ls -la /var/lib/orthanc/db

# Check permissions
ls -ld /var/lib/orthanc/db
# Should show: drwxr-xr-x orthanc orthanc

# Fix permissions if needed
sudo chown -R orthanc:orthanc /var/lib/orthanc/db
sudo chmod -R 755 /var/lib/orthanc/db
```

### Problem 2: Disk Space Full
```bash
# Check disk space
df -h /var/lib/orthanc/db

# Check inode usage
df -i /var/lib/orthanc/db
```

### Problem 3: SELinux/AppArmor Issues
```bash
# Check SELinux (CentOS/RHEL)
getenforce
setsebool -P httpd_can_network_connect 1

# Check AppArmor (Ubuntu)
sudo aa-status | grep orthanc
```

### Problem 4: Network Mount Issues
```json
{
  "StorageDirectory": "/mnt/shared/orthanc"
}
```
**Check:**
- Mount is stable and accessible
- Network connectivity to storage server
- Mount options include proper permissions

## Diagnostic Commands for Remote Server

### 1. Check Orthanc Service Status
```bash
# Service status
sudo systemctl status orthanc

# Service logs
sudo journalctl -u orthanc -f
```

### 2. Check Orthanc Logs
```bash
# Default log location
sudo tail -f /var/log/orthanc/orthanc.log

# Or check systemd logs
sudo journalctl -u orthanc --since "1 hour ago"
```

### 3. Test Storage Directory
```bash
# Test write access as orthanc user
sudo -u orthanc touch /var/lib/orthanc/db/test_file
sudo -u orthanc rm /var/lib/orthanc/db/test_file
```

### 4. Check File System
```bash
# Check for file system errors
sudo fsck /dev/sda1  # Replace with actual device

# Check mount points
mount | grep orthanc
```

## Sample Working orthanc.json Storage Section

```json
{
  "Name": "Orthanc",
  "StorageDirectory": "/var/lib/orthanc/db",
  "IndexDirectory": "/var/lib/orthanc/db",
  "StorageCompression": false,
  "MaximumStorageSize": 0,
  "MaximumPatientCount": 0,
  
  // File permissions
  "UserMetadata": {
    "Sample": "Sample"
  },
  
  // Network settings
  "RemoteAccessAllowed": true,
  "HttpPort": 8042,
  "DicomPort": 4242,
  
  // Important: No storage plugin if using filesystem
  "StorageAreaPlugin": null,
  "DatabasePlugin": null
}
```

## Quick Diagnosis Steps

### 1. Check Current Configuration
```bash
# On the remote server (192.168.20.172)
curl -s http://localhost:8042/system | jq .

# Should show:
# "StorageAreaPlugin": null (for filesystem storage)
```

### 2. Test File System Access
```bash
# Find the storage directory
sudo find /var -name "orthanc" -type d 2>/dev/null
sudo find /opt -name "orthanc" -type d 2>/dev/null

# Common locations:
# /var/lib/orthanc/db
# /opt/orthanc/db  
# /srv/orthanc
```

### 3. Check Instance Files
```bash
# Look for actual DICOM files
sudo find /var/lib/orthanc/db -name "*.dcm" | head -5
sudo ls -la /var/lib/orthanc/db/

# Files should exist with orthanc ownership
```

### 4. Test Orthanc File Access
```bash
# From your diagnostic earlier, try to access the file UUID directly
# File UUID: 6e0d52f8-d874-473a-ad8e-5b95e54b8f60

# Look for this file in storage
sudo find /var/lib/orthanc/db -name "*6e0d52f8*" -o -name "*6e0d*"
```

## Red Flags to Look For

1. **Missing StorageDirectory**: No storage location specified
2. **Wrong permissions**: Directory not owned by orthanc user
3. **Full disk**: No space left on storage device
4. **Broken plugin**: StorageAreaPlugin specified but plugin missing
5. **Network issues**: Storage on unreachable network mount
6. **SELinux/AppArmor**: Security policies blocking file access

## Immediate Actions

1. **SSH to the remote server** (192.168.20.172)
2. **Check orthanc.json** location:
   ```bash
   sudo find /etc -name "orthanc.json" 2>/dev/null
   sudo find /opt -name "orthanc.json" 2>/dev/null
   ```
3. **Examine the StorageDirectory** setting
4. **Test directory access** as orthanc user
5. **Check Orthanc logs** for storage errors
6. **Restart Orthanc** if configuration was changed

The key issue is likely **file system permissions** or **missing/inaccessible storage directory**.