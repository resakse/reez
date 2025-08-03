# Radiology Reject Analysis Implementation Plan

## Overview

This document outlines a comprehensive plan to implement a monthly reject analysis system for the RIS application. The system will track imaging retakes, analyze error patterns, calculate reject rates, and provide actionable insights to improve image quality and reduce patient radiation exposure.

## 1. Research Findings

### Malaysian Standards and Guidelines
- **MOH Malaysia**: Ministry of Health Malaysia oversees radiology quality through national policies and Quality Assurance Programme (QAP)
- **MSQH Standards**: Malaysian Society for Quality in Health provides healthcare accreditation standards recognized by MOH
- **College of Radiology Malaysia**: Publishes QAP implementation manual (Amendment 2023) for radiology services
- **Diagnostic Reference Levels**: Malaysia has established national DRLs - institutions should establish local DRLs when national standards are pending
- **QAP Framework**: 25+ years of quality assurance in Malaysian public health sector with mandatory annual reporting
- **Patient Safety**: Aligns with international standards - 14% of patient radiation exposure comes from retakes

### International Benchmarks for Context
- **ACR Guidelines**: International reference of 8% reject rate (AAPM TG151) - use as benchmark but prioritize Malaysian standards
- **Current Industry Rates**: Digital departments report reject rates around 5-10%

### Common Reject Categories
Based on medical imaging literature, the most common causes of image rejection are:

1. **Human Faults (87.5% of rejections)**
   - Positioning and centering errors (82.3% combined)
   - Anatomy cutoff (28.1%)
   - Over/Under exposure issues
   - Patient motion artifacts
   - Wrong identification or labeling

2. **Equipment Issues**
   - Calibration problems
   - Hardware malfunctions
   - Processing artifacts
   - Technical failures

3. **Processing Errors**
   - Incorrect image processing parameters
   - Software-related artifacts
   - Network transmission errors

4. **Other Factors**
   - Patient condition limitations
   - Environmental factors
   - Procedural complications

## 2. Database Design

### Core Models

#### 2.1 RejectCategory Model
```python
class RejectCategory(OrderedModel):
    """Main categories for reject analysis"""
    CATEGORY_TYPES = [
        ('HUMAN_FAULTS', 'Human Faults'),
        ('EQUIPMENT', 'Equipment'),
        ('PROCESSING', 'Processing'),
        ('OTHERS', 'Others'),
    ]
    
    name = models.CharField(max_length=100)
    category_type = models.CharField(max_length=20, choices=CATEGORY_TYPES)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    # OrderedModel provides drag-and-drop sorting via 'order' field
    class Meta(OrderedModel.Meta):
        ordering = ['category_type', 'order']
        unique_together = ['category_type', 'name']
```

#### 2.2 RejectReason Model
```python
class RejectReason(OrderedModel):
    """Specific reasons within each category"""
    category = models.ForeignKey(RejectCategory, on_delete=models.CASCADE, related_name='reasons')
    reason = models.CharField(max_length=200)
    description = models.TextField(blank=True, null=True)
    is_active = models.BooleanField(default=True)
    
    # Default reasons for Human Faults
    # - Over Exposure / High Index
    # - Under Exposure / Low Index
    # - Positioning Error
    # - Anatomy Cutoff
    # - Patient Motion
    # - Wrong Identification
    
    class Meta(OrderedModel.Meta):
        ordering = ['category', 'order']
        unique_together = ['category', 'reason']
```

