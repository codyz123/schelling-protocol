import type { 
  HealthResponse, 
  ServerInfo, 
  AnalyticsResponse, 
  IntentCluster,
  SearchResult,
  EvaluateResult,
  User,
} from '../types';

const DEFAULT_BASE_URL = 'http://localhost:3000';

export class SchellingAPI {
  private baseUrl: string;
  private adminToken?: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setAdminToken(token: string) {
    this.adminToken = token;
  }

  private async request<T>(endpoint: string, data?: any, userToken?: string): Promise<T> {
    const url = endpoint.startsWith('/') 
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}/schelling/${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    const requestData = data ? { ...data } : {};
    if (this.adminToken && !userToken) {
      requestData.admin_token = this.adminToken;
    }

    const response = await fetch(url, {
      method: endpoint.startsWith('/health') ? 'GET' : 'POST',
      headers,
      body: requestData ? JSON.stringify(requestData) : undefined,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // Health endpoint
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Server info
  async getServerInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('server_info');
  }

  // Analytics
  async getAnalytics(options: {
    cluster_id?: string;
    time_range?: { start?: string; end?: string };
    include_embeddings?: boolean;
  } = {}): Promise<AnalyticsResponse> {
    return this.request<AnalyticsResponse>('analytics', {
      user_token: 'admin', // Required by the API but not used for admin calls
      ...options,
    });
  }

  // Clusters/Intents
  async getClusters(): Promise<{ clusters: IntentCluster[] }> {
    return this.request<{ clusters: IntentCluster[] }>('intents', {
      user_token: 'admin',
    });
  }

  // User operations (for synthetic users)
  async register(userData: {
    intents: string[];
    intent_embedding: number[];
    embedding: number[];
    city?: string;
    age_range?: string;
    description?: string;
    seeking?: string;
    interests?: string[];
    values_text?: string;
    name?: string;
    contact?: string;
    agent_model?: string;
    verification_level?: 'anonymous' | 'verified' | 'attested';
    status?: 'active' | 'paused' | 'delisted';
  }): Promise<{ user_token: string }> {
    return this.request<{ user_token: string }>('register', userData);
  }

  async search(
    userToken: string, 
    options: { top_k?: number; threshold?: number; cluster_id?: string } = {}
  ): Promise<{ candidates: SearchResult[] }> {
    return this.request<{ candidates: SearchResult[] }>('search', {
      top_k: 20,
      threshold: 0.5,
      ...options,
    }, userToken);
  }

  async evaluate(userToken: string, candidateIds: string[]): Promise<EvaluateResult[]> {
    const results: EvaluateResult[] = [];
    
    // API only supports one candidate at a time
    for (const candidateId of candidateIds) {
      const result = await this.request<EvaluateResult>('evaluate', {
        candidate_ids: [candidateId],
      }, userToken);
      results.push(result);
    }
    
    return results;
  }

  async exchange(userToken: string, candidateId: string): Promise<any> {
    return this.request('exchange', {
      candidate_id: candidateId,
    }, userToken);
  }

  async commit(userToken: string, candidateId: string): Promise<any> {
    return this.request('commit', {
      candidate_id: candidateId,
    }, userToken);
  }

  async decline(
    userToken: string, 
    candidateId: string, 
    options: {
      reason?: string;
      notes?: string;
      feedback?: {
        dimension_scores?: Record<string, number>;
        rejection_reason?: string;
      };
    } = {}
  ): Promise<any> {
    return this.request('decline', {
      candidate_id: candidateId,
      ...options,
    }, userToken);
  }

  async sendMessage(userToken: string, candidateId: string, message: string): Promise<any> {
    return this.request('message', {
      candidate_id: candidateId,
      message,
    }, userToken);
  }

  async getMessages(userToken: string, candidateId: string): Promise<any> {
    return this.request('messages', {
      candidate_id: candidateId,
    }, userToken);
  }

  async reportOutcome(
    userToken: string, 
    candidateId: string, 
    outcome: 'positive' | 'neutral' | 'negative',
    notes?: string
  ): Promise<any> {
    return this.request('report', {
      candidate_id: candidateId,
      outcome,
      notes,
    }, userToken);
  }

  async getInsights(userToken: string): Promise<any> {
    return this.request('my_insights', {}, userToken);
  }
}

export const api = new SchellingAPI();