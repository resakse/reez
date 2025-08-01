# Multiple PACS Servers Implementation Plan

## Overview

This document outlines a comprehensive plan to implement multiple PACS server support in the RIS system. The current system supports a single PACS configuration, but we need to extend it to support multiple PACS servers with individual activation controls and a primary PACS designation system.

## Current System Analysis

### Backend (Django)
- **Model**: `PacsConfig` (single instance) in `exam/models.py`
- **API Endpoints**: 
  - `/api/settings/pacs/` (CRUD operations)
  - `/api/pacs/orthanc-url/` (returns single URL)
  - `/api/pacs/search/` (searches single PACS)
  - Multiple proxy endpoints for image retrieval
- **Configuration**: Single Orthanc URL with endpoint style choices

### Frontend (Next.js)
- **Settings**: Single PACS configuration form in `/settings/`
- **PACS Browser**: Uses single PACS for search and import
- **Upload**: Fixed PACS destination
- **Examinations**: Single PACS for image retrieval
- **PACS Utility**: Cached single configuration in `src/lib/pacs.ts`

## Implementation Plan

### Phase 1: Backend Database & Model Changes

#### 1.1 Database Schema Migration

**New Model Structure**:
```python
# exam/models.py
class PacsServer(models.Model):
    name = models.CharField(
        max_length=100, 
        unique=True, 
        help_text="Friendly name for the PACS server (e.g., 'Unraid Orthanc', 'Main Hospital PACS')"
    )
    orthancurl = models.URLField(
        verbose_name="Orthanc URL", 
        max_length=200,
        help_text="Orthanc server URL (e.g., http://10.0.1.0:8042)"
    )
    viewrurl = models.URLField(
        verbose_name="DICOM Viewer URL", 
        max_length=200,
        help_text="DICOM viewer URL for this server"
    )
    endpoint_style = models.CharField(
        max_length=20,
        choices=ENDPOINT_STYLE_CHOICES,
        default='dicomweb',
        help_text="DICOM endpoint style for image retrieval"
    )
    comments = models.TextField(
        blank=True, 
        help_text="Purpose and usage notes (e.g., 'This is only for CT Scan images', 'Archive server for studies older than 1 year')"
    )
    is_active = models.BooleanField(default=True, help_text="Enable/disable this PACS server")
    is_primary = models.BooleanField(default=False, help_text="Primary PACS server for new examinations")
    is_deleted = models.BooleanField(default=False, help_text="Soft delete flag for servers with historical data")
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-is_primary', 'name']
        constraints = [
            models.UniqueConstraint(
                fields=['is_primary'],
                condition=models.Q(is_primary=True, is_deleted=False),
                name='unique_primary_pacs'
            )
        ]
    
    def save(self, *args, **kwargs):
        # Ensure only one primary PACS exists among non-deleted servers
        if self.is_primary and not self.is_deleted:
            PacsServer.objects.filter(is_primary=True, is_deleted=False).exclude(pk=self.pk).update(is_primary=False)
        super().save(*args, **kwargs)
    
    def __str__(self):
        primary_marker = " (Primary)" if self.is_primary else ""
        active_marker = "" if self.is_active else " (Inactive)"
        deleted_marker = " (Deleted)" if self.is_deleted else ""
        return f"{self.name}{primary_marker}{active_marker}{deleted_marker}"

# Updated PacsExam model to track which server contains the images
class PacsExam(models.Model):
    # Existing fields...
    pacs_server = models.ForeignKey(
        PacsServer, 
        on_delete=models.PROTECT,  # Prevent deletion of servers with examinations
        help_text="PACS server where this examination's DICOM data is stored",
        related_name='examinations'
    )
    
    class Meta:
        # Existing meta...
        pass
    
    def get_image_proxy_url(self, orthanc_id: str, endpoint_type: str = 'configurable'):
        """Get the correct proxy URL for this examination's images"""
        return f"/api/pacs/instances/{self.pacs_server.id}/{orthanc_id}/{endpoint_type}"
```

**Migration Strategy**:
1. Create new `PacsServer` model
2. Add `pacs_server` field to `PacsExam` model (nullable initially)
3. Migrate existing `PacsConfig` data to first `PacsServer` entry
4. Update all existing `PacsExam` records to reference the migrated server
5. Make `pacs_server` field non-nullable
6. Set migrated entry as primary and active
7. Deprecate `PacsConfig` model (keep for backward compatibility initially)

#### 1.2 New Serializers

