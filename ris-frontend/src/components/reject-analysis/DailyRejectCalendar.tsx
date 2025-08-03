'use client';

import { useState, useEffect, useCallback } from 'react';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameDay, parseISO } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarIcon, Save, Plus, ChevronLeft, ChevronRight, X, Image } from 'lucide-react';
import { toast } from '@/lib/toast';
import { rejectAnalysisApi } from '@/lib/reject-analysis-api';
import { useTargetRates } from '@/contexts/TargetRatesContext';
import type { RejectCategory } from '@/types/reject-analysis';

interface DailyRejectEntry {
  id?: number;
  date: string;
  category_id: number;
  reason_id: number;
  count: number;
}

interface DailyRejectSummary {
  date: string;
  total_rejects: number;
  total_images: number;
  reject_percentage: number;
  categories: Array<{
    category_name: string;
    count: number;
  }>;
  reasons: Record<number, number>; // reason_id -> count
}

interface DailyRejectCalendarProps {
  language?: 'en' | 'ms';
}

const translations = {
  en: {
    title: 'Daily Reject Tracking',
    subtitle: 'Click on any day to log reject incidents',
    logRejects: 'Log Rejects for',
    save: 'Save Entries',
    cancel: 'Cancel',
    saving: 'Saving...',
    noCategories: 'No reject categories available',
    loadError: 'Failed to load reject categories',
    saveSuccess: 'Daily rejects logged successfully',
    saveError: 'Failed to save daily rejects',
    totalRejects: 'Total Rejects',
    today: 'Today',
    previousMonth: 'Previous Month',
    nextMonth: 'Next Month'
  },
  ms: {
    title: 'Penjejakan Penolakan Harian',
    subtitle: 'Klik pada mana-mana hari untuk log insiden penolakan',
    logRejects: 'Log Penolakan untuk',
    save: 'Simpan Entri',
    cancel: 'Batal',
    saving: 'Menyimpan...',
    noCategories: 'Tiada kategori penolakan tersedia',
    loadError: 'Gagal memuatkan kategori penolakan',
    saveSuccess: 'Penolakan harian berjaya dilog',
    saveError: 'Gagal menyimpan penolakan harian',
    totalRejects: 'Jumlah Penolakan',
    today: 'Hari Ini',
    previousMonth: 'Bulan Sebelumnya',
    nextMonth: 'Bulan Seterusnya'
  }
};

