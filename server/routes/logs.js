const express = require('express');
const fs = require('fs');
const path = require('path');

const router = express.Router();

router.get('/error', (req, res) => {
  const logFilePath = path.join(__dirname, '../../logs/error.log');

  fs.readFile(logFilePath, 'utf8', (err, data) => {
    if (err) {
      console.error('Error reading log file:', err);
      return res.status(500).json({ error: 'Failed to read log file' });
    }

    const logEntries = data
      .split('\n')
      .filter((line) => line.trim() !== '')
      .map((line) => {
        const [timestamp, level, ...messageParts] = line.split(' ');
        return {
          timestamp,
          level,
          message: messageParts.join(' '),
        };
      });

    res.json(logEntries);
  });
});

module.exports = router;
