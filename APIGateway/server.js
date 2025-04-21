const express = require('express');
const httpProxy = require('http-proxy');
const morgan = require('morgan');
const cors = require('cors');
require('dotenv').config();

const app = express();
const proxy = httpProxy.createProxyServer({ changeOrigin: true });

const serviceAUrl = process.env.USER_MANAGEMENT_SERVICE_URL || 'http://localhost:5001';
const serviceBUrl = process.env.DOCTOR_MANAGEMENT_SERVICE_URL || 'http://localhost:5002';
const serviceCUrl = process.env.APPOINTMENT_MANAGEMENT_SERVICE_URL || 'http://localhost:5003';
const serviceDUrl = process.env.TRANSPORT_MANAGEMENT_SERVICE_URL || 'http://localhost:5004';
const serviceEUrl = process.env.PAYMENT_MANAGEMENT_SERVICE_URL || 'http://localhost:5005';
const serviceFUrl = process.env.NOTIFICATION_MANAGEMENT_SERVICE_URL || 'http://localhost:5006';

// Middlewares
app.use(cors(["http://localhost:3000", "https://helodr-saisobila.vercel.app"])); // Allow cross-origin requests
app.use(morgan('combined')); // Detailed request logging

// Proxy error handler (global)
proxy.on('error', (err, req, res) => {
  console.error(`Proxy error for ${req.url}:`, err.message);
  if (!res.headersSent) {
    res.status(502).json({ error: 'Bad Gateway', message: err.message });
  }
});

// Log proxy request details
proxy.on('proxyReq', (proxyReq, req, res, options) => {
  console.log(`Proxying to ${options.target}: ${req.method} ${req.url}`);
});

// Timeout middleware (optional)
app.use((req, res, next) => {
  res.setTimeout(150000, () => {
    console.warn(`Request timed out: ${req.method} ${req.url}`);
    res.status(504).json({ error: 'Gateway Timeout' });
  });
  next();
});

// Routes
app.use('/api/users', (req, res) => {
  console.log(`Routing /api/users → ${serviceAUrl}`);
  proxy.web(req, res, { target: serviceAUrl });
});

app.use('/api/doctors', (req, res) => {
  console.log(`Routing /api/doctors → ${serviceBUrl}`);
  proxy.web(req, res, { target: serviceBUrl });
});


app.use('/api/appoinment', (req, res) => {
  console.log(`Routing /api/appoinment → ${serviceCUrl}`);
  proxy.web(req, res, { target: serviceCUrl });
});


app.use('/api/transport', (req, res) => {
  console.log(`Routing /api/transport → ${serviceDUrl}`);
  proxy.web(req, res, { target: serviceDUrl });
});


app.use('/api/payment', (req, res) => {
  console.log(`Routing /api/payment → ${serviceEUrl}`);
  proxy.web(req, res, { target: serviceEUrl });
});


app.use('/api/notification', (req, res) => {
  console.log(`Routing /api/notification → ${serviceFUrl}`);
  proxy.web(req, res, { target: serviceFUrl });
});

// app.use('/api/info', (req, res) => {
//   console.log(`Routing /api/info → ${serviceBUrl}`);
//   proxy.web(req, res, { target: serviceBUrl });
// });

// Health check
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'API Gateway is running' });
});

// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 API Gateway listening on port ${PORT}`);
});