// Simple calendar component to avoid CSS conflicts
function SimpleCalendar({ 
  currentDate, 
  onDateClick, 
  onMonthChange, 
  dailySummaries,
  t 
}: {
  currentDate: Date;
  onDateClick: (date: Date) => void;
  onMonthChange: (direction: 'prev' | 'next') => void;
  dailySummaries: DailyRejectSummary[];
  t: any;
}) {
  const [hoveredDay, setHoveredDay] = useState<Date | null>(null);
  const { targetRates } = useTargetRates();
  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });
  
  const getDateRejects = (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    return dailySummaries.find(summary => summary.date === dateStr);
  };

  const isToday = (date: Date) => {
    return format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
  };

  const getTargetComparison = (rejectPercentage: number) => {
    // Don't show comparison if target rates haven't been loaded yet
    if (!targetRates.overall) {
      return null;
    }
    
    const overallTarget = targetRates.overall;
    
    if (rejectPercentage <= overallTarget) {
      return {
        status: 'good',
        icon: '✅',
        message: `Below target (${overallTarget}%)`
      };
    } else {
      return {
        status: 'warning',
        icon: '⚠️',
        message: `Above target (${overallTarget}%)`
      };
    }
  };

  return (
    <div className="w-full border border-border rounded-lg overflow-hidden bg-background">
      {/* Calendar Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/10">
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange('prev')}
          className="h-8 w-8 p-0"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        
        <h2 className="font-semibold text-lg">
          {format(currentDate, 'MMMM yyyy')}
        </h2>
        
        <Button
          variant="outline"
          size="sm"
          onClick={() => onMonthChange('next')}
          className="h-8 w-8 p-0"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Weekday Headers */}
      <div className="grid grid-cols-7 bg-muted/20">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
          <div key={day} className="p-2 text-center text-sm font-medium text-muted-foreground border-r border-border last:border-r-0">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Days */}
      <div className="grid grid-cols-7 relative">
        {days.map((day) => {
          const rejects = getDateRejects(day);
          const hasData = rejects && (rejects.total_rejects > 0 || rejects.total_images > 0);
          const dayIsToday = isToday(day);
          const isHovered = hoveredDay && format(hoveredDay, 'yyyy-MM-dd') === format(day, 'yyyy-MM-dd');
          
          return (
            <div
              key={day.toISOString()}
              className={`
                relative p-2 min-h-[100px] border-r border-b border-border last:border-r-0 cursor-pointer
                hover:bg-muted/50 transition-colors flex flex-col justify-between
                ${dayIsToday ? 'bg-primary/10 font-bold' : 'bg-background'}
              `}
              onClick={() => onDateClick(day)}
              onMouseEnter={() => hasData && setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
              title={hasData ? `${format(day, 'MMM d')}: ${rejects.total_rejects} rejects, ${rejects.total_images} images (${rejects.reject_percentage?.toFixed(1)}%)` : undefined}
            >
              {/* Day number */}
              <div className="flex justify-center">
                <span className="text-sm">{format(day, 'd')}</span>
              </div>
              
              {/* Icons and data */}
              {hasData && (
                <div className="flex flex-col items-center space-y-1 text-xs">
                  {rejects.total_rejects > 0 && (
                    <div className="flex items-center text-red-600 dark:text-red-400">
                      <X className="h-3 w-3 mr-1" />
                      <span className="font-medium">{rejects.total_rejects}</span>
                    </div>
                  )}
                  {rejects.total_images > 0 && (
                    <div className="flex items-center text-green-600 dark:text-green-400">
                      <Image className="h-3 w-3 mr-1" />
                      <span className="font-medium">{rejects.total_images}</span>
                    </div>
                  )}
                </div>
              )}
              
              {/* Custom Tooltip */}
              {isHovered && hasData && (
                <div className="absolute top-full left-1/2 transform -translate-x-1/2 mt-1 z-50 bg-popover text-popover-foreground p-4 rounded-md shadow-lg border min-w-[250px] max-w-sm">
                  <div className="space-y-2">
                    <div className="font-medium text-sm">{format(day, 'MMM d, yyyy')}</div>
                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="flex items-center text-red-600 dark:text-red-400">
                        <X className="h-3 w-3 mr-1" />
                        <span>{rejects.total_rejects} rejects</span>
                      </div>
                      <div className="flex items-center text-green-600 dark:text-green-400">
                        <Image className="h-3 w-3 mr-1" />
                        <span>{rejects.total_images} images</span>
                      </div>
                    </div>
                    {(rejects.total_rejects > 0 || rejects.total_images > 0) && (
                      <div className="text-xs pt-1 border-t space-y-1">
                        <div className="text-muted-foreground">
                          Reject Rate: {rejects.reject_percentage.toFixed(1)}%
                        </div>
                        {(() => {
                          const comparison = getTargetComparison(rejects.reject_percentage);
                          if (!comparison) {
                            return (
                              <div className="text-muted-foreground">
                                Loading target rates...
                              </div>
                            );
                          }
                          return (
                            <div className={`flex items-center gap-1 ${
                              comparison.status === 'good' 
                                ? 'text-green-600 dark:text-green-400' 
                                : 'text-yellow-600 dark:text-yellow-400'
                            }`}>
                              <span>{comparison.icon}</span>
                              <span>{comparison.message}</span>
                            </div>
                          );
                        })()}
                      </div>
                    )}
                    {rejects.categories.length > 0 && (
                      <div className="text-xs pt-1 border-t">
                        <div className="font-medium mb-1">Categories:</div>
                        {rejects.categories.slice(0, 3).map((cat, index) => (
                          <div key={index} className="text-muted-foreground">
                            {cat.category_name}: {cat.count}
                          </div>
                        ))}
                        {rejects.categories.length > 3 && (
                          <div className="text-muted-foreground">
                            +{rejects.categories.length - 3} more...
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function DailyRejectCalendar({ language = 'en' }: DailyRejectCalendarProps) {
  const t = translations[language];
  
  const [categories, setCategories] = useState<RejectCategory[]>([]);
  const [dailySummaries, setDailySummaries] = useState<DailyRejectSummary[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [rejectEntries, setRejectEntries] = useState<DailyRejectEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());

  // Load reject categories
  useEffect(() => {
    loadCategories();
  }, []);

  // Load daily reject data for current month
  useEffect(() => {
    loadDailyRejects();
  }, [currentDate]);

  const loadCategories = async () => {
    try {
      const response = await rejectAnalysisApi.categories.getCategories({
        is_active: true,
        page_size: 100
      });
      setCategories(response.results || []);
    } catch (error) {
      console.error('Failed to load categories:', error);
      toast.error(t.loadError);
    } finally {
      setLoading(false);
    }
  };


  const loadDailyRejects = async () => {
    try {
      // Load daily reject summaries for the current month
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth() + 1; // getMonth() returns 0-11
      
      const summaries = await rejectAnalysisApi.incidents.getDailySummaries({
        year,
        month: month.toString()
      });
      
      setDailySummaries(summaries);
    } catch (error) {
      console.error('Failed to load daily rejects:', error);
      // Set empty array on error
      setDailySummaries([]);
    }
  };

  const handleDateClick = useCallback(async (date: Date) => {
    setSelectedDate(date);
    await initializeRejectEntries(date);
    setIsModalOpen(true);
  }, [categories, dailySummaries]);

  const handleMonthChange = (direction: 'prev' | 'next') => {
    const newDate = new Date(currentDate);
    if (direction === 'prev') {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setMonth(newDate.getMonth() + 1);
    }
    setCurrentDate(newDate);
  };

  const initializeRejectEntries = async (date: Date) => {
    const dateStr = format(date, 'yyyy-MM-dd');
    const entries: DailyRejectEntry[] = [];
    
    // Find existing data for this date
    const existingData = dailySummaries.find(summary => summary.date === dateStr);
    
    categories.forEach(category => {
      category.reasons?.forEach(reason => {
        // Get exact count for this specific reason from existing data
        let existingCount = 0;
        if (existingData && existingData.reasons) {
          existingCount = existingData.reasons[reason.id] || 0;
        }
        
        entries.push({
          date: dateStr,
          category_id: category.id,
          reason_id: reason.id,
          count: existingCount
        });
      });
    });
    
    setRejectEntries(entries);
  };

  const handleCountChange = (categoryId: number, reasonId: number, value: string) => {
    const numValue = parseInt(value) || 0;
    
    setRejectEntries(prev => 
      prev.map(entry => 
        entry.category_id === categoryId && entry.reason_id === reasonId
          ? { ...entry, count: numValue }
          : entry
      )
    );
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      
      // Send ALL entries (including 0 values) to properly update/delete records
      const allEntries = rejectEntries; // Don't filter out zeros!
      
      if (allEntries.length === 0) {
        toast.error('No data to save');
        return;
      }

      // Prepare bulk data for single API call - include ALL values including 0
      const rejects: Record<string, number> = {};
      
      for (const entry of allEntries) {
        const category = categories.find(c => c.id === entry.category_id);
        const reason = category?.reasons?.find(r => r.id === entry.reason_id);
        
        if (!category || !reason) {
          throw new Error(`Category or reason not found for entry: ${entry.category_id}/${entry.reason_id}`);
        }
        
        rejects[entry.reason_id.toString()] = entry.count;
      }
      
      // Single API call for all rejects on this date
      const result = await rejectAnalysisApi.incidents.createBulkDailyIncidents({
        date: allEntries[0].date,
        rejects
      });
      
      const totalIncidents = result.incidents_created;
      const replacedIncidents = result.incidents_replaced || 0;
      
      let message = `${t.saveSuccess} (${totalIncidents} incidents created`;
      if (replacedIncidents > 0) {
        message += `, replaced ${replacedIncidents} existing`;
      }
      message += ')';
      
      toast.success(message);
      setIsModalOpen(false);
      
      // Refresh the calendar to show updated data
      await loadDailyRejects();
    } catch (error) {
      console.error('Error saving daily rejects:', error);
      toast.error(error instanceof Error ? error.message : t.saveError);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {t.title}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5" />
            {t.title}
          </CardTitle>
          <p className="text-sm text-muted-foreground">{t.subtitle}</p>
        </CardHeader>
        
        <CardContent>
          <SimpleCalendar
            currentDate={currentDate}
            onDateClick={handleDateClick}
            onMonthChange={handleMonthChange}
            dailySummaries={dailySummaries}
            t={t}
          />
        </CardContent>
      </Card>

      {/* Daily Reject Entry Modal */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent 
          className="overflow-y-auto"
          style={{
            maxWidth: '90vw',
            width: '90vw',
            maxHeight: '90vh',
            height: 'auto'
          }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              {t.logRejects} {selectedDate && format(selectedDate, 'MMMM d, yyyy')}
            </DialogTitle>
            <DialogDescription>
              Enter the number of rejects for each reason. Leave as 0 if no rejects occurred.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-6 py-4">
            {categories.map(category => (
              <div key={category.id} className="space-y-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium">{category.name}</h3>
                  <Badge variant="outline">{category.reasons?.length || 0} reasons</Badge>
                </div>
                
                <div className="grid gap-4 md:grid-cols-2 pl-4">
                  {category.reasons?.map(reason => {
                    const entry = rejectEntries.find(
                      e => e.category_id === category.id && e.reason_id === reason.id
                    );
                    
                    return (
                      <div key={reason.id} className="flex items-center gap-3 p-3 border border-border rounded-lg">
                        <div className="flex-1">
                          <Label htmlFor={`reason-${reason.id}`} className="text-sm font-medium">
                            {reason.name}
                          </Label>
                          {reason.description && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {reason.description.length > 80 
                                ? `${reason.description.substring(0, 80)}...` 
                                : reason.description}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor={`reason-${reason.id}`} className="text-sm text-muted-foreground">
                            Count:
                          </Label>
                          <Input
                            id={`reason-${reason.id}`}
                            type="number"
                            min="0"
                            max="999"
                            value={entry?.count || 0}
                            onChange={(e) => handleCountChange(category.id, reason.id, e.target.value)}
                            className="w-20 text-center"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            {categories.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                {t.noCategories}
              </div>
            )}
          </div>
          
          <div className="flex gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setIsModalOpen(false)}
              className="flex-1"
            >
              {t.cancel}
            </Button>
            <Button
              onClick={handleSave}
              disabled={saving}
              className="flex-1"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  {t.saving}
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  {t.save}
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}