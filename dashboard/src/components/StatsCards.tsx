import React from 'react';
import type { AnalyticsResponse, ServerInfo } from '../types';

interface StatsCardsProps {
  analytics: AnalyticsResponse;
  serverInfo?: ServerInfo;
}

export default function StatsCards({ analytics, serverInfo }: StatsCardsProps) {
  const formatUptime = (seconds: number) => {
    if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m`;
    } else if (seconds < 86400) {
      return `${Math.floor(seconds / 3600)}h`;
    } else {
      return `${Math.floor(seconds / 86400)}d`;
    }
  };

  const cards = [
    {
      title: 'Active Users',
      value: analytics.funnel_metrics.total_users,
      subtitle: serverInfo ? `Uptime: ${formatUptime(serverInfo.uptime_seconds)}` : 'Last 30 days',
      color: 'blue',
      trend: null, // TODO: Add sparkline data
    },
    {
      title: 'Active Candidates', 
      value: serverInfo?.total_candidates || 0,
      subtitle: `Discovery rate: ${Math.round(analytics.response_rate * 100)}%`,
      color: 'green',
      trend: null,
    },
    {
      title: 'Match Rate',
      value: `${Math.round(analytics.match_rate * 100)}%`,
      subtitle: 'Connected / Discovered',
      color: 'purple',
      trend: null,
    },
    {
      title: 'Positive Outcomes',
      value: `${Math.round(analytics.outcome_metrics.positive_rate * 100)}%`,
      subtitle: `${analytics.outcome_metrics.total} total reports`,
      color: 'yellow',
      trend: null,
    },
  ];

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 text-blue-900 border-blue-200';
      case 'green':
        return 'bg-green-50 text-green-900 border-green-200';
      case 'purple':
        return 'bg-purple-50 text-purple-900 border-purple-200';
      case 'yellow':
        return 'bg-yellow-50 text-yellow-900 border-yellow-200';
      default:
        return 'bg-gray-50 text-gray-900 border-gray-200';
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {cards.map((card, index) => (
        <div
          key={index}
          className={`border rounded-lg p-6 ${getColorClasses(card.color)}`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium opacity-75">
                {card.title}
              </p>
              <p className="text-2xl font-bold">
                {card.value}
              </p>
            </div>
            {/* TODO: Add trend indicator icon */}
          </div>
          
          <div className="mt-4">
            <p className="text-sm opacity-75">
              {card.subtitle}
            </p>
            
            {/* TODO: Add sparkline chart */}
            {card.trend && (
              <div className="mt-2 h-8">
                {/* Sparkline would go here */}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}