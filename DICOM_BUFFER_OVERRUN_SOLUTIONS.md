# DICOM Buffer Overrun Solutions

## Problem
The error "dicomParser:parseDicomDataSetExplicit: buffer overrun" typically occurs when accessing Orthanc servers over a network, especially when there are connectivity issues, timeouts, or data corruption during transfer.

## Backend Solutions (Implemented)

### 1. Enhanced DICOM Proxy with Retry Logic
- **File**: `exam/pacs_views.py` - `dicom_instance_proxy` function
- **Features**:
  - Retry mechanism (3 attempts with exponential backoff)
  - HEAD request validation before download
  - Content-Length validation (minimum 1KB for DICOM files)
  - Larger chunk sizes for remote servers (16KB instead of 8KB)
  - Better timeout handling (15s connect, 60s read)
  - Data integrity validation during streaming

### 2. Frontend Image Validation
- **File**: `ris-frontend/src/lib/orthanc.ts` - `getStudyImageIds` function
- **Features**:
  - URL format validation for WADO URI
  - Image ID filtering to remove corrupted entries
  - Better error handling for network issues

### 3. Enhanced DICOM Viewer Error Handling
- **File**: `ris-frontend/src/components/SimpleDicomViewer.tsx`
- **Features**:
  - Specific buffer overrun detection
  - Automatic retry with delay for corrupted images
  - Fallback to single-image loading for stack failures
  - User-friendly error messages with toast notifications

## Orthanc Server Configuration Recommendations

### 1. Network Timeout Settings
Add these to your `orthanc.json` configuration:

```json
{
  "HttpTimeout": 60,
  "DicomServerTimeout": 30,
  "HttpsVerifyPeers": false,
  "KeepAlive": true,
  "TcpNoDelay": true
}
```

### 2. Transfer Settings
```json
{
  "DicomScpTimeout": 30,
  "DicomAssociationCloseDelay": 5,
  "WorkerThreadsCount": 4,
  "MaximumStorageSize": 0,
  "MaximumPatientCount": 0
}
```

### 3. Network Buffer Settings
```json
{
  "DicomThreadsCount": 4,
  "HttpCompressionEnabled": false,
  "KeepAlive": true,
  "HttpRequestMaxSize": 100
}
```

### 4. Storage and Performance
```json
{
  "StorageCompression": false,
  "DatabaseServerIdentifier": "your-server-id",
  "CheckRevisions": false,
  "LimitJobs": 10
}
```

## Network Infrastructure Recommendations

### 1. Firewall Settings
- Ensure ports 8042 (HTTP) and 4242 (DICOM) are open
- Configure proper MTU size for the network segment
- Disable packet inspection for DICOM traffic if possible

### 2. Network Quality
- Use wired connections instead of WiFi when possible
- Monitor network latency and packet loss
- Consider QoS settings for medical imaging traffic

### 3. Bandwidth Considerations
- Ensure adequate bandwidth for DICOM transfer
- Monitor concurrent connections to Orthanc
- Consider implementing connection pooling

## Application-Level Solutions

### 1. Client-Side Caching
- Enable browser caching for DICOM instances
- Implement service worker for offline access
- Use IndexedDB for local DICOM storage

### 2. Progressive Loading
- Load thumbnails first with lower resolution
- Stream images instead of loading all at once
- Implement lazy loading for large studies

### 3. Error Recovery
- Automatic retry with exponential backoff
- Fallback to alternative image formats
- Graceful degradation for network issues

## Monitoring and Diagnostics

### 1. Server Logs
Monitor Orthanc logs for:
- Connection timeouts
- HTTP 5xx errors
- DICOM association failures
- Storage errors

### 2. Client-Side Monitoring
- Network latency measurements
- DICOM loading success rates
- Buffer overrun frequency
- User experience metrics

### 3. Network Monitoring
- Bandwidth utilization
- Packet loss rates
- Connection stability
- DNS resolution times

## Testing Recommendations

### 1. Network Simulation
- Test with artificial latency
- Simulate packet loss
- Test with limited bandwidth
- Verify behavior under load

### 2. DICOM Validation
- Test with various DICOM file sizes
- Verify multi-frame image support
- Test with compressed vs uncompressed
- Validate different transfer syntaxes

## Emergency Fallbacks

### 1. Direct Orthanc Access
If proxy fails, provide direct Orthanc URL for advanced users:
```javascript
// Emergency fallback to direct Orthanc access
const directOrthancUrl = `${orthancUrl}/instances/${instanceId}/file`;
```

### 2. Download for Offline Viewing
Provide option to download DICOM files for external viewers:
```javascript
// Download DICOM file for external viewing
const downloadUrl = `${apiUrl}/api/pacs/instances/${instanceId}/download`;
```

## Implementation Status

✅ **Completed**:
- Enhanced backend proxy with retry logic
- Frontend image validation
- DICOM viewer error handling
- User-friendly error messages

🔄 **Recommended Next Steps**:
- Implement client-side caching
- Add network quality monitoring
- Configure Orthanc server settings
- Set up network infrastructure monitoring

## Usage

The enhanced error handling is automatically active. When buffer overrun occurs:

1. **Detection**: Error is automatically detected and categorized
2. **User Notification**: Clear error message shown to user
3. **Recovery**: Automatic retry after delay
4. **Fallback**: Single image loading if stack fails
5. **Logging**: Detailed error information for debugging

This multi-layered approach should significantly reduce buffer overrun issues when using remote Orthanc servers.