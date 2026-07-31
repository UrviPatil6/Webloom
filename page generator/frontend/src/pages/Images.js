import React, { useState, useEffect } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Button,
  Box,
  CircularProgress,
  Alert,
  Card,
  CardMedia,
  CardContent,
  CardActions,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Chip,
} from '@mui/material';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import { useDropzone } from 'react-dropzone';
import { getImages, uploadImage, updateImage, deleteImage, getWordPressConnections } from '../services/api';
import api from '../services/api';

function Images() {
  const [images, setImages] = useState([]);
  const [allImages, setAllImages] = useState([]); // Store all images for filtering
  const [connections, setConnections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [editDialog, setEditDialog] = useState({ open: false, image: null });
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null, image: null, deleteFromWordPress: false });
  const [selectedConnectionId, setSelectedConnectionId] = useState('all'); // 'all' means show all images
  const [useAI, setUseAI] = useState(true); // Enable AI analysis by default

  useEffect(() => {
    loadImages();
    loadConnections();
  }, []);

  useEffect(() => {
    // Filter images when connection selection changes
    filterImages();
  }, [selectedConnectionId, allImages]);

  const loadConnections = async () => {
    try {
      const response = await getWordPressConnections();
      setConnections(response.data);
      // Set default connection if available
      const defaultConnection = response.data.find(conn => conn.isDefault);
      if (defaultConnection) {
        setSelectedConnectionId(defaultConnection._id);
      } else if (response.data.length > 0) {
        setSelectedConnectionId(response.data[0]._id);
      }
    } catch (err) {
      console.error('Failed to load connections:', err);
    }
  };

  const filterImages = () => {
    if (selectedConnectionId === 'all') {
      setImages(allImages);
      return;
    }

    // Filter images that have been uploaded to the selected connection
    const filtered = allImages.filter(image => {
      if (!image.wordpressUploads || image.wordpressUploads.length === 0) {
        return false; // Don't show images without WordPress uploads when a connection is selected
      }
      return image.wordpressUploads.some(
        upload => upload.connectionId.toString() === selectedConnectionId.toString()
      );
    });
    setImages(filtered);
  };

  const loadImages = async () => {
    try {
      setLoading(true);
      const response = await getImages();
      setAllImages(response.data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const onDrop = async (acceptedFiles) => {
    try {
      setUploading(true);
      setError(null);
      
      if (selectedConnectionId === 'all') {
        setError('Please select a WordPress connection before uploading images');
        setUploading(false);
        return;
      }

      const uploadedImages = [];
      for (const file of acceptedFiles) {
        const formData = new FormData();
        formData.append('image', file);
        formData.append('uploadToWordPress', 'true');
        formData.append('wordpressConnectionId', selectedConnectionId);
        formData.append('useAI', useAI ? 'true' : 'false');
        
        const response = await uploadImage(formData);
        uploadedImages.push(response.data);
      }
      
      // Reload images to ensure we have the latest data with WordPress upload info
      await loadImages();
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.webp']
    }
  });

  const handleUpdate = async () => {
    try {
      const { image } = editDialog;
      await updateImage(image._id, {
        altText: image.altText,
        tags: image.tags,
        category: image.category,
      });
      // Update allImages and let filtering handle the rest
      setAllImages(allImages.map(img => img._id === image._id ? image : img));
      setEditDialog({ open: false, image: null });
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async () => {
    try {
      setError(null);
      const image = deleteDialog.image;
      const shouldDeleteFromWordPress = deleteDialog.deleteFromWordPress;
      
      // Build URL with query parameters
      let deleteUrl = `/images/${deleteDialog.id}`;
      if (shouldDeleteFromWordPress) {
        deleteUrl += '?deleteFromWordPress=true';
      }
      
      const response = await api.delete(deleteUrl);
      
      // Show success message with details
      if (response.data.details) {
        const details = response.data.details;
        let message = 'Image deleted successfully';
        
        if (details.wordpress.attempted) {
          const successCount = details.wordpress.success.length;
          const failedCount = details.wordpress.failed.length;
          
          if (successCount > 0 && failedCount === 0) {
            message += ` and removed from ${successCount} WordPress connection(s)`;
          } else if (successCount > 0 && failedCount > 0) {
            message += `. Removed from ${successCount} WordPress connection(s), but failed to remove from ${failedCount} connection(s)`;
            setError(`Some WordPress deletions failed: ${details.wordpress.failed.map(f => f.error).join(', ')}`);
          } else if (failedCount > 0) {
            message += ' from local database, but failed to remove from WordPress';
            setError(`WordPress deletion failed: ${details.wordpress.failed.map(f => f.error).join(', ')}`);
          }
        }
        
        if (details.warnings && details.warnings.length > 0) {
          setError(prev => prev ? prev + '\n' + details.warnings.join('\n') : details.warnings.join('\n'));
        }
      }
      
      const newAllImages = allImages.filter(img => img._id !== deleteDialog.id);
      setAllImages(newAllImages);
      setDeleteDialog({ open: false, id: null, image: null, deleteFromWordPress: false });
      // Filter will be applied automatically via useEffect
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

  const filteredImagesCount = images.length;
  const totalImagesCount = allImages.length;

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Image Library</Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* WordPress Connection Selector */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <FormControl fullWidth>
          <InputLabel>Select WordPress Connection</InputLabel>
          <Select
            value={selectedConnectionId}
            onChange={(e) => setSelectedConnectionId(e.target.value)}
            label="Select WordPress Connection"
          >
            <MenuItem value="all">
              <Typography variant="body1">All Images</Typography>
            </MenuItem>
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
          {selectedConnectionId !== 'all' && (
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
              Showing {filteredImagesCount} image{filteredImagesCount !== 1 ? 's' : ''} uploaded to this connection
              {totalImagesCount > filteredImagesCount && ` (${totalImagesCount} total)`}
            </Typography>
          )}
        </FormControl>
        
        {selectedConnectionId !== 'all' && (
          <FormControlLabel
            control={
              <Switch
                checked={useAI}
                onChange={(e) => setUseAI(e.target.checked)}
                sx={{ mt: 2 }}
              />
            }
            label={
              <Box>
                <Typography variant="body2">
                  Use AI to auto-generate filename, alt text, title, caption & description
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Analyzes image content and generates SEO-friendly metadata automatically
                </Typography>
              </Box>
            }
          />
        )}
      </Paper>

      {/* Upload Zone */}
      <Paper sx={{ p: 3, mb: 3 }}>
        <Box
          {...getRootProps()}
          sx={{
            border: '2px dashed',
            borderColor: isDragActive ? 'primary.main' : 'grey.300',
            borderRadius: 2,
            p: 4,
            textAlign: 'center',
            cursor: selectedConnectionId === 'all' ? 'not-allowed' : 'pointer',
            bgcolor: isDragActive ? 'action.hover' : selectedConnectionId === 'all' ? 'action.disabledBackground' : 'background.paper',
            opacity: selectedConnectionId === 'all' ? 0.6 : 1,
            mb: 2,
          }}
        >
          <input {...getInputProps()} disabled={selectedConnectionId === 'all'} />
          <CloudUploadIcon sx={{ fontSize: 48, color: 'text.secondary', mb: 2 }} />
          <Typography variant="h6" gutterBottom>
            {isDragActive ? 'Drop images here' : 'Drag & drop images here'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {selectedConnectionId === 'all' 
              ? 'Please select a WordPress connection to upload images' 
              : `Images will be uploaded to: ${connections.find(c => c._id === selectedConnectionId)?.name || 'Selected Connection'}`}
          </Typography>
          {selectedConnectionId !== 'all' && useAI && (
            <Typography variant="caption" color="primary" sx={{ mt: 1, display: 'block' }}>
              ✨ AI will analyze images and auto-generate SEO-friendly metadata
            </Typography>
          )}
          {uploading && (
            <Box sx={{ mt: 2 }}>
              <CircularProgress sx={{ mb: 1 }} />
              <Typography variant="body2" color="text.secondary">
                {useAI ? 'Analyzing image and uploading...' : 'Uploading...'}
              </Typography>
            </Box>
          )}
        </Box>
      </Paper>

      {images.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography variant="h6" color="text.secondary" gutterBottom>
            {selectedConnectionId === 'all' 
              ? 'No images found' 
              : 'No images uploaded to this WordPress connection'}
          </Typography>
          <Typography variant="body2" color="text.secondary">
            {selectedConnectionId === 'all' 
              ? 'Upload images to get started' 
              : 'Select a connection and upload images to see them here'}
          </Typography>
        </Paper>
      ) : (
        <Grid container spacing={3}>
          {images.map((image) => (
          <Grid item xs={12} sm={6} md={4} lg={3} key={image._id}>
            <Card>
              <CardMedia
                component="img"
                height="200"
                image={image.url}
                alt={image.altText}
                sx={{ objectFit: 'cover' }}
              />
              <CardContent>
                <Typography variant="body2" noWrap>
                  {image.filename}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  Used: {image.usageCount || 0} times
                </Typography>
                {image.wordpressUploads && image.wordpressUploads.length > 0 && (
                  <Box sx={{ mt: 1 }}>
                    {image.wordpressUploads.map((upload, idx) => {
                      const connection = connections.find(c => c._id === upload.connectionId);
                      return connection ? (
                        <Chip
                          key={idx}
                          label={connection.name}
                          size="small"
                          icon={<CheckCircleIcon />}
                          sx={{ mr: 0.5, mb: 0.5 }}
                          color="success"
                          variant="outlined"
                        />
                      ) : null;
                    })}
                  </Box>
                )}
              </CardContent>
              <CardActions>
                <IconButton
                  size="small"
                  onClick={() => setEditDialog({ open: true, image: { ...image } })}
                >
                  <EditIcon />
                </IconButton>
                <IconButton
                  size="small"
                  color="error"
                  onClick={() => setDeleteDialog({ 
                    open: true, 
                    id: image._id, 
                    image: image,
                    deleteFromWordPress: false
                  })}
                >
                  <DeleteIcon />
                </IconButton>
              </CardActions>
            </Card>
          </Grid>
        ))}
        </Grid>
      )}

      {/* Edit Dialog */}
      <Dialog open={editDialog.open} onClose={() => setEditDialog({ open: false, image: null })}>
        <DialogTitle>Edit Image</DialogTitle>
        <DialogContent>
          <TextField
            fullWidth
            label="Alt Text"
            value={editDialog.image?.altText || ''}
            onChange={(e) => setEditDialog({
              ...editDialog,
              image: { ...editDialog.image, altText: e.target.value }
            })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Tags (comma-separated)"
            value={editDialog.image?.tags?.join(', ') || ''}
            onChange={(e) => setEditDialog({
              ...editDialog,
              image: { ...editDialog.image, tags: e.target.value.split(',').map(t => t.trim()) }
            })}
            margin="normal"
          />
          <TextField
            fullWidth
            label="Category"
            value={editDialog.image?.category || ''}
            onChange={(e) => setEditDialog({
              ...editDialog,
              image: { ...editDialog.image, category: e.target.value }
            })}
            margin="normal"
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog({ open: false, image: null })}>Cancel</Button>
          <Button onClick={handleUpdate} variant="contained">Save</Button>
        </DialogActions>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null, image: null, deleteFromWordPress: false })} maxWidth="sm" fullWidth>
        <DialogTitle>Delete Image</DialogTitle>
        <DialogContent>
          {deleteDialog.image && (
            <Box>
              <Typography variant="body1" gutterBottom>
                Are you sure you want to delete <strong>{deleteDialog.image.filename}</strong>?
              </Typography>
              
              {deleteDialog.image.usageCount > 0 && (
                <Alert severity="warning" sx={{ mt: 2, mb: 2 }}>
                  This image is used in <strong>{deleteDialog.image.usageCount}</strong> page(s). 
                  Deleting it may break those pages.
                </Alert>
              )}
              
              {deleteDialog.image.wordpressUploads && deleteDialog.image.wordpressUploads.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="body2" color="text.secondary" gutterBottom>
                    This image is uploaded to {deleteDialog.image.wordpressUploads.length} WordPress connection(s):
                  </Typography>
                  <Box sx={{ mt: 1, mb: 2 }}>
                    {deleteDialog.image.wordpressUploads.map((upload, idx) => {
                      const connection = connections.find(c => c._id === upload.connectionId);
                      return connection ? (
                        <Chip
                          key={idx}
                          label={connection.name}
                          size="small"
                          sx={{ mr: 0.5, mb: 0.5 }}
                        />
                      ) : null;
                    })}
                  </Box>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={deleteDialog.deleteFromWordPress}
                        onChange={(e) => setDeleteDialog({
                          ...deleteDialog,
                          deleteFromWordPress: e.target.checked
                        })}
                      />
                    }
                    label={
                      <Box>
                        <Typography variant="body2">
                          Also delete from WordPress
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          Remove the image from WordPress Media Library as well
                        </Typography>
                      </Box>
                    }
                  />
                  {!deleteDialog.deleteFromWordPress && (
                    <Alert severity="info" sx={{ mt: 1 }}>
                      If unchecked, the image will only be removed from your local library but will remain in WordPress.
                    </Alert>
                  )}
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog({ open: false, id: null, image: null, deleteFromWordPress: false })}>
            Cancel
          </Button>
          <Button 
            onClick={handleDelete} 
            color="error" 
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

export default Images;

