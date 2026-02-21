import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { SyntheticUser, SearchResult, EvaluateResult } from '../types';

interface SimulationOutputProps {
  user: SyntheticUser;
}

export default function SimulationOutput({ user }: SimulationOutputProps) {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedCandidates, setSelectedCandidates] = useState<string[]>([]);
  const [evaluations, setEvaluations] = useState<EvaluateResult[]>([]);
  const [currentStep, setCurrentStep] = useState<'search' | 'evaluate' | 'exchange' | 'commit' | 'message' | 'report'>('search');

  // Search mutation
  const searchMutation = useMutation({
    mutationFn: async ({ topK, threshold }: { topK: number; threshold: number }) => {
      const response = await api.search(user.user_token, { top_k: topK, threshold });
      return response.candidates;
    },
    onSuccess: (candidates) => {
      setSearchResults(candidates);
      setCurrentStep('evaluate');
    },
  });

  // Evaluate mutation
  const evaluateMutation = useMutation({
    mutationFn: async (candidateIds: string[]) => {
      return await api.evaluate(user.user_token, candidateIds);
    },
    onSuccess: (results) => {
      setEvaluations(results);
      setCurrentStep('exchange');
    },
  });

  // Exchange mutation
  const exchangeMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      return await api.exchange(user.user_token, candidateId);
    },
    onSuccess: () => {
      setCurrentStep('commit');
    },
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: async (candidateId: string) => {
      return await api.commit(user.user_token, candidateId);
    },
    onSuccess: () => {
      setCurrentStep('message');
    },
  });

  // Decline mutation
  const declineMutation = useMutation({
    mutationFn: async ({ candidateId, reason, notes }: { candidateId: string; reason: string; notes: string }) => {
      return await api.decline(user.user_token, candidateId, { reason, notes });
    },
    onSuccess: () => {
      // Remove declined candidate from results
      setSearchResults(prev => prev.filter(r => !selectedCandidates.includes(r.candidate_id)));
      setSelectedCandidates([]);
    },
  });

  const handleRunSearch = () => {
    searchMutation.mutate({ topK: 10, threshold: 0.5 });
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
          <span className="ml-2">{user.intents[0]}</span>
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
                          Combined: {candidate.combined_score.toFixed(3)}
                        </span>
                        <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded">
                          Your: {candidate.your_fit.toFixed(3)}
                        </span>
                        <span className="bg-purple-100 text-purple-800 px-2 py-1 rounded">
                          Their: {candidate.their_fit.toFixed(3)}
                        </span>
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-1">
                      {candidate.intents[0] || 'No intent specified'}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {candidate.candidate_id}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
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

          {evaluations.length > 0 && (
            <div className="space-y-4">
              {evaluations.map((evaluation, index) => (
                <div key={index} className="border border-gray-200 rounded-md p-4">
                  <div className="flex justify-between items-start mb-3">
                    <h5 className="font-medium">Evaluation {index + 1}</h5>
                    <div className="text-right text-sm">
                      <div>Combined: {evaluation.combined_score.toFixed(3)}</div>
                      <div className="text-gray-600">
                        {evaluation.your_fit.toFixed(3)} × {evaluation.their_fit.toFixed(3)}
                      </div>
                    </div>
                  </div>

                  {/* Breakdown */}
                  <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-600">Trait Similarity:</span>
                      <span className="ml-2">{evaluation.breakdown.trait_similarity.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Intent Similarity:</span>
                      <span className="ml-2">{evaluation.breakdown.intent_similarity.toFixed(3)}</span>
                    </div>
                  </div>

                  {/* Narrative */}
                  {evaluation.narrative_summary && (
                    <div className="mb-3">
                      <h6 className="font-medium text-sm text-gray-900 mb-1">Summary</h6>
                      <p className="text-sm text-gray-700">{evaluation.narrative_summary}</p>
                    </div>
                  )}

                  {/* Shared Interests */}
                  {evaluation.shared_interests?.length > 0 && (
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

                  {/* Action Buttons */}
                  <div className="flex space-x-2 mt-4">
                    <button
                      onClick={() => exchangeMutation.mutate(evaluation.candidate_id)}
                      disabled={exchangeMutation.isPending}
                      className="bg-blue-600 text-white px-3 py-1 text-sm rounded-md hover:bg-blue-700"
                    >
                      Exchange
                    </button>
                    <button
                      onClick={() => declineMutation.mutate({
                        candidateId: evaluation.candidate_id,
                        reason: 'not_interested',
                        notes: 'Testing decline functionality'
                      })}
                      disabled={declineMutation.isPending}
                      className="bg-red-600 text-white px-3 py-1 text-sm rounded-md hover:bg-red-700"
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
        <div className="space-y-2 text-sm font-mono bg-gray-50 p-3 rounded max-h-64 overflow-y-auto">
          {searchMutation.isSuccess && (
            <div className="text-green-700">
              ✓ Search completed: {searchResults.length} candidates found
            </div>
          )}
          {evaluateMutation.isSuccess && (
            <div className="text-blue-700">
              ✓ Evaluation completed: {evaluations.length} evaluations
            </div>
          )}
          {exchangeMutation.isSuccess && (
            <div className="text-purple-700">
              ✓ Exchange requested
            </div>
          )}
          {commitMutation.isSuccess && (
            <div className="text-yellow-700">
              ✓ Commitment made
            </div>
          )}
          {declineMutation.isSuccess && (
            <div className="text-red-700">
              ✓ Candidate declined
            </div>
          )}
        </div>
      </div>
    </div>
  );
}