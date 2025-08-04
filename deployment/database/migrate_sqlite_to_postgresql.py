#!/usr/bin/env python3
"""
SQLite to PostgreSQL Migration Script for AI-Powered RIS

This script migrates data from SQLite development database to PostgreSQL production database.
It handles:
- Data type conversions
- Foreign key constraints
- Sequence adjustments
- Data validation
- Error handling and rollback
"""

import os
import sys
import sqlite3
import psycopg2
import json
import logging
from datetime import datetime
from typing import Dict, List, Any, Optional

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('migration.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class DatabaseMigrator:
    """Handles migration from SQLite to PostgreSQL"""
    
    def __init__(self, sqlite_db_path: str, postgres_config: Dict[str, str]):
        self.sqlite_db_path = sqlite_db_path
        self.postgres_config = postgres_config
        self.sqlite_conn = None
        self.postgres_conn = None
        self.migration_stats = {
            'tables_migrated': 0,
            'records_migrated': 0,
            'errors': 0,
            'start_time': None,
            'end_time': None
        }
        
    def connect_databases(self):
        """Establish connections to both databases"""
        try:
            # Connect to SQLite
            self.sqlite_conn = sqlite3.connect(self.sqlite_db_path)
            self.sqlite_conn.row_factory = sqlite3.Row
            logger.info(f"Connected to SQLite database: {self.sqlite_db_path}")
            
            # Connect to PostgreSQL
            self.postgres_conn = psycopg2.connect(
                host=self.postgres_config['host'],
                database=self.postgres_config['database'],
                user=self.postgres_config['user'],
                password=self.postgres_config['password'],
                port=self.postgres_config['port']
            )
            self.postgres_conn.autocommit = False
            logger.info(f"Connected to PostgreSQL database: {self.postgres_config['database']}")
            
        except Exception as e:
            logger.error(f"Database connection failed: {e}")
            raise
    
    def get_table_schema(self, table_name: str) -> List[Dict[str, Any]]:
        """Get table schema from SQLite"""
        cursor = self.sqlite_conn.cursor()
        cursor.execute(f"PRAGMA table_info({table_name})")
        return [dict(row) for row in cursor.fetchall()]
    
    def get_all_tables(self) -> List[str]:
        """Get list of all tables from SQLite database"""
        cursor = self.sqlite_conn.cursor()
        cursor.execute("""
            SELECT name FROM sqlite_master 
            WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'django_migrations'
            ORDER BY name
        """)
        return [row[0] for row in cursor.fetchall()]
    
    def convert_data_type(self, sqlite_type: str, value: Any) -> Any:
        """Convert SQLite data types to PostgreSQL compatible values"""
        if value is None:
            return None
            
        # Handle boolean values
        if sqlite_type.upper() in ('BOOLEAN', 'BOOL'):
            if isinstance(value, (int, str)):
                return bool(int(value))
            return bool(value)
        
        # Handle datetime fields
        if sqlite_type.upper() in ('DATETIME', 'TIMESTAMP'):
            if isinstance(value, str):
                # Try to parse various datetime formats
                formats = [
                    '%Y-%m-%d %H:%M:%S.%f',
                    '%Y-%m-%d %H:%M:%S',
                    '%Y-%m-%d',
                ]
                for fmt in formats:
                    try:
                        return datetime.strptime(value, fmt)
                    except ValueError:
                        continue
                logger.warning(f"Could not parse datetime: {value}")
                return None
            return value
        
        # Handle JSON fields
        if sqlite_type.upper() == 'JSON':
            if isinstance(value, str):
                try:
                    return json.loads(value)
                except json.JSONDecodeError:
                    return value
            return value
        
        return value
    
    def migrate_table(self, table_name: str) -> int:
        """Migrate a single table from SQLite to PostgreSQL"""
        logger.info(f"Migrating table: {table_name}")
        
        try:
            # Get table schema
            schema = self.get_table_schema(table_name)
            column_names = [col['name'] for col in schema]
            
            # Get all data from SQLite
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute(f"SELECT * FROM {table_name}")
            rows = sqlite_cursor.fetchall()
            
            if not rows:
                logger.info(f"Table {table_name} is empty, skipping...")
                return 0
            
            # Prepare PostgreSQL insert statement
            placeholders = ', '.join(['%s'] * len(column_names))
            insert_query = f"""
                INSERT INTO {table_name} ({', '.join(column_names)}) 
                VALUES ({placeholders})
            """
            
            postgres_cursor = self.postgres_conn.cursor()
            migrated_count = 0
            
            # Migrate data in batches
            batch_size = 1000
            for i in range(0, len(rows), batch_size):
                batch = rows[i:i + batch_size]
                batch_data = []
                
                for row in batch:
                    converted_row = []
                    for j, value in enumerate(row):
                        col_type = schema[j]['type']
                        converted_value = self.convert_data_type(col_type, value)
                        converted_row.append(converted_value)
                    batch_data.append(converted_row)
                
                try:
                    postgres_cursor.executemany(insert_query, batch_data)
                    migrated_count += len(batch)
                    logger.info(f"Migrated {migrated_count}/{len(rows)} records from {table_name}")
                    
                except Exception as e:
                    logger.error(f"Error migrating batch for table {table_name}: {e}")
                    # Try individual inserts for this batch
                    for row_data in batch_data:
                        try:
                            postgres_cursor.execute(insert_query, row_data)
                            migrated_count += 1
                        except Exception as row_error:
                            logger.error(f"Failed to migrate row from {table_name}: {row_error}")
                            logger.error(f"Row data: {row_data}")
                            self.migration_stats['errors'] += 1
            
            # Update sequences for auto-increment fields
            self.update_sequences(table_name, schema)
            
            logger.info(f"Successfully migrated {migrated_count} records from {table_name}")
            return migrated_count
            
        except Exception as e:
            logger.error(f"Failed to migrate table {table_name}: {e}")
            self.migration_stats['errors'] += 1
            return 0
    
    def update_sequences(self, table_name: str, schema: List[Dict[str, Any]]):
        """Update PostgreSQL sequences for auto-increment fields"""
        try:
            postgres_cursor = self.postgres_conn.cursor()
            
            # Find primary key or auto-increment fields
            for col in schema:
                if col['pk'] == 1:  # Primary key
                    sequence_name = f"{table_name}_{col['name']}_seq"
                    
                    # Check if sequence exists
                    postgres_cursor.execute("""
                        SELECT EXISTS (
                            SELECT 1 FROM pg_class 
                            WHERE relname = %s AND relkind = 'S'
                        )
                    """, (sequence_name,))
                    
                    if postgres_cursor.fetchone()[0]:
                        # Get max value from table
                        postgres_cursor.execute(f"SELECT MAX({col['name']}) FROM {table_name}")
                        max_val = postgres_cursor.fetchone()[0]
                        
                        if max_val is not None:
                            # Update sequence
                            postgres_cursor.execute(
                                f"SELECT setval('{sequence_name}', %s)",
                                (max_val,)
                            )
                            logger.info(f"Updated sequence {sequence_name} to {max_val}")
                    
        except Exception as e:
            logger.warning(f"Could not update sequences for {table_name}: {e}")
    
    def validate_migration(self, table_name: str) -> bool:
        """Validate that migration was successful by comparing record counts"""
        try:
            # Count records in SQLite
            sqlite_cursor = self.sqlite_conn.cursor()
            sqlite_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            sqlite_count = sqlite_cursor.fetchone()[0]
            
            # Count records in PostgreSQL
            postgres_cursor = self.postgres_conn.cursor()
            postgres_cursor.execute(f"SELECT COUNT(*) FROM {table_name}")
            postgres_count = postgres_cursor.fetchone()[0]
            
            if sqlite_count == postgres_count:
                logger.info(f"Validation passed for {table_name}: {postgres_count} records")
                return True
            else:
                logger.error(f"Validation failed for {table_name}: SQLite={sqlite_count}, PostgreSQL={postgres_count}")
                return False
                
        except Exception as e:
            logger.error(f"Validation error for {table_name}: {e}")
            return False
    
    def run_migration(self):
        """Run the complete migration process"""
        self.migration_stats['start_time'] = datetime.now()
        logger.info("Starting SQLite to PostgreSQL migration...")
        
        try:
            self.connect_databases()
            
            # Get all tables to migrate
            tables = self.get_all_tables()
            logger.info(f"Found {len(tables)} tables to migrate: {', '.join(tables)}")
            
            # Define migration order (to handle foreign key dependencies)
            migration_order = [
                # Users and authentication
                'auth_user', 'auth_group', 'auth_permission', 'auth_user_groups', 'auth_user_user_permissions',
                'staff_staff',
                
                # Core data
                'wad_wad',
                'pesakit_pesakit',
                'exam_modaliti', 'exam_exam',
                
                # Main application data
                'exam_daftar', 'exam_pemeriksaan', 'exam_pacsexam', 'exam_pacsconfig', 'exam_pacsserver',
                'exam_dashboardconfig', 'exam_mediadistribution',
                
                # AI and reporting
                'exam_aigeneratedreport', 'exam_radiologistreport',
                
                # Reject analysis
                'exam_rejectcategory', 'exam_rejectincident', 'exam_rejectanalysis',
                'exam_rejectanalysistargetsettings',
                
                # Audit
                'audit_auditlog',
                
                # Any remaining tables
            ]
            
            # Add any tables not in the predefined order
            for table in tables:
                if table not in migration_order:
                    migration_order.append(table)
            
            # Migrate tables in order
            for table_name in migration_order:
                if table_name in tables:
                    try:
                        postgres_cursor = self.postgres_conn.cursor()
                        postgres_cursor.execute("BEGIN")
                        
                        migrated_count = self.migrate_table(table_name)
                        
                        if migrated_count >= 0:
                            if self.validate_migration(table_name):
                                postgres_cursor.execute("COMMIT")
                                self.migration_stats['tables_migrated'] += 1
                                self.migration_stats['records_migrated'] += migrated_count
                                logger.info(f"Successfully committed migration for {table_name}")
                            else:
                                postgres_cursor.execute("ROLLBACK")
                                logger.error(f"Rolling back migration for {table_name} due to validation failure")
                                self.migration_stats['errors'] += 1
                        else:
                            postgres_cursor.execute("ROLLBACK")
                            logger.error(f"Rolling back migration for {table_name} due to migration failure")
                            
                    except Exception as e:
                        postgres_cursor.execute("ROLLBACK")
                        logger.error(f"Migration failed for {table_name}: {e}")
                        self.migration_stats['errors'] += 1
            
            # Final validation
            self.run_final_validation()
            
        except Exception as e:
            logger.error(f"Migration failed: {e}")
            raise
        
        finally:
            self.migration_stats['end_time'] = datetime.now()
            self.close_connections()
            self.print_migration_summary()
    
    def run_final_validation(self):
        """Run final validation checks"""
        logger.info("Running final validation checks...")
        
        try:
            postgres_cursor = self.postgres_conn.cursor()
            
            # Check foreign key constraints
            postgres_cursor.execute("""
                SELECT conname, conrelid::regclass, confrelid::regclass
                FROM pg_constraint
                WHERE contype = 'f'
            """)
            
            constraints = postgres_cursor.fetchall()
            logger.info(f"Found {len(constraints)} foreign key constraints")
            
            # Test some basic queries
            test_queries = [
                "SELECT COUNT(*) FROM staff_staff",
                "SELECT COUNT(*) FROM pesakit_pesakit", 
                "SELECT COUNT(*) FROM exam_daftar",
                "SELECT COUNT(*) FROM exam_pemeriksaan",
            ]
            
            for query in test_queries:
                try:
                    postgres_cursor.execute(query)
                    result = postgres_cursor.fetchone()[0]
                    logger.info(f"Test query '{query}' returned: {result}")
                except Exception as e:
                    logger.error(f"Test query failed '{query}': {e}")
            
        except Exception as e:
            logger.error(f"Final validation failed: {e}")
    
    def close_connections(self):
        """Close database connections"""
        if self.sqlite_conn:
            self.sqlite_conn.close()
            logger.info("Closed SQLite connection")
            
        if self.postgres_conn:
            self.postgres_conn.close()
            logger.info("Closed PostgreSQL connection")
    
    def print_migration_summary(self):
        """Print migration summary"""
        duration = self.migration_stats['end_time'] - self.migration_stats['start_time']
        
        print("\n" + "="*60)
        print("MIGRATION SUMMARY")
        print("="*60)
        print(f"Start Time: {self.migration_stats['start_time']}")
        print(f"End Time: {self.migration_stats['end_time']}")
        print(f"Duration: {duration}")
        print(f"Tables Migrated: {self.migration_stats['tables_migrated']}")
        print(f"Records Migrated: {self.migration_stats['records_migrated']}")
        print(f"Errors: {self.migration_stats['errors']}")
        
        if self.migration_stats['errors'] == 0:
            print("\n✅ MIGRATION COMPLETED SUCCESSFULLY!")
        else:
            print(f"\n⚠️  MIGRATION COMPLETED WITH {self.migration_stats['errors']} ERRORS")
            print("Please check the migration.log file for details")
        
        print("="*60)


def main():
    """Main function to run the migration"""
    
    # Configuration
    sqlite_db_path = "db.sqlite3"  # Adjust path as needed
    
    postgres_config = {
        'host': os.environ.get('DATABASE_HOST', 'localhost'),
        'database': os.environ.get('DATABASE_NAME', 'ris_production'),
        'user': os.environ.get('DATABASE_USER', 'ris_user'),
        'password': os.environ.get('DATABASE_PASSWORD'),
        'port': os.environ.get('DATABASE_PORT', '5432'),
    }
    
    # Validate configuration
    if not postgres_config['password']:
        print("Error: DATABASE_PASSWORD environment variable is required")
        sys.exit(1)
    
    if not os.path.exists(sqlite_db_path):
        print(f"Error: SQLite database not found: {sqlite_db_path}")
        sys.exit(1)
    
    print("AI-Powered RIS Database Migration")
    print("SQLite → PostgreSQL")
    print("-" * 40)
    print(f"Source: {sqlite_db_path}")
    print(f"Target: {postgres_config['database']} on {postgres_config['host']}")
    print()
    
    # Confirm migration
    confirm = input("Are you sure you want to proceed with the migration? (y/N): ")
    if confirm.lower() not in ['y', 'yes']:
        print("Migration cancelled.")
        sys.exit(0)
    
    # Run migration
    migrator = DatabaseMigrator(sqlite_db_path, postgres_config)
    
    try:
        migrator.run_migration()
    except KeyboardInterrupt:
        print("\nMigration interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\nMigration failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()