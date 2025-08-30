const express = require('express');
const router = express.Router();

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      ecs: {
        entityCount: 42,
        frameTime: 16.7,
      },
      activeCombats: 3,
      unity: {
        connected: true,
      },
    },
  });
});

module.exports = router;
