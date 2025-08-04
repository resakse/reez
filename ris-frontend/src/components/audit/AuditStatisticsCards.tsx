'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Activity, 
  Users, 
  AlertTriangle, 
  Eye, 
  FileText, 
  Server,
  TrendingUp 
} from 'lucide-react';

interface AuditStats {
  total_events: number;
  unique_users: number;
  failed_logins: number;
  patient_accesses: number;
  examination_activities: number;
  api_activities: number;
  days_included: number;
}

interface AuditStatisticsCardsProps {
  stats: AuditStats;
  loading?: boolean;
}

export default function AuditStatisticsCards({ stats, loading = false }: AuditStatisticsCardsProps) {
  const cards = [
    {
      title: 'Total Events',
      value: stats.total_events,
      icon: Activity,
      description: `Last ${stats.days_included} days`,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      format: (value: number) => value.toLocaleString()
    },
    {
      title: 'Active Users',
      value: stats.unique_users,
      icon: Users,
      description: 'Unique users',
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      format: (value: number) => value.toString()
    },
    {
      title: 'Patient Access',
      value: stats.patient_accesses,
      icon: Eye,
      description: 'Patient records accessed',
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      format: (value: number) => value.toLocaleString()
    },
    {
      title: 'Failed Logins',
      value: stats.failed_logins,
      icon: AlertTriangle,
      description: 'Security alerts',
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      format: (value: number) => value.toString(),
      isAlert: true
    },
    {
      title: 'Examinations',
      value: stats.examination_activities,
      icon: FileText,
      description: 'Examination activities',
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      format: (value: number) => value.toLocaleString()
    },
    {
      title: 'API Calls',
      value: stats.api_activities,
      icon: Server,
      description: 'System API usage',
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      format: (value: number) => value.toLocaleString()
    }
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {Array.from({ length: 6 }).map((_, index) => (
          <Card key={index}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-8 w-16 mb-2" />
              <Skeleton className="h-3 w-20" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
      {cards.map((card, index) => {
        const Icon = card.icon;
        
        return (
          <Card key={index} className="relative overflow-hidden">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {card.title}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className={`text-2xl font-bold ${card.isAlert && card.value > 0 ? 'text-red-600' : ''}`}>
                    {card.format(card.value)}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {card.description}
                  </p>
                </div>
                <div className={`p-2 rounded-lg ${card.bgColor}`}>
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
              </div>
              
              {/* Alert indicator for failed logins */}
              {card.isAlert && card.value > 0 && (
                <div className="absolute top-2 right-2">
                  <div className="h-2 w-2 bg-red-500 rounded-full animate-pulse" />
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}