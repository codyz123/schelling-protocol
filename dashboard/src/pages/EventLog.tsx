import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import type { AnalyticsResponse } from '../types';

interface DerivedEvent {
  id: string;
  timestamp: string;
  type: string;
  cluster: string;
  summary: string;
  details: Record<string, unknown>;
}

export default function EventLog() {
  const [filters, setFilters] = useState({
    eventType: '',
    cluster: '',
    search: '',
  });
  const [events, setEvents] = useState<DerivedEvent[]>([]);
  const prevMetricsRef = useRef<AnalyticsResponse['funnel_metrics'] | null>(null);
  const eventIdCounter = useRef(0);

  // Poll analytics to derive events from metric changes
  const { data: analytics, error: analyticsError, isLoading } = useQuery({
    queryKey: ['event-log-analytics'],
    queryFn: () => api.getAnalytics({}),
    refetchInterval: 5000, // Poll every 5 seconds
    retry: 2,
  });

  // Health check
  const { data: health } = useQuery({
    queryKey: ['event-log-health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 15000,
    retry: 1,
  });

  // Derive events from analytics changes
  const deriveEvents = useCallback((current: AnalyticsResponse['funnel_metrics']) => {
    const prev = prevMetricsRef.current;
    if (!prev) {
      prevMetricsRef.current = { ...current };
      // Generate initial snapshot event
      if (current.total_users > 0) {
        const id = `evt-${++eventIdCounter.current}`;
        setEvents(evts => [{
          id,
          timestamp: new Date().toISOString(),
          type: 'snapshot',
          cluster: 'system',
          summary: `System snapshot: ${current.total_users} users, ${current.discovered} discovered, ${current.connected} connected`,
          details: current,
        }, ...evts]);
      }
      return;
    }

    const newEvents: DerivedEvent[] = [];
    const now = new Date().toISOString();

    if (current.total_users > prev.total_users) {
      const delta = current.total_users - prev.total_users;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'registration',
        cluster: 'system',
        summary: `${delta} new user${delta > 1 ? 's' : ''} registered (total: ${current.total_users})`,
        details: { delta, total: current.total_users },
      });
    }

    if (current.discovered > prev.discovered) {
      const delta = current.discovered - prev.discovered;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'search',
        cluster: 'system',
        summary: `${delta} new discovery event${delta > 1 ? 's' : ''} (total discovered: ${current.discovered})`,
        details: { delta, total: current.discovered },
      });
    }

    if (current.evaluated > prev.evaluated) {
      const delta = current.evaluated - prev.evaluated;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'evaluate',
        cluster: 'system',
        summary: `${delta} new evaluation${delta > 1 ? 's' : ''} (total: ${current.evaluated})`,
        details: { delta, total: current.evaluated },
      });
    }

    if (current.exchanged > prev.exchanged) {
      const delta = current.exchanged - prev.exchanged;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'exchange',
        cluster: 'system',
        summary: `${delta} profile exchange${delta > 1 ? 's' : ''} (total: ${current.exchanged})`,
        details: { delta, total: current.exchanged },
      });
    }

    if (current.committed > prev.committed) {
      const delta = current.committed - prev.committed;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'connection',
        cluster: 'system',
        summary: `${delta} new commitment${delta > 1 ? 's' : ''} (total: ${current.committed})`,
        details: { delta, total: current.committed },
      });
    }

    if (current.connected > prev.connected) {
      const delta = current.connected - prev.connected;
      newEvents.push({
        id: `evt-${++eventIdCounter.current}`,
        timestamp: now,
        type: 'connection',
        cluster: 'system',
        summary: `${delta} pair${delta > 1 ? 's' : ''} connected (total: ${current.connected})`,
        details: { delta, total: current.connected },
      });
    }

    if (newEvents.length > 0) {
      setEvents(evts => [...newEvents, ...evts].slice(0, 200)); // Cap at 200 events
    }

    prevMetricsRef.current = { ...current };
  }, []);

  useEffect(() => {
    if (analytics?.funnel_metrics) {
      deriveEvents(analytics.funnel_metrics);
    }
  }, [analytics, deriveEvents]);

  const eventTypeColors: Record<string, string> = {
    registration: 'bg-green-100 text-green-800',
    search: 'bg-blue-100 text-blue-800',
    decline: 'bg-orange-100 text-orange-800',
    connection: 'bg-purple-100 text-purple-800',
    dispute: 'bg-red-100 text-red-800',
    evaluate: 'bg-yellow-100 text-yellow-800',
    exchange: 'bg-indigo-100 text-indigo-800',
    snapshot: 'bg-gray-100 text-gray-800',
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  const filteredEvents = events.filter(event => {
    if (filters.eventType && event.type !== filters.eventType) return false;
    if (filters.cluster && event.cluster !== filters.cluster) return false;
    if (filters.search && !event.summary.toLowerCase().includes(filters.search.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Event Log</h1>
        <p className="mt-1 text-sm text-gray-600">
          Live event feed derived from analytics polling (5s interval)
        </p>
      </div>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-6 mb-8">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Filters</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Event Type
            </label>
            <select
              value={filters.eventType}
              onChange={(e) => setFilters({ ...filters, eventType: e.target.value })}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              <option value="registration">Registration</option>
              <option value="search">Search</option>
              <option value="evaluate">Evaluate</option>
              <option value="exchange">Exchange</option>
              <option value="connection">Connection</option>
              <option value="snapshot">Snapshot</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Cluster
            </label>
            <select
              value={filters.cluster}
              onChange={(e) => setFilters({ ...filters, cluster: e.target.value })}
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            >
              <option value="">All clusters</option>
              <option value="system">System</option>
              <option value="matchmaking">Matchmaking</option>
              <option value="marketplace">Marketplace</option>
              <option value="talent">Talent</option>
              <option value="roommates">Roommates</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Search
            </label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              placeholder="Search in event summaries..."
              className="block w-full border border-gray-300 rounded-md px-3 py-2 text-sm"
            />
          </div>
        </div>
        
        <div className="mt-4 flex items-center space-x-4">
          <span className="text-sm text-gray-600">
            {filteredEvents.length} of {events.length} events
          </span>
          <button
            onClick={() => setFilters({ eventType: '', cluster: '', search: '' })}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Clear filters
          </button>
          <button
            onClick={() => {
              setEvents([]);
              prevMetricsRef.current = null;
            }}
            className="text-sm text-red-600 hover:text-red-700"
          >
            Clear log
          </button>
        </div>
      </div>

      {/* Event List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Live Events
          </h2>
          <div className="mt-2 flex items-center text-sm">
            {analyticsError ? (
              <div className="flex items-center text-red-500">
                <div className="w-3 h-3 bg-red-500 rounded-full mr-2"></div>
                Analytics polling failed — check server connection
              </div>
            ) : isLoading ? (
              <div className="flex items-center text-yellow-500">
                <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2 animate-pulse"></div>
                Connecting...
              </div>
            ) : (
              <div className="flex items-center text-green-600">
                <div className="w-3 h-3 bg-green-500 rounded-full mr-2 animate-pulse"></div>
                Polling analytics every 5 seconds
                {health && ` · ${health.total_users} users, ${health.total_candidates} candidates`}
              </div>
            )}
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredEvents.map((event) => (
            <div key={event.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    eventTypeColors[event.type] || 'bg-gray-100 text-gray-800'
                  }`}>
                    {event.type}
                  </span>
                  
                  <span className="text-sm text-gray-900">
                    {event.summary}
                  </span>
                </div>
                
                <span 
                  className="text-sm text-gray-500 cursor-help whitespace-nowrap ml-4" 
                  title={new Date(event.timestamp).toLocaleString()}
                >
                  {formatTimestamp(event.timestamp)}
                </span>
              </div>
            </div>
          ))}
        </div>
        
        {filteredEvents.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-500">
              {events.length === 0 ? (
                <>
                  <p>No events yet</p>
                  <p className="text-sm mt-2">
                    Events will appear as users interact with the system.
                    Try registering users in the Simulator.
                  </p>
                </>
              ) : (
                <>
                  <p>No events match the current filters</p>
                  <p className="text-sm mt-2">Try adjusting your search criteria</p>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
