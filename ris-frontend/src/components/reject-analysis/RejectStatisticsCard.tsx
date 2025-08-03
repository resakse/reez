'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, TrendingDown, Target, CheckCircle, AlertCircle } from 'lucide-react';
import { Language } from '@/types/reject-analysis';

interface RejectStatisticsCardProps {
  title: string;
  value: string;
  trend?: number; // Percentage change
  change?: number; // Absolute change
  target?: number;
  meetsTarget?: boolean;
  language?: Language;
  className?: string;
}

const translations = {
  en: {
    increase: 'increase',
    decrease: 'decrease',
    noChange: 'no change',
    target: 'Target',
    meetsTarget: 'Meets target',
    aboveTarget: 'Above target',
    fromLastMonth: 'from last month',
  },
  ms: {
    increase: 'peningkatan',
    decrease: 'penurunan',
    noChange: 'tiada perubahan',
    target: 'Sasaran',
    meetsTarget: 'Mencapai sasaran',
    aboveTarget: 'Melebihi sasaran',
    fromLastMonth: 'dari bulan lepas',
  }
};

export default function RejectStatisticsCard({
  title,
  value,
  trend,
  change,
  target,
  meetsTarget,
  language = 'en',
  className
}: RejectStatisticsCardProps) {
  const t = translations[language];

  const formatTrend = (trendValue: number): string => {
    const absValue = Math.abs(trendValue);
    if (absValue === 0) return t.noChange;
    
    const direction = trendValue > 0 ? t.increase : t.decrease;
    return `${absValue.toFixed(1)}% ${direction}`;
  };

  const formatChange = (changeValue: number): string => {
    if (changeValue === 0) return t.noChange;
    
    const sign = changeValue > 0 ? '+' : '';
    return `${sign}${changeValue}`;
  };

  const getTrendIcon = (trendValue: number) => {
    if (trendValue > 0) {
      return <TrendingUp className="h-4 w-4 text-red-500" />;
    } else if (trendValue < 0) {
      return <TrendingDown className="h-4 w-4 text-green-500" />;
    }
    return null;
  };

  const getChangeIcon = (changeValue: number) => {
    if (changeValue > 0) {
      return <TrendingUp className="h-4 w-4 text-blue-500" />;
    } else if (changeValue < 0) {
      return <TrendingDown className="h-4 w-4 text-blue-500" />;
    }
    return null;
  };

  const getTargetBadge = () => {
    if (typeof meetsTarget !== 'boolean') return null;
    
    return (
      <Badge 
        variant={meetsTarget ? "default" : "destructive"} 
        className="text-xs flex items-center gap-1"
      >
        {meetsTarget ? (
          <CheckCircle className="h-3 w-3" />
        ) : (
          <AlertCircle className="h-3 w-3" />
        )}
        {meetsTarget ? t.meetsTarget : t.aboveTarget}
      </Badge>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        {target && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <Target className="h-3 w-3" />
            {target}%
          </div>
        )}
      </CardHeader>
      <CardContent>
        <div className="flex flex-col gap-2">
          <div className="text-2xl font-bold">{value}</div>
          
          <div className="flex flex-col gap-1">
            {/* Trend information */}
            {typeof trend === 'number' && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {getTrendIcon(trend)}
                <span>{formatTrend(trend)} {t.fromLastMonth}</span>
              </div>
            )}
            
            {/* Change information */}
            {typeof change === 'number' && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                {getChangeIcon(change)}
                <span>{formatChange(change)} {t.fromLastMonth}</span>
              </div>
            )}
            
            {/* Target status */}
            {getTargetBadge()}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}