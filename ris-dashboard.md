# RIS Dashboard Implementation Plan

## Executive Summary

This document outlines a comprehensive plan to build an advanced dashboard for the Radiology Information System (RIS), focusing on key performance indicators (KPIs), storage management, and operational efficiency metrics commonly used in modern radiology departments.

## Current System Analysis

### Available Data Sources

**Patient Data (`pesakit/models.Pesakit`)**
- Demographics, MRN, NRIC, age calculation, gender parsing
- Timestamps: `created`, `modified`
- API: `/api/patients/`

**Examination Data (`exam/models`)**
- `Daftar` (Registration): Patient registrations, ward referrals, status tracking
- `Pemeriksaan` (Examinations): Individual exams with modality, body parts, technical parameters
- `Modaliti`: Imaging modalities (X-Ray, CT, MRI, etc.)
- `Exam`: Available examination types
- `PacsExam`: DICOM study links to Orthanc PACS
- `PacsConfig`: PACS server configuration

**Staff & Ward Data**
- `Staff`: User management with roles
- `Ward`: Referral departments
- APIs: `/api/staff/`, `/api/wards/`

## Industry Standard RIS/PACS Dashboard Metrics

### 1. Patient Demographics & Case Distribution
- **Case Volume Metrics**
  - Cases per day/week/month/year
  - Case distribution by time periods
  - Peak hours analysis
  - Seasonal trends

- **Patient Demographics**
  - Age distribution (pediatric, adult, geriatric)
  - Gender ratio (male/female percentage)
  - Race/ethnicity distribution
  - Geographic distribution by ward/region

### 2. Operational KPIs
- **Volume Metrics**
  - Total examination volume (today/week/month/year)
  - Examination volume by modality
  - Examination volume by location/ward
  - Patient throughput rates
  - Study completion rates

- **Efficiency Metrics**
  - Turnaround Time (TAT) - from order to report
  - Mean technologist throughput
  - Equipment uptime percentage
  - Retake/repeat examination rates
  - No-show rates

### 3. Quality KPIs
- **Clinical Quality**
  - Accuracy of interpretation (peer review scores)
  - Critical result communication timeliness
  - Patient safety incidents
  - Radiation dose monitoring (DRL compliance)

- **Service Quality**
  - Patient satisfaction scores
  - Referring physician satisfaction
  - Report delivery timeliness
  - System availability (99.99% uptime target)

### 4. Resource Utilization
- **Staff Productivity**
  - Examinations per technologist per day
  - Radiologist reading volume
  - Staff overtime hours
  - Training compliance rates

- **Equipment Utilization**
  - Modality usage rates
  - Peak vs off-peak utilization
  - Maintenance downtime
  - Upgrade/replacement planning

## Storage Management & Capacity Planning

### 1. Current Storage Monitoring
- **Disk Space Metrics**
  - Total storage capacity
  - Used storage space
  - Available free space
  - Growth rate analysis

- **Performance Metrics**
  - Image retrieval speeds
  - Storage I/O performance
  - Network throughput
  - Backup completion rates

### 2. Capacity Planning Features
- **Predictive Analytics**
  - Current growth rate calculation
  - Days/months/years until full capacity
  - Modality-specific storage consumption
  - Seasonal variation analysis

- **Configuration Management**
  - User-configurable storage root paths
  - Multiple storage location monitoring
  - Archive tier management
  - Retention policy tracking

### 3. Storage Architecture Considerations
- **Tier Management**
  - Primary storage (recent studies)
  - Near-line storage (6-24 months)
  - Archive storage (long-term)
  - Cloud storage integration

## Dashboard Implementation Plan

### Phase 1: Backend API Development (Week 1-2)

#### 1.1 Create Dashboard API Endpoints

**`/api/dashboard/stats/`** - Aggregate Statistics
```python
# Time-based statistics
{
  "today": {
    "patients": 25,
    "registrations": 30,
    "examinations": 45,
    "studies_completed": 40
  },
  "week": { /* similar structure */ },
  "month": { /* similar structure */ },
  "year": { /* similar structure */ },
  "all_time": { /* similar structure */ }
}
```

