import React, { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAppStore } from '../lib/store';
import { api } from '../lib/api';

export default function TopNav() {
  const location = useLocation();
  const { serverHealth, setServerHealth } = useAppStore();
  
  // Health check query
  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: () => api.getHealth(),
    refetchInterval: 10000, // Check every 10 seconds
    retry: 1,
  });

  useEffect(() => {
    if (health) {
      setServerHealth(health.status === 'healthy' ? 'healthy' : 'unhealthy');
    }
  }, [health, setServerHealth]);

  const navItems = [
    { path: '/', label: 'Dashboard' },
    { path: '/simulator', label: 'Simulator' },
    { path: '/inspector', label: 'Match Inspector' },
    { path: '/events', label: 'Event Log' },
  ];

  const getStatusColor = () => {
    switch (serverHealth) {
      case 'healthy': return 'text-green-600';
      case 'unhealthy': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  const getStatusDot = () => {
    switch (serverHealth) {
      case 'healthy': return 'bg-green-600';
      case 'unhealthy': return 'bg-red-600';
      default: return 'bg-gray-600';
    }
  };

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200 fixed top-0 left-0 right-0 z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          <div className="flex">
            <div className="flex-shrink-0 flex items-center">
              <h1 className="text-xl font-semibold text-gray-900">
                Schelling Dashboard
              </h1>
            </div>
            <div className="hidden sm:ml-6 sm:flex sm:space-x-8">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`inline-flex items-center px-1 pt-1 border-b-2 text-sm font-medium ${
                    location.pathname === item.path
                      ? 'border-blue-500 text-gray-900'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Server Status */}
            <div className="flex items-center space-x-2">
              <div className={`w-2 h-2 rounded-full ${getStatusDot()}`} />
              <span className={`text-sm font-medium ${getStatusColor()}`}>
                {serverHealth === 'healthy' && health ? (
                  <>
                    {health.total_users} users, {health.total_candidates} candidates
                  </>
                ) : serverHealth === 'unhealthy' ? (
                  'Server Error'
                ) : (
                  'Checking...'
                )}
              </span>
            </div>
            
            {/* Current Time */}
            <div className="text-sm text-gray-500">
              {new Date().toLocaleTimeString()}
            </div>
          </div>
        </div>
      </div>
      
      {/* Mobile menu */}
      <div className="sm:hidden">
        <div className="pt-2 pb-3 space-y-1">
          {navItems.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`block pl-3 pr-4 py-2 border-l-4 text-base font-medium ${
                location.pathname === item.path
                  ? 'border-blue-500 text-blue-700 bg-blue-50'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50 hover:border-gray-300'
              }`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>
    </nav>
  );
}