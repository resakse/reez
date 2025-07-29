# CT Scan Bulk Retrieval with Lazy Loading - PRD

## Problem Statement

The current CT scan image display implementation is causing performance issues by:
- Spamming and hammering the server with excessive requests
- Loading all images simultaneously without optimization
- Creating poor user experience with slow loading times
- Lacking proper progress indication during image retrieval

## Solution Overview

Implement a bulk retrieval system with lazy loading that:
1. Displays the first image of each series immediately as thumbnails
2. Implements bulk image retrieval with progressive loading
3. Shows progress bars on thumbnails during retrieval
4. Ensures one thumbnail per series for CT/MRI studies

## Technical Requirements

### 1. Initial Display (First Frame Loading)
- Load only the **first image** (frame 0) of each series on initial page load
- Display these as thumbnails representing each series
- Thumbnail should show series information (series number, description, image count)
- Fast initial load time (<2 seconds for thumbnails)

### 2. Bulk Retrieval System
- Implement background bulk downloading of remaining images per series
- Use queue-based system to prevent server overwhelming
- Concurrent download limit: **3-5 images maximum** at a time
- Download priority: Series user is currently viewing first

### 3. Progressive Loading UI
- Display progress bar overlay on each thumbnail during bulk retrieval
- Progress bar shows: `X / Y images loaded` where Y is total images in series
- Color coding:
  - Red: Not started (0%)
  - Yellow: In progress (1-99%)
  - Green: Complete (100%)
- Progress updates in real-time as images are retrieved

### 4. Series Management
- **One thumbnail per series** for CT/MRI studies
- Thumbnail displays:
  - Series number and description
  - Total image count
  - Current loading progress
  - Preview of first image
- Click thumbnail to open full series viewer

### 5. Series Viewer Navigation
- **Mouse wheel scrolling** through images within a series
- Smooth scrolling with configurable sensitivity
- Current image indicator (e.g., "Image 45 of 250")
- Keyboard shortcuts for navigation:
  - Arrow keys: Previous/Next image
  - Page Up/Down: Jump by 10 images
  - Home/End: First/Last image

### 6. Series Viewer Toolbar
- **Image counter**: "45 / 250" with input field for direct navigation
- **Scroll speed control**: Slider for mouse wheel sensitivity
- **Auto-play controls**: Play/Pause/Stop for cine mode
- **Window/Level controls**: For CT image display optimization
- **Zoom controls**: Fit to window, 1:1, zoom in/out
- **Reset view**: Return to default zoom and pan
- **Series info**: Toggle overlay showing series details

### 7. Caching Strategy
- Implement browser-side image caching
- Cache first frame immediately upon load
- Cache bulk images as they're retrieved
- Use IndexedDB for persistent caching across sessions
- Cache expiration: 24 hours or user-configurable

## API Requirements

**Authentication**: All endpoints require JWT authentication via `permission_classes = [IsAuthenticated]`.

### 1. Series Metadata Endpoint (NEW - To be implemented)
```
GET /api/pacs/studies/{studyUid}/series/
Headers: Authorization: Bearer <jwt_token>
Response: {
  "series": [
    {
      "seriesUid": "string",
      "seriesNumber": "number", 
      "seriesDescription": "string",
      "imageCount": "number",
      "modality": "CT|MRI",
      "firstImageUrl": "/api/pacs/instances/{orthancId}/frames/1"
    }
  ]
}
```

### 2. Bulk Image Retrieval Endpoint (NEW - To be implemented)
```
GET /api/pacs/studies/{studyUid}/series/{seriesUid}/images/bulk?start=0&count=50
Headers: Authorization: Bearer <jwt_token>
Response: {
  "images": [
    {
      "imageNumber": "number",
      "imageUrl": "/api/pacs/instances/{orthancId}/frames/{frameNumber}",
      "instanceUid": "string",
      "frameNumber": "number",
      "orthancId": "string"
    }
  ],
  "totalImages": "number",
  "hasMore": "boolean"
}
```