**`/api/dashboard/demographics/`** - Patient Demographics
```python
{
  "by_period": {
    "today": {
      "age_groups": [
        {"range": "0-17", "count": 5, "percentage": 20.0},
        {"range": "18-65", "count": 15, "percentage": 60.0},
        {"range": "65+", "count": 5, "percentage": 20.0}
      ],
      "gender": [
        {"gender": "M", "count": 12, "percentage": 48.0},
        {"gender": "F", "count": 13, "percentage": 52.0}
      ],
      "race": [
        {"race": "Melayu", "count": 15, "percentage": 60.0},
        {"race": "Cina", "count": 6, "percentage": 24.0},
        {"race": "India", "count": 4, "percentage": 16.0}
      ]
    },
    "week": { /* similar structure */ }
  }
}
```

**`/api/dashboard/modality-stats/`** - Modality Distribution
```python
{
  "by_period": {
    "today": [
      {"modality": "X-Ray", "count": 25, "percentage": 55.6},
      {"modality": "CT", "count": 15, "percentage": 33.3},
      {"modality": "MRI", "count": 5, "percentage": 11.1}
    ],
    "week": [ /* similar structure */ ]
  }
}
```

**`/api/dashboard/performance/`** - Performance Metrics
```python
{
  "turnaround_times": {
    "average_minutes": 45,
    "by_modality": [ /* breakdown */ ]
  },
  "throughput": {
    "exams_per_hour": 3.2,
    "staff_productivity": [ /* per technologist */ ]
  }
}
```

**`/api/dashboard/storage/`** - Storage Management
```python
{
  "primary_storage": {
    "total_gb": 2000,
    "used_gb": 1200,
    "free_gb": 800,
    "usage_percentage": 60.0
  },
  "growth_analysis": {
    "daily_growth_gb": 15.5,
    "monthly_growth_gb": 465,
    "days_until_full": 52,
    "months_until_full": 1.7
  },
  "by_modality": [
    {"modality": "CT", "size_gb": 800, "percentage": 66.7},
    {"modality": "MRI", "size_gb": 300, "percentage": 25.0}
  ]
}
```

#### 1.2 Database Optimizations
- Add indexes for date-based queries
- Implement query optimization with select_related/prefetch_related
- Add caching layer (Redis) for expensive aggregations
- Create materialized views for complex statistics

### Phase 2: Frontend Dashboard Components (Week 3-4)

#### 2.1 Dashboard Layout
```
┌─────────────────────────────────────────────────────────┐
│ Time Period Selector [Today|Week|Month|Year|All]        │
├─────────────────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐        │
│ │Patients │ │  Cases  │ │ Studies │ │Male/Fem │        │
│ │   125   │ │   342   │ │   298   │ │ 48%/52% │        │
│ └─────────┘ └─────────┘ └─────────┘ └─────────┘        │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │  Case Volume Chart  │ │ Modality Distribution│        │
│ │                     │ │                     │        │
│ └─────────────────────┘ └─────────────────────┘        │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │ Age Demographics    │ │  Race Distribution  │        │
│ │ 0-17: 20% (5)      │ │ Melayu: 60% (15)   │        │
│ │ 18-65: 60% (15)    │ │ Cina: 24% (6)      │        │
│ │ 65+: 20% (5)       │ │ India: 16% (4)     │        │
│ └─────────────────────┘ └─────────────────────┘        │
├─────────────────────────────────────────────────────────┤
│ ┌─────────────────────┐ ┌─────────────────────┐        │
│ │ Storage Management  │ │  Recent Activity    │        │
│ │ 1.2TB/2TB (60%)    │ │                     │        │
│ │ 52 days until full  │ │                     │        │
│ └─────────────────────┘ └─────────────────────┘        │
└─────────────────────────────────────────────────────────┘
```

