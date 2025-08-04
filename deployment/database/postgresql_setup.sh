#!/bin/bash

# PostgreSQL Setup Script for AI-Powered RIS Production
# This script sets up PostgreSQL database for production deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
DB_NAME="ris_production"
DB_USER="ris_user"
DB_PASSWORD=""
POSTGRES_VERSION="14"
BACKUP_DIR="/var/backups/postgresql"

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

warn() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING: $1${NC}"
}

error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR: $1${NC}"
    exit 1
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
    error "This script must be run as root"
fi

# Generate secure password if not provided
generate_password() {
    openssl rand -base64 32 | tr -d "=+/" | cut -c1-25
}

log "Setting up PostgreSQL for AI-Powered RIS..."

# 1. Install PostgreSQL
log "Installing PostgreSQL $POSTGRES_VERSION..."
apt update
apt install -y wget ca-certificates

# Add PostgreSQL official APT repository
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | apt-key add -
echo "deb http://apt.postgresql.org/pub/repos/apt/ $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list

apt update
apt install -y postgresql-$POSTGRES_VERSION postgresql-client-$POSTGRES_VERSION postgresql-contrib-$POSTGRES_VERSION

# 2. Start and enable PostgreSQL
systemctl start postgresql
systemctl enable postgresql

# 3. Configure PostgreSQL
log "Configuring PostgreSQL..."

# Generate password if not provided
if [ -z "$DB_PASSWORD" ]; then
    DB_PASSWORD=$(generate_password)
    log "Generated database password: $DB_PASSWORD"
    echo "IMPORTANT: Save this password securely: $DB_PASSWORD" > /tmp/db_password.txt
    warn "Database password saved to /tmp/db_password.txt - please save it securely and delete the file"
fi

# Create database user and database
sudo -u postgres psql << EOF
-- Create user
CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';

-- Create database
CREATE DATABASE $DB_NAME OWNER $DB_USER;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;

-- Grant schema privileges
\c $DB_NAME
GRANT ALL ON SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO $DB_USER;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO $DB_USER;

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- Exit
\q
EOF

# 4. Configure PostgreSQL settings for production
log "Optimizing PostgreSQL configuration..."

PG_VERSION=$(sudo -u postgres psql -t -c "SELECT version();" | grep -oP "\d+\.\d+" | head -1)
PG_CONF_DIR="/etc/postgresql/$POSTGRES_VERSION/main"
PG_CONF="$PG_CONF_DIR/postgresql.conf"
PG_HBA="$PG_CONF_DIR/pg_hba.conf"

# Backup original configs
cp "$PG_CONF" "$PG_CONF.backup"
cp "$PG_HBA" "$PG_HBA.backup"

# Get system memory for optimization
TOTAL_MEM=$(free -m | awk 'NR==2{printf "%.0f", $2}')
SHARED_BUFFERS=$((TOTAL_MEM / 4))  # 25% of total memory
EFFECTIVE_CACHE_SIZE=$((TOTAL_MEM * 3 / 4))  # 75% of total memory

# Configure postgresql.conf
cat >> "$PG_CONF" << EOF

# =================================
# RIS Production Configuration
# =================================

# Connection settings
max_connections = 100
shared_buffers = ${SHARED_BUFFERS}MB
effective_cache_size = ${EFFECTIVE_CACHE_SIZE}MB

# Memory settings
work_mem = 4MB
maintenance_work_mem = 64MB
autovacuum_work_mem = 64MB

# Checkpoint settings
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100

# Performance settings
random_page_cost = 1.1
effective_io_concurrency = 200

# Logging settings
log_destination = 'stderr'
logging_collector = on
log_directory = 'log'
log_filename = 'postgresql-%Y-%m-%d_%H%M%S.log'
log_truncate_on_rotation = on
log_rotation_age = 1d
log_rotation_size = 100MB
log_min_duration_statement = 1000
log_line_prefix = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
log_checkpoints = on
log_connections = on
log_disconnections = on
log_lock_waits = on
log_temp_files = 10MB

# Security settings
ssl = on
ssl_cert_file = 'server.crt'
ssl_key_file = 'server.key'
password_encryption = scram-sha-256

# Autovacuum settings
autovacuum = on
autovacuum_max_workers = 3
autovacuum_naptime = 1min
autovacuum_vacuum_threshold = 50
autovacuum_analyze_threshold = 50
autovacuum_vacuum_scale_factor = 0.2
autovacuum_analyze_scale_factor = 0.1

