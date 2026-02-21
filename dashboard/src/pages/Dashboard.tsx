import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import FunnelDiagram from '../components/FunnelDiagram';
import StatsCards from '../components/StatsCards';

export default function Dashboard() {
  // Fetch analytics data
  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['analytics', { include_embeddings: true }],
    queryFn: () => api.getAnalytics({ include_embeddings: true }),
    refetchInterval: 30000,
    retry: 2,
  });

  // Fetch server info
  const { data: serverInfo, error: serverInfoError } = useQuery({
    queryKey: ['server-info'],
    queryFn: () => api.getServerInfo(),
    refetchInterval: 10000,
    retry: 2,
  });

  // Fetch clusters
  const { data: clustersData } = useQuery({
    queryKey: ['clusters'],
    queryFn: () => api.getClusters(),
    refetchInterval: 60000,
    retry: 2,
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

  // Show error state if analytics fails
  if (analyticsError && !analytics) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-lg font-medium text-red-800 mb-2">Unable to load analytics</h2>
          <p className="text-sm text-red-700 mb-4">
            {analyticsError instanceof Error ? analyticsError.message : 'Server connection failed'}
          </p>
          <p className="text-sm text-gray-600">
            Make sure the Schelling server is running and that your admin token corresponds to a registered user.
            The analytics endpoint requires a valid user_token to authenticate.
          </p>
        </div>
      </div>
    );
  }

  // Default empty analytics if not yet loaded
  const defaultFunnel = {
    total_users: 0,
    discovered: 0,
    evaluated: 0,
    exchanged: 0,
    committed: 0,
    connected: 0,
    completed: 0,
  };

  const safeAnalytics = analytics ?? {
    funnel_metrics: defaultFunnel,
    outcome_metrics: { total: 0, positive: 0, neutral: 0, negative: 0, positive_rate: 0, confidence_interval: { lower: 0, upper: 0 } },
    match_rate: 0,
    response_rate: 0,
    average_score: 0,
    ab_test_results: {},
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-600">
          Live system overview and metrics
        </p>
      </div>

      {/* Stats Cards */}
      <div className="mb-8">
        <StatsCards 
          analytics={safeAnalytics} 
          serverInfo={serverInfo}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Funnel Analytics */}
        <div className="lg:col-span-2">
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-medium text-gray-900">
                Funnel Analytics
              </h2>
              {serverInfoError && (
                <div className="text-sm text-yellow-600">
                  ⚠ Server info unavailable
                </div>
              )}
            </div>
            <FunnelDiagram metrics={safeAnalytics.funnel_metrics} />
          </div>
        </div>

        {/* Cluster Distribution */}
        <div>
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-6">
              Cluster Distribution
            </h2>
            {analytics?.users && analytics.users.length > 0 ? (
              <ClusterDistribution users={analytics.users} />
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p className="text-sm">No users registered yet</p>
              </div>
            )}
          </div>
          
          {/* Cluster Info from server */}
          {clustersData?.clusters && clustersData.clusters.length > 0 && (
            <div className="bg-white shadow rounded-lg p-6 mt-6">
              <h2 className="text-lg font-medium text-gray-900 mb-4">
                Active Clusters
              </h2>
              <div className="space-y-3">
                {clustersData.clusters.map(cluster => (
                  <div key={cluster.id} className="border border-gray-200 rounded p-3 text-sm">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-medium">{cluster.display_name}</span>
                      <span className="text-gray-500">{cluster.user_count} users</span>
                    </div>
                    <p className="text-gray-600 text-xs">{cluster.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* A/B Test Results */}
      {analytics?.ab_test_results && Object.keys(analytics.ab_test_results).length > 0 && (
        <div className="mt-8">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              A/B Test Results
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Object.entries(analytics.ab_test_results).map(([variant, stats]) => (
                <div key={variant} className="border border-gray-200 rounded-lg p-4">
                  <h3 className="font-medium capitalize mb-2">{variant.replace(/_/g, ' ')}</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-gray-600">Users:</span>
                      <span className="ml-2">{stats.user_count}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Avg Score:</span>
                      <span className="ml-2">{stats.avg_score.toFixed(3)}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Positive:</span>
                      <span className="ml-2">{stats.positive_outcomes}</span>
                    </div>
                    <div>
                      <span className="text-gray-600">Total:</span>
                      <span className="ml-2">{stats.total_outcomes}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            {analytics.ab_test_significance && (
              <div className="mt-4 text-sm border-t pt-4">
                <span className={`font-medium ${analytics.ab_test_significance.significant ? 'text-green-600' : 'text-gray-600'}`}>
                  {analytics.ab_test_significance.significant ? '✓ Statistically significant' : '◌ Not significant yet'}
                </span>
                <span className="ml-2 text-gray-500">
                  (z={analytics.ab_test_significance.z.toFixed(2)}, p={analytics.ab_test_significance.p_value.toFixed(4)})
                </span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Cluster distribution component
function ClusterDistribution({ users }: { users: Array<{ primary_cluster: string }> }) {
  const clusterCounts = users.reduce((acc, user) => {
    const cluster = user.primary_cluster || 'default';
    acc[cluster] = (acc[cluster] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const total = users.length;
  
  if (total === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No users registered yet
      </div>
    );
  }

  const clusterColors: Record<string, string> = {
    matchmaking: '#F43F5E',
    marketplace: '#F59E0B',
    talent: '#3B82F6',
    roommates: '#10B981',
    default: '#9CA3AF',
  };

  return (
    <div className="space-y-4">
      {Object.entries(clusterCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([cluster, count]) => (
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
