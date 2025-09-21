# Production Deployment Checklist for rottv5

## 1. Environment Preparation
- [ ] Use Python 3.11+ (as recommended)
- [ ] Set up a virtual environment
- [ ] Install all dependencies from `requirements.txt`
- [ ] Set environment variables for secrets/configuration

## 2. Application Server
- [ ] Use Gunicorn with Uvicorn workers for FastAPI
- [ ] Configure Gunicorn for multiple workers (based on CPU)
- [ ] Set up process management (e.g., systemd service)

## 3. Static Files
- [ ] Serve static files via Nginx (not via FastAPI in production)
- [ ] Collect all frontend assets in a `/static` directory if needed

## 4. Reverse Proxy (Nginx)
- [ ] Set up Nginx to proxy requests to Gunicorn/Uvicorn
- [ ] Configure HTTPS (SSL/TLS) with a certificate (e.g., Let's Encrypt)
- [ ] Set up proper headers and security settings

## 5. Persistence & Scaling
- [ ] Use Redis or another backend for session management (not in-memory)
- [ ] Plan for horizontal scaling if needed

## 6. Security
- [ ] Enable HTTPS
- [ ] Set up firewall rules
- [ ] Enable rate limiting and basic moderation
- [ ] Regularly update dependencies

## 7. Monitoring & Logging
- [ ] Set up logging for app and Nginx
- [ ] Monitor server health and errors

## 8. Testing
- [ ] Test the site end-to-end in a staging environment
- [ ] Check for static file serving, WebSocket connections, and API endpoints

---

See the deployment guide for detailed steps.
