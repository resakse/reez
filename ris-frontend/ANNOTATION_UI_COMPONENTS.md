# DICOM Annotation UI Components

This document provides comprehensive documentation for the new DICOM annotation UI components implemented for the RIS frontend.

## Overview

The annotation UI system provides a complete interface for managing persistent DICOM annotations with the following key features:

- **User Ownership**: Users can only delete their own annotations
- **Auto-save**: Annotations automatically save when created/modified
- **Tabbed Interface**: Organized patient info, reports, and annotations in tabs
- **Real-time Updates**: Annotation counts and lists update automatically
- **Responsive Design**: Works on mobile and desktop devices
- **Dark/Light Theme**: Supports both theme modes
- **Accessibility**: Full keyboard navigation and screen reader support

## Components

### 1. AnnotationPanel.tsx

Main component that displays and manages DICOM annotations for a study.

**Location**: `/src/components/AnnotationPanel.tsx`

**Features**:
- Lists annotations with user names, timestamps, and types
- Shows delete buttons (red X) only for user's own annotations
- Groups annotations by current image vs other images
- Displays measurement values and units
- Supports loading states, error handling, and empty states
- Real-time annotation statistics

**Props**:
```typescript
interface AnnotationPanelProps {
  studyUid: string;              // Required: Study Instance UID
  currentImageId?: string;       // Optional: Current image ID for grouping
  isVisible?: boolean;           // Optional: Panel visibility (default: true)
  onToggleVisibility?: () => void; // Optional: Visibility toggle callback
}
```

**Usage Example**:
```tsx
import { AnnotationPanel } from '@/components/AnnotationPanel';

<AnnotationPanel 
  studyUid="1.2.3.4.5"
  currentImageId="wadouri:http://example.com/image.dcm"
  isVisible={true}
/>
```

### 2. RightPanelTabs.tsx

Tabbed interface component that organizes patient information, reports, and annotations.

**Location**: `/src/components/RightPanelTabs.tsx`

**Features**:
- Three-tab layout: Patient/Studies, Report, Annotations
- Badge showing annotation count on annotations tab
- Auto-refresh annotation count every 30 seconds
- Responsive tab labels (abbreviated on mobile)
- Maintains tab state internally or accepts external control

**Props**:
```typescript
interface RightPanelTabsProps {
  studyUid: string;              // Required: Study Instance UID
  patientData?: any;             // Optional: Patient information object
  studyData?: any;               // Optional: Study information object
  activeTab?: string;            // Optional: Controlled active tab
  onTabChange?: (tabId: string) => void; // Optional: Tab change callback
  annotationCount?: number;      // Optional: Override annotation count
}
```

**Usage Example**:
```tsx
import { RightPanelTabs } from '@/components/RightPanelTabs';

const patientData = {
  name: "John Doe",
  patientId: "12345",
  birthDate: "1980-01-01",
  gender: "M"
};

const studyData = {
  studyDescription: "CT Chest",
  studyDate: "2025-08-10",
  modality: "CT",
  accessionNumber: "ACC123",
  studyInstanceUid: "1.2.3.4.5"
};

<RightPanelTabs
  studyUid="1.2.3.4.5"
  patientData={patientData}
  studyData={studyData}
/>
```

### 3. ExampleRightPanelIntegration.tsx

Example integration component showing how to replace existing right panel content.

**Location**: `/src/components/ExampleRightPanelIntegration.tsx`

This component demonstrates the integration pattern for existing DICOM viewers and maintains compatibility with current panel collapse behavior.

## Data Flow

### Annotation Data Structure

Annotations follow the TypeScript interface defined in `/src/types/annotations.ts`:

```typescript
interface DicomAnnotation {
  id: number;                    // Unique identifier
  study_instance_uid: string;    // Study UID
  series_instance_uid: string;   // Series UID  
  sop_instance_uid: string;      // SOP Instance UID
  image_id: string;              // Cornerstone image ID
  frame_number: number;          // Frame number (default: 1)
  annotation_type: AnnotationType; // Type of annotation
  annotation_data: CornerstoneAnnotationData; // Cornerstone data
  label?: string;                // User-defined label
  description?: string;          // User-defined description
  measurement_value?: number;    // Measurement value (if applicable)
  measurement_unit?: string;     // Measurement unit (if applicable)
  created_at: string;           // Creation timestamp
  modified_at: string;          // Last modification timestamp
  user_full_name: string;       // Creator's full name
  can_delete: boolean;          // Whether current user can delete
}
```

### API Integration

Components use the `useAnnotations` hook for all API operations:

```typescript
const {
  annotations,        // Array of annotations
  loading,           // Loading state
  error,             // Error message
  deleteAnnotation,  // Delete function
  refreshAnnotations,// Manual refresh
  stats              // Annotation statistics
} = useAnnotations({ studyUid });
```

## Styling and Theming

### Design System Integration

All components use the existing shadcn/ui design system:

- **Colors**: Uses CSS custom properties for theme compatibility
- **Typography**: Consistent font sizing and weights
- **Spacing**: Follows the Tailwind spacing scale
- **Components**: Built on shadcn/ui primitives (Button, Card, Badge, etc.)

### Theme Support

Components automatically support both light and dark themes:

```css
/* Example of theme-aware styling */
.annotation-item {
  @apply bg-card text-card-foreground;
  @apply border border-border;
  @apply hover:bg-accent/5;
}
```

### Responsive Design

Components are fully responsive with mobile-first design:

```tsx
// Example responsive tab labels
<span className="hidden sm:inline">Annotations</span>
<span className="sm:hidden">Notes</span>
```

## Integration Guide

### Step 1: Install Required Dependencies

Ensure these packages are installed (they should already be available):

```bash
npm install @radix-ui/react-tabs @radix-ui/react-scroll-area lucide-react
```

### Step 2: Import Components

```tsx
import { RightPanelTabs } from '@/components/RightPanelTabs';
import { AnnotationPanel } from '@/components/AnnotationPanel';
```

### Step 3: Replace Existing Right Panel

In your DICOM viewer page, replace the existing right panel structure:

```tsx
// Before (existing code)
<div className="right-panel">
  <ReportingPanel ... />
  {/* Patient info */}
</div>

// After (new tabbed interface)
<RightPanelTabs
  studyUid={studyUid}
  patientData={patientData}
  studyData={studyData}
/>
```

### Step 4: Update State Management

Remove report-specific state if using controlled tabs:

```tsx
// Remove these if using RightPanelTabs
const [showReporting, setShowReporting] = useState(false);

// Optional: Add tab control
const [activeTab, setActiveTab] = useState('patient');
```

## Advanced Usage

### Custom Tab Control

For advanced control over tab switching:

```tsx
const [activeTab, setActiveTab] = useState('patient');

const handleTabChange = (tabId: string) => {
  // Custom logic (analytics, validation, etc.)
  console.log(`Switching to tab: ${tabId}`);
  setActiveTab(tabId);
};

<RightPanelTabs
  studyUid={studyUid}
  activeTab={activeTab}
  onTabChange={handleTabChange}
  patientData={patientData}
  studyData={studyData}
/>
```

### Annotation Count Override

If you have annotation counts from elsewhere:

```tsx
<RightPanelTabs
  studyUid={studyUid}
  annotationCount={customAnnotationCount}
  // ... other props
/>
```

### Current Image Highlighting

To highlight annotations from the current image:

```tsx
<AnnotationPanel
  studyUid={studyUid}
  currentImageId={getCurrentImageId()} // Your function to get current image
/>
```

## Error Handling

### Loading States

Components automatically show loading skeletons:

```tsx
// Automatic loading state in AnnotationPanel
if (loading) {
  return (
    <div className="p-4 space-y-4">
      {Array.from({ length: 3 }, (_, i) => (
        <AnnotationSkeleton key={i} />
      ))}
    </div>
  );
}
```

