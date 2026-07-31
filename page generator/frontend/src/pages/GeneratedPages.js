import React, { useState, useEffect } from 'react';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  IconButton,
  Chip,
  Alert,
  CircularProgress,
  Checkbox,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
} from '@mui/material';
import VisibilityIcon from '@mui/icons-material/Visibility';
import PublishIcon from '@mui/icons-material/Publish';
import DeleteIcon from '@mui/icons-material/Delete';
import { getPages, publishPage, deletePage, bulkPublishPages } from '../services/api';

function GeneratedPages() {
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState([]);
  const [previewDialog, setPreviewDialog] = useState({ open: false, page: null });

  useEffect(() => {
    loadPages();
  }, []);

  const loadPages = async () => {
    try {
      setLoading(true);
      const response = await getPages();
      setPages(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handlePublish = async (pageId) => {
    try {
      await publishPage(pageId, { status: 'publish' });
      loadPages();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleBulkPublish = async () => {
    try {
      await bulkPublishPages({ pageIds: selected, status: 'publish' });
      setSelected([]);
      loadPages();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (pageId) => {
    try {
      await deletePage(pageId);
      setPages(pages.filter(p => p._id !== pageId));
    } catch (err) {
      setError(err.message);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'published': return 'success';
      case 'draft': return 'default';
      case 'failed': return 'error';
      default: return 'default';
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
        <Typography variant="h4">Generated Pages</Typography>
        {selected.length > 0 && (
          <Button
            variant="contained"
            startIcon={<PublishIcon />}
            onClick={handleBulkPublish}
          >
            Bulk Publish ({selected.length})
          </Button>
        )}
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  indeterminate={selected.length > 0 && selected.length < pages.length}
                  checked={pages.length > 0 && selected.length === pages.length}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelected(pages.map(p => p._id));
                    } else {
                      setSelected([]);
                    }
                  }}
                />
              </TableCell>
              <TableCell>Title</TableCell>
              <TableCell>Focus Keyword</TableCell>
              <TableCell>SEO Title</TableCell>
              <TableCell>Status</TableCell>
              <TableCell>Word Count</TableCell>
              <TableCell>Created</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pages.map((page) => (
              <TableRow key={page._id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={selected.includes(page._id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelected([...selected, page._id]);
                      } else {
                        setSelected(selected.filter(id => id !== page._id));
                      }
                    }}
                  />
                </TableCell>
                <TableCell>{page.title}</TableCell>
                <TableCell>{page.focusKeyword}</TableCell>
                <TableCell>
                  <Typography variant="body2" sx={{ fontSize: '0.85rem' }}>
                    {page.seo?.metaTitle || 'Not set'}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Chip
                    label={page.status}
                    color={getStatusColor(page.status)}
                    size="small"
                  />
                </TableCell>
                <TableCell>{page.wordCount}</TableCell>
                <TableCell>
                  {new Date(page.createdAt).toLocaleDateString()}
                </TableCell>
                <TableCell>
                  <IconButton
                    size="small"
                    onClick={() => setPreviewDialog({ open: true, page })}
                  >
                    <VisibilityIcon />
                  </IconButton>
                  {page.status !== 'published' && (
                    <IconButton
                      size="small"
                      color="primary"
                      onClick={() => handlePublish(page._id)}
                    >
                      <PublishIcon />
                    </IconButton>
                  )}
                  <IconButton
                    size="small"
                    color="error"
                    onClick={() => handleDelete(page._id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Preview Dialog */}
      <Dialog
        open={previewDialog.open}
        onClose={() => setPreviewDialog({ open: false, page: null })}
        maxWidth="lg"
        fullWidth
      >
        <DialogTitle>{previewDialog.page?.title}</DialogTitle>
        <DialogContent>
          {previewDialog.page?.seo && (
            <Box sx={{ mb: 2, p: 2, bgcolor: '#f0f7ff', borderRadius: 1, border: '1px solid #b3d9ff' }}>
              <Typography variant="subtitle2" sx={{ color: '#0066cc', fontWeight: 'bold', mb: 1 }}>
                SEO Metadata (Yoast)
              </Typography>
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  Meta Title ({previewDialog.page.seo.metaTitle?.length || 0}/60)
                </Typography>
                <Typography variant="body2" sx={{ bgcolor: 'white', p: 1, borderRadius: 0.5 }}>
                  {previewDialog.page.seo.metaTitle}
                </Typography>
              </Box>
              <Box sx={{ mb: 1 }}>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  Meta Description ({previewDialog.page.seo.metaDescription?.length || 0}/160)
                </Typography>
                <Typography variant="body2" sx={{ bgcolor: 'white', p: 1, borderRadius: 0.5 }}>
                  {previewDialog.page.seo.metaDescription}
                </Typography>
              </Box>
              <Box>
                <Typography variant="caption" sx={{ color: '#666' }}>
                  Focus Keyphrase
                </Typography>
                <Typography variant="body2" sx={{ bgcolor: 'white', p: 1, borderRadius: 0.5 }}>
                  {previewDialog.page.seo.focusKeyphrase}
                </Typography>
              </Box>
            </Box>
          )}
          <iframe
            title="preview"
            srcDoc={previewDialog.page?.filledHtml}
            style={{ width: '100%', height: '600px', border: 'none' }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPreviewDialog({ open: false, page: null })}>Close</Button>
          {previewDialog.page?.wordpressUrl && (
            <Button
              variant="contained"
              href={previewDialog.page.wordpressUrl}
              target="_blank"
            >
              View on WordPress
            </Button>
          )}
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default GeneratedPages;

