'use client';

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import { Language } from '@/types/reject-analysis';

interface RejectReasonData {
  category: {
    id: number;
    nama: string;
    nama_english: string;
    color_code?: string;
  };
  count: number;
  percentage: number;
}

interface RejectReasonChartProps {
  data: RejectReasonData[];
  language?: Language;
  height?: number;
}

const translations = {
  en: {
    incidents: 'incidents',
    noData: 'No reject data available for the current month',
    total: 'Total',
  },
  ms: {
    incidents: 'insiden',
    noData: 'Tiada data penolakan tersedia untuk bulan semasa',
    total: 'Jumlah',
  }
};

// Default colors for categories if no color_code is provided
const DEFAULT_COLORS = [
  '#3b82f6', // blue
  '#ef4444', // red
  '#f59e0b', // amber
  '#10b981', // emerald
  '#8b5cf6', // violet
  '#f97316', // orange
  '#06b6d4', // cyan
  '#84cc16', // lime
  '#ec4899', // pink
  '#6b7280', // gray
];

export default function RejectReasonChart({ 
  data, 
  language = 'en', 
  height = 300 
}: RejectReasonChartProps) {
  const t = translations[language];

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  // Transform data for chart
  const chartData = data.map((item, index) => ({
    name: language === 'ms' ? item.category.nama : item.category.nama_english,
    value: item.count,
    percentage: item.percentage,
    color: item.category.color_code || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
  }));

  // Custom tooltip component
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border rounded-lg shadow-md p-4 border-gray-200">
          <p className="font-medium mb-2">{data.name}</p>
          <div className="space-y-1">
            <p className="text-sm">{data.value} {t.incidents}</p>
            <p className="text-sm">{data.percentage.toFixed(1)}%</p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Custom label function
  const renderLabel = (entry: any) => {
    if (entry.percentage < 5) return ''; // Don't show label if slice is too small
    return `${entry.percentage.toFixed(1)}%`;
  };

  // Custom legend content
  const CustomLegend = ({ payload }: any) => {
    if (!payload) return null;

    return (
      <div className="flex flex-wrap justify-center gap-4 mt-4">
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div 
              className="w-3 h-3 rounded-full"
              style={{ backgroundColor: entry.color }}
            />
            <span className="text-gray-700 max-w-32 truncate" title={entry.value}>
              {entry.value}
            </span>
          </div>
        ))}
      </div>
    );
  };

  const totalIncidents = chartData.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="w-full">
      {/* Summary info */}
      <div className="text-center mb-4">
        <p className="text-2xl font-bold">{totalIncidents}</p>
        <p className="text-sm text-muted-foreground">{t.total} {t.incidents}</p>
      </div>

      {/* Chart */}
      <div style={{ height: height }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={renderLabel}
              outerRadius={80}
              fill="#8884d8"
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={<CustomLegend />} />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Data breakdown */}
      <div className="mt-4 space-y-2">
        {chartData.map((item, index) => (
          <div key={index} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-gray-700">{item.name}</span>
            </div>
            <div className="flex items-center gap-4">
              <span className="font-medium">{item.value}</span>
              <span className="text-muted-foreground w-12 text-right">
                {item.percentage.toFixed(1)}%
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}