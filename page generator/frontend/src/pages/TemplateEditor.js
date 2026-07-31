import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  TextField,
  Button,
  Typography,
  Grid,
  Alert,
  CircularProgress,
  Tabs,
  Tab,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { getTemplate, createTemplate, updateTemplate, testTemplate } from '../services/api';
import AceEditor from 'react-ace';
import 'ace-builds/src-noconflict/mode-html';
import 'ace-builds/src-noconflict/theme-monokai';
import 'ace-builds/src-noconflict/worker-html';
import ace from 'ace-builds/src-noconflict/ace';

function TemplateEditor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(!!id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [tabValue, setTabValue] = useState(0);
  const [template, setTemplate] = useState({
    name: '',
    description: '',
    htmlContent: '',
    category: 'general',
    tags: [],
  });
  const [previewHtml, setPreviewHtml] = useState('');
  const [previewMode, setPreviewMode] = useState('light'); // 'light' or 'dark'

  useEffect(() => {
    // Configure Ace Editor workers
    ace.config.set('workerPath', '/static/js/');
    ace.config.set('basePath', '/static/js/');
    
    if (id) {
      loadTemplate();
    }
  }, [id]);

  const loadTemplate = async () => {
    try {
      setLoading(true);
      const response = await getTemplate(id);
      setTemplate(response.data);
      setPreviewHtml(response.data.htmlContent);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      if (id) {
        await updateTemplate(id, template);
      } else {
        const response = await createTemplate(template);
        navigate(`/templates/${response.data._id}`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setError(null);
      const response = await testTemplate(id || template._id, {
        mainKeyword: 'AI Agents',
        focusKeyword: 'Sample Industry',
        sampleContent: {},
      });
      setPreviewHtml(response.data.filledHtml);
      setTabValue(1);
    } catch (err) {
      setError(err.message);
    }
  };

  // Inject dark/light mode styles into preview HTML
  const getPreviewWithMode = (html, mode) => {
    if (!html) return '';
    
    const darkModeStyles = `
      <style>
        body {
          background-color: #1e1e1e !important;
          color: #e0e0e0 !important;
          margin: 0;
          padding: 20px;
        }
        /* Override text colors for better visibility */
        p, h1, h2, h3, h4, h5, h6, span, div, a, li, td, th {
          color: #e0e0e0 !important;
        }
        /* Links */
        a {
          color: #64b5f6 !important;
        }
        a:hover {
          color: #90caf9 !important;
        }
        /* Headings */
        h1, h2, h3, h4, h5, h6 {
          color: #ffffff !important;
        }
        /* Buttons and inputs */
        button, input, textarea, select {
          background-color: #2d2d2d !important;
          color: #e0e0e0 !important;
          border-color: #444 !important;
        }
        /* Cards and containers */
        .card, [class*="card"], [class*="container"], [class*="box"] {
          background-color: #2d2d2d !important;
          color: #e0e0e0 !important;
        }
        /* Preserve image visibility */
        img, svg, canvas {
          opacity: 0.95;
        }
        /* Tables */
        table {
          border-color: #444 !important;
        }
        th, td {
          border-color: #444 !important;
        }
        /* Code blocks */
        code, pre {
          background-color: #2d2d2d !important;
          color: #e0e0e0 !important;
        }
      </style>
    `;
    
    const lightModeStyles = `
      <style>
        body {
          background-color: #ffffff !important;
          color: #000000 !important;
          margin: 0;
          padding: 20px;
        }
        /* Reset any dark mode overrides */
        p, h1, h2, h3, h4, h5, h6, span, div, a, li, td, th {
          color: inherit;
        }
        img, svg, canvas {
          opacity: 1;
        }
      </style>
    `;
    
    const modeStyles = mode === 'dark' ? darkModeStyles : lightModeStyles;
    
    // Check if HTML already has a head tag
    if (html.includes('<head>')) {
      return html.replace('<head>', `<head>${modeStyles}`);
    } else if (html.includes('<html>')) {
      return html.replace('<html>', `<html><head>${modeStyles}</head>`);
    } else {
      // If no HTML structure, wrap it
      return `<html><head>${modeStyles}</head><body>${html}</body></html>`;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/templates')}
          sx={{ mr: 2 }}
        >
          Back
        </Button>
        <Typography variant="h4">
          {id ? 'Edit Template' : 'New Template'}
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Template Name"
              value={template.name}
              onChange={(e) => setTemplate({ ...template, name: e.target.value })}
              margin="normal"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Category"
              value={template.category}
              onChange={(e) => setTemplate({ ...template, category: e.target.value })}
              margin="normal"
            />
          </Grid>
          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Description"
              value={template.description}
              onChange={(e) => setTemplate({ ...template, description: e.target.value })}
              margin="normal"
              multiline
              rows={2}
            />
          </Grid>
        </Grid>

        <Box sx={{ mt: 3 }}>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
            <Tabs value={tabValue} onChange={(e, v) => setTabValue(v)}>
              <Tab label="HTML Editor" />
              <Tab label="Preview" />
            </Tabs>
            {tabValue === 1 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <Button
                  variant={previewMode === 'light' ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<LightModeIcon />}
                  onClick={() => setPreviewMode('light')}
                  sx={{ minWidth: '100px' }}
                >
                  Light
                </Button>
                <Button
                  variant={previewMode === 'dark' ? 'contained' : 'outlined'}
                  size="small"
                  startIcon={<DarkModeIcon />}
                  onClick={() => setPreviewMode('dark')}
                  sx={{ minWidth: '100px' }}
                >
                  Dark
                </Button>
              </Box>
            )}
          </Box>

          {tabValue === 0 && (
            <Box sx={{ mt: 2 }}>
              <AceEditor
                mode="html"
                theme="monokai"
                value={template.htmlContent}
                onChange={(value) => {
                  setTemplate({ ...template, htmlContent: value });
                  setPreviewHtml(value);
                }}
                width="100%"
                height="600px"
                fontSize={14}
                setOptions={{
                  enableBasicAutocompletion: true,
                  enableLiveAutocompletion: true,
                  enableSnippets: true,
                  useWorker: false, // Disable web workers to avoid loading issues
                }}
              />
            </Box>
          )}

          {tabValue === 1 && (
            <Box 
              sx={{ 
                mt: 2, 
                border: '1px solid #ddd', 
                p: 2, 
                minHeight: '600px',
                bgcolor: previewMode === 'dark' ? '#1e1e1e' : '#ffffff',
                transition: 'background-color 0.3s ease'
              }}
            >
              <iframe
                title="preview"
                srcDoc={getPreviewWithMode(previewHtml, previewMode)}
                style={{ 
                  width: '100%', 
                  height: '600px', 
                  border: 'none',
                  backgroundColor: previewMode === 'dark' ? '#1e1e1e' : '#ffffff'
                }}
              />
            </Box>
          )}
        </Box>

        <Box sx={{ mt: 3, display: 'flex', gap: 2 }}>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Template'}
          </Button>
          {id && (
            <Button variant="outlined" onClick={handleTest}>
              Test Template
            </Button>
          )}
        </Box>
      </Paper>
    </Box>
  );
}

export default TemplateEditor;