#### 2.2 Key Components

**StatCard Component**
```typescript
interface StatCardProps {
  title: string;
  value: number | string;
  change?: number;
  icon: React.ReactNode;
  period: 'today' | 'week' | 'month' | 'year' | 'all';
}
```

**Charts Components**
- Line chart for examination volume trends
- Pie chart for modality distribution
- Bar chart for ward referral patterns
- Gauge chart for storage utilization

**Storage Management Component**
```typescript
interface StorageConfig {
  rootPath: string;
  alertThreshold: number; // percentage
  projectionMonths: number;
}
```

### Phase 3: Advanced Features (Week 5-6)

#### 3.1 Real-time Updates
- WebSocket integration for live statistics
- Auto-refresh capabilities
- Push notifications for alerts

#### 3.2 Advanced Analytics
- **Predictive Analytics**
  - Machine learning models for capacity planning
  - Seasonal pattern recognition
  - Anomaly detection for unusual patterns

- **Comparative Analytics**
  - Year-over-year comparisons
  - Benchmarking against industry standards
  - Performance trend analysis

#### 3.3 Alert System
- Storage capacity warnings (80%, 90%, 95%)
- Performance degradation alerts
- Equipment maintenance reminders
- Compliance monitoring alerts

### Phase 4: Configuration & Administration (Week 7)

#### 4.1 Admin Configuration Panel
```typescript
interface DashboardConfig {
  storage: {
    rootPaths: string[];
    alertThresholds: {
      warning: number;
      critical: number;
    };
    retentionPolicies: RetentionPolicy[];
  };
  kpis: {
    targets: {
      turnaroundTime: number;
      throughput: number;
      utilization: number;
    };
  };
  notifications: {
    email: boolean;
    slack: boolean;
    webhooks: string[];
  };
}
```

#### 4.2 Role-based Access Control
- **Administrator**: Full dashboard access + configuration
- **Department Manager**: Operational metrics + staff performance
- **Technologist**: Personal performance + schedule
- **Radiologist**: Reading volume + quality metrics

## Technical Implementation Details

### Backend (Django)

#### Models Extensions
```python
# Add to exam/models.py
class DashboardConfig(models.Model):
    storage_root_paths = models.JSONField(default=list)
    alert_thresholds = models.JSONField(default=dict)
    kpi_targets = models.JSONField(default=dict)
    created = models.DateTimeField(auto_now_add=True)
    modified = models.DateTimeField(auto_now=True)

class PerformanceMetric(models.Model):
    metric_type = models.CharField(max_length=50)
    value = models.FloatField()
    period = models.CharField(max_length=20)
    recorded_at = models.DateTimeField(auto_now_add=True)
```

#### API Views
```python
# exam/views.py
class DashboardStatsAPIView(APIView):
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        period = request.query_params.get('period', 'today')
        return Response(self.get_stats_for_period(period))

class StorageMonitorAPIView(APIView):
    def get(self, request):
        config = DashboardConfig.objects.first()
        return Response(self.analyze_storage(config.storage_root_paths))
```

### Frontend (Next.js/React)

#### Page Structure
```typescript
// app/(app)/dashboard/page.tsx
export default function DashboardPage() {
  const [period, setPeriod] = useState<TimePeriod>('today');
  const { data: stats } = useQuery(['dashboard-stats', period], 
    () => fetchDashboardStats(period));
  
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      <StatCard title="Patients" value={stats?.patients} />
      <StatCard title="Examinations" value={stats?.examinations} />
      {/* More components */}
    </div>
  );
}
```

#### Hooks
```typescript
// hooks/useDashboardStats.ts
export function useDashboardStats(period: TimePeriod) {
  return useQuery(
    ['dashboard-stats', period],
    () => api.get(`/dashboard/stats/?period=${period}`),
    { 
      refetchInterval: 30000, // 30 seconds
      staleTime: 10000 
    }
  );
}
```

