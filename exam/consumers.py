import json
import asyncio
import psutil
import os
import shutil
from channels.generic.websocket import AsyncWebsocketConsumer
from channels.exceptions import StopConsumer

class DashboardConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        await self.accept()
        # Start sending live updates for non-chart data only
        self.task = asyncio.create_task(self.send_live_updates())

    async def disconnect(self, close_code):
        # Cancel the background task
        if hasattr(self, 'task'):
            self.task.cancel()
        raise StopConsumer()

    async def send_live_updates(self):
        """Send live updates for system resources and storage info only - NO CHARTS"""
        try:
            while True:
                # 1. System Resources (live)
                cpu_percent = psutil.cpu_percent(interval=1)
                memory = psutil.virtual_memory()
                disk_io = psutil.disk_io_counters()
                
                system_resources = {
                    'cpu_usage_percent': round(cpu_percent, 1),
                    'ram_total_gb': round(memory.total / (1024**3), 2),
                    'ram_used_gb': round(memory.used / (1024**3), 2),
                    'ram_available_gb': round(memory.available / (1024**3), 2),
                    'ram_usage_percent': round(memory.percent, 1),
                    'disk_read_mb': round(disk_io.read_bytes / (1024**2), 2) if disk_io else 0,
                    'disk_write_mb': round(disk_io.write_bytes / (1024**2), 2) if disk_io else 0
                }
                
                # Send system resources update
                await self.send(text_data=json.dumps({
                    'type': 'system_resources',
                    'data': system_resources
                }))
                
                # 2. Storage Info (live but less frequent)
                # Only update storage every 10 seconds to avoid too much disk I/O
                if not hasattr(self, 'storage_counter'):
                    self.storage_counter = 0
                
                self.storage_counter += 1
                if self.storage_counter >= 5:  # Every 10 seconds (5 * 2 seconds)
                    storage_info = await self.get_storage_info()
                    if storage_info:
                        await self.send(text_data=json.dumps({
                            'type': 'storage_info',
                            'data': storage_info
                        }))
                    self.storage_counter = 0
                
                # Wait 2 seconds before next update
                await asyncio.sleep(2)
                
        except asyncio.CancelledError:
            # Task was cancelled, exit gracefully
            pass
        except Exception as e:
            # Log error and close connection
            print(f"Error in dashboard WebSocket: {e}")
            await self.close()

    async def get_storage_info(self):
        """Get storage information without affecting charts"""
        try:
            # Simple storage check for primary paths
            storage_paths = ['/var/lib/orthanc/db', '/data/orthanc', '/opt/orthanc/data', os.getcwd()]
            
            for path in storage_paths:
                if os.path.exists(path):
                    total, used, free = shutil.disk_usage(path)
                    total_gb = total / (1024**3)
                    used_gb = used / (1024**3)
                    free_gb = free / (1024**3)
                    usage_percentage = (used / total) * 100 if total > 0 else 0
                    
                    return {
                        'primary_storage': {
                            'total_gb': round(total_gb, 2),
                            'used_gb': round(used_gb, 2),
                            'free_gb': round(free_gb, 2),
                            'usage_percentage': round(usage_percentage, 1)
                        },
                        'growth_analysis': {
                            'daily_growth_gb': 0.1,  # Estimated
                            'monthly_growth_gb': 3.0,  # Estimated
                            'days_until_full': int(free_gb / 0.1) if free_gb > 0 else 0,
                            'months_until_full': round((free_gb / 0.1) / 30, 1) if free_gb > 0 else 0,
                            'daily_exam_count': 25  # Estimated
                        }
                    }
            return None
        except Exception:
            return None