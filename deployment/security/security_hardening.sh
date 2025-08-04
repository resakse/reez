#!/bin/bash

# Security Hardening Script for AI-Powered RIS Production Server
# This script implements security best practices for Ubuntu/Linux servers

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

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
if [[ $EUID -eq 0 ]]; then
    error "This script should not be run as root for security reasons"
fi

log "Starting security hardening for AI-Powered RIS..."

# 1. System Updates
log "Updating system packages..."
sudo apt update && sudo apt upgrade -y
sudo apt autoremove -y
sudo apt autoclean

# 2. Install security packages
log "Installing security packages..."
sudo apt install -y \
    fail2ban \
    ufw \
    rkhunter \
    chkrootkit \
    clamav \
    clamav-daemon \
    unattended-upgrades \
    apt-listchanges \
    needrestart

# 3. Configure automatic security updates
log "Configuring automatic security updates..."
sudo cat > /etc/apt/apt.conf.d/50unattended-upgrades << EOF
Unattended-Upgrade::Allowed-Origins {
    "\${distro_id}:\${distro_codename}-security";
    "\${distro_id}ESM:\${distro_codename}";
};

Unattended-Upgrade::Remove-Unused-Kernel-Packages "true";
Unattended-Upgrade::Remove-Unused-Dependencies "true";
Unattended-Upgrade::Automatic-Reboot "false";
Unattended-Upgrade::Automatic-Reboot-Time "02:00";
EOF

sudo cat > /etc/apt/apt.conf.d/20auto-upgrades << EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF

# 4. Configure UFW firewall
log "Configuring UFW firewall..."
sudo ufw --force reset
sudo ufw default deny incoming
sudo ufw default allow outgoing

# Allow SSH (customize port if needed)
sudo ufw allow ssh
# Allow HTTP and HTTPS
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# Allow Django development (remove in production)
# sudo ufw allow 8000/tcp
# Allow Next.js development (remove in production)
# sudo ufw allow 3000/tcp
# Allow Orthanc PACS
sudo ufw allow 8042/tcp
sudo ufw allow 8043/tcp
# Allow DICOM MWL
sudo ufw allow 11112/tcp

sudo ufw --force enable

# 5. Configure Fail2Ban
log "Configuring Fail2Ban..."
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local

# Create custom jail for Django admin
sudo cat > /etc/fail2ban/jail.d/django.conf << EOF
[django-auth]
enabled = true
filter = django-auth
logpath = /var/log/ris/django.log
maxretry = 3
bantime = 3600
findtime = 600

[nginx-limit-req]
enabled = true
filter = nginx-limit-req
logpath = /var/log/nginx/error.log
maxretry = 5
bantime = 600
findtime = 600
EOF

# Create Django auth filter
sudo cat > /etc/fail2ban/filter.d/django-auth.conf << EOF
[Definition]
failregex = WARNING.*Invalid login attempt.*<HOST>
            WARNING.*Suspicious activity.*<HOST>
            ERROR.*Authentication failed.*<HOST>
ignoreregex =
EOF

# Create nginx rate limit filter
sudo cat > /etc/fail2ban/filter.d/nginx-limit-req.conf << EOF
[Definition]
failregex = limiting requests, excess: \S+ by zone "\S+", client: <HOST>
ignoreregex =
EOF

# 6. Secure SSH configuration
log "Securing SSH configuration..."
sudo cp /etc/ssh/sshd_config /etc/ssh/sshd_config.backup

# Create secure SSH config
sudo cat > /etc/ssh/sshd_config << EOF
# Secure SSH Configuration for RIS Server

Port 22
Protocol 2

# Authentication
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AuthorizedKeysFile .ssh/authorized_keys
PermitEmptyPasswords no
ChallengeResponseAuthentication no
UsePAM yes

# Connection settings
ClientAliveInterval 300
ClientAliveCountMax 2
MaxAuthTries 3
MaxSessions 2
LoginGraceTime 60

# Restrict users (customize as needed)
# AllowUsers your-username

# Disable unused features
X11Forwarding no
AllowTcpForwarding no
AllowAgentForwarding no
GatewayPorts no
PermitTunnel no

# Security options
StrictModes yes
IgnoreRhosts yes
HostbasedAuthentication no
EOF

