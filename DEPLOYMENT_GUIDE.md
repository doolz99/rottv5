# Step-by-Step Production Deployment Guide for rottv5

## 1. Server Preparation
- Provision a Linux server (Ubuntu recommended)
- Update system packages:
  ```sh
  sudo apt update && sudo apt upgrade -y
  ```
- Install Python 3.11+ and pip:
  ```sh
  sudo apt install python3.11 python3.11-venv python3.11-dev python3-pip -y
  ```

## 2. Clone Your Project
- Upload or clone your `rot.tv5` project to the server:
  ```sh
  git clone <your-repo-url>
  cd rot.tv5
  ```

## 3. Set Up Virtual Environment
```sh
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 4. Install Gunicorn and Uvicorn Workers
```sh
pip install gunicorn uvicorn
```

## 5. Test the App
```sh
uvicorn backend.main:app --host 0.0.0.0 --port 8000
```
- Visit `http://<server-ip>:8000/` to verify it works.

## 6. Set Up Gunicorn Systemd Service
Create `/etc/systemd/system/rottv5.service`:
```
[Unit]
Description=rottv5 FastAPI app
After=network.target

[Service]
User=www-data
Group=www-data
WorkingDirectory=/path/to/rot.tv5
ExecStart=/path/to/rot.tv5/.venv/bin/gunicorn backend.main:app -k uvicorn.workers.UvicornWorker --bind 127.0.0.1:8000 --workers 4
Restart=always

[Install]
WantedBy=multi-user.target
```
- Reload and start the service:
```sh
sudo systemctl daemon-reload
sudo systemctl start rottv5
sudo systemctl enable rottv5
```

## 7. Install and Configure Nginx
- Install Nginx:
  ```sh
  sudo apt install nginx -y
  ```
- Copy and edit `deploy/nginx.rottv5.conf.example` to `/etc/nginx/sites-available/rottv5`.
- Link and enable:
  ```sh
  sudo ln -s /etc/nginx/sites-available/rottv5 /etc/nginx/sites-enabled/
  sudo nginx -t
  sudo systemctl reload nginx
  ```

## 8. Set Up HTTPS (Let's Encrypt)
```sh
sudo apt install certbot python3-certbot-nginx -y
sudo certbot --nginx -d yourdomain.com
```

## 9. (Optional) Use Redis for Sessions
- Install Redis:
  ```sh
  sudo apt install redis-server -y
  ```
- Update backend code to use Redis for session management.

## 10. Final Checks
- Test all endpoints and static files via your domain.
- Monitor logs:
  ```sh
  sudo journalctl -u rottv5 -f
  sudo tail -f /var/log/nginx/error.log
  ```

---

**Note:** Adjust paths, user/group, and domain as needed. Harden security and update dependencies regularly.
