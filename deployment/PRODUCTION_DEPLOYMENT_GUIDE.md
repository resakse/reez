# AI-Powered RIS Production Deployment Guide

## Overview

This guide provides complete instructions for deploying the AI-Powered Radiology Information System (RIS) to production. The system includes:

- **Backend**: Django REST Framework with PostgreSQL
- **Frontend**: Next.js with React and TypeScript
- **AI System**: Ollama with medical AI models
- **Infrastructure**: Docker containers with Nginx reverse proxy
- **Monitoring**: Comprehensive audit trails and system monitoring
- **Security**: Production-hardened configuration with encryption

## Prerequisites

### Hardware Requirements

**Minimum Requirements:**
- CPU: 8 cores (Intel/AMD x64)
- RAM: 16GB
- Storage: 500GB SSD
- GPU: NVIDIA P40 or equivalent (for AI models)
- Network: Gigabit Ethernet

**Recommended Requirements:**
- CPU: 16 cores (Intel/AMD x64)
- RAM: 32GB
- Storage: 1TB NVMe SSD
- GPU: NVIDIA RTX 4090 or equivalent
- Network: Gigabit Ethernet with redundancy

### Software Requirements

- **Operating System**: Ubuntu 22.04 LTS or later
- **Docker**: 24.0+ with Docker Compose v2
- **NVIDIA Container Toolkit**: Latest version
- **Git**: 2.30+
- **SSL Certificates**: Valid SSL certificates for HTTPS

### Network Requirements

- **Ports**: 80 (HTTP), 443 (HTTPS), 22 (SSH)
- **Internal Ports**: 5432 (PostgreSQL), 6379 (Redis), 11434 (Ollama)
- **Firewall**: Configured for production security
- **DNS**: Proper domain name resolution

## Deployment Options

### Option 1: Automated Deployment (Recommended)

Use the provided deployment scripts for automated installation:

```bash
# Clone repository
git clone <repository-url> /opt/ris-production
cd /opt/ris-production

# Run automated deployment
sudo ./deployment/scripts/deploy.sh production
```

### Option 2: Manual Step-by-Step Deployment

Follow the detailed steps below for manual deployment.

## Step-by-Step Deployment

### 1. System Preparation

#### 1.1 Update System
```bash
sudo apt update && sudo apt upgrade -y
sudo reboot
```

#### 1.2 Install Docker and Dependencies
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo apt install docker-compose-plugin

# Install NVIDIA Container Toolkit
distribution=$(. /etc/os-release;echo $ID$VERSION_ID)
curl -s -L https://nvidia.github.io/nvidia-docker/gpgkey | sudo apt-key add -
curl -s -L https://nvidia.github.io/nvidia-docker/$distribution/nvidia-docker.list | sudo tee /etc/apt/sources.list.d/nvidia-docker.list
sudo apt update && sudo apt install -y nvidia-container-toolkit
sudo systemctl restart docker
```

#### 1.3 Security Hardening
```bash
sudo ./deployment/security/security_hardening.sh
```

### 2. Database Setup

#### 2.1 Install and Configure PostgreSQL
```bash
sudo ./deployment/database/postgresql_setup.sh
```

#### 2.2 Migrate Data from SQLite (if applicable)
```bash
# Set environment variables for migration
export DATABASE_PASSWORD="your-secure-password"
export DATABASE_NAME="ris_production"
export DATABASE_USER="ris_user"

# Run migration
python ./deployment/database/migrate_sqlite_to_postgresql.py
```

### 3. Performance Optimization

#### 3.1 Setup Redis Caching
```bash
sudo ./deployment/performance/redis_setup.sh
```

#### 3.2 Configure System Performance
```bash
# Apply performance optimizations
sudo sysctl -p /etc/sysctl.d/99-security.conf
```

### 4. Environment Configuration

#### 4.1 Create Production Environment File
```bash
# Copy template and customize
cp deployment/production.env.template deployment/production.env

# Edit with your production values
nano deployment/production.env
```

#### 4.2 Essential Environment Variables
```bash
# Django Core
DJANGO_SECRET_KEY="your-super-secure-secret-key-here"
DJANGO_DEBUG=False
DJANGO_ALLOWED_HOSTS="yourdomain.com,www.yourdomain.com"

# Database
DATABASE_PASSWORD="your-secure-db-password"

# Redis
REDIS_PASSWORD="your-secure-redis-password"

# AI System
AI_OLLAMA_SERVER_URL="http://ollama:11434"
AI_REPORTING_ENABLED=True

# Email
EMAIL_HOST="smtp.yourdomain.com"
EMAIL_HOST_USER="ris@yourdomain.com"
EMAIL_HOST_PASSWORD="your-email-password"

