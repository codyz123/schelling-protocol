import React, { useState } from 'react';
import { useAppStore } from '../lib/store';
import { api } from '../lib/api';

export default function AuthGate() {
  const [token, setToken] = useState('');
  const [serverUrl, setServerUrl] = useState('http://localhost:3000');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const { setAdminToken, setServerUrl: setStoreServerUrl } = useAppStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');

    try {
      // Update API base URL
      setStoreServerUrl(serverUrl);
      api.setBaseUrl(serverUrl);
      api.setAdminToken(token);
      
      // Test the connection with the health endpoint
      const health = await api.getHealth();
      
      if (health.status !== 'healthy') {
        throw new Error(`Server reports status: ${health.status}`);
      }
      
      // If successful, save token
      setAdminToken(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect to server');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900">
            Schelling Protocol
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Testing Dashboard
          </p>
        </div>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div>
              <label htmlFor="serverUrl" className="block text-sm font-medium text-gray-700">
                Server URL
              </label>
              <div className="mt-1">
                <input
                  id="serverUrl"
                  name="serverUrl"
                  type="url"
                  required
                  value={serverUrl}
                  onChange={(e) => setServerUrl(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="http://localhost:3000"
                />
              </div>
            </div>

            <div>
              <label htmlFor="token" className="block text-sm font-medium text-gray-700">
                Admin Token
              </label>
              <div className="mt-1">
                <input
                  id="token"
                  name="token"
                  type="password"
                  required
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  className="appearance-none block w-full px-3 py-2 border border-gray-300 rounded-md placeholder-gray-400 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm"
                  placeholder="Enter a registered user token"
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Use a registered user&apos;s token. Analytics requires valid user auth.
              </p>
            </div>

            {error && (
              <div className="rounded-md bg-red-50 p-4">
                <div className="flex">
                  <div className="ml-3">
                    <h3 className="text-sm font-medium text-red-800">
                      Connection Error
                    </h3>
                    <div className="mt-2 text-sm text-red-700">
                      {error}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
              >
                {isLoading ? 'Connecting...' : 'Connect'}
              </button>
            </div>
          </form>

          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300" />
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white text-gray-500">
                  For testing purposes only
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