```python
# exam/serializers.py
class PacsServerSerializer(serializers.ModelSerializer):
    endpoint_style_choices = serializers.SerializerMethodField()
    
    class Meta:
        model = PacsServer
        fields = ['id', 'name', 'orthancurl', 'viewrurl', 'endpoint_style', 
                 'is_active', 'is_primary', 'comments', 'endpoint_style_choices',
                 'created', 'modified']
    
    def get_endpoint_style_choices(self, obj):
        return [{'value': choice[0], 'label': choice[1]} 
                for choice in ENDPOINT_STYLE_CHOICES]
    
    def validate(self, data):
        # Ensure at least one PACS server remains active
        if not data.get('is_active', True):
            active_count = PacsServer.objects.filter(is_active=True).exclude(pk=self.instance.pk if self.instance else None).count()
            if active_count == 0:
                raise serializers.ValidationError("At least one PACS server must remain active.")
        return data

class PacsServerListSerializer(serializers.ModelSerializer):
    class Meta:
        model = PacsServer
        fields = ['id', 'name', 'orthancurl', 'is_active', 'is_primary', 'comments']
```

### Phase 2: Backend API Endpoints

#### 2.1 New API Views

```python
# exam/pacs_management_views.py
class PacsServerViewSet(viewsets.ModelViewSet):
    queryset = PacsServer.objects.all()
    serializer_class = PacsServerSerializer
    permission_classes = [IsAuthenticated, IsSuperUser]
    
    @action(detail=True, methods=['post'])
    def set_primary(self, request, pk=None):
        """Set this PACS server as primary"""
        pacs_server = self.get_object()
        if not pacs_server.is_active:
            return Response(
                {'error': 'Cannot set inactive PACS server as primary'}, 
                status=400
            )
        
        pacs_server.is_primary = True
        pacs_server.save()
        return Response({'status': 'Primary PACS server updated'})
    
    @action(detail=False, methods=['get'])
    def active(self, request):
        """Get all active PACS servers"""
        active_servers = PacsServer.objects.filter(is_active=True)
        serializer = PacsServerListSerializer(active_servers, many=True)
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def primary(self, request):
        """Get the primary PACS server"""
        try:
            primary_server = PacsServer.objects.get(is_primary=True, is_active=True)
            serializer = PacsServerSerializer(primary_server)
            return Response(serializer.data)
        except PacsServer.DoesNotExist:
            return Response({'error': 'No primary PACS server configured'}, status=404)

class MultiplePacsSearchView(APIView):
    """Search across all active PACS servers"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        search_params = request.data
        active_servers = PacsServer.objects.filter(is_active=True)
        
        all_studies = []
        server_errors = {}
        
        for server in active_servers:
            try:
                # Search this PACS server
                server_studies = self.search_single_pacs(server, search_params)
                # Add server info to each study
                for study in server_studies:
                    study['pacs_server_id'] = server.id
                    study['pacs_server_name'] = server.name
                all_studies.extend(server_studies)
            except Exception as e:
                server_errors[server.name] = str(e)
        
        return Response({
            'success': True,
            'studies': all_studies,
            'total_count': len(all_studies),
            'server_errors': server_errors,
            'servers_searched': [{'id': s.id, 'name': s.name} for s in active_servers]
        })
    
    def search_single_pacs(self, server: PacsServer, search_params: dict):
        """Search a single PACS server (extracted from existing PacsSearchView)"""
        # Implementation similar to existing PacsSearchView but for specific server
        pass
```

#### 2.2 Updated URL Configuration

```python
# exam/urls.py
from rest_framework.routers import DefaultRouter
from .pacs_management_views import PacsServerViewSet

router = DefaultRouter()
router.register(r'pacs-servers', PacsServerViewSet)

urlpatterns = [
    # Existing patterns...
    path('api/', include(router.urls)),
    
    # New multiple PACS endpoints
    path('api/pacs/search-multiple/', MultiplePacsSearchView.as_view(), name='pacs-search-multiple'),
    path('api/pacs/upload-destinations/', PacsUploadDestinationsView.as_view(), name='pacs-upload-destinations'),
    
    # Modified existing endpoints to support server selection
    path('api/pacs/instances/<int:server_id>/<str:orthanc_id>/file', 
         MultiServerDicomInstanceProxy.as_view(), name='multi-server-dicom-proxy'),
]
```

### Phase 3: Frontend Library Updates

#### 3.1 Enhanced PACS Utility Library

