#!/bin/bash
# Quick Orthanc storage diagnostic script for 192.168.20.172

echo "🔍 ORTHANC STORAGE DIAGNOSTIC"
echo "=============================="

STORAGE_DIR="/var/lib/orthanc/db-v6"
echo "Storage Directory: $STORAGE_DIR"
echo ""

# 1. Check if directory exists
echo "1. Directory existence:"
if [ -d "$STORAGE_DIR" ]; then
    echo "   ✅ Directory exists"
else
    echo "   ❌ Directory does NOT exist"
    echo "   🔧 Fix: sudo mkdir -p $STORAGE_DIR"
fi
echo ""

# 2. Check permissions
echo "2. Directory permissions:"
ls -ld "$STORAGE_DIR" 2>/dev/null || echo "   ❌ Cannot access directory"
echo ""

# 3. Check ownership
echo "3. Directory ownership:"
OWNER=$(stat -c "%U:%G" "$STORAGE_DIR" 2>/dev/null || echo "unknown")
echo "   Owner: $OWNER"
if [[ "$OWNER" == "orthanc:orthanc" ]]; then
    echo "   ✅ Correct ownership"
elif [[ "$OWNER" == "unknown" ]]; then
    echo "   ❌ Cannot determine ownership"
else
    echo "   ⚠️  Ownership might be incorrect (should be orthanc:orthanc)"
    echo "   🔧 Fix: sudo chown -R orthanc:orthanc $STORAGE_DIR"
fi
echo ""

# 4. Check disk space
echo "4. Disk space:"
df -h "$STORAGE_DIR" 2>/dev/null || df -h /var
echo ""

# 5. Check if orthanc user can write
echo "5. Write test as orthanc user:"
if sudo -u orthanc touch "$STORAGE_DIR/test_write" 2>/dev/null; then
    echo "   ✅ Write test successful"
    sudo -u orthanc rm "$STORAGE_DIR/test_write"
else
    echo "   ❌ Write test failed"
    echo "   🔧 Fix: sudo chown -R orthanc:orthanc $STORAGE_DIR && sudo chmod -R 755 $STORAGE_DIR"
fi
echo ""

# 6. Check for actual DICOM files
echo "6. DICOM files in storage:"
FILE_COUNT=$(find "$STORAGE_DIR" -type f 2>/dev/null | wc -l)
echo "   Total files: $FILE_COUNT"

if [ $FILE_COUNT -gt 0 ]; then
    echo "   Sample files:"
    find "$STORAGE_DIR" -type f | head -3
else
    echo "   ❌ No files found in storage directory"
fi
echo ""

# 7. Check for the specific file UUIDs we know about
echo "7. Checking for known file UUIDs:"
UUID1="6e0d52f8-d874-473a-ad8e-5b95e54b8f60"
UUID2="a4826691-b8aa-4a68-9a97-b5d3de3075e5"

echo "   Looking for UUID: $UUID1"
FOUND1=$(find "$STORAGE_DIR" -name "*$UUID1*" 2>/dev/null)
if [ -n "$FOUND1" ]; then
    echo "   ✅ Found: $FOUND1"
    ls -la "$FOUND1"
else
    echo "   ❌ Not found"
fi

echo "   Looking for UUID: $UUID2"
FOUND2=$(find "$STORAGE_DIR" -name "*$UUID2*" 2>/dev/null)
if [ -n "$FOUND2" ]; then
    echo "   ✅ Found: $FOUND2"
    ls -la "$FOUND2"
else
    echo "   ❌ Not found"
fi
echo ""

# 8. Check Orthanc service status
echo "8. Orthanc service status:"
systemctl is-active orthanc 2>/dev/null || echo "   ❌ Cannot check service status"
echo ""

# 9. Check recent Orthanc logs for storage errors
echo "9. Recent Orthanc logs (storage-related):"
if [ -f "/var/log/orthanc/orthanc.log" ]; then
    echo "   Last 5 storage-related log entries:"
    grep -i "storage\|file\|directory" /var/log/orthanc/orthanc.log | tail -5
elif command -v journalctl >/dev/null; then
    echo "   Last 5 systemd log entries:"
    journalctl -u orthanc --since "1 hour ago" | grep -i "storage\|file\|directory" | tail -5
else
    echo "   ❌ Cannot access logs"
fi
echo ""

echo "🔧 QUICK FIXES IF NEEDED:"
echo "========================"
echo "# Fix ownership:"
echo "sudo chown -R orthanc:orthanc $STORAGE_DIR"
echo ""
echo "# Fix permissions:"
echo "sudo chmod -R 755 $STORAGE_DIR"
echo ""
echo "# Restart Orthanc:"
echo "sudo systemctl restart orthanc"
echo ""
echo "# Check logs:"
echo "sudo journalctl -u orthanc -f"