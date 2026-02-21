import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import type { SyntheticUser } from '../types';
import { api } from './api';

interface AppState {
  // Server configuration
  serverUrl: string;
  setServerUrl: (url: string) => void;
  
  // Authentication (stored in sessionStorage for security)
  adminToken?: string;
  setAdminToken: (token: string) => void;
  clearAdminToken: () => void;
  
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

// Session storage for auth credentials (cleared on tab close)
const authStorage = createJSONStorage(() => sessionStorage);

// Separate store for auth (sessionStorage)
interface AuthState {
  adminToken?: string;
}

const getPersistedAuth = (): AuthState => {
  try {
    const raw = sessionStorage.getItem('schelling-dashboard-auth');
    if (raw) {
      const parsed = JSON.parse(raw);
      return { adminToken: parsed?.state?.adminToken };
    }
  } catch {
    // ignore
  }
  return {};
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => {
      // On init, restore admin token from session storage and sync to API
      const persisted = getPersistedAuth();
      if (persisted.adminToken) {
        api.setAdminToken(persisted.adminToken);
      }

      return {
        serverUrl: 'http://localhost:3000',
        setServerUrl: (url) => {
          set({ serverUrl: url });
          api.setBaseUrl(url);
        },
        
        adminToken: persisted.adminToken,
        setAdminToken: (token) => {
          set({ adminToken: token });
          api.setAdminToken(token);
          // Persist auth to sessionStorage
          try {
            sessionStorage.setItem('schelling-dashboard-auth', 
              JSON.stringify({ state: { adminToken: token } }));
          } catch { /* ignore */ }
        },
        clearAdminToken: () => {
          set({ adminToken: undefined });
          try {
            sessionStorage.removeItem('schelling-dashboard-auth');
          } catch { /* ignore */ }
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
      };
    },
    {
      name: 'schelling-dashboard-store',
      // Only persist non-sensitive state to localStorage
      // Auth token is in sessionStorage (handled separately above)
      partialize: (state) => ({
        serverUrl: state.serverUrl,
        syntheticUsers: state.syntheticUsers,
        recentPairs: state.recentPairs,
        templates: state.templates,
      }),
    }
  )
);
