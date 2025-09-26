# Simple Deployment Guide for rottv5

This guide will help you deploy your rottv5 application to a DigitalOcean droplet in just a few steps.

## Prerequisites

- A DigitalOcean account
- A domain name (optional - you can use the IP address)
- Your SSH key set up on your local machine

## Step 1: Create a DigitalOcean Droplet

1. Log into [DigitalOcean](https://digitalocean.com)
2. Click "Create" → "Droplets"
3. Choose:
   - **Image**: Ubuntu 24.04 LTS
   - **Plan**: Basic ($6/month is fine for testing)
   - **Authentication**: Add your SSH key
   - **Hostname**: Your domain name (e.g., `rotview.org`)
4. Click "Create Droplet"
5. Wait for it to finish creating and note the IP address

## Step 2: Set Up Your Domain (Optional)

If you have a domain:

1. Go to your domain registrar (GoDaddy, Namecheap, etc.)
2. Add an A record pointing to your droplet's IP address
3. Wait 5-10 minutes for DNS to propagate

## Step 3: Deploy Your Application

From your local machine, run:

```bash
# Navigate to your project directory
cd /path/to/your/rottv5

# Deploy to your droplet (replace with your actual IP and domain)
./deploy/local-deploy.sh yourdomain.com YOUR_DROPLET_IP
```

**Example:**

```bash
./deploy/local-deploy.sh rotview.org 134.199.149.211
```

The script will:

- Upload your code to the server
- Install all dependencies
- Set up the web server
- Configure SSL certificates
- Start your application

## Step 4: Access Your Application

Once deployment completes, visit:

- **With domain**: `https://yourdomain.com`
- **Without domain**: `http://YOUR_DROPLET_IP`

## Troubleshooting

### If the deployment fails:

1. **Check SSH connection:**

   ```bash
   ssh root@YOUR_DROPLET_IP
   ```

2. **Check if your SSH key is working:**

   ```bash
   ssh -i ~/.ssh/id_ed25519 root@YOUR_DROPLET_IP
   ```

3. **If you get "Permission denied":**
   - Make sure you added your SSH key when creating the droplet
   - Or add your key manually:
     ```bash
     ssh-copy-id -i ~/.ssh/id_ed25519.pub root@YOUR_DROPLET_IP
     ```

### If the website doesn't load:

1. **Check if services are running:**

   ```bash
   ssh root@YOUR_DROPLET_IP "systemctl status rottv5"
   ```

2. **Check application logs:**

   ```bash
   ssh root@YOUR_DROPLET_IP "journalctl -u rottv5 -f"
   ```

3. **Restart the application:**
   ```bash
   ssh root@YOUR_DROPLET_IP "systemctl restart rottv5"
   ```

## Updating Your Application

To update your application after making changes:

```bash
# From your local machine
./deploy/update.sh
```

## What Gets Installed

The deployment script automatically installs:

- Python 3.13 and all dependencies
- Nginx web server
- SSL certificates (if you have a domain)
- Firewall protection
- Process management
- Redis for sessions

## Cost Breakdown

- **DigitalOcean Droplet**: $6/month (1GB RAM, 1 CPU)
- **Domain**: ~$10-15/year (optional)
- **Total**: ~$7-8/month

## Security Features

Your deployment includes:

- SSL/HTTPS encryption
- Firewall protection
- Automatic security updates
- Process isolation

## Need Help?

If you run into issues:

1. Check the logs using the commands above
2. Make sure your domain DNS is pointing to the correct IP
3. Verify your SSH key is properly configured
4. Check that the droplet is running in the DigitalOcean dashboard

## Next Steps

Once deployed, you can:

- Monitor your application with the provided commands
- Set up monitoring and alerts
- Scale up your droplet if you need more resources
- Set up automated backups

---

**That's it!** Your rottv5 application should now be live and accessible to the world.
