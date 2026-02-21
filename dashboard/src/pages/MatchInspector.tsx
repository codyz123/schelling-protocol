import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAppStore } from '../lib/store';
import type { SearchResult, EvaluateResult } from '../types';

export default function MatchInspector() {
  const [candidateId, setCandidateId] = useState('');
  const [userToken, setUserToken] = useState('');
  const [mode, setMode] = useState<'direct' | 'search'>('direct');
  const [inspectionResult, setInspectionResult] = useState<EvaluateResult | null>(null);
  
  const { recentPairs, addRecentPair, syntheticUsers } = useAppStore();

  // Search results when using user token
  const { data: searchResults, refetch: runSearch, isLoading: searchLoading, error: searchError } = useQuery({
    queryKey: ['inspector-search', userToken],
    queryFn: () => api.search(userToken, { top_k: 20 }),
    enabled: false,
  });

  // Evaluate a specific candidate pair
  const inspectMutation = useMutation({
    mutationFn: async ({ token, candId }: { token: string; candId: string }) => {
      const results = await api.evaluate(token, [candId]);
      return results[0] || null;
    },
    onSuccess: (result) => {
      setInspectionResult(result);
      if (candidateId) {
        addRecentPair(candidateId);
      }
    },
  });

  const handleDirectInspection = () => {
    if (candidateId.trim() && userToken.trim()) {
      inspectMutation.mutate({ token: userToken, candId: candidateId });
    }
  };

  const handleUserSearch = () => {
    if (userToken.trim()) {
      runSearch();
    }
  };

  const handleCandidateClick = (candidate: SearchResult) => {
    setCandidateId(candidate.candidate_id);
    inspectMutation.mutate({ token: userToken, candId: candidate.candidate_id });
    setMode('direct');
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
            {mode === 'direct' ? 'Pair Selection' : 'User Search'}
          </h2>

          {/* User Token (needed for both modes) */}
          <div className="mb-4">
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
            
            {/* Quick select from synthetic users */}
            {syntheticUsers.length > 0 && (
              <select
                value=""
                onChange={(e) => setUserToken(e.target.value)}
                className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm mt-2"
              >
                <option value="">Select synthetic user...</option>
                {syntheticUsers.map((user, index) => (
                  <option key={user.user_token} value={user.user_token}>
                    User {index + 1} ({user.primary_cluster})
                  </option>
                ))}
              </select>
            )}
          </div>

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
                disabled={!candidateId.trim() || !userToken.trim() || inspectMutation.isPending}
                className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {inspectMutation.isPending ? 'Inspecting...' : 'Inspect Pair'}
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <button
                onClick={handleUserSearch}
                disabled={!userToken.trim() || searchLoading}
                className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {searchLoading ? 'Searching...' : 'Run Search'}
              </button>
            </div>
          )}

          {/* Error display */}
          {inspectMutation.error && (
            <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700">
              {inspectMutation.error instanceof Error ? inspectMutation.error.message : 'Inspection failed'}
            </div>
          )}
          {searchError && (
            <div className="mt-4 p-3 bg-red-50 rounded text-sm text-red-700">
              {searchError instanceof Error ? searchError.message : 'Search failed'}
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
                    onClick={() => {
                      setCandidateId(pair.candidateId);
                      setMode('direct');
                    }}
                    className="block w-full text-left p-2 text-sm border border-gray-200 rounded hover:bg-gray-50 font-mono"
                  >
                    {pair.candidateId.slice(0, 20)}...
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

            {/* Search Results */}
            {mode === 'search' && searchResults && (
              <div className="space-y-4 mb-6">
                <h3 className="font-medium">
                  Search Results ({searchResults.candidates.length})
                </h3>
                {searchResults.candidates.length === 0 ? (
                  <p className="text-sm text-gray-500">No candidates found for this user.</p>
                ) : (
                  <div className="space-y-3">
                    {searchResults.candidates.map((candidate, index) => (
                      <div
                        key={candidate.candidate_id}
                        className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                        onClick={() => handleCandidateClick(candidate)}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-medium">Candidate #{index + 1}</span>
                          <div className="text-sm">
                            <span className="bg-green-100 text-green-800 px-2 py-1 rounded mr-2">
                              {(candidate.compatibility_score ?? 0).toFixed(3)}
                            </span>
                          </div>
                        </div>
                        <p className="text-xs text-gray-500 font-mono">
                          {candidate.candidate_id}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Detailed Inspection Result */}
            {inspectionResult && (
              <InspectionDetail result={inspectionResult} />
            )}

            {/* Empty state */}
            {!inspectionResult && !(mode === 'search' && searchResults) && (
              <div className="text-center py-12 text-gray-500">
                <p>Enter a user token and candidate ID, or run a search to begin inspection</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function InspectionDetail({ result }: { result: EvaluateResult }) {
  return (
    <div className="space-y-6">
      <div className="border-b pb-4">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium">Detailed Comparison</h3>
          <span className="text-2xl font-bold text-blue-600">
            {result.compatibility_score.toFixed(3)}
          </span>
        </div>
        <p className="text-sm text-gray-500 font-mono mt-1">
          Candidate: {result.candidate_id}
        </p>
      </div>

      {/* Score Breakdown */}
      {result.breakdown && Object.keys(result.breakdown).length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Score Breakdown</h4>
          <div className="space-y-2">
            {Object.entries(result.breakdown)
              .sort(([, a], [, b]) => (b as number) - (a as number))
              .map(([dimension, score]) => (
                <div key={dimension} className="flex items-center space-x-3">
                  <span className="text-sm w-40 capitalize">{dimension.replace(/_/g, ' ')}</span>
                  <div className="flex-1 bg-gray-200 rounded-full h-3">
                    <div
                      className="h-3 rounded-full bg-blue-500"
                      style={{ width: `${Math.max(0, Math.min(100, (score as number) * 100))}%` }}
                    />
                  </div>
                  <span className="text-sm font-mono w-14 text-right">
                    {(score as number).toFixed(3)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* Narrative Summary */}
      {result.narrative_summary && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Narrative Summary</h4>
          <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-4">
            {result.narrative_summary}
          </p>
        </div>
      )}

      {/* Complementary Traits */}
      {result.complementary_traits && result.complementary_traits.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-3">Complementary Traits</h4>
          <div className="space-y-2">
            {result.complementary_traits.map((trait, i) => (
              <div key={i} className="flex items-center justify-between text-sm border border-gray-200 rounded p-3">
                <span className="font-medium capitalize w-36">{trait.dimension.replace(/_/g, ' ')}</span>
                <div className="flex items-center space-x-4">
                  <span className="text-blue-600">You: {trait.you.toFixed(2)}</span>
                  <span className="text-purple-600">Them: {trait.them.toFixed(2)}</span>
                </div>
                <span className="text-gray-500 text-xs">{trait.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Shared Interests */}
      {result.shared_interests && result.shared_interests.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Shared Interests</h4>
          <div className="flex flex-wrap gap-2">
            {result.shared_interests.map((interest, i) => (
              <span key={i} className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
                {interest}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Strongest Alignments */}
      {result.strongest_alignments && result.strongest_alignments.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Strongest Alignments</h4>
          <div className="flex flex-wrap gap-2">
            {result.strongest_alignments.map((alignment, i) => (
              <span key={i} className="bg-green-100 text-green-800 text-sm px-3 py-1 rounded-full capitalize">
                {alignment.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Predicted Friction */}
      {result.predicted_friction && result.predicted_friction.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Predicted Friction Points</h4>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {result.predicted_friction.map((point, i) => (
              <li key={i}>{point}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Conversation Starters */}
      {result.conversation_starters && result.conversation_starters.length > 0 && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Conversation Starters</h4>
          <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
            {result.conversation_starters.map((starter, i) => (
              <li key={i}>{starter}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Intent Explanation */}
      {result.intent_explanation && (
        <div>
          <h4 className="font-medium text-gray-900 mb-2">Intent Analysis</h4>
          <div className="grid grid-cols-2 gap-4">
            {result.intent_explanation.aligned.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-green-700 mb-1">Aligned</h5>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {result.intent_explanation.aligned.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
            {result.intent_explanation.misaligned.length > 0 && (
              <div>
                <h5 className="text-sm font-medium text-red-700 mb-1">Misaligned</h5>
                <ul className="list-disc list-inside text-sm text-gray-700 space-y-1">
                  {result.intent_explanation.misaligned.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
