import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Paper,
  Typography,
  Button,
  CircularProgress,
  Alert,
  Chip,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Card,
  CardContent,
  Grid,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  IconButton,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import RefreshIcon from '@mui/icons-material/Refresh';
import VisibilityIcon from '@mui/icons-material/Visibility';
import { getJob, getPage } from '../services/api';

function JobDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [responseDialog, setResponseDialog] = useState({ open: false, page: null });

  useEffect(() => {
    loadJob();
    const interval = setInterval(loadJob, 5000); // Refresh every 5 seconds
    return () => clearInterval(interval);
  }, [id]);

  const loadJob = async () => {
    try {
      const response = await getJob(id);
      setJob(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'success';
      case 'processing': return 'info';
      case 'failed': return 'error';
      case 'cancelled': return 'default';
      default: return 'warning';
    }
  };

  const handleViewResponse = async (pageId) => {
    try {
      const response = await getPage(pageId);
      setResponseDialog({ open: true, page: response.data });
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading && !job) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !job) {
    return <Alert severity="error">{error}</Alert>;
  }

  if (!job) {
    return <Alert severity="info">Job not found</Alert>;
  }

  const completedCount = job.pagesStatus?.filter(p => p.status === 'completed').length || 0;
  const failedCount = job.pagesStatus?.filter(p => p.status === 'failed').length || 0;
  const processingCount = job.pagesStatus?.filter(p => p.status === 'processing').length || 0;

  return (
    <Box>
      <Box display="flex" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/jobs')}
          sx={{ mr: 2 }}
        >
          Back to Jobs
        </Button>
        <Typography variant="h4">Job Details</Typography>
        <Button
          startIcon={<RefreshIcon />}
          onClick={loadJob}
          sx={{ ml: 'auto' }}
        >
          Refresh
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Job Information</Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Job ID:</strong> {job._id}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                <strong>Main Keyword:</strong> {job.mainKeyword}
              </Typography>
              {job.titleConnector && (
                <Typography variant="body2" color="text.secondary">
                  <strong>Title Connector:</strong> {job.titleConnector}
                </Typography>
              )}
              <Typography variant="body2" color="text.secondary">
                <strong>Total Pages:</strong> {job.totalPages}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
                <Typography variant="body2" color="text.secondary" component="span">
                  <strong>Status:</strong>
                </Typography>
                <Chip
                  label={job.status}
                  color={getStatusColor(job.status)}
                  size="small"
                />
              </Box>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Progress:</strong> {job.progress || 0}%
              </Typography>
              {job.startedAt && (
                <Typography variant="body2" color="text.secondary" component="div">
                  <strong>Started:</strong> {new Date(job.startedAt).toLocaleString()}
                </Typography>
              )}
              {job.completedAt && (
                <Typography variant="body2" color="text.secondary" component="div">
                  <strong>Completed:</strong> {new Date(job.completedAt).toLocaleString()}
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>Statistics</Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Completed:</strong> {completedCount}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Processing:</strong> {processingCount}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Failed:</strong> {failedCount}
              </Typography>
              <Box sx={{ mt: 2 }}>
                <LinearProgress
                  variant="determinate"
                  value={job.progress || 0}
                  sx={{ height: 10, borderRadius: 5 }}
                />
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom sx={{ color: '#d32f2f' }}>💰 Token Usage & Cost</Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Input Tokens:</strong> {job.totalTokenUsage?.inputTokens || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Output Tokens:</strong> {job.totalTokenUsage?.outputTokens || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary" component="div">
                <strong>Total Tokens:</strong> {job.totalTokenUsage?.totalTokens || 0}
              </Typography>
              <Box sx={{ mt: 2, p: 2, bgcolor: '#e8f5e9', borderRadius: 1 }}>
                <Typography variant="h6" sx={{ color: '#2e7d32', fontWeight: 'bold' }}>
                  Total Cost: ${(job.totalCost || 0).toFixed(6)}
                </Typography>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  Average per page: ${((job.totalCost || 0) / (job.totalPages || 1)).toFixed(6)}
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h6" gutterBottom>Pages Status</Typography>
            <TableContainer>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Focus Keyword</TableCell>
                    <TableCell>Generated Title</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell>Tokens Used</TableCell>
                    <TableCell>Cost</TableCell>
                    <TableCell>Actions</TableCell>
                    <TableCell>Error</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {job.pagesStatus?.map((pageStatus, index) => (
                    <TableRow key={index}>
                      <TableCell>{pageStatus.focusKeyword}</TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontSize: '0.875rem' }}>
                          {pageStatus.generatedTitle || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={pageStatus.status}
                          color={getStatusColor(pageStatus.status)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {pageStatus.tokenUsage?.totalTokens || '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="caption" color="text.secondary">
                          {pageStatus.cost ? `$${pageStatus.cost.toFixed(6)}` : '-'}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {pageStatus.pageId && pageStatus.status === 'completed' && (
                          <IconButton
                            size="small"
                            onClick={() => handleViewResponse(pageStatus.pageId)}
                            title="View OpenAI Response"
                          >
                            <VisibilityIcon fontSize="small" />
                          </IconButton>
                        )}
                      </TableCell>
                      <TableCell>
                        {pageStatus.error ? (
                          <Alert severity="error" sx={{ py: 0, fontSize: '0.75rem' }}>
                            {pageStatus.error}
                          </Alert>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          </Paper>
        </Grid>
      </Grid>

      {/* OpenAI Response Dialog */}
      <Dialog
        open={responseDialog.open}
        onClose={() => setResponseDialog({ open: false, page: null })}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>Page Details & OpenAI Response</DialogTitle>
        <DialogContent sx={{ maxHeight: '600px', overflow: 'auto' }}>
          {responseDialog.page?.generatedContent ? (
            <Box>
              {/* SEO Metadata Section */}
              {responseDialog.page?.seo && (
                <Box sx={{ mb: 3, p: 2, bgcolor: '#f0f7ff', borderRadius: 1, border: '1px solid #b3d9ff' }}>
                  <Typography variant="h6" gutterBottom sx={{ color: '#0066cc' }}>
                    SEO Metadata (Yoast)
                  </Typography>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 'bold' }}>
                      Meta Title ({responseDialog.page.seo.metaTitle?.length || 0}/60)
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, p: 1, bgcolor: 'white', borderRadius: 0.5, border: '1px solid #ddd' }}>
                      {responseDialog.page.seo.metaTitle || 'Not set'}
                    </Typography>
                  </Box>
                  <Box sx={{ mb: 2 }}>
                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 'bold' }}>
                      Meta Description ({responseDialog.page.seo.metaDescription?.length || 0}/160)
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, p: 1, bgcolor: 'white', borderRadius: 0.5, border: '1px solid #ddd' }}>
                      {responseDialog.page.seo.metaDescription || 'Not set'}
                    </Typography>
                  </Box>
                  <Box>
                    <Typography variant="caption" sx={{ color: '#666', fontWeight: 'bold' }}>
                      Focus Keyphrase
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, p: 1, bgcolor: 'white', borderRadius: 0.5, border: '1px solid #ddd' }}>
                      {responseDialog.page.seo.focusKeyphrase || 'Not set'}
                    </Typography>
                  </Box>
                </Box>
              )}

              <Typography variant="h6" gutterBottom sx={{ mt: 2 }}>
                Intro Section
              </Typography>
              {responseDialog.page.generatedContent.intro && (
                <Box sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  {responseDialog.page.generatedContent.intro.h1 && (
                    <Typography variant="h5" gutterBottom>
                      {responseDialog.page.generatedContent.intro.h1}
                    </Typography>
                  )}
                  {responseDialog.page.generatedContent.intro.paragraph && (
                    <Typography variant="body2" color="text.secondary">
                      {responseDialog.page.generatedContent.intro.paragraph}
                    </Typography>
                  )}
                </Box>
              )}

              <Typography variant="h6" gutterBottom>
                Main Sections
              </Typography>
              {responseDialog.page.generatedContent.sections?.map((section, idx) => (
                <Box key={idx} sx={{ mb: 3, p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  {section.h2 && (
                    <Typography variant="h6" gutterBottom>
                      {section.h2}
                    </Typography>
                  )}
                  {section.paragraphs?.map((para, pIdx) => (
                    <Typography key={pIdx} variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {para}
                    </Typography>
                  ))}
                </Box>
              ))}

              <Typography variant="h6" gutterBottom>
                Conclusion
              </Typography>
              {responseDialog.page.generatedContent.conclusion && (
                <Box sx={{ p: 2, bgcolor: 'background.paper', borderRadius: 1 }}>
                  {responseDialog.page.generatedContent.conclusion.h2 && (
                    <Typography variant="h6" gutterBottom>
                      {responseDialog.page.generatedContent.conclusion.h2}
                    </Typography>
                  )}
                  {responseDialog.page.generatedContent.conclusion.paragraph && (
                    <Typography variant="body2" color="text.secondary">
                      {responseDialog.page.generatedContent.conclusion.paragraph}
                    </Typography>
                  )}
                </Box>
              )}
            </Box>
          ) : (
            <Typography>No content available</Typography>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setResponseDialog({ open: false, page: null })}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default JobDetail;