# Background writer
bgwriter_delay = 200ms
bgwriter_lru_maxpages = 100
bgwriter_lru_multiplier = 2.0

# Write-ahead logging
wal_level = replica
max_wal_size = 2GB
min_wal_size = 80MB
archive_mode = on
archive_command = 'cp %p $BACKUP_DIR/wal/%f'

# Replication (for future use)
max_replication_slots = 2
max_wal_senders = 2
EOF

# 5. Configure pg_hba.conf for security
log "Configuring PostgreSQL authentication..."

cat > "$PG_HBA" << EOF
# PostgreSQL Client Authentication Configuration File
# RIS Production Configuration

# TYPE  DATABASE        USER            ADDRESS                 METHOD

# "local" is for Unix domain socket connections only
local   all             postgres                                peer
local   all             all                                     peer

# IPv4 local connections:
host    all             all             127.0.0.1/32            scram-sha-256
host    $DB_NAME        $DB_USER        127.0.0.1/32            scram-sha-256

# IPv6 local connections:
host    all             all             ::1/128                 scram-sha-256

# Allow replication connections from localhost
local   replication     all                                     peer
host    replication     all             127.0.0.1/32            scram-sha-256
host    replication     all             ::1/128                 scram-sha-256
EOF

# 6. Create backup directory and scripts
log "Setting up backup system..."
mkdir -p "$BACKUP_DIR"/{daily,weekly,monthly,wal}
chown -R postgres:postgres "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Create backup script
cat > /usr/local/bin/postgresql-backup.sh << EOF
#!/bin/bash

# PostgreSQL Backup Script for RIS
set -euo pipefail

BACKUP_DIR="$BACKUP_DIR"
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"
DATE=\$(date +%Y%m%d_%H%M%S)
RETENTION_DAYS=30

# Daily backup
DAILY_BACKUP="\$BACKUP_DIR/daily/\${DB_NAME}_\${DATE}.sql.gz"
sudo -u postgres pg_dump -U \$DB_USER -h localhost \$DB_NAME | gzip > "\$DAILY_BACKUP"

# Create weekly backup (Sunday)
if [ \$(date +%u) -eq 7 ]; then
    WEEKLY_BACKUP="\$BACKUP_DIR/weekly/\${DB_NAME}_week_\${DATE}.sql.gz"
    cp "\$DAILY_BACKUP" "\$WEEKLY_BACKUP"
fi

# Create monthly backup (1st of month)
if [ \$(date +%d) -eq 01 ]; then
    MONTHLY_BACKUP="\$BACKUP_DIR/monthly/\${DB_NAME}_month_\${DATE}.sql.gz"
    cp "\$DAILY_BACKUP" "\$MONTHLY_BACKUP"
fi

# Clean old daily backups
find "\$BACKUP_DIR/daily" -name "*.sql.gz" -mtime +\$RETENTION_DAYS -delete

# Clean old WAL files
find "\$BACKUP_DIR/wal" -name "*" -mtime +7 -delete

# Log backup completion
echo "\$(date): Backup completed - \$DAILY_BACKUP" >> /var/log/postgresql-backup.log

# Verify backup integrity
if gunzip -t "\$DAILY_BACKUP"; then
    echo "\$(date): Backup verification successful" >> /var/log/postgresql-backup.log
else
    echo "\$(date): Backup verification FAILED" >> /var/log/postgresql-backup.log
    exit 1
fi
EOF

chmod +x /usr/local/bin/postgresql-backup.sh