```typescript
// src/lib/pacs.ts
interface PacsServer {
  id: number;
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  is_active: boolean;
  is_primary: boolean;
  comments?: string;
}

interface PacsConfig {
  servers: PacsServer[];
  primary_server: PacsServer | null;
  active_servers: PacsServer[];
}

let cachedPacsConfig: PacsConfig | null = null;
let cacheExpiry: number = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

export async function getPacsConfig(): Promise<PacsConfig> {
  const now = Date.now();
  
  if (cachedPacsConfig && now < cacheExpiry) {
    return cachedPacsConfig;
  }
  
  try {
    const [serversResponse, primaryResponse] = await Promise.all([
      AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/active/`),
      AuthService.authenticatedFetch(`${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/primary/`)
    ]);
    
    const servers: PacsServer[] = serversResponse.ok ? await serversResponse.json() : [];
    const primary_server: PacsServer | null = primaryResponse.ok ? await primaryResponse.json() : null;
    
    const config: PacsConfig = {
      servers,
      primary_server,
      active_servers: servers.filter(s => s.is_active)
    };
    
    cachedPacsConfig = config;
    cacheExpiry = now + CACHE_DURATION;
    
    return config;
  } catch (error) {
    // Fallback to single server configuration for backward compatibility
    return {
      servers: [{
        id: 1,
        name: 'Default PACS',
        orthancurl: process.env.NEXT_PUBLIC_ORTHANC_URL || 'http://localhost:8043',
        viewrurl: 'http://localhost:3000/viewer',
        endpoint_style: 'dicomweb',
        is_active: true,
        is_primary: true
      }],
      primary_server: null,
      active_servers: []
    };
  }
}

export async function getPrimaryPacsServer(): Promise<PacsServer | null> {
  const config = await getPacsConfig();
  return config.primary_server;
}

export async function getActivePacsServers(): Promise<PacsServer[]> {
  const config = await getPacsConfig();
  return config.active_servers;
}

export async function getPacsServerById(id: number): Promise<PacsServer | null> {
  const config = await getPacsConfig();
  return config.servers.find(s => s.id === id) || null;
}

export function clearPacsConfigCache(): void {
  cachedPacsConfig = null;
  cacheExpiry = 0;
}
```

### Phase 4: Frontend Settings UI

#### 4.1 Multiple PACS Management Component

```typescript
// src/components/PacsServerManager.tsx
interface PacsServer {
  id: number;
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  is_active: boolean;
  is_primary: boolean;
  comments?: string;
}

interface PacsServerFormData {
  name: string;
  orthancurl: string;
  viewrurl: string;
  endpoint_style: string;
  comments: string;
}

