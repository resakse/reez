'use client';

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { RejectTrendData, Language } from '@/types/reject-analysis';

interface RejectTrendsChartProps {
  data: RejectTrendData[];
  language?: Language;
  height?: number;
}

const translations = {
  en: {
    rejectRate: 'Reject Rate (%)',
    targetRate: 'Target Rate (%)',
    examinations: 'Examinations',
    rejects: 'Rejects',
    month: 'Month',
    noData: 'No data available for the selected period',
  },
  ms: {
    rejectRate: 'Kadar Penolakan (%)',
    targetRate: 'Kadar Sasaran (%)',
    examinations: 'Pemeriksaan',
    rejects: 'Penolakan',
    month: 'Bulan',
    noData: 'Tiada data tersedia untuk tempoh yang dipilih',
  }
};

export default function RejectTrendsChart({ 
  data, 
  language = 'en', 
  height = 300 
}: RejectTrendsChartProps) {
  const t = translations[language];

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        {t.noData}
      </div>
    );
  }

  // Custom tooltip component
  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white border rounded-lg shadow-md p-4 border-gray-200">
          <p className="font-medium mb-2">{`${label} ${data.year}`}</p>
          <div className="space-y-1">
            <p className="flex items-center gap-2">
              <span className="w-3 h-3 bg-blue-500 rounded-full"></span>
              <span className="text-sm">{t.rejectRate}: {data.reject_rate.toFixed(2)}%</span>
            </p>
            <p className="flex items-center gap-2">
              <span className="w-3 h-3 bg-red-500 rounded-full"></span>
              <span className="text-sm">{t.targetRate}: {data.target_rate.toFixed(2)}%</span>
            </p>
            <hr className="my-2" />
            <p className="text-sm text-gray-600">{t.examinations}: {data.total_examinations.toLocaleString()}</p>
            <p className="text-sm text-gray-600">{t.rejects}: {data.total_rejects.toLocaleString()}</p>
          </div>
        </div>
      );
    }
    return null;
  };

  // Format month names
  const formatMonth = (month: string): string => {
    if (language === 'ms') {
      const monthMap: { [key: string]: string } = {
        'Jan': 'Jan', 'Feb': 'Feb', 'Mar': 'Mac', 'Apr': 'Apr',
        'May': 'Mei', 'Jun': 'Jun', 'Jul': 'Jul', 'Aug': 'Ogo',
        'Sep': 'Sep', 'Oct': 'Okt', 'Nov': 'Nov', 'Dec': 'Dis'
      };
      return monthMap[month] || month;
    }
    return month;
  };

  // Transform data for chart
  const chartData = data.map(item => ({
    ...item,
    month: formatMonth(item.month)
  }));

  return (
    <div className="w-full" style={{ height: height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={chartData}
          margin={{
            top: 5,
            right: 30,
            left: 20,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis 
            dataKey="month" 
            className="text-xs"
            tick={{ fontSize: 12, fill: 'currentColor' }}
          />
          <YAxis 
            domain={[0, 'dataMax + 1']}
            className="text-xs"
            tick={{ fontSize: 12, fill: 'currentColor' }}
            label={{ 
              value: '%', 
              angle: -90, 
              position: 'insideLeft',
              style: { textAnchor: 'middle' }
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend 
            wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }}
          />
          
          {/* Target rate reference line */}
          <ReferenceLine 
            y={data[0]?.target_rate || 2} 
            stroke="#ef4444" 
            strokeDasharray="5 5" 
            strokeOpacity={0.7}
          />
          
          {/* Actual reject rate line */}
          <Line
            type="monotone"
            dataKey="reject_rate"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
            activeDot={{ r: 6, stroke: '#3b82f6', strokeWidth: 2 }}
            name={t.rejectRate}
          />
          
          {/* Target rate line */}
          <Line
            type="monotone"
            dataKey="target_rate"
            stroke="#ef4444"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            name={t.targetRate}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}