'use client';

import AIPerformanceDashboard from '@/components/AIPerformanceDashboard';
import { AISettingsProvider } from '@/contexts/AISettingsContext';

export default function AIDashboardPage() {
  return (
    <AISettingsProvider>
      <AIPerformanceDashboard />
    </AISettingsProvider>
  );
}