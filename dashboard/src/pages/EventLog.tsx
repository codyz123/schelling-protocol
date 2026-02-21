import React, { useState } from 'react';

export default function EventLog() {
  const [filters, setFilters] = useState({
    eventType: '',
    cluster: '',
    search: '',
  });

  // Mock events for demonstration
  const mockEvents = [
    {
      id: 1,
      timestamp: new Date().toISOString(),
      type: 'registration',
      cluster: 'matchmaking',
      summary: 'New registration in matchmaking (verified)',
      details: { user_count: 1250 },
    },
    {
      id: 2,
      timestamp: new Date(Date.now() - 60000).toISOString(),
      type: 'connection',
      cluster: 'matchmaking',
      summary: 'Candidate pair connected (combined_score: 0.78)',
      details: { combined_score: 0.78 },
    },
    {
      id: 3,
      timestamp: new Date(Date.now() - 120000).toISOString(),
      type: 'decline',
      cluster: 'marketplace',
      summary: 'Decline at EVALUATED — reason: personality_mismatch',
      details: { stage: 'EVALUATED', reason: 'personality_mismatch' },
    },
    {
      id: 4,
      timestamp: new Date(Date.now() - 180000).toISOString(),
      type: 'search',
      cluster: 'talent',
      summary: 'Search completed with 12 candidates found',
      details: { candidate_count: 12 },
    },
  ];

  const eventTypeColors = {
    registration: 'bg-green-100 text-green-800',
    search: 'bg-blue-100 text-blue-800',
    decline: 'bg-orange-100 text-orange-800',
    connection: 'bg-purple-100 text-purple-800',
    dispute: 'bg-red-100 text-red-800',
    evaluate: 'bg-yellow-100 text-yellow-800',
  };

  const clusterColors = {
    matchmaking: 'bg-rose-100 text-rose-800',
    marketplace: 'bg-amber-100 text-amber-800',
    talent: 'bg-blue-100 text-blue-800',
    roommates: 'bg-emerald-100 text-emerald-800',
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

  const filteredEvents = mockEvents.filter(event => {
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
          Filterable, searchable log of all system operations
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
              <option value="decline">Decline</option>
              <option value="connection">Connection</option>
              <option value="dispute">Dispute</option>
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
            {filteredEvents.length} of {mockEvents.length} events
          </span>
          <button
            onClick={() => setFilters({ eventType: '', cluster: '', search: '' })}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Clear filters
          </button>
        </div>
      </div>

      {/* Event List */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-medium text-gray-900">
            Recent Events
          </h2>
          <div className="mt-2 flex items-center text-sm text-gray-500">
            <div className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></div>
            WebSocket unavailable — showing mock data for demonstration
          </div>
        </div>
        
        <div className="divide-y divide-gray-200">
          {filteredEvents.map((event) => (
            <div key={event.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  {/* Event Type Badge */}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    eventTypeColors[event.type as keyof typeof eventTypeColors] || 'bg-gray-100 text-gray-800'
                  }`}>
                    {event.type}
                  </span>
                  
                  {/* Cluster Badge */}
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    clusterColors[event.cluster as keyof typeof clusterColors] || 'bg-gray-100 text-gray-800'
                  }`}>
                    {event.cluster}
                  </span>
                  
                  {/* Summary */}
                  <span className="text-sm text-gray-900">
                    {event.summary}
                  </span>
                </div>
                
                {/* Timestamp */}
                <div className="flex items-center space-x-2">
                  <span 
                    className="text-sm text-gray-500 cursor-help" 
                    title={new Date(event.timestamp).toLocaleString()}
                  >
                    {formatTimestamp(event.timestamp)}
                  </span>
                  <button className="text-gray-400 hover:text-gray-600">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                </div>
              </div>
              
              {/* Event Details (collapsible) */}
              <div className="mt-2 text-xs text-gray-600">
                Event ID: {event.id} | Details: {JSON.stringify(event.details)}
              </div>
            </div>
          ))}
        </div>
        
        {filteredEvents.length === 0 && (
          <div className="px-6 py-12 text-center">
            <div className="text-gray-500">
              <p>No events match the current filters</p>
              <p className="text-sm mt-2">Try adjusting your search criteria</p>
            </div>
          </div>
        )}
      </div>

      {/* Pagination Placeholder */}
      <div className="mt-8 flex justify-center">
        <div className="text-sm text-gray-500">
          Pagination controls will appear here for large event sets
        </div>
      </div>
    </div>
  );
}