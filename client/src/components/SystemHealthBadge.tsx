import React from 'react';

interface HealthData {
  status: string;
  service: string;
  message: string;
  timestamp: string;
}

interface SystemHealthBadgeProps {
  health: HealthData;
}

export const SystemHealthBadge: React.FC<SystemHealthBadgeProps> = ({ health }) => {
  // Determine badge color based on status
  let badgeColor = 'green'; // Default to green for "ok"
  if (health.status !== 'ok') {
    badgeColor = 'red'; // Set to red for any other status
  }

  return (
    <div
      style={{
        backgroundColor: badgeColor,
        color: 'white',
        padding: '8px',
        borderRadius: '4px',
        display: 'inline-block',
        margin: '4px',
      }}
    >
      {health.message} {/* Display the health message */}
    </div>
  );
};