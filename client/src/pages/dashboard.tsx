// client/src/pages/dashboard.tsx
import React, { useState, useEffect } from 'react';
import { Grid, Card, CardContent, Typography, TextField, Button } from '@mui/material';
import Navigation from '../components/Navigation'; // Import the Navigation component

const Dashboard = () => {
  const [seed, setSeed] = useState('');
  const [worldData, setWorldData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load seed from local storage on component mount
    const storedSeed = localStorage.getItem('dungenSeed');
    if (storedSeed) {
      setSeed(storedSeed);
    }
  }, []);

  useEffect(() => {
    if (seed) {
      localStorage.setItem('dungenSeed', seed);
    }
  }, [seed]);

  const generateWorld = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/generate?seed=${seed}`);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      const data = await response.json();
      setWorldData(data);
    } catch (e: any) {
      setError(`Failed to generate world: ${e.message}`);
      console.error("World generation error:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSeed(event.target.value);
  };

  return (
    <>
      <Navigation /> {/* Add the Navigation component at the top */}
      <Grid container spacing={3} padding={2}>
        <Grid item xs={12}>
          <Typography variant="h4">DunGen Dashboard</Typography>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">World Generation</Typography>
              <TextField
                label="Seed"
                value={seed}
                onChange={handleSeedChange}
                fullWidth
                margin="normal"
              />
              <Button variant="contained" color="primary" onClick={generateWorld} disabled={loading}>
                {loading ? 'Generating...' : 'Generate World'}
              </Button>
              {error && (
                <Typography color="error" variant="body2">{error}</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6">World Data</Typography>
              {worldData ? (
                <pre>{JSON.stringify(worldData, null, 2)}</pre>
              ) : (
                <Typography variant="body2">No world data generated yet.</Typography>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </>
  );
};

export default Dashboard;