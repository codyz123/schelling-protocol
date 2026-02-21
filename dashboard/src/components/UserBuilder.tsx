import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { CLUSTER_CENTROIDS, INTENT_DIMENSIONS, type SyntheticUser, type IntentCluster } from '../types';

interface UserBuilderProps {
  onUserRegistered: (user: SyntheticUser) => void;
  clusters: IntentCluster[];
}

export default function UserBuilder({ onUserRegistered, clusters }: UserBuilderProps) {
  const [intents, setIntents] = useState<string[]>(['']);
  const [intentEmbedding, setIntentEmbedding] = useState<number[]>(new Array(16).fill(0));
  const [traitEmbedding, setTraitEmbedding] = useState<number[]>(new Array(50).fill(0));
  const [profile, setProfile] = useState({
    city: 'Brooklyn',
    age_range: '25-34',
    description: '',
    seeking: '',
    interests: '',
    values_text: '',
    name: '',
    contact: '',
  });
  const [agentModel] = useState('testing-ui-synthetic');
  const [verificationLevel, setVerificationLevel] = useState<'anonymous' | 'verified' | 'attested'>('anonymous');

  const registerMutation = useMutation({
    mutationFn: async (userData: any) => {
      const response = await api.register(userData);
      return response;
    },
    onSuccess: (response) => {
      // Compute primary cluster
      const primaryCluster = computePrimaryCluster(intentEmbedding);
      
      const user: SyntheticUser = {
        user_token: response.user_token,
        intent_embedding: intentEmbedding,
        trait_embedding: traitEmbedding,
        intents,
        primary_cluster: primaryCluster,
        reputation_score: 0.5, // New users start at 0.5
        status: 'active',
        last_registered_at: new Date().toISOString(),
        profile: {
          ...profile,
          interests: profile.interests.split(',').map(s => s.trim()).filter(Boolean),
        },
      };
      
      onUserRegistered(user);
    },
  });

  const computePrimaryCluster = (embedding: number[]): string => {
    let bestCluster = 'default';
    let bestSimilarity = -1;
    
    for (const [clusterId, centroid] of Object.entries(CLUSTER_CENTROIDS)) {
      const similarity = cosineSimilarity(embedding, centroid);
      if (similarity > bestSimilarity && similarity > 0.5) {
        bestSimilarity = similarity;
        bestCluster = clusterId;
      }
    }
    
    return bestCluster;
  };

  const cosineSimilarity = (a: number[], b: number[]): number => {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  };

  const handleQuickFill = (clusterId: string) => {
    if (CLUSTER_CENTROIDS[clusterId]) {
      setIntentEmbedding(CLUSTER_CENTROIDS[clusterId]);
      
      // Also set appropriate intent text
      const intentTexts = {
        matchmaking: ['Find me a meaningful romantic relationship'],
        marketplace: ['Looking to buy or sell items locally'],
        talent: ['Seeking professional opportunities and networking'],
        roommates: ['Looking for compatible roommates to share living space'],
      };
      
      if (intentTexts[clusterId as keyof typeof intentTexts]) {
        setIntents(intentTexts[clusterId as keyof typeof intentTexts]);
      }
    }
  };

  const handleRandomFill = () => {
    setIntentEmbedding(intentEmbedding.map(() => (Math.random() - 0.5) * 1.6)); // Random in [-0.8, 0.8]
    setTraitEmbedding(traitEmbedding.map(() => Math.random() * 0.6 - 0.3)); // Random normal-ish in [-0.3, 0.3]
  };

  const handleRegister = async () => {
    const userData = {
      intents: intents.filter(Boolean),
      intent_embedding: intentEmbedding,
      embedding: traitEmbedding,
      city: profile.city,
      age_range: profile.age_range,
      description: profile.description,
      seeking: profile.seeking,
      interests: profile.interests.split(',').map(s => s.trim()).filter(Boolean),
      values_text: profile.values_text,
      name: profile.name,
      contact: profile.contact,
      agent_model: agentModel,
      verification_level: verificationLevel,
      status: 'active',
    };
    
    registerMutation.mutate(userData);
  };

  return (
    <div className="space-y-6">
      {/* Intent Section */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Intent</h3>
        
        {/* Intent Text */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Intent Description
          </label>
          {intents.map((intent, index) => (
            <input
              key={index}
              type="text"
              value={intent}
              onChange={(e) => {
                const newIntents = [...intents];
                newIntents[index] = e.target.value;
                setIntents(newIntents);
              }}
              placeholder="Describe what you're looking for"
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm mb-2"
            />
          ))}
        </div>

        {/* Quick Fill Buttons */}
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Quick Fill Presets
          </label>
          <div className="flex flex-wrap gap-2">
            {Object.keys(CLUSTER_CENTROIDS).map((clusterId) => (
              <button
                key={clusterId}
                onClick={() => handleQuickFill(clusterId)}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 capitalize"
              >
                {clusterId}
              </button>
            ))}
            <button
              onClick={handleRandomFill}
              className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Random
            </button>
          </div>
        </div>

        {/* Intent Embedding Sliders */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Intent Embedding (16 dimensions)
          </label>
          <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto border border-gray-200 rounded-md p-3">
            {intentEmbedding.map((value, index) => (
              <div key={index} className="flex items-center space-x-3">
                <span className="text-xs font-mono w-24 truncate">
                  {INTENT_DIMENSIONS[index]}
                </span>
                <input
                  type="range"
                  min="-1"
                  max="1"
                  step="0.05"
                  value={value}
                  onChange={(e) => {
                    const newEmbedding = [...intentEmbedding];
                    newEmbedding[index] = parseFloat(e.target.value);
                    setIntentEmbedding(newEmbedding);
                  }}
                  className="flex-1"
                />
                <span className="text-xs font-mono w-12 text-right">
                  {value.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Profile Section */}
      <div>
        <h3 className="text-lg font-medium text-gray-900 mb-4">Profile</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              City
            </label>
            <input
              type="text"
              value={profile.city}
              onChange={(e) => setProfile({ ...profile, city: e.target.value })}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Age Range
            </label>
            <select
              value={profile.age_range}
              onChange={(e) => setProfile({ ...profile, age_range: e.target.value })}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option>18-24</option>
              <option>25-34</option>
              <option>35-44</option>
              <option>45-54</option>
              <option>55-64</option>
              <option>65+</option>
            </select>
          </div>
        </div>
        
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Description
          </label>
          <textarea
            value={profile.description}
            onChange={(e) => setProfile({ ...profile, description: e.target.value })}
            rows={3}
            className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
          />
        </div>
      </div>

      {/* Register Button */}
      <div>
        <button
          onClick={handleRegister}
          disabled={registerMutation.isPending || intents.every(i => !i.trim())}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {registerMutation.isPending ? 'Registering...' : 'Register User'}
        </button>
        
        {registerMutation.error && (
          <p className="mt-2 text-sm text-red-600">
            Error: {registerMutation.error.message}
          </p>
        )}
      </div>
    </div>
  );
}