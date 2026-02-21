import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';

export default function MatchInspector() {
  const [candidateId, setCandidateId] = useState('');
  const [userToken, setUserToken] = useState('');
  const [mode, setMode] = useState<'direct' | 'search'>('direct');
  
  const { recentPairs, syntheticUsers } = useAppStore();

  // Search results when using user token
  const { data: searchResults, refetch: runSearch } = useQuery({
    queryKey: ['search', userToken],
    queryFn: () => api.search(userToken, { top_k: 20 }),
    enabled: false, // Only run when manually triggered
  });

  const handleDirectInspection = () => {
    if (candidateId.trim()) {
      // TODO: Implement candidate inspection
      console.log('Inspecting candidate:', candidateId);
    }
  };

  const handleUserSearch = () => {
    if (userToken.trim()) {
      runSearch();
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Match Inspector</h1>
        <p className="mt-1 text-sm text-gray-600">
          Deep-dive analysis of candidate pairs
        </p>
      </div>

      {/* Mode Selector */}
      <div className="mb-8">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            {[
              { key: 'direct', label: 'Direct Entry' },
              { key: 'search', label: 'Search Mode' },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setMode(tab.key as 'direct' | 'search')}
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Input Panel */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            {mode === 'direct' ? 'Candidate Selection' : 'User Search'}
          </h2>

          {mode === 'direct' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Candidate ID
                </label>
                <input
                  type="text"
                  value={candidateId}
                  onChange={(e) => setCandidateId(e.target.value)}
                  placeholder="Enter candidate ID"
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              
              <button
                onClick={handleDirectInspection}
                disabled={!candidateId.trim()}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                Inspect Pair
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  User Token
                </label>
                <input
                  type="text"
                  value={userToken}
                  onChange={(e) => setUserToken(e.target.value)}
                  placeholder="Enter user token"
                  className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                />
              </div>
              
              {/* Synthetic Users Quick Select */}
              {syntheticUsers.length > 0 && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Or select synthetic user
                  </label>
                  <select
                    value=""
                    onChange={(e) => setUserToken(e.target.value)}
                    className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
                  >
                    <option value="">Select user...</option>
                    {syntheticUsers.map((user, index) => (
                      <option key={user.user_token} value={user.user_token}>
                        User {index + 1} ({user.primary_cluster})
                      </option>
                    ))}
                  </select>
                </div>
              )}
              
              <button
                onClick={handleUserSearch}
                disabled={!userToken.trim()}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                Run Search
              </button>
            </div>
          )}

          {/* Recent Pairs */}
          {recentPairs.length > 0 && (
            <div className="mt-8">
              <h3 className="text-sm font-medium text-gray-700 mb-3">
                Recently Inspected
              </h3>
              <div className="space-y-2">
                {recentPairs.map((pair, index) => (
                  <button
                    key={index}
                    onClick={() => setCandidateId(pair.candidateId)}
                    className="block w-full text-left p-2 text-sm border border-gray-200 rounded hover:bg-gray-50"
                  >
                    {pair.candidateId.slice(0, 16)}...
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Panel */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Inspection Results
            </h2>

            {mode === 'search' && searchResults && (
              <div className="space-y-4">
                <h3 className="font-medium">
                  Search Results ({searchResults.candidates.length})
                </h3>
                <div className="space-y-3">
                  {searchResults.candidates.map((candidate, index) => (
                    <div
                      key={candidate.candidate_id}
                      className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setCandidateId(candidate.candidate_id);
                        setMode('direct');
                      }}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-medium">Candidate #{index + 1}</span>
                        <div className="text-sm">
                          <span className="bg-green-100 text-green-800 px-2 py-1 rounded mr-2">
                            {candidate.combined_score.toFixed(3)}
                          </span>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600 mb-2">
                        {candidate.intents[0] || 'No intent specified'}
                      </p>
                      <p className="text-xs text-gray-500">
                        ID: {candidate.candidate_id}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!candidateId && !searchResults && (
              <div className="text-center py-12 text-gray-500">
                <p>Enter a candidate ID or run a user search to begin inspection</p>
              </div>
            )}

            {candidateId && mode === 'direct' && (
              <div className="text-center py-12 text-gray-500">
                <p>Candidate inspection view coming soon</p>
                <p className="text-sm mt-2">
                  Will show side-by-side user comparison, score breakdown, and timeline
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}