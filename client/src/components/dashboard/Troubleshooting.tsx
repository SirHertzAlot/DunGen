import { useEffect, useState } from 'react';

interface LogEntry {
  timestamp: string;
  level: string;
  message: string;
}

export function Troubleshooting() {
  const [logEntries, setLogEntries] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const fetchLogs = async () => {
      try {
        const response = await fetch('/api/logs/error'); // Endpoint to fetch error logs
        if (!response.ok) {
          throw new Error('Failed to fetch logs');
        }
        const logs = await response.json();
        setLogEntries(logs);
      } catch (error) {
        console.error('Error fetching logs:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchLogs();
  }, []);

  if (isLoading) {
    return <div className="text-gray-400">Loading troubleshooting data...</div>;
  }

  if (logEntries.length === 0) {
    return <div className="text-green-500">No issues detected. All systems are operational.</div>;
  }

  return (
    <div className="bg-gray-800 p-6 rounded-lg">
      <h2 className="text-xl font-bold text-red-500 mb-4">Troubleshooting</h2>
      <ul className="space-y-4">
        {logEntries.map((entry, index) => (
          <li key={index} className="bg-gray-700 p-4 rounded">
            <p className="text-sm text-gray-400">
              <strong>Timestamp:</strong> {entry.timestamp}
            </p>
            <p className="text-sm text-gray-400">
              <strong>Level:</strong> {entry.level}
            </p>
            <p className="text-sm text-gray-300">
              <strong>Message:</strong> {entry.message}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}
