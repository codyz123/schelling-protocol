import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import FunnelDiagram from '../components/FunnelDiagram';
import StatsCards from '../components/StatsCards';

export default function Dashboard() {
  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading } = useQuery({
    queryKey: ['analytics', { include_embeddings: true }],
    queryFn: () => api.getAnalytics({ include_embeddings: true }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });

  // Fetch server info
  const { data: serverInfo } = useQuery({
    queryKey: ['server-info'],
    queryFn: () => api.getServerInfo(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Fetch clusters
  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.getClusters(),
    refetchInterval: 60000, // Refresh every minute
  });

  if (analyticsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Live system overview and metrics
        </p>
      </div>

      {/* Stats Cards */}
      {analytics && (
        <div className="mb-8">
          <StatsCards 
            analytics={analytics} 
            serverInfo={serverInfo}
          />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Funnel Analytics */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">
                Funnel Analytics
              </h2>
              <div className="text-sm text-gray-500">
                Last 30 days
              </div>
            </div>
            {analytics && (
              <FunnelDiagram metrics={analytics.funnel_metrics} />
            )}
          </div>
        </div>

        {/* Cluster Distribution */}
        <div>
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Cluster Distribution
            </h2>
            {analytics?.users && (
              <ClusterDistribution users={analytics.users} />
            )}
          </div>
        </div>
      </div>

      {/* Event Feed (placeholder for now) */}
      <div className="mt-8">
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-6">
            Recent Events
          </h2>
          <div className="text-center py-8 text-gray-500">
            <p>Real-time event feed will appear here</p>
            <p className="text-sm mt-2">
              (WebSocket integration required)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cluster distribution component
function ClusterDistribution({ users }: { users: Array<{ primary_cluster: string }> }) {
  const clusterCounts = users.reduce((acc, user) => {
    acc[user.primary_cluster] = (acc[user.primary_cluster] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = users.length;
  
  const clusterColors: Record<string, string> = {
    matchmaking: '#F43F5E',
    marketplace: '#F59E0B',
    talent: '#3B82F6',
    roommates: '#10B981',
    default: '#9CA3AF',
  };

  return (
    <div className="space-y-4">
      {Object.entries(clusterCounts).map(([cluster, count]) => (
        <div key={cluster}>
          <div className="flex justify-between text-sm mb-1">
            <span className="font-medium capitalize">{cluster}</span>
            <span>{count} ({Math.round((count / total) * 100)}%)</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="h-2 rounded-full"
              style={{
                width: `${(count / total) * 100}%`,
                backgroundColor: clusterColors[cluster] || clusterColors.default,
              }}
            />
          </div>
        </div>
      ))}
      
      <div className="pt-4 border-t border-gray-200">
        <div className="text-sm text-gray-600">
          Total Users: {total}
        </div>
      </div>
    </div>
  );
}