# Security
CORS_ALLOWED_ORIGINS="https://yourdomain.com"
```

### 5. SSL Certificate Setup

#### 5.1 Using Let's Encrypt (Recommended)
```bash
# Install Certbot
sudo apt install certbot python3-certbot-nginx

# Obtain certificates
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com

# Verify auto-renewal
sudo certbot renew --dry-run
```

#### 5.2 Using Custom Certificates
```bash
# Copy certificates to proper location
sudo mkdir -p /etc/nginx/ssl
sudo cp your-cert.pem /etc/nginx/ssl/fullchain.pem
sudo cp your-key.pem /etc/nginx/ssl/privkey.pem
sudo chmod 600 /etc/nginx/ssl/*
```

### 6. Docker Deployment

#### 6.1 Build and Start Services
```bash
# Build application image
docker-compose -f docker-compose.yml build

# Start all services
docker-compose -f docker-compose.yml up -d

# Verify services are running
docker-compose ps
```

#### 6.2 Initialize Database
```bash
# Run migrations
docker-compose exec app python manage.py migrate

# Create superuser
docker-compose exec app python manage.py createsuperuser

# Collect static files
docker-compose exec app python manage.py collectstatic --noinput
```

#### 6.3 Initialize AI Models
```bash
# Download medical AI models
docker-compose exec ollama ollama pull llava-med:7b
docker-compose exec ollama ollama pull meditron:7b
docker-compose exec ollama ollama pull medalpaca:7b
```

### 7. Monitoring and Backup Setup

#### 7.1 Configure Monitoring
```bash
sudo ./deployment/monitoring/production_monitoring_setup.sh
```

#### 7.2 Setup Backup Strategy
```bash
sudo ./deployment/backup/backup_strategy.sh
```

### 8. Final Configuration

#### 8.1 Configure Nginx
```bash
# Copy production nginx config
sudo cp deployment/security/nginx.conf /etc/nginx/sites-available/default
sudo nginx -t
sudo systemctl restart nginx
```

#### 8.2 Setup Systemd Services (Optional)
```bash
# Create systemd service for auto-start
sudo cp deployment/systemd/ris-production.service /etc/systemd/system/
sudo systemctl enable ris-production.service
sudo systemctl start ris-production.service
```

## Post-Deployment Verification

### 1. Health Checks

```bash
# Check system health
curl -f http://yourdomain.com/health/

# Check API health
curl -f http://yourdomain.com/api/health/

# Check AI system
curl -f http://localhost:11434/api/tags

# Check database connectivity
docker-compose exec app python manage.py shell -c "
from django.db import connection
with connection.cursor() as cursor:
    cursor.execute('SELECT 1')
print('Database OK')
"
```

### 2. Performance Testing

```bash
# Run system monitoring dashboard
sudo /opt/ris-monitoring/scripts/monitoring_dashboard.sh

# Check resource usage
docker stats

# Verify backup system
sudo /usr/local/bin/ris-backup-status.sh
```

### 3. Security Verification

```bash
# Run security status check
sudo /usr/local/bin/security-status.sh

# Test SSL configuration
curl -I https://yourdomain.com

# Verify firewall rules
sudo ufw status verbose
```

## Maintenance Procedures

### Daily Maintenance (Automated)

The following tasks run automatically via cron jobs:

- **System Health Monitoring**: Every 15 minutes
- **Application Performance Monitoring**: Every hour
- **Database Backup**: Every 6 hours
- **Full System Backup**: Daily at 2 AM
- **Log Rotation**: Daily
- **Security Monitoring**: Continuous

### Weekly Maintenance (Manual - 30 minutes)

1. **Review System Health**:
   ```bash
   sudo /opt/ris-monitoring/scripts/monitoring_dashboard.sh
   ```

2. **Check Backup Integrity**:
   ```bash
   sudo /usr/local/bin/ris-verify-backups.sh
   ```

3. **Review Security Logs**:
   ```bash
   sudo tail -100 /var/log/ris/security.log
   ```

4. **Update System Packages**:
   ```bash
   sudo apt update && sudo apt upgrade -y
   ```

### Monthly Maintenance (Manual - 2 hours)

1. **Comprehensive System Review**:
   - Performance metrics analysis
   - Storage usage optimization
   - Security audit
   - Backup restoration testing

2. **AI Model Updates**:
   ```bash
   # Check for model updates
   docker-compose exec ollama ollama list
   
   # Update models if needed
   docker-compose exec ollama ollama pull llava-med:latest
   ```

3. **Database Maintenance**:
   ```bash
   sudo /usr/local/bin/postgresql-maintenance.sh
   ```

4. **SSL Certificate Renewal** (if not automated):
   ```bash
   sudo certbot renew
   ```

## Troubleshooting

### Common Issues

#### 1. Service Won't Start
```bash
# Check service logs
docker-compose logs <service-name>

# Check system resources
df -h
free -h

# Restart services
docker-compose restart <service-name>
```

#### 2. Database Connection Issues
```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check database connectivity
docker-compose exec database psql -U ris_user -d ris_production -c "SELECT 1;"

# Review database logs
sudo tail -f /var/log/postgresql/postgresql-*.log
```

#### 3. AI System Not Responding
```bash
# Check Ollama service
docker-compose logs ollama

# Verify GPU access
nvidia-smi

# Restart AI service
docker-compose restart ollama
```

#### 4. High Memory Usage
```bash
# Check memory usage by service
docker stats

# Clean up unused resources
docker system prune -f

# Restart services if needed
docker-compose restart
```

### Emergency Procedures

#### 1. System Rollback
```bash
# Automated rollback using deployment script
sudo ./deployment/scripts/deploy.sh production --rollback

# Manual rollback
cd /opt/ris-production
git checkout HEAD~1
docker-compose down
docker-compose up -d
```

#### 2. Database Recovery
```bash
# List available backups
ls -la /var/backups/ris/database/daily/

# Restore from backup
sudo /usr/local/bin/ris-database-restore.sh /var/backups/ris/database/daily/backup_file.sql.gz.gpg
```

#### 3. Complete System Recovery
```bash
# Stop all services
docker-compose down

# Restore from full backup
sudo ./deployment/backup/restore_full_system.sh

# Restart services
docker-compose up -d
```

## Security Considerations

### Data Protection

1. **Encryption**: All sensitive data is encrypted at rest and in transit
2. **Access Control**: Role-based permissions for all system access
3. **Audit Trails**: Comprehensive logging of all user activities
4. **Backup Security**: Encrypted backups with secure key management

### Network Security

1. **Firewall**: Properly configured UFW with minimal open ports
2. **SSL/TLS**: Strong encryption for all web traffic
3. **VPN Access**: Recommended for administrative access
4. **Rate Limiting**: Protection against DoS attacks

### Compliance

The system is configured to meet:
- **HIPAA Requirements**: Patient data protection and audit trails
- **SOC 2 Type II**: Security and availability controls
- **GDPR**: Data privacy and protection regulations

## Performance Optimization

### Database Optimization

1. **Indexing**: Optimized indexes for common queries
2. **Connection Pooling**: Efficient database connection management
3. **Query Optimization**: Regular analysis of slow queries
4. **Maintenance**: Automated vacuum and analyze operations

### Caching Strategy

1. **Redis Caching**: Application-level caching for frequent data
2. **Static File Caching**: CDN integration for static assets
3. **Database Query Caching**: Reduced database load
4. **Session Management**: Efficient session storage

### AI System Optimization

1. **GPU Utilization**: Optimized AI model loading and processing
2. **Model Caching**: Efficient model storage and retrieval
3. **Batch Processing**: Optimized AI inference for multiple requests
4. **Resource Management**: Dynamic resource allocation

## Scaling Considerations

### Horizontal Scaling

1. **Load Balancing**: Multiple application instances behind load balancer
2. **Database Clustering**: PostgreSQL master-slave replication
3. **Redis Clustering**: Distributed caching layer
4. **AI Model Distribution**: Multiple AI processing nodes

### Vertical Scaling

1. **Resource Monitoring**: Continuous monitoring of CPU, memory, and storage
2. **Capacity Planning**: Proactive resource allocation
3. **Performance Tuning**: Regular optimization of system parameters

## Support and Maintenance Contacts

### Internal Team
- **System Administrator**: [Contact Information]
- **Database Administrator**: [Contact Information]
- **Security Administrator**: [Contact Information]
- **Application Developer**: [Contact Information]

### External Support
- **Hosting Provider**: [Contact Information]
- **SSL Certificate Provider**: [Contact Information]
- **Backup Service Provider**: [Contact Information]

### Emergency Contacts
- **24/7 Support Hotline**: [Phone Number]
- **Emergency Email**: [Email Address]
- **Escalation Procedure**: [Document Reference]

---

## Conclusion

This production deployment guide provides comprehensive instructions for deploying and maintaining the AI-Powered RIS. Regular monitoring, maintenance, and security updates are essential for optimal system performance and security.

For additional support or questions, refer to the troubleshooting section or contact the support team.

**Last Updated**: January 2025
**Version**: 1.0
**Next Review Date**: April 2025