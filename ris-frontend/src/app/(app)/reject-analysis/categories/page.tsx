'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import RejectCategoryManager from '@/components/reject-analysis/RejectCategoryManager';

export default function RejectCategoriesPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Reject Categories</h1>
        <p className="text-muted-foreground">
          Manage reject reason categories for consistent incident classification
        </p>
      </div>

      {/* Category Management - ONE UNIFIED SECTION */}
      <RejectCategoryManager />

    </div>
  );
}