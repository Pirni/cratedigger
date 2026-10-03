import express from 'express';

import { requireBearer } from './features/auth/middleware.js';
import authRouter from './features/auth/route.js';
import downloadRouter from './features/downloads/route.js';
import syncRouter from './features/sync/route.js';
import userRouter from './features/users/route.js';

const app = express();

app.use(express.json());
app.use('/api/auth', authRouter);
app.use('/api/users', requireBearer, userRouter);
app.use('/api/downloads', requireBearer, downloadRouter);
app.use('/api/sync', requireBearer, syncRouter);

export default app;
