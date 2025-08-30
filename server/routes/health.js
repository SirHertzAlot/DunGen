const express = require('express');
const fetch = require('node-fetch');

const router = express.Router();

/**
 * Fetches the health status of a specific service.
 * @param {string} id - The unique ID of the service.
 * @param {string} url - The URL of the service health endpoint.
 * @param {string} serviceName - The name of the service.
 * @returns {Promise<Object>} - The health status of the service.
 */
async function fetchServiceHealth(id, url, serviceName) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Service ${serviceName} returned status ${response.status}`);
    }
    const data = await response.json();
    return {
      id,
      service: serviceName,
      status: data.status || 'unknown',
      message: data.message || 'No message provided',
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    return {
      id,
      service: serviceName,
      status: 'error',
      message: error.message,
      timestamp: new Date().toISOString(),
    };
  }
}

// Define the health check for all services
const services = [
  { id: 'redis', name: 'Redis', url: 'http://localhost:6379/health' },
  { id: 'database', name: 'Database', url: 'http://localhost:5432/health' },
  { id: 'api-gateway', name: 'API Gateway', url: 'http://localhost:3000/health' },
  { id: 'mmorpg-backend', name: 'MMORPG-Backend', url: 'http://localhost:4000/status' }, // Added MMORPG-Backend service
];

router.get('/health', async (req, res) => {
  try {
    // Fetch health status for all services
    const healthStatuses = await Promise.all(
      services.map((service) =>
        fetchServiceHealth(service.id, service.url, service.name)
      )
    );

    res.json(healthStatuses);
  } catch (error) {
    console.error('Error fetching health statuses:', error);
    res.status(500).json({ error: 'Failed to fetch health statuses' });
  }
});

module.exports = router;
