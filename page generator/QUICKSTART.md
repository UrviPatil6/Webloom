# Quick Start Guide

## Prerequisites Installation

### 1. Install Node.js
Download and install Node.js v16+ from https://nodejs.org/

### 2. Install MongoDB
- **Windows/Mac**: Download from https://www.mongodb.com/try/download/community
- **Linux**: `sudo apt-get install mongodb`
- Start MongoDB: `mongod` (or use MongoDB as a service)

### 3. Install Docker (for Redis)
- **All Platforms**: Download from https://www.docker.com/products/docker-desktop
- Or install Redis locally (see Option B below)

## Setup Steps

### 1. Install Dependencies
```bash
npm run install-all
```

### 2. Configure Backend
```bash
cd backend
# Create .env file manually with:
```

Create `backend/.env` file:
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/page-generator
JWT_SECRET=your-random-secret-key-here
OPENAI_API_KEY=sk-your-openai-api-key-here
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### 3. Configure Frontend
Create `frontend/.env` file:
```
REACT_APP_API_URL=http://localhost:5000/api
```

### 4. Start Services

**Option A: Redis in Docker (Recommended)**
```bash
# Start Redis in Docker
docker-compose up -d

# Check Redis status
docker-compose ps

# View Redis logs
docker-compose logs -f redis

# Stop Redis
docker-compose down
```

**Option B: Local Installation**
```bash
# Terminal 1: MongoDB (must be installed locally)
mongod

# Terminal 2: Redis (if not using Docker)
redis-server
```

### 5. Run Application

**Option A: Run both backend and frontend (Recommended)**
From root directory:
```bash
npm run dev
```

**Option B: Run separately**
```bash
# Terminal 1: Backend (from root directory)
npm run server

# Terminal 2: Frontend (from root directory)
npm run client
# OR from frontend directory:
cd frontend
npm start
```

This starts:
- Backend: http://localhost:5000
- Frontend: http://localhost:3000

## First Time Setup

1. **Open Dashboard**: http://localhost:3000
2. **Configure WordPress**:
   - Go to WordPress Settings
   - Enter WordPress site URL (e.g., https://yoursite.com)
   - Create Application Password in WordPress:
     - WordPress Admin → Users → Profile → Application Passwords
     - Create new password and copy it
   - Enter username and application password
   - Click "Test Connection"

3. **Upload Images**:
   - Go to Image Library
   - Drag & drop images
   - Images are uploaded to WordPress automatically

4. **Create Template**:
   - Go to Templates → New Template
   - Paste your HTML/CSS design
   - System auto-detects placeholders
   - Save template

5. **Generate Pages**:
   - Go to Page Generator
   - Select template
   - Enter main keyword (e.g., "AI Agents")
   - Enter focus keywords (one per line)
   - Click "Generate Pages"

## Common Issues

### MongoDB Connection Error
- Make sure MongoDB is running: `mongod`
- Check MONGODB_URI in backend/.env

### Redis Connection Error
- **If using Docker**: Make sure container is running: `docker-compose ps`
- **If using local**: Make sure Redis is running: `redis-server`
- Check REDIS_URL in backend/.env (should be `redis://localhost:6379`)
- Restart Redis container: `docker-compose restart redis`

### OpenAI API Error
- Verify OPENAI_API_KEY in backend/.env
- Check API key is valid and has credits

### WordPress Connection Error
- Verify site URL (no trailing slash)
- Check username and application password
- Ensure WordPress REST API is enabled
- Check site allows REST API access

### Port Already in Use
- Change PORT in backend/.env
- Update REACT_APP_API_URL in frontend/.env

## Next Steps

- Read full README.md for detailed documentation
- Check template placeholders documentation
- Explore analytics dashboard
- Set up job queue monitoring