### Error States

Error states provide user-friendly messages with retry options:

```tsx
// Automatic error handling with retry button
if (error) {
  return (
    <ErrorState error={error} onRetry={handleRetry} />
  );
}
```

### Empty States

Empty states guide users on next steps:

```tsx
// Context-aware empty states
<EmptyState hasCurrentImage={!!currentImageId} />
```

## Performance Considerations

### Optimization Features

1. **Memoization**: Components use React.useMemo for expensive calculations
2. **Virtualization**: Large annotation lists are handled efficiently
3. **Debounced Updates**: Real-time updates are debounced to prevent excessive re-renders
4. **Lazy Loading**: Tabs are loaded only when accessed (except annotations tab)

### Memory Management

```tsx
// Components properly clean up resources
useEffect(() => {
  return () => {
    // Cleanup timers and subscriptions
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
  };
}, []);
```

## Accessibility

### Keyboard Navigation

- Tab navigation through all interactive elements
- Arrow keys for tab switching
- Enter/Space for button activation
- Escape for modal/dropdown closing

### Screen Reader Support

```tsx
// ARIA labels and descriptions
<Button aria-label="Delete annotation">
  <Trash2 className="w-4 h-4" />
</Button>

// Role and state information
<div role="tabpanel" aria-labelledby="annotations-tab">
  {/* Content */}
</div>
```

### Color Contrast

All components meet WCAG AA contrast requirements in both light and dark themes.

## Troubleshooting

### Common Issues

1. **Annotations not loading**:
   - Check `studyUid` prop is correct
   - Verify authentication token is valid
   - Check browser console for API errors

2. **Delete button not appearing**:
   - Ensure user is authenticated
   - Verify annotation.can_delete is true
   - Check user permissions in backend

3. **Tab switching not working**:
   - Verify tab IDs match expected values: 'patient', 'report', 'annotations'
   - Check if using controlled vs uncontrolled tabs correctly

### Debug Mode

Enable debug logging by setting localStorage:

```javascript
localStorage.setItem('debug', 'annotations:*');
```

## Migration from Legacy UI

### Before Migration

1. Backup existing right panel component
2. Document current state management
3. Test annotation functionality with existing backend

### During Migration

1. Replace right panel component gradually
2. Test each tab functionality
3. Verify annotation permissions work correctly

### After Migration

1. Remove unused component files
2. Clean up unused state variables
3. Update any direct API calls to use hooks

## Future Enhancements

### Planned Features

1. **Annotation Search**: Full-text search within annotations
2. **Filtering**: Filter annotations by type, user, or date
3. **Export**: Export annotations to DICOM SR or JSON
4. **Templates**: Predefined annotation templates
5. **Collaboration**: Real-time collaborative annotations

### Extension Points

Components are designed for extension:

```tsx
// Custom annotation types
const customAnnotationTypes: Record<string, AnnotationTypeConfig> = {
  'custom-measurement': {
    icon: CustomIcon,
    color: 'bg-custom-100',
    name: 'Custom Measurement'
  }
};
```

## Support

For issues or questions:

1. Check the TypeScript types in `/src/types/annotations.ts`
2. Review the hook implementation in `/src/hooks/useAnnotations.ts`  
3. Examine the example integration in `/src/components/ExampleRightPanelIntegration.tsx`
4. Test with the backend API endpoints documented in the Django annotation plan

## File Locations

- **AnnotationPanel.tsx**: `/src/components/AnnotationPanel.tsx`
- **RightPanelTabs.tsx**: `/src/components/RightPanelTabs.tsx`
- **ExampleRightPanelIntegration.tsx**: `/src/components/ExampleRightPanelIntegration.tsx`
- **Types**: `/src/types/annotations.ts`
- **Hooks**: `/src/hooks/useAnnotations.ts`
- **Toast Service**: `/src/lib/toast.ts`

This completes the comprehensive DICOM annotation UI component system with full documentation for implementation and usage.