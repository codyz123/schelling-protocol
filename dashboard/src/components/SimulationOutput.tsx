import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SyntheticUser, SearchResult, EvaluateResult } from '../types';

interface SimulationOutputProps {
  user: SyntheticUser;
}

interface LogEntry {
  id: number;
  timestamp: Date;
  type: 'search' | 'evaluate' | 'exchange' | 'commit' | 'decline' | 'error';
  message: string;
}

let logIdCounter = 0;

export default function SimulationOutput({ user }: SimulationOutputProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluateResult[]>([]);
  const [exchangedCandidates, setExchangedCandidates] = useState<Set<string>>(new Set());
  const [committedCandidates, setCommittedCandidates] = useState<Set<string>>(new Set());
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const prevUserTokenRef = useRef(user.user_token);

  // Reset state when user changes to prevent stale data from previous user
  useEffect(() => {
    if (prevUserTokenRef.current !== user.user_token) {
      prevUserTokenRef.current = user.user_token;
      setSearchResults([]);
      setSelectedCandidates([]);
      setEvaluations([]);
      setExchangedCandidates(new Set());
      setCommittedCandidates(new Set());
      setLogs([]);
    }
  }, [user.user_token]);

  const addLog = useCallback((type: LogEntry['type'], message: string) => {
    setLogs(prev => [...prev, { id: ++logIdCounter, timestamp: new Date(), type, message }]);
  }, []);

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async ({ topK, threshold }: { topK: number; threshold: number }) => {
      const response = await api.search(user.user_token, { top_k: topK, threshold });
      return response.candidates;
    },
    onSuccess: (candidates) => {
      setSearchResults(candidates);
      setSelectedCandidates([]);
      setEvaluations([]);
      setExchangedCandidates(new Set());
      setCommittedCandidates(new Set());
      addLog('search', `Found ${candidates.length} candidates`);
    },
    onError: (err: Error) => {
      addLog('error', `Search failed: ${err.message}`);
    },
  });

  // Evaluate mutation
  const evaluateMutation = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      return await api.evaluate(user.user_token, candidateIds);
    },
    onSuccess: (results) => {
      setEvaluations(results);
      addLog('evaluate', `Evaluated ${results.length} candidates`);
    },
    onError: (err: Error) => {
      addLog('error', `Evaluate failed: ${err.message}`);
    },
  });

  // Exchange mutation
  const exchangeMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      await api.exchange(user.user_token, candidateId);
      return candidateId;
    },
    onSuccess: (candidateId) => {
      setExchangedCandidates(prev => new Set(prev).add(candidateId));
      addLog('exchange', `Exchange requested for ${candidateId.slice(0, 12)}...`);
    },
    onError: (err: Error) => {
      addLog('error', `Exchange failed: ${err.message}`);
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      await api.commit(user.user_token, candidateId);
      return candidateId;
    },
    onSuccess: (candidateId) => {
      setCommittedCandidates(prev => new Set(prev).add(candidateId));
      addLog('commit', `Commitment made for ${candidateId.slice(0, 12)}...`);
    },
    onError: (err: Error) => {
      addLog('error', `Commit failed: ${err.message}`);
    },
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: async ({ candidateId, reason, notes }: { candidateId: string; reason: string; notes: string }) => {
      await api.decline(user.user_token, candidateId, { reason, notes });
      return candidateId;
    },
    onSuccess: (candidateId) => {
      setSearchResults(prev => prev.filter(r => r.candidate_id !== candidateId));
      setEvaluations(prev => prev.filter(e => e.candidate_id !== candidateId));
      setSelectedCandidates(prev => prev.filter(id => id !== candidateId));
      addLog('decline', `Declined ${candidateId.slice(0, 12)}...`);
    },
    onError: (err: Error) => {
      addLog('error', `Decline failed: ${err.message}`);
    },
  });

  const handleRunSearch = () => {
    searchMutation.mutate({ topK: 10, threshold: 0.3 });
  };

  const handleEvaluateSelected = () => {
    if (selectedCandidates.length > 0) {
      evaluateMutation.mutate(selectedCandidates);
    }
  };

  const handleCandidateSelect = (candidateId: string, selected: boolean) => {
    if (selected) {
      setSelectedCandidates(prev => [...prev, candidateId]);
    } else {
      setSelectedCandidates(prev => prev.filter(id => id !== candidateId));
    }
  };

  const formatScore = (value: number | undefined): string => {
    return value !== undefined ? value.toFixed(3) : 'N/A';
  };

  return (
    <div className="space-y-6">
      {/* User Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Current User</h3>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-gray-600">Token:</span>
            <span className="ml-2 font-mono">{user.user_token.slice(0, 12)}...</span>
          </div>
          <div>
            <span className="text-gray-600">Cluster:</span>
            <span className="ml-2 capitalize">{user.primary_cluster}</span>
          </div>
        </div>
        <div className="mt-2 text-sm">
          <span className="text-gray-600">Intent:</span>
          <span className="ml-2">{user.intents[0] || 'No intent specified'}</span>
        </div>
      </div>

      {/* Step 1: Search */}
      <div className="border rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-4">Step 1: Search</h3>
        
        <button
          onClick={handleRunSearch}
          disabled={searchMutation.isPending}
          className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {searchMutation.isPending ? 'Searching...' : 'Run Search'}
        </button>

        {searchMutation.error && (
          <p className="mt-2 text-sm text-red-600">
            Error: {searchMutation.error.message}
          </p>
        )}

        {searchResults.length > 0 && (
          <div className="mt-4">
            <h4 className="font-medium mb-2">Search Results ({searchResults.length})</h4>
            <div className="space-y-2">
              {searchResults.map((candidate, index) => (
                <div
                  key={candidate.candidate_id}
                  className="flex items-center space-x-3 p-3 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  <input
                    type="checkbox"
                    checked={selectedCandidates.includes(candidate.candidate_id)}
                    onChange={(e) => handleCandidateSelect(candidate.candidate_id, e.target.checked)}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">#{index + 1}</span>
                      <div className="flex space-x-2 text-sm">
                        <span className="bg-green-100 text-green-800 px-2 py-1 rounded">
                          Score: {formatScore(candidate.compatibility_score)}
                        </span>
                        {candidate.your_fit !== undefined && (
                          <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            Your: {formatScore(candidate.your_fit)}
                          </span>
                        )}
                        {candidate.their_fit !== undefined && (
                          <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                            Their: {formatScore(candidate.their_fit)}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {candidate.candidate_id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {searchMutation.isSuccess && searchResults.length === 0 && (
          <p className="mt-4 text-sm text-gray-500">
            No candidates found. Try registering more users or adjusting the threshold.
          </p>
        )}
      </div>

      {/* Step 2: Evaluate */}
      {searchResults.length > 0 && (
        <div className="border rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-4">Step 2: Evaluate</h3>
          
          <div className="flex space-x-2 mb-4">
            <button
              onClick={handleEvaluateSelected}
              disabled={selectedCandidates.length === 0 || evaluateMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {evaluateMutation.isPending ? 'Evaluating...' : `Evaluate Selected (${selectedCandidates.length})`}
            </button>
          </div>

          {evaluateMutation.error && (
            <p className="mt-2 text-sm text-red-600">
              Error: {evaluateMutation.error.message}
            </p>
          )}

          {evaluations.length > 0 && (
            <div className="space-y-4">
              {evaluations.map((evaluation) => (
                <div key={evaluation.candidate_id} className="border border-gray-200 rounded-md p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h5 className="font-medium text-sm">{evaluation.candidate_id.slice(0, 16)}...</h5>
                    <div className="text-right text-sm">
                      <div>Score: {formatScore(evaluation.compatibility_score)}</div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  {evaluation.breakdown && (
                    <div className="grid grid-cols-2 gap-2 text-sm mb-3">
                      {Object.entries(evaluation.breakdown).map(([key, value]) => (
                        <div key={key}>
                          <span className="text-gray-600 capitalize">{key.replace(/_/g, ' ')}:</span>
                          <span className="ml-2">{typeof value === 'number' ? value.toFixed(3) : String(value)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Narrative */}
                  {evaluation.narrative_summary && (
                    <div className="mb-3">
                      <h6 className="font-medium text-sm text-gray-900 mb-1">Summary</h6>
                      <p className="text-sm text-gray-700">{evaluation.narrative_summary}</p>
                    </div>
                  )}

                  {/* Shared Interests */}
                  {evaluation.shared_interests && evaluation.shared_interests.length > 0 && (
                    <div className="mb-3">
                      <h6 className="font-medium text-sm text-gray-900 mb-1">Shared Interests</h6>
                      <div className="flex flex-wrap gap-1">
                        {evaluation.shared_interests.map((interest, i) => (
                          <span key={i} className="bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                            {interest}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Predicted Friction */}
                  {evaluation.predicted_friction && evaluation.predicted_friction.length > 0 && (
                    <div className="mb-3">
                      <h6 className="font-medium text-sm text-gray-900 mb-1">Predicted Friction</h6>
                      <ul className="text-sm text-gray-700 list-disc list-inside">
                        {evaluation.predicted_friction.map((f, i) => (
                          <li key={i}>{f}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Conversation Starters */}
                  {evaluation.conversation_starters && evaluation.conversation_starters.length > 0 && (
                    <div className="mb-3">
                      <h6 className="font-medium text-sm text-gray-900 mb-1">Conversation Starters</h6>
                      <ul className="text-sm text-gray-700 list-disc list-inside">
                        {evaluation.conversation_starters.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-2 mt-4">
                    {!exchangedCandidates.has(evaluation.candidate_id) && (
                      <button
                        onClick={() => exchangeMutation.mutate(evaluation.candidate_id)}
                        disabled={exchangeMutation.isPending}
                        className="bg-blue-600 text-white px-3 py-1 text-sm rounded-md hover:bg-blue-700 disabled:opacity-50"
                      >
                        Exchange
                      </button>
                    )}
                    {exchangedCandidates.has(evaluation.candidate_id) && !committedCandidates.has(evaluation.candidate_id) && (
                      <button
                        onClick={() => commitMutation.mutate(evaluation.candidate_id)}
                        disabled={commitMutation.isPending}
                        className="bg-purple-600 text-white px-3 py-1 text-sm rounded-md hover:bg-purple-700 disabled:opacity-50"
                      >
                        Commit
                      </button>
                    )}
                    {committedCandidates.has(evaluation.candidate_id) && (
                      <span className="text-sm text-green-600 font-medium py-1">✓ Committed</span>
                    )}
                    <button
                      onClick={() => declineMutation.mutate({
                        candidateId: evaluation.candidate_id,
                        reason: 'not_interested',
                        notes: 'Testing decline functionality'
                      })}
                      disabled={declineMutation.isPending}
                      className="bg-red-600 text-white px-3 py-1 text-sm rounded-md hover:bg-red-700 disabled:opacity-50"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Operation Log */}
      <div className="border rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-4">Operation Log</h3>
        <div className="space-y-1 text-sm font-mono bg-gray-50 p-3 rounded max-h-48 overflow-y-auto">
          {logs.length === 0 && (
            <div className="text-gray-400">No operations yet. Start by running a search.</div>
          )}
          {logs.map((log) => {
            const colors: Record<string, string> = {
              search: 'text-green-700',
              evaluate: 'text-blue-700',
              exchange: 'text-purple-700',
              commit: 'text-yellow-700',
              decline: 'text-red-700',
              error: 'text-red-600 font-bold',
            };
            return (
              <div key={log.id} className={colors[log.type] || 'text-gray-600'}>
                [{log.timestamp.toLocaleTimeString()}] {log.type === 'error' ? '✗' : '✓'} {log.message}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
