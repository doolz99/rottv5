#!/bin/bash

# rottv5 Automated Deployment Script for DigitalOcean
# Usage: ./deploy.sh [domain] [repo_url] [droplet_ip]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${1:-""}
REPO_URL=${2:-"https://github.com/yourusername/rottv5.git"}
DROPLET_IP=${3:-""}
APP_NAME="rottv5"
APP_DIR="/opt/rottv5"
SERVICE_USER="www-data"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if running as root
check_root() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root"
        exit 1
    fi
}

# Function to validate inputs
validate_inputs() {
    if [[ -z "$DROPLET_IP" ]]; then
        print_error "Droplet IP is required"
        echo "Usage: $0 [domain] [repo_url] [droplet_ip]"
        echo "Example: $0 example.com https://github.com/user/rottv5.git 192.168.1.100"
        exit 1
    fi
    
    if [[ -z "$DOMAIN" ]]; then
        print_warning "No domain provided, will use IP address"
        DOMAIN="$DROPLET_IP"
    fi
}

# Function to update system packages
update_system() {
    print_status "Updating system packages..."
    apt update && apt upgrade -y
    print_success "System packages updated"
}

# Function to install dependencies
install_dependencies() {
    print_status "Installing dependencies..."
    
    # Install Python 3.13 and development tools
    apt install -y python3.13 python3.13-venv python3.13-dev python3-pip
    
    # Install system dependencies
    apt install -y git nginx ufw fail2ban curl wget
    
    # Install Redis (optional but recommended)
    apt install -y redis-server
    
    print_success "Dependencies installed"
}

# Function to create application directory and user
setup_app_directory() {
    print_status "Setting up application directory..."
    
    # Create application directory
    mkdir -p "$APP_DIR"
    
    # Set proper ownership
    chown -R "$SERVICE_USER:$SERVICE_USER" "$APP_DIR"
    
    print_success "Application directory created at $APP_DIR"
}

# Function to clone and setup application
setup_application() {
    print_status "Cloning application from $REPO_URL..."
    
    # Clone repository (or skip if already exists)
    if [[ "$REPO_URL" == file://* ]]; then
        print_status "Using existing project files (file:// URL detected)"
    else
        sudo -u "$SERVICE_USER" git clone "$REPO_URL" "$APP_DIR"
    fi
    
    # Navigate to app directory
    cd "$APP_DIR"
    
    # Create virtual environment
    print_status "Creating Python virtual environment..."
    sudo -u "$SERVICE_USER" python3.13 -m venv .venv
    
    # Activate virtual environment and install dependencies
    print_status "Installing Python dependencies..."
    sudo -u "$SERVICE_USER" bash -c "source .venv/bin/activate && pip install -r requirements.txt"
    sudo -u "$SERVICE_USER" bash -c "source .venv/bin/activate && pip install gunicorn uvicorn"
    
    print_success "Application setup completed"
}

# Function to create systemd service
create_systemd_service() {
    print_status "Creating systemd service..."
    
    cat > /etc/systemd/system/rottv5.service << EOF
[Unit]
Description=rottv5 FastAPI app
After=network.target

[Service]
User=$SERVICE_USER
Group=$SERVICE_USER
WorkingDirectory=$APP_DIR
Environment=PATH=$APP_DIR/.venv/bin
ExecStart=$APP_DIR/.venv/bin/gunicorn backend.main:app -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000 --workers 4
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

    # Reload systemd and enable service
    systemctl daemon-reload
    systemctl enable rottv5
    
    print_success "Systemd service created and enabled"
}

# Function to configure Nginx
configure_nginx() {
    print_status "Configuring Nginx..."
    
    # Create Nginx configuration
    cat > /etc/nginx/sites-available/rottv5 << EOF
server {
    listen 80;
    server_name $DOMAIN;

    # Serve static files directly
    location /static/ {
        alias $APP_DIR/frontend/;
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Proxy WebSocket connections
    location /ws {
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400;
    }

    # Proxy API and other requests
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

    # Enable the site
    ln -sf /etc/nginx/sites-available/rottv5 /etc/nginx/sites-enabled/
    rm -f /etc/nginx/sites-enabled/default
    
    # Test Nginx configuration
    nginx -t
    
    print_success "Nginx configured"
}

# Function to setup SSL with Let's Encrypt
setup_ssl() {
    if [[ "$DOMAIN" != "$DROPLET_IP" ]]; then
        print_status "Setting up SSL with Let's Encrypt..."
        
        # Install Certbot
        apt install -y certbot python3-certbot-nginx
        
        # Get SSL certificate
        certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --email admin@"$DOMAIN"
        
        # Setup auto-renewal
        systemctl enable certbot.timer
        
        print_success "SSL certificate installed"
    else
        print_warning "Skipping SSL setup (using IP address)"
    fi
}

# Function to configure firewall
configure_firewall() {
    print_status "Configuring firewall..."
    
    # Configure UFW
    ufw --force reset
    ufw default deny incoming
    ufw default allow outgoing
    ufw allow ssh
    ufw allow 'Nginx Full'
    ufw --force enable
    
    print_success "Firewall configured"
}

# Function to start services
start_services() {
    print_status "Starting services..."
    
    # Start Redis
    systemctl start redis-server
    systemctl enable redis-server
    
    # Start application
    systemctl start rottv5
    
    # Reload Nginx
    systemctl reload nginx
    
    print_success "All services started"
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Wait a moment for services to start
    sleep 5
    
    # Check service status
    if systemctl is-active --quiet rottv5; then
        print_success "Application service is running"
    else
        print_error "Application service failed to start"
        systemctl status rottv5
        exit 1
    fi
    
    if systemctl is-active --quiet nginx; then
        print_success "Nginx is running"
    else
        print_error "Nginx failed to start"
        systemctl status nginx
        exit 1
    fi
    
    # Test HTTP response
    if curl -f -s "http://localhost:8000/" > /dev/null; then
        print_success "Application is responding on localhost"
    else
        print_error "Application is not responding"
        exit 1
    fi
    
    print_success "Deployment verification completed"
}

# Function to display final information
display_final_info() {
    echo
    print_success "🎉 Deployment completed successfully!"
    echo
    echo "Application Information:"
    echo "  - URL: http://$DOMAIN"
    echo "  - Application Directory: $APP_DIR"
    echo "  - Service User: $SERVICE_USER"
    echo
    echo "Useful Commands:"
    echo "  - Check application status: systemctl status rottv5"
    echo "  - View application logs: journalctl -u rottv5 -f"
    echo "  - Restart application: systemctl restart rottv5"
    echo "  - Check Nginx status: systemctl status nginx"
    echo "  - View Nginx logs: tail -f /var/log/nginx/error.log"
    echo
    echo "Security:"
    echo "  - Firewall is enabled (UFW)"
    echo "  - Fail2ban is installed"
    echo "  - SSL certificate installed (if domain provided)"
    echo
}

# Main deployment function
main() {
    print_status "Starting rottv5 deployment..."
    echo "Domain: $DOMAIN"
    echo "Repository: $REPO_URL"
    echo "Droplet IP: $DROPLET_IP"
    echo
    
    check_root
    validate_inputs
    update_system
    install_dependencies
    setup_app_directory
    setup_application
    create_systemd_service
    configure_nginx
    setup_ssl
    configure_firewall
    start_services
    verify_deployment
    display_final_info
}

# Run main function
main "$@"
