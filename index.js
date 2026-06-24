import express from 'express';
import cors from 'cors';
import { startWhatsAppClient, getQR, getTasks } from './whatsapp.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '200mb', extended: true }));

// Catch-all error handler for body parser / socket errors
app.use((err, req, res, next) => {
  console.error(`🚨 Express Error: ${err.message} (Type: ${err.type || 'Unknown'})`);
  res.status(err.status || 500).json({ error: err.message });
});

process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});

// Expose the current QR code for the frontend to scan
app.get('/api/qr', (req, res) => {
  const qr = getQR();
  if (!qr) {
    return res.json({ status: 'connected_or_generating', qr: null });
  }
  res.json({ status: 'waiting_for_scan', qr });
});

// Stores the latest Google Sheets data pushed by Apps Script
let latestSheetsData = null;

// Endpoint for Apps Script to push data
app.post('/api/sheets/sync', (req, res) => {
  latestSheetsData = req.body;
  const sizeKb = req.headers['content-length'] ? (parseInt(req.headers['content-length']) / 1024).toFixed(2) : 'Unknown';
  console.log(`📊 Received Google Sheets sync (${new Date().toLocaleTimeString()}) - Payload size: ${sizeKb} KB`);
  res.json({ success: true });
});

// Endpoint for React frontend to fetch the latest data
app.get('/api/sheets/data', (req, res) => {
  res.json(latestSheetsData || {});
});

// Route to get generated tasks
app.get('/api/tasks', (req, res) => {
  res.json({ tasks: getTasks() });
});

app.listen(PORT, () => {
  console.log(`🚀 Task OS Backend running on http://localhost:${PORT}`);
  console.log('Starting WhatsApp Client...');
  startWhatsAppClient();
});