export default function PacsServerManager() {
  const [servers, setServers] = useState<PacsServer[]>([]);
  const [editingServer, setEditingServer] = useState<PacsServer | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [formData, setFormData] = useState<PacsServerFormData>({
    name: '',
    orthancurl: '',
    viewrurl: '',
    endpoint_style: 'dicomweb',
    comments: ''
  });
  
  const handleToggleActive = async (serverId: number, isActive: boolean) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ is_active: isActive })
        }
      );
      
      if (response.ok) {
        setServers(prev => prev.map(s => 
          s.id === serverId ? { ...s, is_active: isActive } : s
        ));
        toast.success(`PACS server ${isActive ? 'activated' : 'deactivated'}`);
        clearPacsConfigCache(); // Clear cache when settings change
      }
    } catch (error) {
      toast.error('Failed to update PACS server status');
    }
  };
  
  const handleSetPrimary = async (serverId: number) => {
    try {
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${serverId}/set_primary/`,
        { method: 'POST' }
      );
      
      if (response.ok) {
        setServers(prev => prev.map(s => ({
          ...s,
          is_primary: s.id === serverId
        })));
        toast.success('Primary PACS server updated');
        clearPacsConfigCache();
      }
    } catch (error) {
      toast.error('Failed to set primary PACS server');
    }
  };
  
  const handleSaveServer = async (data: PacsServerFormData) => {
    try {
      const url = editingServer 
        ? `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/${editingServer.id}/`
        : `${process.env.NEXT_PUBLIC_API_URL}/api/pacs-servers/`;
      
      const method = editingServer ? 'PATCH' : 'POST';
      
      const response = await AuthService.authenticatedFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      
      if (response.ok) {
        const savedServer = await response.json();
        
        if (editingServer) {
          setServers(prev => prev.map(s => s.id === editingServer.id ? savedServer : s));
          toast.success('PACS server updated successfully');
        } else {
          setServers(prev => [...prev, savedServer]);
          toast.success('PACS server added successfully');
        }
        
        setShowAddForm(false);
        setEditingServer(null);
        clearPacsConfigCache();
      }
    } catch (error) {
      toast.error('Failed to save PACS server');
    }
  };
  
  const PacsServerForm = ({ server, onSave, onCancel }: {
    server?: PacsServer | null;
    onSave: (data: PacsServerFormData) => void;
    onCancel: () => void;
  }) => {
    const [localFormData, setLocalFormData] = useState<PacsServerFormData>(
      server ? {
        name: server.name,
        orthancurl: server.orthancurl,
        viewrurl: server.viewrurl,
        endpoint_style: server.endpoint_style,
        comments: server.comments || ''
      } : {
        name: '',
        orthancurl: '',
        viewrurl: '',
        endpoint_style: 'dicomweb',
        comments: ''
      }
    );

    return (
      <Card className="mb-4">
        <CardHeader>
          <CardTitle>{server ? 'Edit PACS Server' : 'Add New PACS Server'}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <Label htmlFor="name">Server Name *</Label>
              <Input
                id="name"
                value={localFormData.name}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, name: e.target.value }))}
                placeholder="e.g., Unraid Orthanc, Main Hospital PACS"
              />
            </div>
            
            <div>
              <Label htmlFor="orthancurl">Orthanc URL *</Label>
              <Input
                id="orthancurl"
                type="url"
                value={localFormData.orthancurl}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, orthancurl: e.target.value }))}
                placeholder="e.g., http://10.0.1.0:8042"
              />
            </div>
            
            <div>
              <Label htmlFor="viewrurl">DICOM Viewer URL *</Label>
              <Input
                id="viewrurl"
                type="url"
                value={localFormData.viewrurl}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, viewrurl: e.target.value }))}
                placeholder="e.g., http://localhost:3000/viewer"
              />
            </div>
            
            <div>
              <Label htmlFor="endpoint_style">Endpoint Style</Label>
              <Select 
                value={localFormData.endpoint_style} 
                onValueChange={(value) => setLocalFormData(prev => ({ ...prev, endpoint_style: value }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dicomweb">DICOMweb (Recommended)</SelectItem>
                  <SelectItem value="file">File endpoint</SelectItem>
                  <SelectItem value="attachment">Attachment</SelectItem>
                  <SelectItem value="auto">Auto-detect</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="comments">Comments & Usage Notes</Label>
              <Textarea
                id="comments"
                value={localFormData.comments}
                onChange={(e) => setLocalFormData(prev => ({ ...prev, comments: e.target.value }))}
                placeholder="e.g., This is only for CT Scan images, Archive server for studies older than 1 year"
                rows={3}
              />
            </div>
            
            <div className="flex gap-2 pt-4">
              <Button onClick={() => onSave(localFormData)}>
                {server ? 'Update Server' : 'Add Server'}
              </Button>
              <Button variant="outline" onClick={onCancel}>
                Cancel
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {(showAddForm || editingServer) && (
        <PacsServerForm
          server={editingServer}
          onSave={handleSaveServer}
          onCancel={() => {
            setShowAddForm(false);
            setEditingServer(null);
          }}
        />
      )}
      
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle>PACS Servers</CardTitle>
              <CardDescription>Manage multiple PACS server connections</CardDescription>
            </div>
            {!showAddForm && !editingServer && (
              <Button onClick={() => setShowAddForm(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add PACS Server
              </Button>
            )}
          </div>
        </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {servers.map(server => (
            <div key={server.id} className="border rounded-lg p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold text-lg">{server.name}</h3>
                    {server.is_primary && (
                      <Badge variant="default">Primary</Badge>
                    )}
                    <Badge variant={server.is_active ? "outline" : "secondary"}>
                      {server.is_active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  
                  {server.comments && (
                    <div className="mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-400 rounded">
                      <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                        {server.comments}
                      </p>
                    </div>
                  )}
                  
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Orthanc:</span> {server.orthancurl}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Viewer:</span> {server.viewrurl}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Endpoint:</span> {server.endpoint_style}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={server.is_active}
                    onCheckedChange={(checked) => handleToggleActive(server.id, checked)}
                  />
                  {server.is_active && !server.is_primary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimary(server.id)}
                    >
                      Set Primary
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingServer(server)}
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDeleteServer(server.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

#### 4.2 Updated Settings Page

```typescript
// src/app/(app)/settings/page.tsx - Updated to include PacsServerManager
export default function SettingsPage() {
  const { user } = useAuth();
  const isSupervisor = user?.is_superuser || false;
  
  if (!isSupervisor) {
    return <AccessDeniedMessage />;
  }
  
  return (
    <div className="space-y-6">
      <PacsServerManager />
      {/* Other settings components */}
    </div>
  );
}
```

### Phase 5: Frontend Feature Updates

#### 5.1 Enhanced PACS Browser

```typescript
// src/app/(app)/pacs-browser/page.tsx - Updated search functionality
export default function PacsBrowserPage() {
  const [selectedServers, setSelectedServers] = useState<number[]>([]);
  const [availableServers, setAvailableServers] = useState<PacsServer[]>([]);
  
  useEffect(() => {
    const loadServers = async () => {
      const servers = await getActivePacsServers();
      setAvailableServers(servers);
      setSelectedServers(servers.map(s => s.id)); // Select all by default
    };
    loadServers();
  }, []);
  
  const searchMultiplePacs = useCallback(async () => {
    try {
      setSearching(true);
      setError(null);
      
      const searchParams = {
        // ... existing search parameters
        server_ids: selectedServers // Include selected server IDs
      };
      
      const response = await AuthService.authenticatedFetch(
        `${process.env.NEXT_PUBLIC_API_URL}/api/pacs/search-multiple/`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(searchParams)
        }
      );
      
      const data = await response.json();
      
      if (data.success) {
        setAllStudies(data.studies);
        
        // Show server errors if any
        if (Object.keys(data.server_errors).length > 0) {
          const errorMessage = Object.entries(data.server_errors)
            .map(([server, error]) => `${server}: ${error}`)
            .join('\n');
          toast.warning(`Some servers had errors:\n${errorMessage}`);
        }
        
        toast.success(`Found ${data.total_count} studies from ${data.servers_searched.length} servers`);
      }
    } catch (error) {
      setError('Failed to search PACS servers');
      toast.error('Failed to search PACS servers');
    } finally {
      setSearching(false);
    }
  }, [selectedServers, /* other dependencies */]);
  
  return (
    <div>
      {/* Server Selection UI */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>PACS Server Selection</CardTitle>
          <CardDescription>Choose which PACS servers to search</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {availableServers.map(server => (
              <div key={server.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`server-${server.id}`}
                  checked={selectedServers.includes(server.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedServers(prev => [...prev, server.id]);
                    } else {
                      setSelectedServers(prev => prev.filter(id => id !== server.id));
                    }
                  }}
                />
                <Label htmlFor={`server-${server.id}`} className="flex items-center gap-2">
                  {server.name}
                  {server.is_primary && <Badge variant="outline" className="text-xs">Primary</Badge>}
                </Label>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      
      {/* Rest of existing PACS browser UI */}
      {/* Studies table will now show server information */}
    </div>
  );
}
```

#### 5.2 Upload Page with PACS Selection

```typescript
// src/app/(app)/upload/page.tsx - Add PACS server selection
export default function UploadPage() {
  const [selectedPacsServer, setSelectedPacsServer] = useState<number | null>(null);
  const [availableServers, setAvailableServers] = useState<PacsServer[]>([]);
  
  useEffect(() => {
    const loadServers = async () => {
      const servers = await getActivePacsServers();
      setAvailableServers(servers);
      
      // Auto-select primary server
      const primary = servers.find(s => s.is_primary);
      if (primary) {
        setSelectedPacsServer(primary.id);
      }
    };
    loadServers();
  }, []);
  
  return (
    <ProtectedRoute requireStaff={true}>
      <div className="container mx-auto py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold">Upload DICOM Images</h1>
            <p className="text-muted-foreground">
              Upload DICOM files and register them in the RIS system
            </p>
          </div>
        </div>

        {/* PACS Server Selection */}
        <Card>
          <CardHeader>
            <CardTitle>PACS Destination</CardTitle>
            <CardDescription>Choose which PACS server to upload to</CardDescription>
          </CardHeader>
          <CardContent>
            <Select 
              value={selectedPacsServer?.toString()} 
              onValueChange={(value) => setSelectedPacsServer(parseInt(value))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select PACS server" />
              </SelectTrigger>
              <SelectContent>
                {availableServers.map(server => (
                  <SelectItem key={server.id} value={server.id.toString()}>
                    <div className="flex items-center gap-2">
                      {server.name}
                      {server.is_primary && (
                        <Badge variant="outline" className="text-xs">Primary</Badge>
                      )}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Information Card */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              How it works
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm space-y-2">
            <p><strong>1. Upload:</strong> Select or drag DICOM files (.dcm, .dicom) to upload</p>
            <p><strong>2. Patient Matching:</strong> Choose an existing patient or let the system create a new one from DICOM metadata</p>
            <p><strong>3. Study Registration:</strong> The system automatically creates a study registration in the RIS</p>
            <p><strong>4. PACS Storage:</strong> Files are stored in the selected PACS server for viewing</p>
            <div className="mt-3 p-3 border rounded border-l-4">
              <p className="text-xs">
                <strong>Note:</strong> Uploaded studies will be immediately available for viewing in the DICOM viewer.
                All patient information is extracted from DICOM metadata when available.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Upload Component */}
        {selectedPacsServer && (
          <DicomUpload 
            pacsServerId={selectedPacsServer}
            onUploadComplete={handleUploadComplete}
            onClose={handleClose}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
```

#### 5.3 Updated Examinations Page

```typescript
// src/app/(app)/examinations/page.tsx - Use examination's stored PACS server
interface ExaminationWithServer extends Examination {
  pacs_server: {
    id: number;
    name: string;
    is_active: boolean;
  };
}

export default function ExaminationsPage() {
  const [examinations, setExaminations] = useState<ExaminationWithServer[]>([]);
  
  const viewStudy = (examination: ExaminationWithServer) => {
    if (!examination.pacs_server.is_active) {
      toast.warning(`PACS server "${examination.pacs_server.name}" is inactive but attempting to load images...`);
    }
    
    // Use the examination's stored PACS server for viewing
    router.push(`/examinations/${examination.id}/view?pacs_server=${examination.pacs_server.id}`);
  };
  
  return (
    <div>
      {/* Examinations table with server information */}
      {examinations.map(examination => (
        <tr key={examination.id}>
          <td>
            {/* Existing examination data */}
          </td>
          <td>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                Server: {examination.pacs_server.name}
              </span>
              {!examination.pacs_server.is_active && (
                <Badge variant="warning" className="text-xs">
                  Server Inactive
                </Badge>
              )}
            </div>
          </td>
          <td>
            <Button onClick={() => viewStudy(examination)}>
              View Images
            </Button>
          </td>
        </tr>
      ))}
    </div>
  );
}
```

### Phase 6: Server Reference Tracking

#### 6.1 Import Process Updates

```python
# exam/pacs_views.py - Updated import function
def import_legacy_study(request):
    """Import study and record which server it came from"""
    study_instance_uid = request.data.get('studyInstanceUid')
    source_server_id = request.data.get('source_server_id')  # NEW: Track source server
    
    try:
        source_server = PacsServer.objects.get(id=source_server_id, is_active=True)
    except PacsServer.DoesNotExist:
        return Response({'error': 'Invalid or inactive source PACS server'}, status=400)
    
    # ... existing import logic ...
    
    # When creating PacsExam record:
    pacs_exam = PacsExam.objects.create(
        # ... existing fields ...
        pacs_server=source_server,  # NEW: Record which server contains the images
        study_instance_uid=study_instance_uid,
    )
    
    return Response({
        'success': True,
        'registration_id': registration.id,
        'pacs_server': {
            'id': source_server.id,
            'name': source_server.name
        }
    })
```

#### 6.2 Upload Process Updates

```python
# exam/upload_views.py - Updated upload function
def upload_dicom_study(request):
    """Upload DICOM files and record destination server"""
    destination_server_id = request.data.get('destination_server_id')  # NEW: Track destination
    dicom_files = request.FILES.getlist('dicom_files')
    
    try:
        destination_server = PacsServer.objects.get(id=destination_server_id, is_active=True)
    except PacsServer.DoesNotExist:
        return Response({'error': 'Invalid or inactive destination PACS server'}, status=400)
    
    # Upload to specific Orthanc server
    orthanc_url = destination_server.orthancurl
    
    # ... existing upload logic using destination_server.orthancurl ...
    
    # When creating PacsExam record:
    pacs_exam = PacsExam.objects.create(
        # ... existing fields ...
        pacs_server=destination_server,  # NEW: Record where images were uploaded
        study_instance_uid=uploaded_study_uid,
    )
    
    return Response({
        'success': True,
        'study_id': study.id,
        'pacs_server': {
            'id': destination_server.id,
            'name': destination_server.name
        }
    })
```

### Phase 7: Backend Integration Points

#### 7.1 Updated Image Proxy Views

```python
# exam/multi_pacs_views.py
class MultiServerDicomInstanceProxy(APIView):
    """Proxy DICOM instances from specific PACS server"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, server_id: int, orthanc_id: str):
        try:
            # Allow access to inactive servers for historical data, but warn
            pacs_server = PacsServer.objects.get(id=server_id, is_deleted=False)
            
            if not pacs_server.is_active:
                # Log warning but still attempt to serve images
                logger.warning(f"Accessing images from inactive PACS server: {pacs_server.name}")
                
        except PacsServer.DoesNotExist:
            return Response({'error': 'PACS server not found'}, status=404)
        
        # Use the specific server's configuration for proxy
        return self.proxy_with_server_config(pacs_server, orthanc_id, request)
    
    def proxy_with_server_config(self, server: PacsServer, orthanc_id: str, request):
        """Proxy request using specific server configuration"""
        # Implementation similar to existing proxy views but with server-specific config
        orthanc_url = server.orthancurl
        endpoint_style = server.endpoint_style
        
        # ... existing proxy logic adapted for server-specific config ...
        pass

class ExaminationImageProxy(APIView):
    """Proxy images for specific examination using its recorded server"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, examination_id: int, orthanc_id: str):
        try:
            # Get examination and its associated PACS server
            examination = get_object_or_404(PacsExam, id=examination_id)
            pacs_server = examination.pacs_server
            
            if pacs_server.is_deleted:
                return Response({'error': 'PACS server has been deleted'}, status=410)
            
            if not pacs_server.is_active:
                logger.warning(f"Serving images from inactive server {pacs_server.name} for examination {examination_id}")
            
            return self.proxy_with_server_config(pacs_server, orthanc_id, request)
            
        except PacsExam.DoesNotExist:
            return Response({'error': 'Examination not found'}, status=404)
```

class PacsUploadDestinationsView(APIView):
    """Return available PACS servers for upload"""
    permission_classes = [IsAuthenticated, IsStaff]
    
    def get(self, request):
        active_servers = PacsServer.objects.filter(is_active=True)
        serializer = PacsServerListSerializer(active_servers, many=True)
        return Response({
            'servers': serializer.data,
            'primary_server_id': active_servers.filter(is_primary=True).first()?.id
        })
```

### Phase 7: Migration & Deployment Strategy

#### 7.1 Database Migration Plan

1. **Create new `PacsServer` model**
2. **Data migration script**:
   ```python
   # Migration file
   def migrate_existing_pacs_config(apps, schema_editor):
       PacsConfig = apps.get_model('exam', 'PacsConfig')
       PacsServer = apps.get_model('exam', 'PacsServer')
       PacsExam = apps.get_model('exam', 'PacsExam')
       
       # Migrate existing config to first PacsServer
       existing_config = PacsConfig.objects.first()
       if existing_config:
           migrated_server = PacsServer.objects.create(
               name='Main Hospital PACS',
               orthancurl=existing_config.orthancurl,
               viewrurl=existing_config.viewrurl,
               endpoint_style=existing_config.endpoint_style,
               is_active=True,
               is_primary=True,
               comments='Migrated from original PACS configuration - Main production server'
           )
           
           # Update all existing PacsExam records to reference the migrated server
           PacsExam.objects.filter(pacs_server__isnull=True).update(pacs_server=migrated_server)
   ```

3. **Backward compatibility period** - Keep old endpoints working

#### 7.2 Frontend Deployment Strategy

1. **Feature flags** for gradual rollout
2. **Fallback mechanisms** to single PACS mode
3. **Cache invalidation** when switching between modes

### Phase 8: Testing Strategy

#### 8.1 Backend Tests

```python
# tests/test_multiple_pacs.py
class MultiplePacsTestCase(TestCase):
    def test_primary_pacs_constraint(self):
        """Test that only one primary PACS can exist"""
        pass
    
    def test_active_pacs_requirement(self):
        """Test that at least one PACS must remain active"""
        pass
    
    def test_multiple_pacs_search(self):
        """Test searching across multiple PACS servers"""
        pass
    
    def test_server_specific_proxy(self):
        """Test DICOM proxy with specific server"""
        pass
```

#### 8.2 Frontend Tests

```typescript
// tests/multiple-pacs.test.tsx
describe('Multiple PACS Management', () => {
  test('should display all active PACS servers', async () => {
    // Test component rendering
  });
  
  test('should handle primary server selection', async () => {
    // Test primary server switching
  });
  
  test('should search across selected servers', async () => {
    // Test multi-server search
  });
});
```

### Phase 8: PACS Server Lifecycle Management

#### 8.1 Soft Deletion Strategy

To preserve historical examination data, servers should never be hard-deleted if they contain examinations:

```python
# exam/pacs_management_views.py
class PacsServerViewSet(viewsets.ModelViewSet):
    def destroy(self, request, *args, **kwargs):
        """Soft delete server if it has examinations, hard delete if empty"""
        pacs_server = self.get_object()
        
        # Check if server has any examinations
        examination_count = pacs_server.examinations.count()
        
        if examination_count > 0:
            # Soft delete - keep server for historical data
            pacs_server.is_deleted = True
            pacs_server.is_active = False
            pacs_server.is_primary = False
            pacs_server.save()
            
            return Response({
                'message': f'Server marked as deleted. {examination_count} historical examinations preserved.',
                'examination_count': examination_count,
                'soft_deleted': True
            })
        else:
            # Hard delete - no examinations depend on this server
            pacs_server.delete()
            return Response({'message': 'Server permanently deleted.', 'soft_deleted': False})

    @action(detail=True, methods=['post'])
    def restore(self, request, pk=None):
        """Restore a soft-deleted server"""
        pacs_server = self.get_object()
        if not pacs_server.is_deleted:
            return Response({'error': 'Server is not deleted'}, status=400)
        
        pacs_server.is_deleted = False
        pacs_server.is_active = True  # Reactivate on restore
        pacs_server.save()
        
        return Response({'message': 'Server restored successfully'})
```

#### 8.2 Server Health Monitoring

```python
# exam/pacs_health_views.py
@api_view(['GET'])
@permission_classes([IsAuthenticated, IsSuperUser])
def pacs_servers_health_check(request):
    """Check health of all PACS servers"""
    servers = PacsServer.objects.filter(is_deleted=False)
    health_status = {}
    
    for server in servers:
        try:
            # Test connection to Orthanc server
            response = requests.get(f"{server.orthancurl}/system", timeout=5)
            health_status[server.id] = {
                'name': server.name,
                'status': 'healthy' if response.status_code == 200 else 'unhealthy',
                'response_time_ms': response.elapsed.total_seconds() * 1000,
                'examination_count': server.examinations.count()
            }
        except Exception as e:
            health_status[server.id] = {
                'name': server.name,
                'status': 'unreachable',
                'error': str(e),
                'examination_count': server.examinations.count()
            }
    
    return Response(health_status)
```

## Benefits of This Implementation

1. **Data Integrity**: Each examination knows exactly where its images are stored, regardless of server changes
2. **Historical Preservation**: Changing primary servers doesn't break access to historical examinations
3. **Flexibility**: Support for multiple PACS environments (production, staging, archive)
4. **Reliability**: Graceful handling of inactive servers while preserving data access
5. **Scalability**: Easy to add new PACS servers as needed
6. **User Control**: Fine-grained control over which servers to use for new operations
7. **Backward Compatibility**: Existing single-PACS workflows continue to work
8. **Audit Trail**: Clear tracking of which server contains each examination's data
9. **Soft Deletion**: Servers with historical data can't be accidentally deleted

## Technical Considerations

1. **Performance**: Parallel searches across multiple servers
2. **Error Handling**: Graceful failure handling for unreachable servers
3. **Caching**: Updated caching strategy for multiple server configurations
4. **Security**: Server-specific authentication if needed
5. **Monitoring**: Health checks for all configured servers

## Implementation Timeline

- **Phase 1-2 (Backend)**: 2-3 weeks
- **Phase 3-4 (Frontend Core)**: 2-3 weeks  
- **Phase 5 (UI Updates)**: 2-3 weeks
- **Phase 6-7 (Integration & Migration)**: 1-2 weeks
- **Phase 8 (Testing)**: 1 week

**Total Estimated Timeline**: 8-12 weeks

## Example PACS Server Configurations

Here are some typical PACS server setups that organizations might implement:

### Production Environment
```
Name: Main Hospital PACS
URL: http://10.0.1.100:8042
Comments: Primary production server for all current examinations
Status: Active, Primary
```

### Modality-Specific Servers
```
Name: Unraid Orthanc CT
URL: http://10.0.1.50:8042
Comments: Dedicated server for CT scan images only

Name: Radiology Dept MRI
URL: http://172.16.1.200:8043
Comments: MRI studies and specialized sequences

Name: Emergency Dept X-Ray
URL: http://192.168.100.10:8042
Comments: Emergency department X-ray images for quick access
```

### Archive Setup
```
Name: Long-term Archive
URL: http://archive.hospital.local:8042
Comments: Archive server for studies older than 2 years
Status: Active, Non-primary

Name: Backup PACS
URL: http://backup-pacs.hospital.local:8042
Comments: Mirror of main PACS for disaster recovery
Status: Inactive (activate when needed)
```

### Development/Testing
```
Name: Development PACS
URL: http://dev-orthanc:8042
Comments: Development environment for testing new features
Status: Active, Non-primary

Name: Training PACS
URL: http://training.hospital.local:8042
Comments: Training environment with anonymized test data
Status: Active, Non-primary
```

This comprehensive plan provides a robust foundation for multiple PACS server support while maintaining backward compatibility and providing enhanced functionality for the RIS system.