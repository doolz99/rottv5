#!/bin/bash

# rottv5 Local to DigitalOcean Deployment Script
# This script deploys from your local machine to a DigitalOcean droplet
# Usage: ./local-deploy.sh [domain] [droplet_ip] [ssh_key_path]

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DOMAIN=${1:-""}
DROPLET_IP=${2:-""}
SSH_KEY_PATH=${3:-"~/.ssh/id_ed25519"}
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_NAME="rottv5"
REMOTE_APP_DIR="/opt/rottv5"
REMOTE_USER="root"

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

# Function to validate inputs
validate_inputs() {
    if [[ -z "$DROPLET_IP" ]]; then
        print_error "Droplet IP is required"
        echo "Usage: $0 [domain] [droplet_ip] [ssh_key_path]"
        echo "Example: $0 example.com 192.168.1.100 ~/.ssh/id_ed25519"
        exit 1
    fi
    
    if [[ -z "$DOMAIN" ]]; then
        print_warning "No domain provided, will use IP address"
        DOMAIN="$DROPLET_IP"
    fi
    
    # Expand SSH key path
    SSH_KEY_PATH="${SSH_KEY_PATH/#\~/$HOME}"
    
    if [[ ! -f "$SSH_KEY_PATH" ]]; then
        print_error "SSH key not found at $SSH_KEY_PATH"
        exit 1
    fi
}

# Function to test SSH connection
test_ssh_connection() {
    print_status "Testing SSH connection to $DROPLET_IP..."
    
    if ssh -i "$SSH_KEY_PATH" -o ConnectTimeout=10 -o BatchMode=yes "$REMOTE_USER@$DROPLET_IP" "echo 'SSH connection successful'" > /dev/null 2>&1; then
        print_success "SSH connection successful"
    else
        print_error "SSH connection failed"
        echo "Please ensure:"
        echo "  1. The droplet is running"
        echo "  2. Your SSH key is added to the droplet"
        echo "  3. The SSH key path is correct: $SSH_KEY_PATH"
        exit 1
    fi
}

# Function to upload deployment script
upload_deployment_script() {
    print_status "Uploading deployment script to droplet..."
    
    scp -i "$SSH_KEY_PATH" -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null "$PROJECT_DIR/deploy/deploy.sh" "$REMOTE_USER@$DROPLET_IP:/tmp/"
    
    print_success "Deployment script uploaded"
}

# Function to create project archive
create_project_archive() {
    print_status "Creating project archive..."
    
    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    ARCHIVE_PATH="$TEMP_DIR/rottv5.tar.gz"
    
    # Copy project files (exclude .git, .venv, __pycache__)
    rsync -av --exclude='.git' --exclude='.venv' --exclude='__pycache__' --exclude='*.pyc' --exclude='.DS_Store' --exclude='node_modules' "$PROJECT_DIR/" "$TEMP_DIR/rottv5/"
    
    # Create archive
    cd "$TEMP_DIR"
    tar -czf "$ARCHIVE_PATH" rottv5/
    
    echo "$ARCHIVE_PATH"
}

# Function to upload project
upload_project() {
    print_status "Uploading project to droplet..."
    
    # Use rsync to upload project directly
    rsync -avz --delete \
        --exclude='.git' \
        --exclude='.venv' \
        --exclude='__pycache__' \
        --exclude='*.pyc' \
        --exclude='.DS_Store' \
        --exclude='node_modules' \
        -e "ssh -i $SSH_KEY_PATH -o StrictHostKeyChecking=no" \
        "$PROJECT_DIR/" "$REMOTE_USER@$DROPLET_IP:/tmp/rottv5/"
    
    print_success "Project uploaded"
}

# Function to run deployment on remote server
run_remote_deployment() {
    print_status "Running deployment on remote server..."
    
    # Make deployment script executable and run it
    ssh -i "$SSH_KEY_PATH" "$REMOTE_USER@$DROPLET_IP" << EOF
        chmod +x /tmp/deploy.sh
        
        # Move project to final location
        rm -rf /opt/rottv5
        mv /tmp/rottv5 /opt/
        chown -R www-data:www-data /opt/rottv5
        
        # Run deployment script
        /tmp/deploy.sh "$DOMAIN" "file:///opt/rottv5" "$DROPLET_IP"
        
        # Clean up
        rm -f /tmp/deploy.sh
EOF
    
    print_success "Remote deployment completed"
}

# Function to verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Test HTTP response
    if curl -f -s "http://$DROPLET_IP/" > /dev/null; then
        print_success "Application is responding at http://$DROPLET_IP/"
    else
        print_warning "Application may not be responding yet"
    fi
    
    if [[ "$DOMAIN" != "$DROPLET_IP" ]]; then
        if curl -f -s "http://$DOMAIN/" > /dev/null; then
            print_success "Application is responding at http://$DOMAIN/"
        else
            print_warning "Domain may not be pointing to the droplet yet"
        fi
    fi
}

# Function to display final information
display_final_info() {
    echo
    print_success "🎉 Deployment completed successfully!"
    echo
    echo "Application Information:"
    echo "  - IP Address: $DROPLET_IP"
    echo "  - Domain: $DOMAIN"
    echo "  - Application URL: http://$DOMAIN"
    echo
    echo "SSH Access:"
    echo "  - Command: ssh -i $SSH_KEY_PATH $REMOTE_USER@$DROPLET_IP"
    echo
    echo "Useful Commands:"
    echo "  - Check application status: ssh -i $SSH_KEY_PATH $REMOTE_USER@$DROPLET_IP 'systemctl status rottv5'"
    echo "  - View application logs: ssh -i $SSH_KEY_PATH $REMOTE_USER@$DROPLET_IP 'journalctl -u rottv5 -f'"
    echo "  - Restart application: ssh -i $SSH_KEY_PATH $REMOTE_USER@$DROPLET_IP 'systemctl restart rottv5'"
    echo
    echo "To update the application:"
    echo "  - Run: ./deploy/update.sh"
    echo
}

# Main deployment function
main() {
    print_status "Starting local to DigitalOcean deployment..."
    echo "Domain: $DOMAIN"
    echo "Droplet IP: $DROPLET_IP"
    echo "SSH Key: $SSH_KEY_PATH"
    echo "Project Directory: $PROJECT_DIR"
    echo
    
    validate_inputs
    test_ssh_connection
    upload_deployment_script
    upload_project
    run_remote_deployment
    verify_deployment
    display_final_info
}

# Run main function
main "$@"
