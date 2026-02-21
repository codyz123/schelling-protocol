import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SyntheticUser } from '../types';
import { api } from './api';

interface AppState {
  // Server configuration
  serverUrl: string;
  setServerUrl: (url: string) => void;
  
  // Authentication
  adminToken?: string;
  setAdminToken: (token: string) => void;
  
  // Synthetic users pool
  syntheticUsers: SyntheticUser[];
  addSyntheticUser: (user: SyntheticUser) => void;
  removeSyntheticUser: (userToken: string) => void;
  clearSyntheticUsers: () => void;
  
  // Recently inspected pairs
  recentPairs: Array<{ candidateId: string; timestamp: number }>;
  addRecentPair: (candidateId: string) => void;
  
  // User templates
  templates: Array<{
    name: string;
    template: Partial<SyntheticUser>;
    timestamp: number;
  }>;
  saveTemplate: (name: string, template: Partial<SyntheticUser>) => void;
  removeTemplate: (name: string) => void;
  
  // Server health
  serverHealth: 'unknown' | 'healthy' | 'unhealthy';
  setServerHealth: (health: 'unknown' | 'healthy' | 'unhealthy') => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      serverUrl: 'http://localhost:3000',
      setServerUrl: (url) => {
        set({ serverUrl: url });
        // Update API client
        if (typeof api.constructor === 'function') {
          Object.setPrototypeOf(api, new (api.constructor as any)(url));
        }
      },
      
      adminToken: undefined,
      setAdminToken: (token) => {
        set({ adminToken: token });
        api.setAdminToken(token);
      },
      
      syntheticUsers: [],
      addSyntheticUser: (user) => set((state) => ({
        syntheticUsers: [...state.syntheticUsers, user]
      })),
      removeSyntheticUser: (userToken) => set((state) => ({
        syntheticUsers: state.syntheticUsers.filter(u => u.user_token !== userToken)
      })),
      clearSyntheticUsers: () => set({ syntheticUsers: [] }),
      
      recentPairs: [],
      addRecentPair: (candidateId) => set((state) => {
        const recent = state.recentPairs.filter(p => p.candidateId !== candidateId);
        recent.unshift({ candidateId, timestamp: Date.now() });
        return { recentPairs: recent.slice(0, 10) }; // Keep only 10 most recent
      }),
      
      templates: [],
      saveTemplate: (name, template) => set((state) => ({
        templates: [
          ...state.templates.filter(t => t.name !== name),
          { name, template, timestamp: Date.now() }
        ]
      })),
      removeTemplate: (name) => set((state) => ({
        templates: state.templates.filter(t => t.name !== name)
      })),
      
      serverHealth: 'unknown',
      setServerHealth: (health) => set({ serverHealth: health }),
    }),
    {
      name: 'schelling-dashboard-store',
      // Don't persist server health - check it fresh each time
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        adminToken: state.adminToken,
        syntheticUsers: state.syntheticUsers,
        recentPairs: state.recentPairs,
        templates: state.templates,
      }),
    }
  )
);