import React from 'react'
import ReactDOM from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App.tsx'
import './index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,          // Data stays fresh for 5 seconds
      retry: 2,                  // Retry failed queries twice
      refetchOnWindowFocus: true, // Refresh when user returns to tab
    },
    mutations: {
      retry: 0, // Don't retry mutations — user should manually retry
    },
  },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
)