# Restart SSH service
sudo systemctl restart sshd

# 7. Configure system security limits
log "Configuring system security limits..."
sudo cat >> /etc/security/limits.conf << EOF

# Security limits for RIS
* soft nproc 65536
* hard nproc 65536
* soft nofile 65536
* hard nofile 65536
root soft nproc unlimited
EOF

# 8. Kernel security parameters
log "Configuring kernel security parameters..."
sudo cat > /etc/sysctl.d/99-security.conf << EOF
# Kernel security parameters for RIS

# IP Spoofing protection
net.ipv4.conf.default.rp_filter = 1
net.ipv4.conf.all.rp_filter = 1

# Ignore bogus ICMP responses
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Ignore ping requests
net.ipv4.icmp_echo_ignore_all = 0

# Disable source packet routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0
net.ipv6.conf.default.accept_source_route = 0

# Ignore send redirects
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0

# Disable ICMP redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0

# Enable IP spoofing protection
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Ignore ICMP redirects from non-gateway hosts
net.ipv4.conf.all.secure_redirects = 0
net.ipv4.conf.default.secure_redirects = 0

# Enable TCP SYN cookies
net.ipv4.tcp_syncookies = 1

# TCP hardening
net.ipv4.tcp_timestamps = 0
net.ipv4.tcp_sack = 0

# Kernel hardening
kernel.dmesg_restrict = 1
kernel.kptr_restrict = 2
kernel.yama.ptrace_scope = 1
kernel.kexec_load_disabled = 1

# Shared memory security
kernel.shmmax = 268435456
kernel.shmall = 268435456

# File system security
fs.suid_dumpable = 0
fs.protected_hardlinks = 1
fs.protected_symlinks = 1
EOF

# Apply sysctl settings
sudo sysctl -p /etc/sysctl.d/99-security.conf

# 9. Setup log rotation for RIS logs
log "Configuring log rotation..."
sudo cat > /etc/logrotate.d/ris << EOF
/var/log/ris/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
        systemctl restart ris-django > /dev/null 2>&1 || true
    endscript
}

