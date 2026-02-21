import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import UserBuilder from '../components/UserBuilder';
import SimulationOutput from '../components/SimulationOutput';
import type { SyntheticUser } from '../types';

type SimulatorMode = 'single' | 'batch' | 'ab';

export default function Simulator() {
  const [mode, setMode] = useState<SimulatorMode>('single');
  const [currentUser, setCurrentUser] = useState<SyntheticUser | null>(null);
  
  const { addSyntheticUser, syntheticUsers } = useAppStore();

  // Fetch clusters for presets
  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.getClusters(),
  });

  const handleUserRegistered = (user: SyntheticUser) => {
    setCurrentUser(user);
    addSyntheticUser(user);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Simulator</h1>
        <p className="mt-1 text-sm text-gray-600">
          Create synthetic users and simulate the matching funnel
        </p>
      </div>

      {/* Mode Selector */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'single', label: 'Single User' },
              { key: 'batch', label: 'Batch' },
              { key: 'ab', label: 'A/B Test' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key as SimulatorMode)}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  mode === tab.key
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {mode === 'single' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* User Builder */}
          <div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                User Builder
              </h2>
              <UserBuilder 
                onUserRegistered={handleUserRegistered}
                clusters={clustersData?.clusters || []}
              />
            </div>
          </div>

          {/* Simulation Output */}
          <div>
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-medium text-gray-900 mb-6">
                Simulation Output
              </h2>
              {currentUser ? (
                <SimulationOutput user={currentUser} />
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>Register a user to begin simulation</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === 'batch' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Batch Simulation
          </h2>
          <div className="text-center py-8 text-gray-500">
            <p>Batch simulation mode coming soon</p>
            <p className="text-sm mt-2">
              Generate multiple users and run population-wide analysis
            </p>
          </div>
        </div>
      )}

      {mode === 'ab' && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            A/B Test Simulator
          </h2>
          <div className="text-center py-8 text-gray-500">
            <p>A/B testing mode coming soon</p>
            <p className="text-sm mt-2">
              Compare scoring variants across the same population
            </p>
          </div>
        </div>
      )}

      {/* Synthetic Users Pool */}
      {syntheticUsers.length > 0 && (
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Synthetic Users Pool ({syntheticUsers.length})
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {syntheticUsers.map((user, index) => (
                <div
                  key={user.user_token}
                  className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => setCurrentUser(user)}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-900">
                      User {index + 1}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {user.primary_cluster}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 truncate">
                    {user.intents[0] || 'No intent specified'}
                  </p>
                  <div className="mt-2 text-xs text-gray-500">
                    Token: {user.user_token.slice(0, 8)}...
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}