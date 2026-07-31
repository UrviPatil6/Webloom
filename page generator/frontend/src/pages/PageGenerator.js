import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Alert,
  CircularProgress,
  FormControlLabel,
  Switch,
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { getTemplates, createJob, getWordPressConnections } from '../services/api';
import { useNavigate } from 'react-router-dom';

function PageGenerator() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState([]);
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState(null);
  const [formData, setFormData] = useState({
    templateId: '',
    mainKeyword: '',
    focusKeywords: '',
    titleConnector: '',
    imageSelectionMethod: 'random',
    autoPublish: false,
    wordpressConnectionId: '',
  });
  const [generatedTitles, setGeneratedTitles] = useState([]);
  const [showTitlePreview, setShowTitlePreview] = useState(false);

  useEffect(() => {
    loadTemplates();
    loadConnections();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const response = await getTemplates();
      setTemplates(response.data);
      if (response.data.length > 0) {
        setFormData(prev => ({ ...prev, templateId: response.data[0]._id }));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadConnections = async () => {
    try {
      const response = await getWordPressConnections();
      setConnections(response.data);
      // Set default connection if available
      const defaultConnection = response.data.find(conn => conn.isDefault);
      if (defaultConnection) {
        setFormData(prev => ({ ...prev, wordpressConnectionId: defaultConnection._id }));
      } else if (response.data.length > 0) {
        setFormData(prev => ({ ...prev, wordpressConnectionId: response.data[0]._id }));
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const generateTitlePreviews = () => {
    if (!formData.mainKeyword || !formData.focusKeywords || !formData.titleConnector) {
      setError('Please fill in Main Keyword, Connector, and Focus Keywords to preview titles');
      return;
    }

    const focusKeywordsArray = formData.focusKeywords
      .split('\n')
      .map(k => k.trim())
      .filter(k => k.length > 0);

    const titles = focusKeywordsArray.map(focusKeyword =>
      `${formData.mainKeyword} ${formData.titleConnector} ${focusKeyword}`
    );

    setGeneratedTitles(titles);
    setShowTitlePreview(true);
  };

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      setError(null);

      if (!formData.templateId || !formData.mainKeyword || !formData.focusKeywords || !formData.titleConnector) {
        setError('Please fill in all required fields');
        return;
      }

      if (formData.autoPublish && !formData.wordpressConnectionId) {
        setError('Please select a WordPress connection when auto-publish is enabled');
        return;
      }

      const focusKeywordsArray = formData.focusKeywords
        .split('\n')
        .map(k => k.trim())
        .filter(k => k.length > 0);

      if (focusKeywordsArray.length === 0) {
        setError('Please enter at least one focus keyword');
        return;
      }

      const response = await createJob({
        templateId: formData.templateId,
        mainKeyword: formData.mainKeyword,
        focusKeywords: focusKeywordsArray,
        titleConnector: formData.titleConnector,
        imageSelectionMethod: formData.imageSelectionMethod,
        autoPublish: formData.autoPublish,
        wordpressConnectionId: formData.autoPublish ? formData.wordpressConnectionId : null,
      });

      navigate(`/jobs/${response.data._id}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setGenerating(false);
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
      <Typography variant="h4" gutterBottom>
        Page Generator
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper sx={{ p: 3 }}>
        <Grid container spacing={3}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Template</InputLabel>
              <Select
                value={formData.templateId}
                onChange={(e) => setFormData({ ...formData, templateId: e.target.value })}
                label="Template"
              >
                {templates.map((template) => (
                  <MenuItem key={template._id} value={template._id}>
                    {template.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12} md={6}>
            <FormControl fullWidth margin="normal">
              <InputLabel>Image Selection Method</InputLabel>
              <Select
                value={formData.imageSelectionMethod}
                onChange={(e) => setFormData({ ...formData, imageSelectionMethod: e.target.value })}
                label="Image Selection Method"
              >
                <MenuItem value="random">Random</MenuItem>
                <MenuItem value="keyword">Keyword Match</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Main Keyword"
              value={formData.mainKeyword}
              onChange={(e) => setFormData({ ...formData, mainKeyword: e.target.value })}
              margin="normal"
              placeholder="e.g., AI Agents"
              required
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Title Connector"
              value={formData.titleConnector}
              onChange={(e) => setFormData({ ...formData, titleConnector: e.target.value })}
              margin="normal"
              placeholder="e.g., of, for, in, and, vs, with, :"
              required
              helperText="Enter the word or phrase to connect Main Keyword with Focus Keywords"
            />
          </Grid>

          <Grid item xs={12} md={6}>
            <Button
              fullWidth
              variant="outlined"
              onClick={generateTitlePreviews}
              sx={{ mt: 1, height: '56px' }}
            >
              Preview Titles
            </Button>
          </Grid>

          <Grid item xs={12}>
            <TextField
              fullWidth
              label="Focus Keywords (one per line)"
              value={formData.focusKeywords}
              onChange={(e) => setFormData({ ...formData, focusKeywords: e.target.value })}
              margin="normal"
              multiline
              rows={10}
              placeholder="e.g., Textile Industry&#10;Automotive Industry&#10;Food Industry"
              required
              helperText="Enter one focus keyword per line. Each keyword will generate a separate page."
            />
          </Grid>

          {showTitlePreview && generatedTitles.length > 0 && (
            <Grid item xs={12}>
              <Paper sx={{ p: 2, bgcolor: 'info.light' }}>
                <Typography variant="h6" gutterBottom>
                  Generated Page Titles Preview
                </Typography>
                <Box sx={{ maxHeight: '300px', overflow: 'auto' }}>
                  {generatedTitles.map((title, index) => (
                    <Typography
                      key={index}
                      variant="body2"
                      sx={{ mb: 1, p: 1, bgcolor: 'background.paper', borderRadius: 1 }}
                    >
                      {index + 1}. {title}
                    </Typography>
                  ))}
                </Box>
              </Paper>
            </Grid>
          )}

          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={formData.autoPublish}
                  onChange={(e) => setFormData({ ...formData, autoPublish: e.target.checked })}
                />
              }
              label="Auto-publish to WordPress after generation"
            />
          </Grid>

          {formData.autoPublish && (
            <Grid item xs={12}>
              <FormControl fullWidth margin="normal">
                <InputLabel>WordPress Connection</InputLabel>
                <Select
                  value={formData.wordpressConnectionId}
                  onChange={(e) => setFormData({ ...formData, wordpressConnectionId: e.target.value })}
                  label="WordPress Connection"
                  required
                >
                  {connections.map((connection) => (
                    <MenuItem key={connection._id} value={connection._id}>
                      <Box display="flex" alignItems="center" width="100%">
                        {connection.connected ? (
                          <CheckCircleIcon color="success" sx={{ mr: 1, fontSize: 16 }} />
                        ) : (
                          <ErrorIcon color="error" sx={{ mr: 1, fontSize: 16 }} />
                        )}
                        <Box>
                          <Typography variant="body1">
                            {connection.name}
                            {connection.isDefault && ' (Default)'}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            {connection.siteUrl}
                          </Typography>
                        </Box>
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
                {connections.length === 0 && (
                  <Typography variant="caption" color="error" sx={{ mt: 1 }}>
                    No WordPress connections available. Please add a connection in WordPress Settings.
                  </Typography>
                )}
                {formData.wordpressConnectionId && (
                  <Alert severity="info" sx={{ mt: 1 }}>
                    <Typography variant="body2">
                      <strong>Image Selection:</strong> Only images uploaded to this WordPress connection will be used for page generation.
                    </Typography>
                    <Typography variant="caption" display="block" sx={{ mt: 0.5 }}>
                      This ensures all images are available in the target WordPress site and prevents broken image links.
                    </Typography>
                  </Alert>
                )}
              </FormControl>
            </Grid>
          )}

          <Grid item xs={12}>
            <Button
              variant="contained"
              size="large"
              startIcon={generating ? <CircularProgress size={20} /> : <PlayArrowIcon />}
              onClick={handleGenerate}
              disabled={generating}
            >
              {generating ? 'Generating...' : 'Generate Pages'}
            </Button>
          </Grid>
        </Grid>
      </Paper>
    </Box>
  );
}

export default PageGenerator;

