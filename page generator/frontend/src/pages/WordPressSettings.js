import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Grid,
  Card,
  CardContent,
  CardActions,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
  Chip,
  Divider,
  List,
  ListItem,
  ListItemText,
  ListItemSecondaryAction,
  FormControlLabel,
  Switch,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from '@mui/material';
import SaveIcon from '@mui/icons-material/Save';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import StarIcon from '@mui/icons-material/Star';
import StarBorderIcon from '@mui/icons-material/StarBorder';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import {
  getWordPressConnections,
  createWordPressConnection,
  updateWordPressConnection,
  deleteWordPressConnection,
  testWordPressConnectionById,
  setDefaultWordPressConnection,
} from '../services/api';

function WordPressSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState({});
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [connections, setConnections] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [copied, setCopied] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    siteUrl: '',
    username: '',
    appPassword: '',
    contentMethod: 'html_block',
    isDefault: false,
  });

  const yoastCode = `// Register Yoast SEO meta fields for REST API
add_action('init', function() {
    $meta_args = array(
        'type'           => 'string',
        'description'    => 'Yoast SEO meta field',
        'single'         => true,
        'show_in_rest'   => true,
    );

    // Register each Yoast SEO meta field
    register_meta('post', '_yoast_wpseo_title', $meta_args);
    register_meta('post', '_yoast_wpseo_metadesc', $meta_args);
    register_meta('post', '_yoast_wpseo_focuskw', $meta_args);
    register_meta('post', '_yoast_wpseo_focuskeywords', $meta_args);
});`;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(yoastCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    loadConnections();
  }, []);

  const loadConnections = async () => {
    try {
      setLoading(true);
      const response = await getWordPressConnections();
      setConnections(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (connection = null) => {
    if (connection) {
      setEditingConnection(connection);
      setFormData({
        name: connection.name,
        siteUrl: connection.siteUrl,
        username: connection.username,
        appPassword: '', // Don't show password
        contentMethod: connection.contentMethod || 'html_block',
        isDefault: connection.isDefault || false,
      });
    } else {
      setEditingConnection(null);
      setFormData({
        name: '',
        siteUrl: '',
        username: '',
        appPassword: '',
        contentMethod: 'html_block',
        isDefault: false,
      });
    }
    setDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingConnection(null);
    setFormData({
      name: '',
      siteUrl: '',
      username: '',
      appPassword: '',
      contentMethod: 'html_block',
      isDefault: false,
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      if (!formData.name || !formData.siteUrl || !formData.username) {
        setError('Name, Site URL, and Username are required');
        return;
      }

      if (!editingConnection && !formData.appPassword) {
        setError('Application password is required for new connections');
        return;
      }

      if (editingConnection) {
        await updateWordPressConnection(editingConnection._id, formData);
        setSuccess('Connection updated successfully');
      } else {
        await createWordPressConnection(formData);
        setSuccess('Connection created successfully');
      }

      await loadConnections();
      handleCloseDialog();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async (connectionId) => {
    try {
      setTesting({ ...testing, [connectionId]: true });
      setError(null);
      setSuccess(null);
      await testWordPressConnectionById(connectionId);
      setSuccess('Connection test successful!');
      await loadConnections();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
      await loadConnections();
    } finally {
      setTesting({ ...testing, [connectionId]: false });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteWordPressConnection(deleteDialog.id);
      setSuccess('Connection deleted successfully');
      setDeleteDialog({ open: false, id: null });
      await loadConnections();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
    }
  };

  const handleSetDefault = async (connectionId) => {
    try {
      await setDefaultWordPressConnection(connectionId);
      setSuccess('Default connection updated');
      await loadConnections();
    } catch (err) {
      setError(err.response?.data?.error || err.message);
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">WordPress Connections</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Add Connection
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess(null)}>{success}</Alert>}

      {connections.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            No WordPress connections configured
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Add your first WordPress connection to start publishing pages
          </Typography>
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Add Connection
          </Button>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {connections.map((connection) => (
            <Grid item xs={12} md={6} key={connection._id}>
              <Card>
                <CardContent>
                  <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
                    <Box>
                      <Typography variant="h6" gutterBottom>
                        {connection.name}
                        {connection.isDefault && (
                          <Chip
                            icon={<StarIcon />}
                            label="Default"
                            size="small"
                            color="primary"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        {connection.siteUrl}
                      </Typography>
                    </Box>
                    <Box display="flex" alignItems="center">
                      {connection.connected ? (
                        <CheckCircleIcon color="success" sx={{ mr: 1 }} />
                      ) : (
                        <ErrorIcon color="error" sx={{ mr: 1 }} />
                      )}
                      <Typography
                        variant="body2"
                        color={connection.connected ? 'success.main' : 'error'}
                      >
                        {connection.connected ? 'Connected' : 'Not Connected'}
                      </Typography>
                    </Box>
                  </Box>

                  <Divider sx={{ my: 2 }} />

                  <List dense>
                    <ListItem>
                      <ListItemText
                        primary="Username"
                        secondary={connection.username}
                      />
                    </ListItem>
                    <ListItem>
                      <ListItemText
                        primary="Content Method"
                        secondary={
                          connection.contentMethod === 'html_block'
                            ? 'HTML Block (Gutenberg)'
                            : connection.contentMethod === 'elementor'
                            ? 'Elementor Widget'
                            : 'Direct Content'
                        }
                      />
                    </ListItem>
                    {connection.lastTested && (
                      <ListItem>
                        <ListItemText
                          primary="Last Tested"
                          secondary={new Date(connection.lastTested).toLocaleString()}
                        />
                      </ListItem>
                    )}
                  </List>
                </CardContent>
                <CardActions>
                  <Button
                    size="small"
                    startIcon={<EditIcon />}
                    onClick={() => handleOpenDialog(connection)}
                  >
                    Edit
                  </Button>
                  <Button
                    size="small"
                    onClick={() => handleTest(connection._id)}
                    disabled={testing[connection._id]}
                  >
                    {testing[connection._id] ? 'Testing...' : 'Test'}
                  </Button>
                  {!connection.isDefault && (
                    <Button
                      size="small"
                      startIcon={<StarBorderIcon />}
                      onClick={() => handleSetDefault(connection._id)}
                    >
                      Set Default
                    </Button>
                  )}
                  <Button
                    size="small"
                    color="error"
                    startIcon={<DeleteIcon />}
                    onClick={() => setDeleteDialog({ open: true, id: connection._id })}
                  >
                    Delete
                  </Button>
                </CardActions>
              </Card>
            </Grid>
          ))}
        </Grid>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {editingConnection ? 'Edit Connection' : 'Add New Connection'}
        </DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Connection Name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Main Site, Client Site 1"
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="WordPress Site URL"
                value={formData.siteUrl}
                onChange={(e) => setFormData({ ...formData, siteUrl: e.target.value })}
                placeholder="https://yoursite.com"
                helperText="Enter your WordPress site URL (without trailing slash)"
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Username"
                value={formData.username}
                onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                required
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Application Password"
                type="text"
                value={formData.appPassword}
                onChange={(e) => setFormData({ ...formData, appPassword: e.target.value })}
                helperText={editingConnection ? "Leave blank to keep existing password" : "Paste the application password from WordPress (spaces will be automatically removed)"}
                placeholder="IMnV bJZi Mva2 PESg 10Dp R7ae"
                required={!editingConnection}
              />
            </Grid>
            <Grid item xs={12}>
              <FormControl fullWidth>
                <InputLabel>Content Insertion Method</InputLabel>
                <Select
                  value={formData.contentMethod || 'html_block'}
                  onChange={(e) => setFormData({ ...formData, contentMethod: e.target.value })}
                  label="Content Insertion Method"
                >
                  <MenuItem value="html_block">HTML Block (Gutenberg) - Recommended</MenuItem>
                  <MenuItem value="direct">Direct Content (Classic Editor)</MenuItem>
                  <MenuItem value="elementor">Elementor Widget (Requires Elementor Plugin)</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={formData.isDefault}
                    onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  />
                }
                label="Set as default connection"
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancel</Button>
          <Button
            variant="contained"
            startIcon={<SaveIcon />}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null })}>
        <DialogTitle>Delete Connection</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to delete this connection? This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null })}>Cancel</Button>
          <Button color="error" variant="contained" onClick={handleDelete}>
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* Setup Instructions Card */}
      <Card sx={{ mt: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Setup Instructions
          </Typography>
          <Typography variant="body2" component="div" sx={{ mt: 1 }}>
            <ol>
              <li>Go to WordPress Admin → Users → Profile</li>
              <li>Scroll to "Application Passwords"</li>
              <li>Create a new application password</li>
              <li>Copy the password (you won't see it again)</li>
              <li>Enter it in the form above</li>
            </ol>
          </Typography>
        </CardContent>
      </Card>

      {/* Token Usage & Cost Section */}
      <Grid container spacing={3} sx={{ mt: 2 }}>
        <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
              💰 Token Usage & Cost Per Page
            </Typography>

            <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
              Understanding how much each page costs to generate using OpenAI's API.
            </Typography>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  📊 Token Breakdown Per Page
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="h6" sx={{ mt: 2, mb: 2, fontWeight: 'bold', color: '#d32f2f' }}>
                    Understanding Tokens
                  </Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    A "token" is how OpenAI counts text. Think of it like words, but more precise:
                    <br />• <strong>1 token ≈ 4 characters</strong> or about <strong>0.75 words</strong>
                    <br />• Example: "Hello world" = ~3 tokens
                    <br />• Punctuation and special characters also count as tokens
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="h6" sx={{ mt: 2, mb: 2, fontWeight: 'bold', color: '#1976d2' }}>
                    📝 Tokens Used Per Page Generation
                  </Typography>

                  <Box sx={{ bgcolor: '#f5f5f5', p: 2, borderRadius: 1, mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 1 }}>
                      <strong>1. Input Tokens (Prompt to OpenAI):</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, mb: 1, color: '#666' }}>
                      • Main keyword: ~5 tokens (example: "AI Agents")
                      <br />• Focus keyword: ~5 tokens (example: "Mumbai")
                      <br />• Template structure info: ~200 tokens (instructions for content format)
                      <br />• SEO instructions: ~100 tokens (meta title, description guidelines)
                      <br />• System prompt: ~150 tokens (role definition, content quality rules)
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, fontWeight: 'bold', color: '#1976d2' }}>
                      ➜ Total Input: ~460 tokens per page
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="body2" sx={{ mb: 1, mt: 2 }}>
                      <strong>2. Output Tokens (Content Generated):</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, mb: 1, color: '#666' }}>
                      • H1 Title: ~10 tokens
                      <br />• Intro paragraphs (300 words): ~400 tokens
                      <br />• Value proposition section: ~150 tokens
                      <br />• Why section (5 points): ~200 tokens
                      <br />• Features section with images: ~250 tokens
                      <br />• Conclusion: ~150 tokens
                    </Typography>
                    <Typography variant="body2" sx={{ ml: 2, fontWeight: 'bold', color: '#1976d2' }}>
                      ➜ Total Output: ~1,160 tokens per page
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="h6" sx={{ mt: 2, mb: 1, fontWeight: 'bold', color: '#d32f2f' }}>
                      📊 TOTAL TOKENS PER PAGE: ~1,620 tokens
                    </Typography>
                  </Box>

                  <Typography variant="h6" sx={{ mt: 3, mb: 2, fontWeight: 'bold', color: '#2e7d32' }}>
                    💵 Cost Calculation
                  </Typography>

                  <Box sx={{ bgcolor: '#e8f5e9', p: 2, borderRadius: 1, mb: 2 }}>
                    <Typography variant="body2" sx={{ mb: 2 }}>
                      <strong>Using GPT-4o-mini (Most Economical):</strong>
                    </Typography>

                    <Typography variant="body2" sx={{ ml: 2, mb: 1 }}>
                      • Input pricing: $0.15 per 1M tokens = <strong>$0.000069 per page</strong>
                      <br />• Output pricing: $0.60 per 1M tokens = <strong>$0.000696 per page</strong>
                      <br />• <strong style={{ color: '#2e7d32', fontSize: '16px' }}>Cost per page: ~$0.0008 (less than 1 cent)</strong>
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="body2" sx={{ mb: 2, mt: 2 }}>
                      <strong>Generating 100 Pages:</strong>
                    </Typography>

                    <Typography variant="body2" sx={{ ml: 2, mb: 1 }}>
                      • 100 pages × 1,620 tokens = 162,000 tokens total
                      <br />• Input cost: 100 × $0.000069 = <strong>$0.0069</strong>
                      <br />• Output cost: 100 × $0.000696 = <strong>$0.0696</strong>
                      <br />• <strong style={{ color: '#2e7d32', fontSize: '16px' }}>Total: ~$0.08 for 100 pages</strong>
                    </Typography>

                    <Divider sx={{ my: 2 }} />

                    <Typography variant="body2" sx={{ mb: 2, mt: 2 }}>
                      <strong>Generating 1,000 Pages:</strong>
                    </Typography>

                    <Typography variant="body2" sx={{ ml: 2, mb: 1 }}>
                      • 1,000 pages × 1,620 tokens = 1,620,000 tokens total
                      <br />• Input cost: 1,000 × $0.000069 = <strong>$0.069</strong>
                      <br />• Output cost: 1,000 × $0.000696 = <strong>$0.696</strong>
                      <br />• <strong style={{ color: '#2e7d32', fontSize: '16px' }}>Total: ~$0.77 for 1,000 pages</strong>
                    </Typography>
                  </Box>

                  <Alert severity="info" sx={{ mt: 2 }}>
                    <strong>💡 Why GPT-4o-mini?</strong>
                    <br />It's the most cost-effective model that still produces high-quality content. If you want faster generation, you can upgrade to GPT-4o, but costs will be ~5x higher.
                  </Alert>

                  <Alert severity="success" sx={{ mt: 2 }}>
                    <strong>🎯 Cost Example:</strong>
                    <br />• Generating 10 pages/day × 30 days = 300 pages/month
                    <br />• Monthly cost: 300 × $0.0008 = <strong>$0.24/month</strong>
                    <br />• One page costs less than a fraction of a penny!
                  </Alert>
                </Box>
              </AccordionDetails>
            </Accordion>

            <Divider sx={{ my: 2 }} />

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  ⚡ How Tokens Are Used in Your System
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="h6" sx={{ mt: 2, mb: 2, fontWeight: 'bold' }}>
                    Step-by-Step Token Flow
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2, padding: '10px', bgcolor: '#e3f2fd', borderRadius: 1 }}>
                    <strong>Step 1: You Create a Job</strong>
                    <br />You enter: Main Keyword ("AI Agents") + Connector ("for") + Focus Keywords ("Mumbai", "Delhi", "Bangalore")
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2, padding: '10px', bgcolor: '#fff3e0', borderRadius: 1 }}>
                    <strong>Step 2: System Sends to OpenAI</strong>
                    <br />For EACH focus keyword, the system creates a prompt that includes:
                    <br />• Your keywords
                    <br />• Template format instructions
                    <br />• SEO guidelines
                    <br />• Quality standards
                    <br /><strong>↓ INPUT TOKENS USED HERE ↓</strong>
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2, padding: '10px', bgcolor: '#f3e5f5', borderRadius: 1 }}>
                    <strong>Step 3: OpenAI Generates Content</strong>
                    <br />OpenAI writes a complete page with:
                    <br />• H1 heading
                    <br />• Introduction paragraphs
                    <br />• Value proposition section
                    <br />• Benefits (Why section)
                    <br />• Features/Industries section
                    <br />• Call-to-action
                    <br /><strong>↓ OUTPUT TOKENS USED HERE ↓</strong>
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 2, padding: '10px', bgcolor: '#e8f5e9', borderRadius: 1 }}>
                    <strong>Step 4: Content is Saved</strong>
                    <br />The generated content is saved to your database (no additional tokens)
                    <br />SEO metadata is auto-generated (minimal tokens, ~50 tokens)
                  </Typography>

                  <Divider sx={{ my: 2 }} />

                  <Typography variant="h6" sx={{ mt: 2, mb: 2, fontWeight: 'bold' }}>
                    📈 Token Optimization Tips
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>1. Batch Generation:</strong> Generating 100 pages costs less per page than 1 page individually because you share the system prompt cost.
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>2. Template Reuse:</strong> Using the same template multiple times doesn't increase template token cost.
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>3. Focus Keywords:</strong> More keywords = more pages = lower cost per page
                  </Typography>

                  <Typography variant="body2" sx={{ mb: 1 }}>
                    <strong>4. Monitor Usage:</strong> Check your OpenAI dashboard to track actual token usage and costs.
                  </Typography>
                </Box>
              </AccordionDetails>
            </Accordion>
          </CardContent>
        </Card>
        </Grid>

        {/* Yoast SEO Section */}
        <Grid item xs={12}>
        <Card>
          <CardContent>
            <Typography variant="h5" gutterBottom sx={{ color: '#0066cc', fontWeight: 'bold' }}>
              ⚙️ Enable Yoast SEO Auto-Population
            </Typography>

            <Typography variant="body2" sx={{ mb: 2, color: '#666' }}>
              For automatic SEO metadata (Meta Title, Meta Description, Focus Keyphrase) to be populated in Yoast when pages are published, you need to register Yoast meta fields in your WordPress theme.
            </Typography>

            <Accordion>
              <AccordionSummary expandIcon={<ExpandMoreIcon />}>
                <Typography variant="subtitle1" sx={{ fontWeight: 'bold' }}>
                  📋 Step-by-Step Guide
                </Typography>
              </AccordionSummary>
              <AccordionDetails>
                <Box sx={{ width: '100%' }}>
                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 1: Login to WordPress Admin</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Go to your WordPress admin dashboard and look for the theme editor.
                  </Typography>

                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 2: Navigate to Theme Editor</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Go to: <strong>Appearance → Theme File Editor</strong> (or "Theme Code Editor" depending on WordPress version)
                  </Typography>

                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 3: Find functions.php</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    In the right sidebar, you'll see a list of theme files. Look for and click on <strong>"functions.php"</strong>. This file controls your theme's functionality.
                  </Typography>

                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 4: Copy the Code</Typography>
                  <Typography variant="body2" sx={{ mb: 1 }}>
                    Click the button below to copy the required PHP code to your clipboard.
                  </Typography>

                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 5: Paste into functions.php</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Scroll to the <strong>end of the functions.php file</strong> and paste the code. Make sure you paste it BEFORE the closing <strong>?&gt;</strong> tag (if one exists).
                  </Typography>

                  <Typography variant="h6" sx={{ mt: 2, mb: 1 }}>Step 6: Save the File</Typography>
                  <Typography variant="body2" sx={{ mb: 2 }}>
                    Click the <strong>"Update File"</strong> button to save your changes.
                  </Typography>

                  <Alert severity="success" sx={{ mt: 2 }}>
                    ✓ Done! Yoast SEO fields are now registered and will accept metadata from our system.
                  </Alert>
                </Box>
              </AccordionDetails>
            </Accordion>

            <Divider sx={{ my: 2 }} />

            <Typography variant="h6" sx={{ mb: 2, fontWeight: 'bold' }}>
              📝 Code to Paste in functions.php
            </Typography>

            <Box
              sx={{
                bgcolor: '#f5f5f5',
                p: 2,
                borderRadius: 1,
                border: '1px solid #ddd',
                mb: 2,
                fontFamily: 'monospace',
                fontSize: '12px',
                overflowX: 'auto',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: '#333',
                lineHeight: '1.5'
              }}
            >
              {yoastCode}
            </Box>

            <Button
              variant="contained"
              startIcon={<ContentCopyIcon />}
              onClick={handleCopyCode}
              sx={{ mb: 2 }}
            >
              {copied ? '✓ Copied to Clipboard!' : 'Copy Code'}
            </Button>

            <Alert severity="info" sx={{ mt: 2 }}>
              <strong>What does this code do?</strong>
              <br />
              This PHP code tells WordPress to "listen" for SEO metadata from our page generator system. It registers four Yoast SEO meta fields so they can be updated via REST API:
              <br />
              • <strong>_yoast_wpseo_title</strong> - Meta title shown in search results (max 60 characters)
              <br />
              • <strong>_yoast_wpseo_metadesc</strong> - Meta description shown in search results (max 160 characters)
              <br />
              • <strong>_yoast_wpseo_focuskw</strong> - Focus keyphrase for SEO analysis
              <br />
              • <strong>_yoast_wpseo_focuskeywords</strong> - Additional keyword data
            </Alert>

            <Alert severity="warning" sx={{ mt: 2 }}>
              <strong>Important:</strong> After adding this code, new pages published from our system will automatically have their Yoast SEO fields populated. You may need to refresh the page editor to see the changes.
            </Alert>
          </CardContent>
        </Card>
        </Grid>
      </Grid>
    </Box>
  );
}

export default WordPressSettings;
