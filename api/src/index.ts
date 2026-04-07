import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import morgan from 'morgan';

import authRouter from './routes/auth';
import { errorHandler } from './middleware/errors';
import { generalLimiter } from './middleware/rateLimiter';

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  }),
);
app.use(express.json({ limit: '10mb' }));
app.use(morgan(process.env.APP_ENV === 'production' ? 'combined' : 'dev'));
app.use(generalLimiter);

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/auth', authRouter);

// ─── Error handling ───────────────────────────────────────────────────────────

app.use(errorHandler);

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = parseInt(process.env.PORT ?? '3000', 10);

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`SportsAdmin API listening on port ${PORT} [${process.env.APP_ENV ?? 'development'}]`);
  });
}

export default app;
