import { handle } from 'hono/aws-lambda';
import { createApp, authenticate, requireAdmin } from './app.js';
import authRoutes from './routes/auth.js';
import meRoutes from './routes/me.js';
import snackRoutes from './routes/snacks.js';
import adminRoutes from './routes/admin.js';

const app = createApp();

app.use('*', async (c, next) => {
  await next();
  // The API is same-origin behind CloudFront, so nothing here should ever be
  // cached or embedded elsewhere.
  c.header('Cache-Control', 'no-store');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
});

app.onError((err, c) => {
  console.error('Unhandled API error', err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

app.get('/api/health', (c) => c.json({ ok: true, stage: process.env.STAGE ?? 'unknown' }));

// Public: signing in.
app.route('/', authRoutes);

// Everything else requires a session.
app.use('/api/me/*', authenticate);
app.use('/api/me', authenticate);
app.use('/api/snacks/*', authenticate);
app.use('/api/snacks', authenticate);
app.use('/api/notifications/*', authenticate);
app.use('/api/notifications', authenticate);
app.use('/api/push/*', authenticate);
app.use('/api/admin/*', authenticate, requireAdmin);

app.route('/', meRoutes);
app.route('/', snackRoutes);
app.route('/', adminRoutes);

app.notFound((c) => c.json({ error: 'Not found' }, 404));

export const handler = handle(app);
