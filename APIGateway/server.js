const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const http = require('http');
const https = require('https');
dotenv.config();

// Configure global agent settings
http.globalAgent.keepAlive = true;
https.globalAgent.keepAlive = true;
http.globalAgent.maxSockets = Infinity;
https.globalAgent.maxSockets = Infinity;

const app = express();

// Enhanced CORS configuration
app.use(cors({
  origin: true,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing with increased limits
app.use(bodyParser.json({ 
  limit: '10mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(bodyParser.urlencoded({ 
  extended: true, 
  limit: '10mb'
}));

// Enhanced logging
app.use(morgan('dev'));

// Request debug middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  console.log('Headers:', req.headers);
  if (req.body) console.log('Body:', req.body);
  next();
});

// Proxy middleware with proper body handling
const apiProxy = createProxyMiddleware({
  target: 'http://localhost:5001',
  changeOrigin: true,
  pathRewrite: { '^/api': '' },
  onProxyReq: (proxyReq, req) => {
    if (req.body) {
      let bodyData = JSON.stringify(req.body);
      if (!proxyReq.getHeader('content-type')) {
        proxyReq.setHeader('Content-Type', 'application/json');
      }
      proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
      proxyReq.write(bodyData);
      proxyReq.end();
    }
  },
  onError: (err, req, res) => {
    console.error('Proxy Error:', err);
    res.status(502).json({ 
      error: 'Bad Gateway',
      message: 'Connection to backend service failed',
      details: err.message
    });
  },
  proxyTimeout: 30000,
  timeout: 30000,
  secure: false, // Disable SSL verification for local development
  preserveHeaderKeyCase: true,
  followRedirects: true
});

app.use((req, res, next) => {
  req.socket.on('error', (err) => {
    console.error('Socket Error:', err);
  });
  next();
});

// Apply proxy
app.use('/api', apiProxy);

// Health endpoint
app.get('/gateway-status', (req, res) => {
  res.json({ 
    status: 'online',
    timestamp: new Date().toISOString()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(`[${new Date().toISOString()}] Gateway Error:`, err);
  res.status(500).json({
    error: 'Internal Server Error',
    message: err.message
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`\nAPI Gateway running on port ${PORT}`);
  console.log(`Forwarding requests to http://localhost:5001`);
  console.log(`Health check: http://localhost:${PORT}/gateway-status\n`);
});