## Data Sources & Calculations

### Volume Calculations
```sql
-- Today's examinations
SELECT COUNT(*) FROM exam_pemeriksaan 
WHERE DATE(created) = CURRENT_DATE;

-- Modality distribution
SELECT m.nama, COUNT(p.id) as count
FROM exam_modaliti m
LEFT JOIN exam_pemeriksaan p ON m.id = p.modaliti_id
WHERE DATE(p.created) = CURRENT_DATE
GROUP BY m.id, m.nama;
```

### Storage Analysis
```python
import os
import shutil

def analyze_storage_path(path: str):
    total, used, free = shutil.disk_usage(path)
    
    # Calculate DICOM studies size
    studies_size = sum(
        os.path.getsize(os.path.join(dirpath, filename))
        for dirpath, dirnames, filenames in os.walk(path)
        for filename in filenames
    )
    
    return {
        'total_gb': total / (1024**3),
        'used_gb': used / (1024**3),
        'free_gb': free / (1024**3),
        'studies_size_gb': studies_size / (1024**3)
    }
```

## Performance Considerations

### Caching Strategy
- Redis for expensive aggregations (TTL: 5 minutes)
- Browser caching for static charts
- Database query optimization with proper indexes

### Scalability
- Pagination for large datasets
- Lazy loading for charts
- Background job processing for complex calculations

### Security
- JWT authentication for all API endpoints
- Role-based access control
- Input validation and SQL injection prevention

## Testing Strategy

### Backend Testing
```python
# tests/test_dashboard_api.py
class DashboardAPITest(TestCase):
    def test_stats_endpoint_returns_valid_data(self):
        response = self.client.get('/api/dashboard/stats/?period=today')
        self.assertEqual(response.status_code, 200)
        self.assertIn('patients', response.json())
```

### Frontend Testing
```typescript
// __tests__/dashboard.test.tsx
describe('Dashboard', () => {
  it('displays correct statistics', async () => {
    render(<DashboardPage />);
    expect(screen.getByText('Patients')).toBeInTheDocument();
  });
});
```

## Deployment & Monitoring

### Health Checks
- API endpoint response times
- Database query performance
- Storage accessibility
- Cache hit rates

### Alerting
- Storage capacity thresholds
- API performance degradation
- Database connection issues
- Failed background jobs

## Success Metrics

### Technical KPIs
- Dashboard load time < 2 seconds
- API response time < 500ms
- 99.9% uptime
- Zero data accuracy issues

### Business KPIs
- 30% improvement in operational efficiency
- 50% reduction in manual reporting time
- 95% user adoption rate
- Positive user feedback scores

## Timeline & Resources

**Week 1-2**: Backend API development (1 developer)
**Week 3-4**: Frontend components (1 developer)
**Week 5-6**: Advanced features (2 developers)
**Week 7**: Testing & deployment (1 developer + QA)

**Total Effort**: ~6 person-weeks
**Timeline**: 7 weeks
**Resources**: 2 full-stack developers, 1 QA engineer

## Risk Mitigation

### Technical Risks
- **Performance**: Implement caching and query optimization early
- **Data Accuracy**: Comprehensive testing and validation
- **Storage Access**: Fallback mechanisms for storage monitoring

### Business Risks
- **User Adoption**: Early user feedback and iterative design
- **Scope Creep**: Clear requirements and change management
- **Integration Issues**: Thorough testing with existing systems

## Future Enhancements

### Phase 2 Features
- Mobile responsive design
- Export capabilities (PDF, Excel)
- Custom report builder
- Advanced analytics with ML

### Integration Opportunities
- Electronic Health Record (EHR) integration
- Billing system connectivity
- Quality assurance workflows
- Compliance reporting automation

## Conclusion

This comprehensive dashboard will provide the RIS with industry-standard metrics, proactive storage management, and actionable insights to improve operational efficiency and patient care quality. The phased approach ensures manageable development while delivering value early and often.