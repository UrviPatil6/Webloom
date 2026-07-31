import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Templates
export const getTemplates = () => api.get('/templates');
export const getTemplate = (id) => api.get(`/templates/${id}`);
export const createTemplate = (data) => api.post('/templates', data);
export const updateTemplate = (id, data) => api.put(`/templates/${id}`, data);
export const deleteTemplate = (id) => api.delete(`/templates/${id}`);
export const testTemplate = (id, data) => api.post(`/templates/${id}/test`, data);

// Images
export const getImages = (params) => api.get('/images', { params });
export const getImage = (id) => api.get(`/images/${id}`);
export const uploadImage = (formData) => api.post('/images/upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const bulkUploadImages = (formData) => api.post('/images/bulk-upload', formData, {
  headers: { 'Content-Type': 'multipart/form-data' }
});
export const updateImage = (id, data) => api.put(`/images/${id}`, data);
export const deleteImage = (id) => {
  // id can include query parameters like "id?deleteFromWordPress=true"
  return api.delete(`/images/${id}`);
};

// Pages
export const getPages = (params) => api.get('/pages', { params });
export const getPage = (id) => api.get(`/pages/${id}`);
export const generatePage = (data) => api.post('/pages/generate', data);
export const publishPage = (id, data) => api.post(`/pages/${id}/publish`, data);
export const updatePage = (id, data) => api.put(`/pages/${id}`, data);
export const deletePage = (id) => api.delete(`/pages/${id}`);
export const bulkPublishPages = (data) => api.post('/pages/bulk-publish', data);

// Jobs
export const getJobs = () => api.get('/jobs');
export const getJob = (id) => api.get(`/jobs/${id}`);
export const createJob = (data) => api.post('/jobs/generate', data);
export const cancelJob = (id) => api.post(`/jobs/${id}/cancel`);
export const retryJob = (id) => api.post(`/jobs/${id}/retry`);

// WordPress
export const getWordPressSettings = () => api.get('/wordpress/settings');
export const updateWordPressSettings = (data) => api.put('/wordpress/settings', data);
export const testWordPressConnection = () => api.post('/wordpress/test');

// WordPress Connections
export const getWordPressConnections = () => api.get('/wordpress/connections');
export const getWordPressConnection = (id) => api.get(`/wordpress/connections/${id}`);
export const getDefaultWordPressConnection = () => api.get('/wordpress/connections/default/active');
export const createWordPressConnection = (data) => api.post('/wordpress/connections', data);
export const updateWordPressConnection = (id, data) => api.put(`/wordpress/connections/${id}`, data);
export const deleteWordPressConnection = (id) => api.delete(`/wordpress/connections/${id}`);
export const testWordPressConnectionById = (id) => api.post(`/wordpress/connections/${id}/test`);
export const setDefaultWordPressConnection = (id) => api.put(`/wordpress/connections/${id}/default`);

// Analytics
export const getAnalyticsOverview = () => api.get('/analytics/overview');
export const getPagesOverTime = (days) => api.get('/analytics/pages-over-time', { params: { days } });
export const getPagesByStatus = () => api.get('/analytics/pages-by-status');
export const getTopKeywords = () => api.get('/analytics/top-keywords');

export default api;

