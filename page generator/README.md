# Multi-Page Generator with AI Content

A full-stack MERN application for generating WordPress pages with AI-generated content, image management, and automated publishing.

## Features

- **Template Management**: Create and manage HTML/CSS templates with placeholder system
- **Image Library**: Upload, organize, and tag images with WordPress integration
- **AI Content Generation**: Generate 1000-word content using OpenAI GPT-4
- **Bulk Page Generation**: Generate multiple pages from keywords
- **WordPress Integration**: Automatic publishing to WordPress via REST API
- **Job Queue**: Monitor and manage generation jobs in real-time
- **Analytics Dashboard**: Track pages, templates, and generation statistics

## Tech Stack

### Backend
- Node.js + Express
- MongoDB with Mongoose
- OpenAI API integration
- WordPress REST API integration
- Bull queue for job processing

### Frontend
- React 18
- Material-UI (MUI)
- React Router
- Recharts for analytics
- Ace Editor for code editing

## Installation

### Prerequisites
- Node.js (v16+)
- MongoDB (local or cloud)
- Redis (for job queue) - can run in Docker
- Docker (optional - for running Redis)
- OpenAI API key
- WordPress site with REST API enabled

### Setup

1. **Clone and install dependencies:**
```bash
npm run install-all
```

2. **Backend setup:**
```bash
cd backend
cp .env.example .env
# Edit .env with your configuration
```

3. **Frontend setup:**
```bash
cd frontend
# Create .env file with:
# REACT_APP_API_URL=http://localhost:5000/api
```

4. **Start MongoDB and Redis:**

**Option A: Redis in Docker (Recommended)**
```bash
# Start Redis in Docker
docker-compose up -d

# View logs
docker-compose logs -f redis

# Stop Redis
docker-compose down
```

**Option B: Local Installation**
```bash
# MongoDB (must be installed locally)
mongod

# Redis (if not using Docker)
redis-server
```

5. **Run the application:**
```bash
# From root directory
npm run dev
```

This will start:
- Backend server on http://localhost:5000
- Frontend app on http://localhost:3000

## Configuration

### Backend Environment Variables (.env)
```
PORT=5000
MONGODB_URI=mongodb://localhost:27017/page-generator
JWT_SECRET=your-secret-key
OPENAI_API_KEY=your-openai-api-key
REDIS_URL=redis://localhost:6379
NODE_ENV=development
```

### WordPress Setup
1. Go to WordPress Admin → Users → Profile
2. Scroll to "Application Passwords"
3. Create a new application password
4. Enter it in the WordPress Settings page

## Usage

### 1. Configure WordPress
- Navigate to WordPress Settings
- Enter your WordPress site URL
- Enter username and application password
- Test connection

### 2. Upload Images
- Go to Image Library
- Drag & drop images or click to upload
- Images are automatically uploaded to WordPress Media Library
- Add tags and alt text for better matching

### 3. Create Template
- Go to Templates → New Template
- Paste your HTML/CSS design
- System auto-detects placeholders
- Test template with sample data

### 4. Generate Pages
- Go to Page Generator
- Select template
- Enter main keyword (same for all pages)
- Enter focus keywords (one per line)
- Choose image selection method
- Click "Generate Pages"

### 5. Monitor Jobs
- View job progress in Job Queue
- See real-time status updates
- Check completed/failed pages

### 6. Publish Pages
- Go to Generated Pages
- Preview pages before publishing
- Publish individually or bulk publish
- Pages are created in WordPress

## Template Placeholders

### Keyword Placeholders
- `{{MAIN_KEYWORD}}` - Main keyword (same for all pages)
- `{{FOCUS_KEYWORD}}` - Focus keyword (different per page)

### Content Placeholders
- `{{INTRO_H1}}` - Introduction heading
- `{{INTRO_PARAGRAPH_1}}` - First intro paragraph
- `{{INTRO_PARAGRAPH_2}}` - Second intro paragraph
- `{{VALUE_PARAGRAPH}}` - Value proposition paragraph
- `{{FEATURE_1}}`, `{{FEATURE_2}}`, etc. - Feature list items
- And more...

### Image Placeholders
- `{{IMAGE_1_URL}}` - First image URL
- `{{IMAGE_1_ALT}}` - First image alt text
- `{{IMAGE_2_URL}}` - Second image URL
- `{{IMAGE_2_ALT}}` - Second image alt text

## API Endpoints

### Templates
- `GET /api/templates` - List all templates
- `POST /api/templates` - Create template
- `GET /api/templates/:id` - Get template
- `PUT /api/templates/:id` - Update template
- `DELETE /api/templates/:id` - Delete template

### Images
- `GET /api/images` - List images
- `POST /api/images/upload` - Upload image
- `PUT /api/images/:id` - Update image
- `DELETE /api/images/:id` - Delete image

### Pages
- `GET /api/pages` - List generated pages
- `POST /api/pages/generate` - Generate single page
- `POST /api/pages/:id/publish` - Publish page
- `POST /api/pages/bulk-publish` - Bulk publish

### Jobs
- `GET /api/jobs` - List jobs
- `POST /api/jobs/generate` - Create generation job
- `GET /api/jobs/:id` - Get job details

### WordPress
- `GET /api/wordpress/settings` - Get settings
- `PUT /api/wordpress/settings` - Update settings
- `POST /api/wordpress/test` - Test connection

### Analytics
- `GET /api/analytics/overview` - Dashboard stats
- `GET /api/analytics/pages-over-time` - Pages over time
- `GET /api/analytics/pages-by-status` - Status breakdown

## Project Structure

```
page-generator/
├── backend/
│   ├── models/          # MongoDB models
│   ├── routes/          # API routes
│   ├── services/        # Business logic
│   └── server.js        # Express server
├── frontend/
│   ├── src/
│   │   ├── components/  # React components
│   │   ├── pages/       # Page components
│   │   ├── services/    # API services
│   │   └── App.js       # Main app
│   └── public/
└── README.md
```

## License

ISC