/var/log/nginx/*.log {
    daily
    missingok
    rotate 30
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        systemctl reload nginx > /dev/null 2>&1 || true
    endscript
}
EOF

# 10. Create RIS system user and group
log "Creating RIS system user and directories..."
sudo groupadd -r ris || true
sudo useradd -r -g ris -d /opt/ris -s /bin/false ris || true

# Create directories with proper permissions
sudo mkdir -p /var/log/ris
sudo mkdir -p /var/www/ris/{static,media}
sudo mkdir -p /opt/ris
sudo chown -R ris:ris /var/log/ris
sudo chown -R ris:ris /var/www/ris
sudo chown -R ris:ris /opt/ris
sudo chmod 755 /var/log/ris
sudo chmod 755 /var/www/ris
sudo chmod 644 /var/log/ris/*.log 2>/dev/null || true

# 11. Setup file integrity monitoring
log "Setting up file integrity monitoring..."
sudo rkhunter --update
sudo rkhunter --propupd

# Configure rkhunter
sudo cat > /etc/rkhunter.conf.local << EOF
# RIS-specific rkhunter configuration
ALLOW_SSH_ROOT_USER=no
ALLOW_SSH_PROT_V1=0
SCRIPTWHITELIST=/usr/bin/groups
SCRIPTWHITELIST=/usr/bin/ldd
SCRIPTWHITELIST=/usr/bin/which
ALLOWHIDDENDIR=/dev/.udev
ALLOWHIDDENDIR=/dev/.static
ALLOWHIDDENDIR=/dev/.initramfs
ALLOWHIDDENFILE=/dev/.blkid.tab
ALLOWHIDDENFILE=/dev/.blkid.tab.old
EOF

# 12. Configure ClamAV antivirus
log "Configuring ClamAV antivirus..."
sudo systemctl stop clamav-daemon
sudo freshclam
sudo systemctl start clamav-daemon
sudo systemctl enable clamav-daemon

# Create daily scan script
sudo cat > /usr/local/bin/daily-clamscan.sh << 'EOF'
#!/bin/bash
SCAN_DIRS="/opt/ris /var/www/ris /home"
LOG_FILE="/var/log/ris/clamav-scan.log"

echo "$(date): Starting ClamAV scan..." >> $LOG_FILE
clamscan -r --quiet --log=$LOG_FILE $SCAN_DIRS
if [ $? -eq 1 ]; then
    echo "$(date): VIRUS FOUND! Check $LOG_FILE" >> $LOG_FILE
    # Send alert email if configured
    # mail -s "VIRUS ALERT - RIS Server" admin@yourdomain.com < $LOG_FILE
fi
echo "$(date): ClamAV scan completed." >> $LOG_FILE
EOF

sudo chmod +x /usr/local/bin/daily-clamscan.sh

# Add to crontab
(sudo crontab -l 2>/dev/null; echo "0 2 * * * /usr/local/bin/daily-clamscan.sh") | sudo crontab -

# 13. Create security monitoring script
log "Creating security monitoring script..."
sudo cat > /usr/local/bin/security-check.sh << 'EOF'
#!/bin/bash
LOG_FILE="/var/log/ris/security-check.log"

echo "$(date): Starting security check..." >> $LOG_FILE

# Check for failed login attempts
FAILED_LOGINS=$(grep "Failed password" /var/log/auth.log | wc -l)
if [ $FAILED_LOGINS -gt 10 ]; then
    echo "$(date): High number of failed login attempts: $FAILED_LOGINS" >> $LOG_FILE
fi

# Check for listening ports
netstat -tulpn | grep LISTEN >> $LOG_FILE

# Check system load
uptime >> $LOG_FILE

# Check disk usage
df -h >> $LOG_FILE

# Check for rootkits
rkhunter --check --skip-keypress --report-warnings-only >> $LOG_FILE 2>&1

echo "$(date): Security check completed." >> $LOG_FILE
EOF

sudo chmod +x /usr/local/bin/security-check.sh

# Add to crontab (run every hour)
(sudo crontab -l 2>/dev/null; echo "0 * * * * /usr/local/bin/security-check.sh") | sudo crontab -

# 14. Configure AppArmor profiles (if available)
if command -v aa-status >/dev/null 2>&1; then
    log "Configuring AppArmor..."
    sudo systemctl enable apparmor
    sudo systemctl start apparmor
fi

# 15. Set up AIDE (Advanced Intrusion Detection Environment)
log "Installing and configuring AIDE..."
sudo apt install -y aide
sudo aideinit
sudo mv /var/lib/aide/aide.db.new /var/lib/aide/aide.db

# Add AIDE check to crontab
(sudo crontab -l 2>/dev/null; echo "0 6 * * * /usr/bin/aide --check") | sudo crontab -

# 16. Final services restart
log "Restarting security services..."
sudo systemctl restart fail2ban
sudo systemctl enable fail2ban
sudo systemctl restart ufw

# 17. Create security status check script
log "Creating security status script..."
sudo cat > /usr/local/bin/security-status.sh << 'EOF'
#!/bin/bash

echo "=== RIS Security Status ==="
echo

echo "UFW Status:"
sudo ufw status

echo
echo "Fail2Ban Status:"
sudo fail2ban-client status

echo
echo "SSH Configuration:"
sudo sshd -T | grep -E "(permitrootlogin|passwordauthentication|pubkeyauthentication)"

echo
echo "System Load:"
uptime

echo
echo "Disk Usage:"
df -h

echo
echo "Last Failed Logins:"
sudo lastb | head -10

echo
echo "Active Network Connections:"
sudo netstat -tulpn | grep LISTEN | head -10

echo
echo "=== End Security Status ==="
EOF

sudo chmod +x /usr/local/bin/security-status.sh

log "Security hardening completed successfully!"
log "Run 'sudo /usr/local/bin/security-status.sh' to check security status"
log "Important: Please reboot the system to ensure all changes take effect"

warn "Don't forget to:"
warn "1. Set up SSH keys and disable password authentication"
warn "2. Configure backup encryption"
warn "3. Set up monitoring and alerting"
warn "4. Review and customize firewall rules"
warn "5. Configure fail2ban notification emails"
warn "6. Test all security measures"

log "Security hardening script completed. Please reboot the system."