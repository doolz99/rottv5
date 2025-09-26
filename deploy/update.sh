#!/bin/bash

# rottv5 Application Update Script
# Usage: ./update.sh [repo_url]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
REPO_URL=${1:-"https://github.com/yourusername/rottv5.git"}
APP_DIR="/opt/rottv5"
SERVICE_USER="www-data"
BACKUP_DIR="/opt/backups/rottv5"

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

# Function to create backup
create_backup() {
    print_status "Creating backup..."
    
    # Create backup directory
    mkdir -p "$BACKUP_DIR"
    
    # Create timestamp
    TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
    BACKUP_PATH="$BACKUP_DIR/backup_$TIMESTAMP"
    
    # Create backup
    cp -r "$APP_DIR" "$BACKUP_PATH"
    
    print_success "Backup created at $BACKUP_PATH"
}

# Function to stop services
stop_services() {
    print_status "Stopping services..."
    
    systemctl stop rottv5
    
    print_success "Services stopped"
}

# Function to update application
update_application() {
    print_status "Updating application from $REPO_URL..."
    
    cd "$APP_DIR"
    
    # Stash any local changes
    sudo -u "$SERVICE_USER" git stash
    
    # Pull latest changes
    sudo -u "$SERVICE_USER" git pull origin main
    
    # Update dependencies
    print_status "Updating Python dependencies..."
    sudo -u "$SERVICE_USER" bash -c "source .venv/bin/activate && pip install -r requirements.txt"
    
    print_success "Application updated"
}

# Function to start services
start_services() {
    print_status "Starting services..."
    
    systemctl start rottv5
    
    # Wait for service to start
    sleep 3
    
    if systemctl is-active --quiet rottv5; then
        print_success "Services started successfully"
    else
        print_error "Failed to start services"
        systemctl status rottv5
        exit 1
    fi
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Test HTTP response
    if curl -f -s "http://localhost:8000/" > /dev/null; then
        print_success "Application is responding"
    else
        print_error "Application is not responding"
        exit 1
    fi
    
    print_success "Deployment verification completed"
}

# Function to cleanup old backups
cleanup_backups() {
    print_status "Cleaning up old backups..."
    
    # Keep only last 5 backups
    cd "$BACKUP_DIR"
    ls -t | tail -n +6 | xargs -r rm -rf
    
    print_success "Old backups cleaned up"
}

# Function to display update information
display_update_info() {
    echo
    print_success "🎉 Application update completed successfully!"
    echo
    echo "Update Information:"
    echo "  - Application Directory: $APP_DIR"
    echo "  - Backup Location: $BACKUP_DIR"
    echo "  - Service Status: $(systemctl is-active rottv5)"
    echo
    echo "Useful Commands:"
    echo "  - Check application status: systemctl status rottv5"
    echo "  - View application logs: journalctl -u rottv5 -f"
    echo "  - Restart application: systemctl restart rottv5"
    echo
}

# Main update function
main() {
    print_status "Starting rottv5 application update..."
    echo "Repository: $REPO_URL"
    echo
    
    check_root
    create_backup
    stop_services
    update_application
    start_services
    verify_deployment
    cleanup_backups
    display_update_info
}

# Run main function
main "$@"