# Add backup to crontab
(crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/postgresql-backup.sh") | crontab -

# 7. Create restore script
cat > /usr/local/bin/postgresql-restore.sh << 'EOF'
#!/bin/bash

# PostgreSQL Restore Script for RIS
set -euo pipefail

if [ $# -ne 1 ]; then
    echo "Usage: $0 <backup_file.sql.gz>"
    exit 1
fi

BACKUP_FILE="$1"
DB_NAME="ris_production"
DB_USER="ris_user"

if [ ! -f "$BACKUP_FILE" ]; then
    echo "Error: Backup file not found: $BACKUP_FILE"
    exit 1
fi

echo "Warning: This will replace the current database!"
read -p "Are you sure you want to continue? (y/N): " confirm

if [ "$confirm" != "y" ] && [ "$confirm" != "Y" ]; then
    echo "Restore cancelled."
    exit 0
fi

echo "Stopping RIS services..."
systemctl stop ris-django || true
systemctl stop ris-frontend || true

echo "Dropping existing database..."
sudo -u postgres dropdb $DB_NAME || true
sudo -u postgres createdb -O $DB_USER $DB_NAME

echo "Restoring database from $BACKUP_FILE..."
gunzip -c "$BACKUP_FILE" | sudo -u postgres psql -U $DB_USER -d $DB_NAME

echo "Starting RIS services..."
systemctl start ris-django
systemctl start ris-frontend

echo "Database restore completed successfully!"
EOF

chmod +x /usr/local/bin/postgresql-restore.sh

# 8. Create database maintenance script
cat > /usr/local/bin/postgresql-maintenance.sh << EOF
#!/bin/bash

# PostgreSQL Maintenance Script for RIS
set -euo pipefail

DB_NAME="$DB_NAME"
DB_USER="$DB_USER"

echo "\$(date): Starting PostgreSQL maintenance..." >> /var/log/postgresql-maintenance.log

# Vacuum and analyze database
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "VACUUM ANALYZE;"

# Reindex database
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "REINDEX DATABASE \$DB_NAME;"

# Update statistics
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "ANALYZE;"

# Check database size and performance
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables 
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
" >> /var/log/postgresql-maintenance.log

echo "\$(date): PostgreSQL maintenance completed." >> /var/log/postgresql-maintenance.log
EOF

chmod +x /usr/local/bin/postgresql-maintenance.sh

# Add maintenance to crontab (weekly on Sunday at 3 AM)
(crontab -l 2>/dev/null; echo "0 3 * * 0 /usr/local/bin/postgresql-maintenance.sh") | crontab -

# 9. Create monitoring script
cat > /usr/local/bin/postgresql-monitor.sh << EOF
#!/bin/bash

# PostgreSQL Monitoring Script for RIS
DB_NAME="$DB_NAME"
DB_USER="$DB_USER"

echo "=== PostgreSQL Status Report ==="
echo "Date: \$(date)"
echo

# Database size
echo "Database Size:"
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "
SELECT pg_size_pretty(pg_database_size('\$DB_NAME')) AS database_size;
"

# Connection count
echo "Active Connections:"
sudo -u postgres psql -c "
SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';
"

# Long running queries
echo "Long Running Queries (>5 minutes):"
sudo -u postgres psql -c "
SELECT pid, now() - pg_stat_activity.query_start AS duration, query 
FROM pg_stat_activity 
WHERE (now() - pg_stat_activity.query_start) > interval '5 minutes';
"

# Table statistics
echo "Table Statistics:"
sudo -u postgres psql -U \$DB_USER -d \$DB_NAME -c "
SELECT schemaname, tablename, n_tup_ins as inserts, n_tup_upd as updates, n_tup_del as deletes
FROM pg_stat_user_tables
WHERE n_tup_ins + n_tup_upd + n_tup_del > 0
ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC;
"

echo "=== End Status Report ==="
EOF

chmod +x /usr/local/bin/postgresql-monitor.sh

# 10. Restart PostgreSQL with new configuration
log "Restarting PostgreSQL with new configuration..."
systemctl restart postgresql

# Test connection
log "Testing database connection..."
sudo -u postgres psql -U $DB_USER -d $DB_NAME -c "SELECT version();"

# 11. Create environment file for Django
cat > /tmp/database_env.txt << EOF
# Database configuration for production.env
DATABASE_ENGINE=django.db.backends.postgresql
DATABASE_NAME=$DB_NAME
DATABASE_USER=$DB_USER
DATABASE_PASSWORD=$DB_PASSWORD
DATABASE_HOST=localhost
DATABASE_PORT=5432
EOF

log "PostgreSQL setup completed successfully!"
log "Database: $DB_NAME"
log "User: $DB_USER"
log "Password saved to: /tmp/db_password.txt"
log "Environment variables saved to: /tmp/database_env.txt"

warn "Important next steps:"
warn "1. Save the database password securely"
warn "2. Update your production.env file with database credentials"
warn "3. Test database connection from your application"
warn "4. Run Django migrations"
warn "5. Set up SSL certificates for PostgreSQL"
warn "6. Configure backup retention policy"
warn "7. Monitor database performance"

log "Useful commands:"
log "- Monitor database: sudo /usr/local/bin/postgresql-monitor.sh"
log "- Manual backup: sudo /usr/local/bin/postgresql-backup.sh"
log "- Restore database: sudo /usr/local/bin/postgresql-restore.sh <backup_file>"
log "- Maintenance: sudo /usr/local/bin/postgresql-maintenance.sh"