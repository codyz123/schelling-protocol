import type { 
  HealthResponse, 
  ServerInfo, 
  AnalyticsResponse, 
  IntentCluster,
  SearchResult,
  EvaluateResult,
} from '../types';

const DEFAULT_BASE_URL = 'http://localhost:3000';

export class SchellingAPI {
  private baseUrl: string;
  private adminToken?: string;

  constructor(baseUrl: string = DEFAULT_BASE_URL) {
    this.baseUrl = baseUrl;
  }

  setBaseUrl(url: string) {
    this.baseUrl = url.replace(/\/+$/, ''); // Strip trailing slashes
  }

  setAdminToken(token: string) {
    this.adminToken = token;
  }

  private async request<T>(
    endpoint: string, 
    data?: Record<string, unknown>, 
    userToken?: string
  ): Promise<T> {
    const isHealthEndpoint = endpoint === '/health';
    const url = endpoint.startsWith('/') 
      ? `${this.baseUrl}${endpoint}`
      : `${this.baseUrl}/schelling/${endpoint}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    const method = isHealthEndpoint ? 'GET' : 'POST';

    let body: string | undefined;
    if (method === 'POST') {
      const requestData: Record<string, unknown> = data ? { ...data } : {};
      if (this.adminToken && !userToken) {
        requestData.admin_token = this.adminToken;
      }
      body = JSON.stringify(requestData);
    }

    const response = await fetch(url, {
      method,
      headers,
      body,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`API Error: ${response.status} ${error}`);
    }

    return response.json();
  }

  // Health endpoint (GET /health — no body)
  async getHealth(): Promise<HealthResponse> {
    return this.request<HealthResponse>('/health');
  }

  // Server info
  async getServerInfo(): Promise<ServerInfo> {
    return this.request<ServerInfo>('server_info');
  }

  // Analytics — uses admin_token for auth, no user_token needed
  async getAnalytics(options: {
    cluster_id?: string;
    time_range?: { start?: string; end?: string };
    include_embeddings?: boolean;
  } = {}): Promise<AnalyticsResponse> {
    // Use the admin token as the user_token since the analytics handler
    // validates user existence. The admin token should be a registered user.
    return this.request<AnalyticsResponse>('analytics', {
      user_token: this.adminToken ?? '',
      ...options,
    });
  }

  // Clusters/Intents — handleListVerticals does not require user_token
  async getClusters(): Promise<{ clusters: IntentCluster[] }> {
    return this.request<{ clusters: IntentCluster[] }>('intents', {});
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

  // Server returns { comparisons: ComparisonResult[] } for evaluate
  async evaluate(userToken: string, candidateIds: string[]): Promise<EvaluateResult[]> {
    const result = await this.request<{ comparisons: EvaluateResult[] }>('evaluate', {
      candidate_ids: candidateIds,
    }, userToken);
    return result.comparisons;
  }

  async exchange(userToken: string, candidateId: string): Promise<Record<string, unknown>> {
    return this.request('exchange', {
      candidate_id: candidateId,
    }, userToken);
  }

  async commit(userToken: string, candidateId: string): Promise<Record<string, unknown>> {
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
  ): Promise<Record<string, unknown>> {
    return this.request('decline', {
      candidate_id: candidateId,
      ...options,
    }, userToken);
  }

  async sendMessage(userToken: string, candidateId: string, message: string): Promise<Record<string, unknown>> {
    return this.request('message', {
      candidate_id: candidateId,
      message,
    }, userToken);
  }

  async getMessages(userToken: string, candidateId: string): Promise<Record<string, unknown>> {
    return this.request('messages', {
      candidate_id: candidateId,
    }, userToken);
  }

  async reportOutcome(
    userToken: string, 
    candidateId: string, 
    outcome: 'positive' | 'neutral' | 'negative',
    notes?: string
  ): Promise<Record<string, unknown>> {
    return this.request('report', {
      candidate_id: candidateId,
      outcome,
      notes,
    }, userToken);
  }

  async getInsights(userToken: string): Promise<Record<string, unknown>> {
    return this.request('my_insights', {}, userToken);
  }

  // Events endpoint for the event log
  async getEvents(options: {
    limit?: number;
    offset?: number;
    event_type?: string;
    cluster_id?: string;
  } = {}): Promise<Record<string, unknown>> {
    return this.request('events', {
      user_token: this.adminToken ?? '',
      ...options,
    });
  }
}

export const api = new SchellingAPI();
