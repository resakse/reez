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

      {/* Guidelines */}
      <Card>
        <CardHeader>
          <CardTitle>Category Guidelines</CardTitle>
        </CardHeader>
        
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">Best Practices:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Keep category names clear and specific</li>
              <li>Provide both English and Malay translations</li>
              <li>Use consistent color coding for related categories</li>
              <li>Order categories by frequency of use (most common first)</li>
              <li>Include detailed descriptions to avoid confusion</li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-medium mb-2">Common Categories:</h4>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Patient positioning errors</li>
              <li>Motion artifacts</li>
              <li>Technical equipment issues</li>
              <li>Exposure/technique problems</li>
              <li>Patient preparation issues</li>
              <li>Anatomical coverage insufficient</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}