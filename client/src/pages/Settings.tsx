import { useState, useEffect } from 'react';

export default function Settings() {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Simulate a delay for the service response
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 2000); // 2-second delay

    return () => clearTimeout(timer); // Cleanup the timer on unmount
  }, []);

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <div className="max-w-6xl mx-auto p-8">
        {isLoading ? (
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-gray-300 mx-auto mb-4"></div>
            <p className="text-gray-300">Loading settings...</p>
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-bold mb-8">Settings</h1>
            <p className="text-gray-300">This page is under construction.</p>
          </>
        )}
      </div>
    </div>
  );
}
