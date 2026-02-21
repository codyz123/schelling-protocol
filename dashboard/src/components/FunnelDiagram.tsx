import React from 'react';

interface FunnelDiagramProps {
  metrics: {
    total_users: number;
    discovered: number;
    evaluated: number;
    exchanged: number;
    committed: number;
    connected: number;
    completed: number;
  };
}

export default function FunnelDiagram({ metrics }: FunnelDiagramProps) {
  const stages = [
    { name: 'Registered', count: metrics.total_users, key: 'total_users' },
    { name: 'Discovered', count: metrics.discovered, key: 'discovered' },
    { name: 'Evaluated', count: metrics.evaluated, key: 'evaluated' },
    { name: 'Exchanged', count: metrics.exchanged, key: 'exchanged' },
    { name: 'Committed', count: metrics.committed, key: 'committed' },
    { name: 'Connected', count: metrics.connected, key: 'connected' },
    { name: 'Completed', count: metrics.completed, key: 'completed' },
  ];

  const maxCount = Math.max(...stages.map(s => s.count));

  return (
    <div className="space-y-4">
      {stages.map((stage, index) => {
        const prevStage = index > 0 ? stages[index - 1] : null;
        const conversionRate = prevStage && prevStage.count > 0 
          ? (stage.count / prevStage.count) * 100 
          : 100;
        
        const widthPercent = maxCount > 0 ? (stage.count / maxCount) * 100 : 0;
        const isLowConversion = prevStage && conversionRate < 50;

        return (
          <div key={stage.key} className="flex items-center space-x-4">
            {/* Stage Bar */}
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-gray-900">
                  {stage.name}
                </span>
                <div className="flex items-center space-x-2">
                  <span className="text-sm font-bold text-gray-900">
                    {stage.count.toLocaleString()}
                  </span>
                  {prevStage && (
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        isLowConversion
                          ? 'bg-red-100 text-red-800'
                          : 'bg-green-100 text-green-800'
                      }`}
                    >
                      {conversionRate.toFixed(1)}%
                    </span>
                  )}
                </div>
              </div>
              
              <div className="w-full bg-gray-200 rounded-full h-6">
                <div
                  className={`h-6 rounded-full flex items-center px-2 ${
                    isLowConversion
                      ? 'bg-red-500'
                      : 'bg-blue-500'
                  }`}
                  style={{ width: `${Math.max(widthPercent, 1)}%` }}
                >
                  {/* Optional: Add count inside bar if space allows */}
                </div>
              </div>
            </div>
            
            {/* Conversion Arrow */}
            {index < stages.length - 1 && (
              <div className="flex flex-col items-center">
                <div className={`text-xs font-medium ${
                  isLowConversion ? 'text-red-600' : 'text-gray-600'
                }`}>
                  ↓
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Summary Stats */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="font-medium text-gray-600">Overall Conversion:</span>
            <span className="ml-2 font-bold">
              {metrics.total_users > 0 
                ? ((metrics.completed / metrics.total_users) * 100).toFixed(1)
                : '0.0'
              }%
            </span>
          </div>
          <div>
            <span className="font-medium text-gray-600">Discovery Rate:</span>
            <span className="ml-2 font-bold">
              {metrics.total_users > 0 
                ? ((metrics.discovered / metrics.total_users) * 100).toFixed(1)
                : '0.0'
              }%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}