### 3. Existing DICOM Proxy Endpoints (CORS Solution)
```
# Individual DICOM instance proxy (EXISTING)
GET /api/pacs/instances/{orthancId}/file
Headers: Authorization: Bearer <jwt_token>
Response: Binary DICOM data

# DICOMweb proxy (EXISTING) 
GET /api/pacs/instances/{orthancId}/dicomweb
Headers: Authorization: Bearer <jwt_token>
Response: Binary DICOM data

# Frame-specific proxy (EXISTING)
GET /api/pacs/instances/{orthancId}/frames/{frameNumber}
Headers: Authorization: Bearer <jwt_token>
Response: Binary frame data

# Study image IDs (EXISTING)
GET /api/pacs/studies/{studyUid}/image-ids/
Headers: Authorization: Bearer <jwt_token>
Response: {"imageIds": ["wadouri:url1", "wadors:url2"], "total": number}
```

### 4. Authentication Endpoints (EXISTING)
```
POST /api/token/
Body: {"username": "string", "password": "string"}
Response: {"access": "jwt_token", "refresh": "refresh_token"}

POST /api/token/refresh/
Body: {"refresh": "refresh_token"}
Response: {"access": "new_jwt_token"}
```

## Frontend Implementation

### 1. Component Structure
```
StudyViewer/
├── SeriesThumbnailGrid/
│   ├── SeriesThumbnail/
│   │   ├── ThumbnailImage
│   │   ├── ProgressBar
│   │   └── SeriesInfo
│   └── BulkLoader (service)
├── SeriesViewer/ (full screen)
│   ├── ImageViewport/
│   │   ├── DicomImage
│   │   ├── MouseWheelHandler
│   │   └── KeyboardHandler
│   ├── ViewerToolbar/
│   │   ├── ImageCounter
│   │   ├── ScrollSpeedControl
│   │   ├── AutoPlayControls
│   │   ├── WindowLevelControls
│   │   ├── ZoomControls
│   │   └── ViewerSettings
│   └── NavigationService
└── ImageCache (service)
```

### 2. State Management
- `seriesData`: Array of series metadata
- `loadingProgress`: Map of seriesUid -> progress percentage
- `imageCache`: Map of imageKey -> cached image data
- `currentlyLoading`: Set of seriesUid currently being bulk loaded
- `currentImageIndex`: Current image number in active series
- `scrollSensitivity`: Mouse wheel scroll speed setting
- `autoPlaySettings`: Auto-play speed and state
- `windowLevelSettings`: CT window/level values
- `zoomState`: Current zoom level and pan position

### 3. Loading States
1. **Initial**: Show loading skeleton for thumbnails
2. **Thumbnail Loaded**: Show first frame with 0% progress
3. **Bulk Loading**: Show progress bar with current percentage
4. **Complete**: Hide progress bar, full series available
5. **Error**: Show error state with retry option

### 4. Navigation Implementation
- **Mouse wheel event handling**: 
  - `wheel` event listener on image viewport
  - Debounced scroll events to prevent excessive updates
  - Configurable sensitivity multiplier (0.5x to 3x)
- **Keyboard navigation**:
  - Event listeners for arrow keys, page up/down, home/end
  - Focus management for proper keyboard handling
- **Touch/swipe support**: For mobile devices
- **Smooth transitions**: CSS transitions for image changes
- **Preloading**: Load adjacent images (±3) for smooth scrolling

## Performance Specifications

### 1. Loading Performance
- Initial thumbnail load: <2 seconds for up to 20 series
- Bulk retrieval rate: 2-5 images per second per series
- Memory usage: <500MB for typical CT study (500+ images)
- No server request timeout issues
- **Mouse wheel navigation**: <50ms response time per scroll
- **Image preloading**: Adjacent images loaded within 200ms

### 2. Server Load Management
- Maximum concurrent requests: 5
- Request queue with prioritization
- Exponential backoff on failures
- Request batching where possible

### 3. User Experience
- Responsive thumbnails during loading
- Smooth progress animations
- No UI blocking during bulk operations
- Clear visual feedback for all states
- **Smooth scrolling**: No lag or jitter during mouse wheel navigation
- **Intuitive toolbar**: All controls easily accessible and labeled
- **Keyboard shortcuts**: Standard medical imaging shortcuts supported

## Error Handling

### 1. Network Errors
- Retry failed requests with exponential backoff
- Show retry button on thumbnail for failed series
- Graceful degradation to individual image loading

### 2. Server Errors
- Handle 429 (rate limiting) with appropriate delays
- Handle 404 for missing images
- Display error states with user-friendly messages

### 3. Memory Constraints
- Implement LRU cache eviction
- Monitor memory usage and clear old cache entries
- Fallback to re-downloading if cache full

