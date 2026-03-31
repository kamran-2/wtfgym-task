const express = require('express');

// Factory: receives the live simulator instance from index.js
module.exports = function simulatorRoutes(simulator) {
  const router = express.Router();

  // GET /api/simulator/status
  router.get('/status', (req, res) => {
    res.json(simulator.getStatus());
  });

  // POST /api/simulator/control  { action: 'pause'|'resume'|'speed'|'reset', speed: 1|5|10 }
  router.post('/control', (req, res) => {
    const { action, speed } = req.body;
    switch (action) {
      case 'pause':  simulator.pause();  break;
      case 'resume': simulator.resume(); break;
      case 'speed':  simulator.setSpeed(Number(speed)); break;
      case 'reset':  simulator.reset();  break;
      default:
        return res.status(400).json({ error: 'Unknown action. Use: pause|resume|speed|reset' });
    }
    res.json(simulator.getStatus());
  });

  return router;
};
