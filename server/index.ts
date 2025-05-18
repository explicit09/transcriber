import 'dotenv/config';
import express, { type Request, type Response, type NextFunction } from "express";
import type { Response as ExpressResponse } from 'express-serve-static-core';
import { Server, createServer } from 'http';
import rateLimit from 'express-rate-limit';
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import dotenv from 'dotenv';
import { ensureVectorIndex } from './search';
import { startTaggingJob } from './tagger';

// Load environment variables from .env file
dotenv.config();

const app = express();

// Increase body size limits to handle large file uploads
app.use(express.json({ limit: '500mb' }));
app.use(express.urlencoded({ extended: false, limit: '500mb' }));

const searchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
});
app.use('/api/search', searchLimiter);

// Simple request logging middleware
app.use((req: Request, _res: Response, next: NextFunction) => {
  if (req.path.startsWith("/api")) {
    log(`${req.method} ${req.path}`);
  }
  next();
});

// CORS configuration
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

(async () => {
  await ensureVectorIndex();
  startTaggingJob();
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: ExpressResponse, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on port 5000
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = process.env.PORT ? parseInt(process.env.PORT) : 5000;
  server.listen(port, () => {
    log(`serving on port ${port}`);
  });
})();
