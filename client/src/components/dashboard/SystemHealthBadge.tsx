import React from 'react';

interface HealthData {
  id?: string; // Allow optional id
  status: string;
  service: string;
  message: string;
  timestamp: string;
}

interface SystemHealthBadgeProps {
  health?: HealthData[]; // Array of health data
  isLoading: boolean;
}

export const SystemHealthBadge: React.FC<SystemHealthBadgeProps> = ({ health, isLoading }) => {
  if (isLoading) {
    return (
      <div className="flex flex-wrap gap-4">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-300"></div>
        <p className="text-gray-300">Waiting for service responses...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-4">
      {health?.map((serviceHealth, index) => {
        const badgeColor = serviceHealth.status === 'ok' ? 'green' : 'red';

        return (
          <div
            key={serviceHealth.id || `health-${index}`} // Use id or fallback to index
            style={{
              backgroundColor: badgeColor,
              color: 'white',
              padding: '8px',
              borderRadius: '4px',
              display: 'inline-block',
              margin: '4px',
            }}
          >
            <strong>{serviceHealth.service}</strong>
            <div>ID: {serviceHealth.id || `health-${index}`}</div> {/* Display fallback ID */}
            <div>{serviceHealth.message}</div>
          </div>
        );
      })}
    </div>
  );
};
