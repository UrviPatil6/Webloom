import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Templates from './pages/Templates';
import TemplateEditor from './pages/TemplateEditor';
import Images from './pages/Images';
import PageGenerator from './pages/PageGenerator';
import GeneratedPages from './pages/GeneratedPages';
import WordPressSettings from './pages/WordPressSettings';
import JobQueue from './pages/JobQueue';
import JobDetail from './pages/JobDetail';

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: '#1976d2',
    },
    secondary: {
      main: '#dc004e',
    },
  },
});

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Router>
        <Layout>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/templates" element={<Templates />} />
            <Route path="/templates/new" element={<TemplateEditor />} />
            <Route path="/templates/:id" element={<TemplateEditor />} />
            <Route path="/images" element={<Images />} />
            <Route path="/generate" element={<PageGenerator />} />
            <Route path="/pages" element={<GeneratedPages />} />
            <Route path="/wordpress" element={<WordPressSettings />} />
            <Route path="/jobs" element={<JobQueue />} />
            <Route path="/jobs/:id" element={<JobDetail />} />
          </Routes>
        </Layout>
      </Router>
    </ThemeProvider>
  );
}

export default App;