#### 2.3 RejectAnalysis Model
```python
class RejectAnalysis(models.Model):
    """Monthly reject analysis tracking"""
    analysis_date = models.DateField(help_text="Month and year for this analysis")
    modality = models.ForeignKey('exam.Modaliti', on_delete=models.CASCADE)
    
    # Calculated statistics
    total_examinations = models.PositiveIntegerField(help_text="Total examinations for the month")
    total_images = models.PositiveIntegerField(help_text="Total images produced (including retakes)")
    total_retakes = models.PositiveIntegerField(help_text="Total number of retake images")
    
    # Calculated percentages
    reject_rate = models.DecimalField(
        max_digits=5, decimal_places=2, 
        help_text="Reject rate percentage (total_retakes/total_images) * 100"
    )
    
    # Annual tracking
    comments = models.TextField(blank=True, null=True, help_text="Comments for the analysis period")
    corrective_actions = models.TextField(blank=True, null=True, help_text="Corrective actions taken")
    
    # Metadata
    created_by = models.ForeignKey('staff.Staff', on_delete=models.SET_NULL, null=True)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        unique_together = ['analysis_date', 'modality']
        ordering = ['-analysis_date', 'modality']
```

#### 2.4 RejectIncident Model
```python
class RejectIncident(models.Model):
    """Individual reject incidents linked to examinations"""
    examination = models.ForeignKey('exam.Pemeriksaan', on_delete=models.CASCADE, related_name='reject_incidents')
    analysis = models.ForeignKey(RejectAnalysis, on_delete=models.CASCADE, related_name='incidents')
    
    # Reject details
    reject_reason = models.ForeignKey(RejectReason, on_delete=models.CASCADE)
    reject_date = models.DateTimeField(default=timezone.now)
    
    # Technical details
    retake_count = models.PositiveSmallIntegerField(default=1, help_text="Number of retakes for this examination")
    technologist = models.ForeignKey('staff.Staff', on_delete=models.SET_NULL, null=True, blank=True)
    
    # Additional context
    notes = models.TextField(blank=True, null=True, help_text="Additional notes about the reject")
    
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-reject_date']
```

### PACS Server Configuration for Reject Analysis

Add new field to existing `PacsServer` model:

```python
# exam/models.py - Add to existing PacsServer model
class PacsServer(models.Model):
    # ... existing fields ...
    
    # New field for reject analysis configuration
    include_in_reject_analysis = models.BooleanField(
        default=True, 
        help_text="Include this PACS server in reject analysis calculations. "
                 "Uncheck for imported data from other facilities or archived data "
                 "that shouldn't count towards institution's statistics."
    )
```

### Admin Interface Configuration

```python
# exam/admin.py - Update PacsServer admin
@admin.register(PacsServer)
class PacsServerAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'is_primary', 'include_in_reject_analysis', 'comments']
    list_filter = ['is_active', 'is_primary', 'include_in_reject_analysis']
    fieldsets = [
        ('Server Information', {
            'fields': ['name', 'orthancurl', 'viewrurl', 'endpoint_style']
        }),
        ('Configuration', {
            'fields': ['is_active', 'is_primary', 'include_in_reject_analysis']
        }),
        ('Documentation', {
            'fields': ['comments']
        })
    ]
    
    def get_readonly_fields(self, request, obj=None):
        # Only superusers can modify reject analysis inclusion
        if not request.user.is_superuser:
            return ['include_in_reject_analysis']
        return []
```

### Migration Strategy
1. Create reject analysis models in `exam/models.py` alongside existing models
2. Add `include_in_reject_analysis` field to existing `PacsServer` model
3. Create data migration to set default values for existing PACS servers
4. Add initial data fixtures for common reject categories and reasons
5. Create management command to populate historical data if needed

## 3. Backend API Design

### 3.1 Django REST Framework Serializers

