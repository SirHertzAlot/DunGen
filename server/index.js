const express = require('express');
const logsRouter = require('./routes/logs');
const healthRouter = require('./routes/health');
const ecsRouter = require('./routes/ecs');
import logger from './utils/logger';

const app = express();
const PORT = 3000;

app.use('/api/logs', logsRouter);
app.use('/api/health', healthRouter);
app.use('/api/ecs', ecsRouter);

logger.error('This is a test error log entry.');

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

module.exports = app;