## Success Metrics

### 1. Performance Metrics
- Initial page load time: <3 seconds
- Time to first thumbnail: <1 second
- Server request count: <50% of current implementation
- Memory usage: Stable under 500MB

### 2. User Experience Metrics
- Click-to-view latency: <500ms for cached series
- Progress visibility: 100% of bulk operations show progress
- Error recovery: <5% of sessions require manual retry

### 3. Technical Metrics
- Cache hit rate: >80% for repeated views
- Request failure rate: <2%
- Server load reduction: >60% compared to current

## Implementation Phases

### Phase 1: Foundation (Week 1)
- Implement **Django DICOM proxy endpoints** with JWT authentication
- Create series metadata API endpoint with proper CORS handling
- Create SeriesThumbnail component with progress bar
- Basic bulk loader service structure with JWT token management

### Phase 2: Core Functionality (Week 2)
- Implement **bulk retrieval proxy endpoints** in Django
- Complete BulkLoader service with queue management and JWT tokens
- Image caching system with IndexedDB
- **Mouse wheel navigation** and keyboard shortcuts

### Phase 3: UI/UX Polish (Week 3)
- **Series viewer toolbar** with all controls
- Progress animations and visual feedback
- Error handling and retry mechanisms (including JWT refresh)
- **Adjacent image preloading** system

### Phase 4: Testing & Optimization (Week 4)
- Load testing with large CT studies and JWT authentication
- Memory leak testing and optimization
- **DICOM server proxy performance** testing
- User acceptance testing

## Technical Risks & Mitigations

### Risk 1: Memory Leaks
- **Mitigation**: Implement proper cleanup in useEffect hooks
- **Mitigation**: Monitor memory usage with performance.memory API
- **Mitigation**: Aggressive cache cleanup for unused series

### Risk 2: Server Overload (Django + DICOM Server)
- **Mitigation**: Implement request throttling and queuing in Django proxy
- **Mitigation**: Server-side rate limiting for DICOM server requests
- **Mitigation**: Circuit breaker pattern for failed DICOM server requests
- **Mitigation**: Connection pooling for DICOM server connections

### Risk 3: JWT Token Management
- **Mitigation**: Implement automatic token refresh before expiration
- **Mitigation**: Queue failed requests during token refresh
- **Mitigation**: Graceful fallback to login page on refresh failure
- **Mitigation**: Secure token storage in httpOnly cookies or secure storage

### Risk 4: Cache Corruption
- **Mitigation**: Implement cache validation with checksums
- **Mitigation**: Graceful fallback to network requests via Django proxy
- **Mitigation**: Cache versioning and automatic cleanup

## Dependencies

### Frontend
- **React Query/TanStack Query**: API state management with JWT token handling
- **IndexedDB wrapper (Dexie.js)**: Persistent image caching across sessions
- **JWT Authentication**: Automatic token refresh and request interceptors
- **Axios/Fetch interceptors**: Automatic Bearer token injection and refresh
- **Web Workers**: Background processing for image decoding (optional)

### Backend
- **Django REST Framework**: JWT authentication middleware
- **DICOM Proxy Service**: Django views to proxy requests to DICOM server
- **Bulk image retrieval optimization**: Efficient database queries and caching  
- **Response compression**: gzip compression for metadata endpoints
- **Database query optimization**: Prefetch related data for series metadata
- **CORS handling**: Django-cors-headers for frontend API access
- **JWT token management**: Automatic token refresh handling

## Acceptance Criteria

1. ✅ Initial page load shows one thumbnail per CT/MRI series within 3 seconds
2. ✅ Progress bars display and update during bulk image retrieval
3. ✅ No more than 5 concurrent server requests at any time
4. ✅ Images are cached and available for immediate re-viewing
5. ✅ Error states are handled gracefully with retry options
6. ✅ Memory usage remains stable during extended use
7. ✅ Server load is reduced by at least 50% compared to current implementation
8. ✅ **Mouse wheel scrolling** through series images with <50ms response time
9. ✅ **Toolbar controls** for navigation, zoom, window/level, and auto-play
10. ✅ **Keyboard shortcuts** work for all navigation functions
11. ✅ **Image counter** shows current position and allows direct navigation
12. ✅ **Smooth scrolling** with configurable sensitivity settings
13. ✅ **Adjacent image preloading** (±3 images) for seamless navigation