```python
# exam/serializers.py

class RejectReasonSerializer(serializers.ModelSerializer):
    class Meta:
        model = RejectReason
        fields = ['id', 'reason', 'description', 'is_active', 'order']

class RejectCategorySerializer(serializers.ModelSerializer):
    reasons = RejectReasonSerializer(many=True, read_only=True)
    
    class Meta:
        model = RejectCategory
        fields = ['id', 'name', 'category_type', 'description', 'is_active', 'order', 'reasons']

class RejectIncidentSerializer(serializers.ModelSerializer):
    reject_reason_name = serializers.CharField(source='reject_reason.reason', read_only=True)
    technologist_name = serializers.CharField(source='technologist.get_full_name', read_only=True)
    
    class Meta:
        model = RejectIncident
        fields = ['id', 'examination', 'reject_reason', 'reject_reason_name', 
                 'reject_date', 'retake_count', 'technologist', 'technologist_name', 'notes']

class RejectAnalysisSerializer(serializers.ModelSerializer):
    modality_name = serializers.CharField(source='modality.nama', read_only=True)
    incidents = RejectIncidentSerializer(many=True, read_only=True)
    
    class Meta:
        model = RejectAnalysis
        fields = ['id', 'analysis_date', 'modality', 'modality_name', 'total_examinations',
                 'total_images', 'total_retakes', 'reject_rate', 'comments', 
                 'corrective_actions', 'incidents', 'created', 'modified']
```

### 3.2 API Endpoints

```python
# exam/urls.py - Add to existing patterns

# Reject Analysis APIs
path('api/reject-categories/', RejectCategoryListCreateView.as_view(), name='reject-categories'),
path('api/reject-categories/<int:pk>/', RejectCategoryDetailView.as_view(), name='reject-category-detail'),
path('api/reject-categories/<int:category_id>/reasons/', RejectReasonListCreateView.as_view(), name='reject-reasons'),
path('api/reject-reasons/<int:pk>/', RejectReasonDetailView.as_view(), name='reject-reason-detail'),
path('api/reject-analysis/', RejectAnalysisListCreateView.as_view(), name='reject-analysis'),
path('api/reject-analysis/<int:pk>/', RejectAnalysisDetailView.as_view(), name='reject-analysis-detail'),
path('api/reject-incidents/', RejectIncidentListCreateView.as_view(), name='reject-incidents'),
path('api/reject-incidents/<int:pk>/', RejectIncidentDetailView.as_view(), name='reject-incident-detail'),

# Statistics and reporting endpoints
path('api/reject-analysis/statistics/<str:year>/', RejectAnalysisStatisticsView.as_view(), name='reject-statistics'),
path('api/reject-analysis/trends/', RejectAnalysisTrendsView.as_view(), name='reject-trends'),
```

### 3.3 ViewSets and Business Logic

