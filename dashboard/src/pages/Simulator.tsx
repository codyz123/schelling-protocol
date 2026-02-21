import React, { useState, useCallback } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import UserBuilder from '../components/UserBuilder';
import SimulationOutput from '../components/SimulationOutput';
import { CLUSTER_CENTROIDS, type SyntheticUser } from '../types';

type SimulatorMode = 'single' | 'batch';

export default function Simulator() {
  const [mode, setMode] = useState<SimulatorMode>('single');
  const [currentUser, setCurrentUser] = useState<SyntheticUser | null>(null);
  const [batchSize, setBatchSize] = useState(5);
  const [batchCluster, setBatchCluster] = useState('matchmaking');
  const [batchLog, setBatchLog] = useState<string[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const batchAbortRef = React.useRef(false);
  
  const { addSyntheticUser, syntheticUsers, removeSyntheticUser, clearSyntheticUsers } = useAppStore();

  // Fetch clusters for presets
  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.getClusters(),
  });

  const handleUserRegistered = (user: SyntheticUser) => {
    setCurrentUser(user);
    addSyntheticUser(user);
  };

  // Batch registration with rate limiting (200ms delay between registrations)
  const runBatch = useCallback(async () => {
    if (batchRunning) return;
    setBatchRunning(true);
    setBatchLog([]);
    batchAbortRef.current = false;
    
    const centroid = CLUSTER_CENTROIDS[batchCluster];
    if (!centroid) {
      setBatchLog(['Error: Unknown cluster']);
      setBatchRunning(false);
      return;
    }

    const MAX_BATCH = 20; // Hard cap to prevent DDoS
    const actualSize = Math.min(batchSize, MAX_BATCH);
    const DELAY_MS = 200; // Rate limit: 5 req/sec max

    for (let i = 0; i < actualSize; i++) {
      if (batchAbortRef.current) {
        setBatchLog(prev => [...prev, `— Batch cancelled at ${i}/${actualSize}`]);
        break;
      }
      try {
        // Add noise to centroid
        const intentEmbedding = centroid.map(v => 
          Math.max(-1, Math.min(1, v + (Math.random() - 0.5) * 0.4))
        );
        const traitEmbedding = Array.from({length: 50}, () => 
          +(Math.random() * 0.6 - 0.3).toFixed(2)
        );

        const result = await api.register({
          intents: [`Batch user ${i + 1} for ${batchCluster}`],
          intent_embedding: intentEmbedding,
          embedding: traitEmbedding,
          city: 'Brooklyn',
          age_range: '25-34',
          description: `Synthetic batch user for ${batchCluster} testing`,
          agent_model: 'testing-ui-batch',
          verification_level: 'anonymous',
          status: 'active',
        });

        const user: SyntheticUser = {
          user_token: result.user_token,
          intent_embedding: intentEmbedding,
          trait_embedding: traitEmbedding,
          intents: [`Batch user ${i + 1} for ${batchCluster}`],
          primary_cluster: batchCluster,
          reputation_score: 0.5,
          status: 'active',
          last_registered_at: new Date().toISOString(),
        };
        addSyntheticUser(user);
        setBatchLog(prev => [...prev, `✓ User ${i + 1}/${actualSize} registered: ${result.user_token.slice(0, 12)}...`]);
        
        // Rate limiting delay
        if (i < actualSize - 1) {
          await new Promise(r => setTimeout(r, DELAY_MS));
        }
      } catch (err) {
        setBatchLog(prev => [...prev, `✗ User ${i + 1}/${actualSize} failed: ${err instanceof Error ? err.message : 'Unknown error'}`]);
      }
    }
    
    setBatchLog(prev => [...prev, `— Batch complete: ${actualSize} users attempted`]);
    setBatchRunning(false);
  }, [batchSize, batchCluster, batchRunning, addSyntheticUser]);

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
          <p className="text-sm text-gray-600 mb-6">
            Register multiple synthetic users at once for a specific cluster.
            Rate-limited to 5 registrations/second, max 20 per batch.
          </p>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Batch Size (max 20)
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={batchSize}
                onChange={(e) => setBatchSize(Math.min(20, Math.max(1, parseInt(e.target.value) || 1)))}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Target Cluster
              </label>
              <select
                value={batchCluster}
                onChange={(e) => setBatchCluster(e.target.value)}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
              >
                {Object.keys(CLUSTER_CENTROIDS).map(id => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex space-x-3">
            <button
              onClick={runBatch}
              disabled={batchRunning}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {batchRunning ? 'Running...' : `Register ${Math.min(batchSize, 20)} Users`}
            </button>
            {batchRunning && (
              <button
                onClick={() => { batchAbortRef.current = true; }}
                className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
              >
                Cancel
              </button>
            )}
          </div>

          {batchLog.length > 0 && (
            <div className="mt-6 bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Batch Log</h3>
              <div className="space-y-1 font-mono text-xs">
                {batchLog.map((line, i) => (
                  <div key={i} className={line.startsWith('✗') ? 'text-red-600' : 'text-gray-700'}>
                    {line}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Synthetic Users Pool */}
      {syntheticUsers.length > 0 && (
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">
                Synthetic Users Pool ({syntheticUsers.length})
              </h2>
              <button
                onClick={() => clearSyntheticUsers()}
                className="text-sm text-red-600 hover:text-red-700"
              >
                Clear All
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {syntheticUsers.map((user, index) => (
                <div
                  key={user.user_token}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer ${
                    currentUser?.user_token === user.user_token 
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200'
                  }`}
                  onClick={() => {
                    setCurrentUser(user);
                    setMode('single');
                  }}
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
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-xs text-gray-500 font-mono">
                      {user.user_token.slice(0, 8)}...
                    </span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeSyntheticUser(user.user_token);
                        if (currentUser?.user_token === user.user_token) {
                          setCurrentUser(null);
                        }
                      }}
                      className="text-xs text-red-500 hover:text-red-700"
                    >
                      Remove
                    </button>
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
