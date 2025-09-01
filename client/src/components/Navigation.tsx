import React from 'react';
import { AppBar, Toolbar, Typography, Button } from '@mui/material';
import { Link } from 'react-router-dom'; // Assuming you are using React Router

const Navigation = () => {
  return (
    <AppBar position="static">
      <Toolbar>
        <Typography variant="h6" style={{ flexGrow: 1 }}>
          DunGen
        </Typography>
        <Button color="inherit" component={Link} to="/">
          Dashboard
        </Button>
        <Button color="inherit" component={Link} to="/world-map">
          World Map
        </Button>
        <Button color="inherit" component={Link} to="/settings">
          Settings
        </Button>
        {/* Add more links as needed */}
      </Toolbar>
    </AppBar>
  );
};

export default Navigation;