```python
# exam/views.py - Add to existing views

class RejectAnalysisViewSet(viewsets.ModelViewSet):
    """CRUD operations for reject analysis"""
    queryset = RejectAnalysis.objects.all()
    serializer_class = RejectAnalysisSerializer
    permission_classes = [IsAuthenticated]
    
    def perform_create(self, serializer):
        # Auto-calculate statistics when creating new analysis
        analysis = serializer.save(created_by=self.request.user)
        self.calculate_monthly_statistics(analysis)
    
    def calculate_monthly_statistics(self, analysis):
        """Calculate monthly statistics for the analysis"""
        month_start = analysis.analysis_date.replace(day=1)
        month_end = (month_start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        
        # Get examinations for the month and modality
        examinations = Pemeriksaan.objects.filter(
            exam__modaliti=analysis.modality,
            created__date__range=[month_start, month_end]
        )
        
        # Calculate totals
        analysis.total_examinations = examinations.count()
        analysis.total_retakes = RejectIncident.objects.filter(
            analysis=analysis
        ).aggregate(
            total_retakes=Sum('retake_count')
        )['total_retakes'] or 0
        
        # Get actual total images from PACS instead of estimating
        analysis.total_images = self.get_monthly_images_from_pacs(
            analysis.modality, month_start, month_end
        )
        
        # Calculate reject rate
        if analysis.total_images > 0:
            analysis.reject_rate = (analysis.total_retakes / analysis.total_images) * 100
        else:
            analysis.reject_rate = 0
            
        analysis.save()
    
    def get_monthly_images_from_pacs(self, modality, start_date, end_date):
        """Get actual image count from PACS/Orthanc for the month"""
        from exam.utils import get_orthanc_monthly_images
        
        # Query only PACS servers configured for reject analysis
        # Exclude imported data from other facilities or archived data
        total_images = 0
        pacs_servers = PacsServer.objects.filter(
            is_active=True,
            include_in_reject_analysis=True  # New filter for reject analysis
        )
        
        for pacs_server in pacs_servers:
            try:
                images_count = get_orthanc_monthly_images(
                    pacs_server, modality, start_date, end_date
                )
                total_images += images_count
                logger.info(f"PACS {pacs_server.name}: {images_count} images for {modality.nama}")
            except Exception as e:
                # Log error but continue with other servers
                logger.warning(f"Failed to get images from {pacs_server.name}: {e}")
        
        return total_images

class RejectAnalysisStatisticsView(APIView):
    """Annual statistics and trends"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request, year):
        analyses = RejectAnalysis.objects.filter(
            analysis_date__year=year
        ).values('modality__nama').annotate(
            avg_reject_rate=Avg('reject_rate'),
            total_retakes=Sum('total_retakes'),
            total_images=Sum('total_images')
        )
        
        return Response({
            'year': year,
            'modalities': analyses,
            'overall_reject_rate': analyses.aggregate(
                overall=Sum('total_retakes') * 100.0 / Sum('total_images')
            )['overall'] or 0
        })

# exam/utils.py - Add new utility function

def get_orthanc_monthly_images(pacs_server, modality, start_date, end_date):
    """Query Orthanc for total image count in date range"""
    import requests
    
    # Format dates for DICOM query (YYYYMMDD)
    start_dicom = start_date.strftime('%Y%m%d')
    end_dicom = end_date.strftime('%Y%m%d')
    
    # Orthanc find query
    query_data = {
        "Level": "Instance",
        "Query": {
            "StudyDate": f"{start_dicom}-{end_dicom}",
            "Modality": modality.singkatan  # Use modality abbreviation
        }
    }
    
    try:
        # Query Orthanc for instances
        response = requests.post(
            f"{pacs_server.orthancurl}/tools/find",
            json=query_data,
            timeout=30
        )
        response.raise_for_status()
        
        # Return count of instances (images)
        instances = response.json()
        return len(instances)
        
    except requests.RequestException as e:
        logger.error(f"Orthanc query failed for {pacs_server.name}: {e}")
        return 0
```

## 4. Frontend Implementation

### 4.1 React Components Structure

```
ris-frontend/src/components/reject-analysis/
├── RejectAnalysisDashboard.tsx      # Main dashboard component
├── RejectAnalysisForm.tsx           # Create/edit analysis form
├── RejectCategoryManager.tsx        # CRUD for categories and reasons
├── RejectIncidentForm.tsx           # Log individual reject incidents
├── RejectStatisticsCard.tsx         # KPI cards display
├── RejectTrendsChart.tsx            # Time series charts
└── RejectReasonChart.tsx            # Pie/bar charts for reasons
```

### 4.2 Key Components

#### RejectAnalysisDashboard.tsx
```typescript
interface RejectAnalysisProps {
  selectedMonth: string;
  selectedModality?: string;
}

export function RejectAnalysisDashboard({ selectedMonth, selectedModality }: RejectAnalysisProps) {
  const [analysisData, setAnalysisData] = useState<RejectAnalysis[]>([]);
  const [loading, setLoading] = useState(true);

  // Fetch data, display cards, charts, and tables
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <RejectStatisticsCard title="Total Examinations" value={totalExams} />
        <RejectStatisticsCard title="Total Retakes" value={totalRetakes} />
        <RejectStatisticsCard title="Reject Rate" value={`${rejectRate}%`} trend="down" />
        <RejectStatisticsCard title="Target Rate" value="< 8%" />
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RejectTrendsChart data={trendsData} />
        <RejectReasonChart data={reasonsData} />
      </div>

      {/* Data Table */}
      <RejectAnalysisTable data={analysisData} />
    </div>
  );
}
```

#### RejectCategoryManager.tsx
```typescript
export function RejectCategoryManager() {
  // Implements drag-and-drop sorting for categories and reasons
  // Uses react-beautiful-dnd or similar library
  // CRUD operations with optimistic updates
  
  return (
    <div className="space-y-4">
      <DragDropContext onDragEnd={handleDragEnd}>
        {categories.map(category => (
          <CategorySection 
            key={category.id} 
            category={category}
            onUpdate={updateCategory}
            onDelete={deleteCategory}
          />
        ))}
      </DragDropContext>
    </div>
  );
}
```

#### PacsConfigManager.tsx
```typescript
export function PacsConfigManager() {
  const [pacsServers, setPacsServers] = useState<PacsServer[]>([]);
  const [loading, setLoading] = useState(true);

  // Only accessible to superusers
  if (!user?.is_superuser) {
    return <div>Access denied. Superuser privileges required.</div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>PACS Server Configuration for Reject Analysis</CardTitle>
        <CardDescription>
          Configure which PACS servers should be included in reject analysis calculations.
          Exclude servers with imported data from other facilities.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {pacsServers.map(server => (
            <div key={server.id} className="flex items-center justify-between p-4 border rounded">
              <div>
                <h4 className="font-medium">{server.name}</h4>
                <p className="text-sm text-muted-foreground">{server.comments}</p>
              </div>
              <div className="flex items-center space-x-4">
                <Badge variant={server.is_active ? "default" : "secondary"}>
                  {server.is_active ? "Active" : "Inactive"}
                </Badge>
                <Switch
                  checked={server.include_in_reject_analysis}
                  onCheckedChange={(checked) => updatePacsServer(server.id, { include_in_reject_analysis: checked })}
                />
                <span className="text-sm">Include in Analysis</span>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

### 4.3 Charts Implementation

Using **Chart.js** with **react-chartjs-2** for visualization:

```typescript
// RejectTrendsChart.tsx
export function RejectTrendsChart({ data }: { data: RejectAnalysis[] }) {
  const chartData = {
    labels: data.map(item => format(new Date(item.analysis_date), 'MMM yyyy')),
    datasets: [
      {
        label: 'Reject Rate (%)',
        data: data.map(item => item.reject_rate),
        borderColor: 'rgb(239, 68, 68)',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.1,
      },
      {
        label: 'Target Rate (%)',
        data: Array(data.length).fill(8),
        borderColor: 'rgb(34, 197, 94)',
        borderDash: [5, 5],
      }
    ]
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reject Rate Trends</CardTitle>
      </CardHeader>
      <CardContent>
        <Line data={chartData} options={chartOptions} />
      </CardContent>
    </Card>
  );
}

// RejectReasonChart.tsx - Pie chart for reject reasons
export function RejectReasonChart({ data }: { data: RejectIncident[] }) {
  // Group incidents by reject reason and create pie chart
  const reasonCounts = data.reduce((acc, incident) => {
    const reason = incident.reject_reason_name;
    acc[reason] = (acc[reason] || 0) + incident.retake_count;
    return acc;
  }, {} as Record<string, number>);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reject Reasons Distribution</CardTitle>
      </CardHeader>
      <CardContent>
        <Pie data={pieChartData} options={pieChartOptions} />
      </CardContent>
    </Card>
  );
}
```

### 4.4 InfoBox Components

```typescript
interface InfoBoxProps {
  title: string;
  value: string | number;
  change?: number;
  trend?: 'up' | 'down' | 'stable';
  icon?: React.ReactNode;
}

export function InfoBox({ title, value, change, trend, icon }: InfoBoxProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          {change !== undefined && (
            <p className={`text-sm ${trend === 'down' ? 'text-green-600' : 'text-red-600'}`}>
              {trend === 'down' ? '↓' : '↑'} {Math.abs(change)}% from last month
            </p>
          )}
        </div>
        {icon && <div className="h-8 w-8 text-muted-foreground">{icon}</div>}
      </div>
    </Card>
  );
}
```

## 5. Implementation Phases

### Phase 1: Backend Foundation (Week 1-2)
1. **Create database models** and run migrations
2. **Add initial data fixtures** for common reject categories:
   - Human Faults: Over Exposure, Under Exposure, Positioning Error, Anatomy Cutoff, Patient Motion
   - Equipment: Calibration Error, Hardware Malfunction, Processing Artifact
   - Processing: Software Error, Network Issue, Image Corruption
   - Others: Patient Condition, Environmental Factor
3. **Implement DRF serializers and viewsets**
4. **Create management commands** for data migration and statistics calculation

### Phase 2: API Development (Week 2-3)
1. **Implement CRUD endpoints** for all models
2. **Add drag-and-drop ordering** functionality for categories/reasons
3. **Create statistics calculation logic**
4. **Implement filtering and search** capabilities
5. **Add API tests** for all endpoints

### Phase 3: Frontend Components (Week 3-4)
1. **Create base components** (InfoBox, Charts, Forms)
2. **Implement RejectAnalysisDashboard** with KPI cards
3. **Add RejectCategoryManager** with drag-and-drop
4. **Create forms** for logging incidents and managing analysis
5. **Implement responsive design** for mobile compatibility

### Phase 4: Charts and Visualization (Week 4-5)
1. **Integrate Chart.js** library
2. **Implement trend charts** (line charts for monthly trends)
3. **Create reason distribution charts** (pie/doughnut charts)
4. **Add comparative charts** (modality comparisons)
5. **Implement interactive filtering** on charts

### Phase 5: Integration and Testing (Week 5-6)
1. **Integrate with existing examination workflow**
2. **Add reject incident logging** to examination interface
3. **Implement automated statistics calculation**
4. **Create data export functionality** (PDF reports, Excel)
5. **Comprehensive testing** and bug fixes

### Phase 6: Advanced Features (Week 6-7)
1. **Implement email notifications** for high reject rates
2. **Add automated reports** generation
3. **Create dashboard widgets** for main RIS dashboard
4. **Implement data archiving** for old analyses
5. **Performance optimization** and caching

## 6. Technical Specifications

### 6.1 Database Indexes
```sql
-- For optimal query performance
CREATE INDEX idx_reject_analysis_date_modality ON exam_rejectanalysis(analysis_date, modality_id);
CREATE INDEX idx_reject_incident_date ON exam_rejectincident(reject_date);
CREATE INDEX idx_reject_incident_analysis ON exam_rejectincident(analysis_id);
```

### 6.2 API Performance
- **Pagination**: Implement pagination for large datasets
- **Caching**: Redis caching for frequently accessed statistics
- **Filtering**: Django-filter integration for complex queries
- **Rate Limiting**: API rate limiting to prevent abuse

### 6.3 Frontend State Management
- **Context API**: For global reject analysis state
- **React Query**: For server state synchronization and caching
- **Form Validation**: Zod schema validation for forms
- **Error Handling**: Comprehensive error boundaries and user feedback
- **Localization**: Bilingual support (Bahasa Malaysia & English) for Malaysian users

## 7. Security Considerations

### 7.1 Access Control
- **Role-based permissions**: Only quality managers can create/edit analyses
- **Audit logging**: Track all changes to reject data
- **Data validation**: Server-side validation for all inputs
- **CSRF protection**: For form submissions

### 7.2 Data Privacy
- **Anonymized reporting**: Remove patient identifiers from reports
- **Secure export**: Password-protected export files
- **Data retention**: Automatic archiving of old data

## 8. Performance Targets

- **Page load time**: < 2 seconds for dashboard
- **Chart rendering**: < 1 second for all visualizations
- **API response time**: < 500ms for standard queries
- **Database queries**: Optimized to prevent N+1 problems
- **Mobile responsiveness**: Full functionality on mobile devices

## 9. Success Metrics

### 9.1 Functional Metrics
- **Reject rate tracking accuracy**: 99.9% data accuracy
- **User adoption**: 100% of radiographers using the system
- **Report generation**: Monthly reports generated automatically aligned with MOH QAP requirements
- **Trend identification**: Early detection of quality issues
- **MSQH Compliance**: Meet Malaysian healthcare accreditation standards

### 9.2 Quality Improvements
- **Target reject rate**: Establish institutional benchmarks aligned with Malaysian DRLs and MOH standards
- **QAP Reporting**: Annual QAP reports with high acceptance rates
- **Trend analysis**: Month-over-month comparison capabilities with Malaysian context
- **Action tracking**: Document corrective actions and their effectiveness per MOH guidelines
- **Staff training**: Identify training needs based on reject patterns and Malaysian best practices

## 10. Future Enhancements

### 10.1 Advanced Analytics
- **Machine learning**: Predict reject likelihood based on historical patterns
- **Real-time monitoring**: Live reject rate monitoring during shifts
- **Comparative analysis**: Benchmark against industry standards
- **Predictive maintenance**: Equipment-related reject pattern analysis

### 10.2 Integration Opportunities
- **DICOM integration**: Automatic reject detection from DICOM metadata
- **PACS integration**: Link reject incidents to actual DICOM studies
- **Staff scheduling**: Correlate reject rates with staff schedules
- **Equipment maintenance**: Integrate with maintenance scheduling systems

## 11. Deployment Strategy

### 11.1 Development Environment
1. Create feature branch: `feature/reject-analysis`
2. Implement in development environment
3. Unit and integration testing
4. Code review and approval

### 11.2 Staging Deployment
1. Deploy to staging environment
2. User acceptance testing with quality team
3. Performance testing with sample data
4. Security testing and vulnerability assessment

### 11.3 Production Deployment
1. Database migration during maintenance window
2. Blue-green deployment for zero downtime
3. Feature flag rollout for gradual user onboarding
4. Monitoring and alerting setup

## 12. Malaysian Compliance Requirements

### 12.1 MOH QAP Compliance
- **Annual QAP Reports**: Automated generation of MOH-compliant quality assurance reports
- **DRL Monitoring**: Integration with Malaysian diagnostic reference levels
- **Reject Rate Standards**: Align with MOH guidelines rather than solely international standards
- **Data Format**: Support MOH-specified data formats and reporting structures

### 12.2 MSQH Accreditation Support
- **Quality Indicators**: Track MSQH-defined quality metrics
- **Documentation Standards**: Ensure reports meet MSQH documentation requirements
- **Audit Trail**: Maintain comprehensive audit trails for MSQH assessments
- **Continuous Improvement**: Implement MSQH continuous improvement frameworks

### 12.3 Malaysian Regulatory Framework
- **Atomic Energy Licensing Act 1984**: Ensure compliance with radiation safety regulations
- **College of Radiology Guidelines**: Follow Malaysian radiology professional standards
- **Local DRL Establishment**: Support institutional DRL setting when national standards are pending
- **Bilingual Support**: Interface and reports in Bahasa Malaysia and English

## 13. Training and Documentation

### 13.1 User Training (Malaysian Context)
- **Quality managers**: Advanced features, MOH QAP reporting, and MSQH compliance
- **Radiographers**: Incident logging aligned with Malaysian practices
- **IT staff**: System administration and MOH reporting requirements
- **Management**: Executive dashboards with Malaysian quality indicators

### 13.2 Documentation
- **User manual**: Bilingual step-by-step usage guide
- **QAP manual**: MOH QAP compliance guide
- **MSQH documentation**: MSQH accreditation support materials
- **API documentation**: Complete API reference with Malaysian data formats
- **Technical documentation**: System architecture and maintenance
- **Training materials**: Video tutorials in Bahasa Malaysia and English

This comprehensive implementation plan provides a roadmap for building a robust reject analysis system that meets Malaysian MOH standards, MSQH accreditation requirements, and provides actionable insights for continuous quality improvement in Malaysian radiology departments.