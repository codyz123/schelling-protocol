import type {
  RegisterParams,
  UpdateParams,
  SearchParams,
  QuickSeekParams,
  QuickOfferParams,
  ContractParams,
  SubscribeParams,
  Trait,
  Preference,
  Deliverable,
  DescribeResponse,
  RegisterResponse,
  OnboardResponse,
  SearchResponse,
  QuickSeekResponse,
  QuickOfferResponse,
  ConnectionsResponse,
  ContractResponse,
  ReputationResponse,
  SchellingErrorBody,
} from "./types.js";

// ─── Error ───────────────────────────────────────────────────────────

export class SchellingError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "SchellingError";
  }
}

// ─── Client ──────────────────────────────────────────────────────────

export class Schelling {
  private readonly baseUrl: string;
  private token: string | undefined;

  constructor(serverUrl: string, options?: string | { token?: string; maxRetries?: number; retryDelayMs?: number }) {
    this.baseUrl = serverUrl.replace(/\/$/, "");
    if (typeof options === "string") {
      this.token = options;
      this.maxRetries = 2;
      this.retryDelayMs = 1000;
    } else {
      this.token = options?.token;
      this.maxRetries = options?.maxRetries ?? 2;
      this.retryDelayMs = options?.retryDelayMs ?? 1000;
    }
  }

  /** Get or set the current bearer token */
  get userToken(): string | undefined {
    return this.token;
  }
  set userToken(t: string | undefined) {
    this.token = t;
  }

  // ─── Raw HTTP ────────────────────────────────────────────────────

  /** Maximum retries for transient failures (5xx, network errors) */
  readonly maxRetries: number;
  private readonly retryDelayMs: number;

  private async post<T = unknown>(
    operation: string,
    params: Record<string, unknown> | object = {},
  ): Promise<T> {
    const payload = params as Record<string, unknown>;
    if (this.token && !payload.user_token) {
      payload.user_token = this.token;
    }

    const url = `${this.baseUrl}/schelling/${operation}`;
    const body = JSON.stringify(payload);
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        const data: unknown = await res.json();

        if (!res.ok) {
          const err = data as SchellingErrorBody;
          const error = new SchellingError(
            err.code || "UNKNOWN",
            err.message || `HTTP ${res.status}`,
            res.status,
          );
          // Only retry on 5xx (server errors), not 4xx (client errors)
          if (res.status >= 500 && attempt < this.maxRetries) {
            lastError = error;
            await this.sleep(this.retryDelayMs * (attempt + 1));
            continue;
          }
          throw error;
        }

        return data as T;
      } catch (e) {
        if (e instanceof SchellingError) throw e;
        // Network error (fetch failed entirely)
        lastError = e as Error;
        if (attempt < this.maxRetries) {
          await this.sleep(this.retryDelayMs * (attempt + 1));
          continue;
        }
        throw new SchellingError(
          "NETWORK_ERROR",
          `Failed to reach ${this.baseUrl}: ${(e as Error).message}. Is the server running?`,
          0,
        );
      }
    }

    throw lastError || new SchellingError("UNKNOWN", "Request failed after retries", 0);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // ─── Discovery ───────────────────────────────────────────────────

  /** Discover what the Schelling network offers */
  async describe(): Promise<DescribeResponse> {
    return this.post<DescribeResponse>("describe");
  }

  /** Get server metadata */
  async serverInfo(): Promise<Record<string, unknown>> {
    return this.post("server_info");
  }

  /** List or search clusters */
  async clusters(params: {
    action?: "list" | "search" | "describe";
    query?: string;
    prefix?: string;
    min_population?: number;
    sort?: "population" | "created" | "activity";
    limit?: number;
    cursor?: string;
  } = {}): Promise<Record<string, unknown>> {
    return this.post("clusters", params);
  }

  /** Get detailed cluster info */
  async clusterInfo(clusterId: string): Promise<Record<string, unknown>> {
    return this.post("cluster_info", { cluster_id: clusterId });
  }

  // ─── Onboarding & Registration ──────────────────────────────────

  /** NL onboarding: describe what you want, get a registration template */
  async onboard(naturalLanguage: string, clusterId?: string): Promise<OnboardResponse> {
    return this.post<OnboardResponse>("onboard", {
      natural_language: naturalLanguage,
      ...(clusterId && { cluster_id: clusterId }),
    });
  }

  /** Register with structured traits and preferences */
  async register(params: RegisterParams): Promise<RegisterResponse> {
    const p = { protocol_version: "3.0", ...params };
    const result = await this.post<RegisterResponse>("register", p);
    if (result.user_token) {
      this.token = result.user_token;
    }
    return result;
  }

  /** Update your registration */
  async update(params: Omit<UpdateParams, "user_token">): Promise<Record<string, unknown>> {
    return this.post("update", params);
  }

  /** Refresh staleness clock */
  async refresh(): Promise<Record<string, unknown>> {
    return this.post("refresh");
  }

  // ─── Natural Language Interface ─────────────────────────────────

  /**
   * Find what you need in one call (NL interface).
   * Wraps quick_seek with a simple string input.
   */
  async seek(intent: string, options?: Partial<Omit<QuickSeekParams, "intent">>): Promise<QuickSeekResponse> {
    const result = await this.post<QuickSeekResponse>("quick_seek", { intent, ...options });
    if (result.user_token && !this.token) {
      this.token = result.user_token;
    }
    return result;
  }

  /**
   * Advertise what you offer in one call (NL interface).
   * Wraps quick_offer with a simple string input.
   */
  async offer(intent: string, options?: Partial<Omit<QuickOfferParams, "intent">>): Promise<QuickOfferResponse> {
    const result = await this.post<QuickOfferResponse>("quick_offer", { intent, ...options });
    if (result.user_token && !this.token) {
      this.token = result.user_token;
    }
    return result;
  }

  // ─── Search ─────────────────────────────────────────────────────

  /** Full structured search */
  async search(params: Omit<SearchParams, "user_token"> = {}): Promise<SearchResponse> {
    return this.post<SearchResponse>("search", params);
  }

  /** Quick seek with all options */
  async quickSeek(params: QuickSeekParams): Promise<QuickSeekResponse> {
    const result = await this.post<QuickSeekResponse>("quick_seek", params);
    if (result.user_token && !this.token) {
      this.token = result.user_token;
    }
    return result;
  }

  /** Quick offer with all options */
  async quickOffer(params: QuickOfferParams): Promise<QuickOfferResponse> {
    const result = await this.post<QuickOfferResponse>("quick_offer", params);
    if (result.user_token && !this.token) {
      this.token = result.user_token;
    }
    return result;
  }

  /** Quick match — both sides in one call */
  async quickMatch(params: {
    seek: Record<string, unknown>;
    offer: Record<string, unknown>;
    auto_connect?: boolean;
  }): Promise<Record<string, unknown>> {
    return this.post("quick_match", params);
  }

  // ─── Funnel Operations ──────────────────────────────────────────

  /** Express interest in a candidate */
  async interest(candidateId: string, contractProposal?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post("interest", {
      candidate_id: candidateId,
      ...(contractProposal && { contract_proposal: contractProposal }),
    });
  }

  /** Commit to a candidate */
  async commit(candidateId: string): Promise<Record<string, unknown>> {
    return this.post("commit", { candidate_id: candidateId });
  }

  /** List connections */
  async connections(params: {
    stage_filter?: number;
    cluster_filter?: string;
    mode_filter?: string;
    limit?: number;
    cursor?: string;
  } = {}): Promise<ConnectionsResponse> {
    return this.post<ConnectionsResponse>("connections", params);
  }

  /** Decline a candidate */
  async decline(candidateId: string, reason?: string, feedback?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post("decline", {
      candidate_id: candidateId,
      ...(reason ? { reason } : {}),
      ...(feedback ? { feedback } : {}),
    });
  }

  /** Reconsider a declined candidate */
  async reconsider(candidateId: string): Promise<Record<string, unknown>> {
    return this.post("reconsider", { candidate_id: candidateId });
  }

  /** Withdraw from COMMITTED/CONNECTED */
  async withdraw(candidateId: string, reason?: string): Promise<Record<string, unknown>> {
    return this.post("withdraw", {
      candidate_id: candidateId,
      ...(reason && { reason }),
    });
  }

  /** Report outcome */
  async report(candidateId: string, outcome: "positive" | "neutral" | "negative", feedback?: Record<string, unknown>): Promise<Record<string, unknown>> {
    return this.post("report", {
      candidate_id: candidateId,
      outcome,
      ...(feedback ? { feedback } : {}),
    });
  }

  /** Get pending actions */
  async pending(): Promise<Record<string, unknown>> {
    return this.post("pending");
  }

  // ─── Communication ──────────────────────────────────────────────

  /** Send a message */
  async message(candidateId: string, content: string): Promise<Record<string, unknown>> {
    return this.post("message", { candidate_id: candidateId, content });
  }

  /** Get messages */
  async messages(candidateId: string, params: { since?: string; limit?: number; cursor?: string } = {}): Promise<Record<string, unknown>> {
    return this.post("messages", { candidate_id: candidateId, ...params });
  }

  /** Share direct contact info */
  async direct(candidateId: string, contactInfo: string): Promise<Record<string, unknown>> {
    return this.post("direct", { candidate_id: candidateId, contact_info: contactInfo });
  }

  /** Block/unblock relay */
  async relayBlock(candidateId: string, blocked: boolean): Promise<Record<string, unknown>> {
    return this.post("relay_block", { candidate_id: candidateId, blocked });
  }

  /** Pre-commitment Q&A */
  async inquire(candidateId: string, params: {
    action: "ask" | "answer" | "list";
    question?: string;
    category?: string;
    required?: boolean;
    inquiry_id?: string;
    answer?: string;
    confidence?: number;
    source?: string;
  }): Promise<Record<string, unknown>> {
    return this.post("inquire", { candidate_id: candidateId, ...params });
  }

  // ─── Contracts & Deliverables ───────────────────────────────────

  /** Contract lifecycle */
  async contract(params: Omit<ContractParams, "user_token">): Promise<ContractResponse> {
    return this.post<ContractResponse>("contract", params);
  }

  /** Deliver an artifact */
  async deliver(contractId: string, deliverable: Deliverable, milestoneId?: string, message?: string): Promise<Record<string, unknown>> {
    return this.post("deliver", {
      contract_id: contractId,
      deliverable,
      ...(milestoneId && { milestone_id: milestoneId }),
      ...(message && { message }),
    });
  }

  /** Accept or reject a delivery */
  async acceptDelivery(deliveryId: string, accepted: boolean, feedback?: string, rating?: number): Promise<Record<string, unknown>> {
    return this.post("accept_delivery", {
      delivery_id: deliveryId,
      accepted,
      ...(feedback && { feedback }),
      ...(rating !== undefined && { rating }),
    });
  }

  /** List deliverables */
  async deliveries(contractId: string, statusFilter?: string): Promise<Record<string, unknown>> {
    return this.post("deliveries", {
      contract_id: contractId,
      ...(statusFilter && { status_filter: statusFilter }),
    });
  }

  // ─── Events ─────────────────────────────────────────────────────

  /** Lifecycle events */
  async event(params: {
    action: "emit" | "ack" | "list";
    candidate_id?: string;
    contract_id?: string;
    event_type?: string;
    payload?: unknown;
    requires_ack?: boolean;
    ack_deadline_hours?: number;
    event_id?: string;
    response?: string;
    since?: string;
    limit?: number;
  }): Promise<Record<string, unknown>> {
    return this.post("event", params);
  }

  // ─── Subscriptions ──────────────────────────────────────────────

  /** Create or list subscriptions */
  async subscribe(params: Omit<SubscribeParams, "user_token"> = {}): Promise<Record<string, unknown>> {
    return this.post("subscribe", params);
  }

  /** Cancel a subscription */
  async unsubscribe(subscriptionId: string): Promise<Record<string, unknown>> {
    return this.post("unsubscribe", { subscription_id: subscriptionId });
  }

  /** List notifications */
  async notifications(params: { subscription_id?: string; since?: string; limit?: number } = {}): Promise<Record<string, unknown>> {
    return this.post("notifications", params);
  }

  // ─── Reputation & Enforcement ───────────────────────────────────

  /** Get reputation */
  async reputation(candidateId?: string): Promise<ReputationResponse> {
    return this.post<ReputationResponse>("reputation", {
      ...(candidateId && { candidate_id: candidateId }),
    });
  }

  /** File a dispute */
  async dispute(candidateId: string, reason: string, evidence?: string[], traitClaims?: unknown[], deliveryClaims?: unknown[]): Promise<Record<string, unknown>> {
    return this.post("dispute", {
      candidate_id: candidateId,
      reason,
      ...(evidence && { evidence }),
      ...(traitClaims && { trait_claims: traitClaims }),
      ...(deliveryClaims && { delivery_claims: deliveryClaims }),
    });
  }

  /** Check jury duty */
  async juryDuty(): Promise<Record<string, unknown>> {
    return this.post("jury_duty");
  }

  /** Submit jury verdict */
  async juryVerdict(disputeId: string, verdict: "for_filer" | "for_defendant" | "dismissed", reasoning: string): Promise<Record<string, unknown>> {
    return this.post("jury_verdict", { dispute_id: disputeId, verdict, reasoning });
  }

  /** Submit or request verification */
  async verify(params: {
    action: "submit" | "request";
    trait_key: string;
    evidence_type?: string;
    evidence_data?: string;
    requested_tier?: string;
    candidate_id?: string;
  }): Promise<Record<string, unknown>> {
    return this.post("verify", params);
  }

  // ─── Tools ──────────────────────────────────────────────────────

  /** Register a third-party tool */
  async registerTool(params: {
    tool_id: string;
    display_name: string;
    description: string;
    one_line_description: string;
    endpoint: string;
    input_schema: unknown;
    output_schema: unknown;
    cluster_scope?: string[];
    pricing?: unknown;
    version: string;
    health_check_endpoint?: string;
  }): Promise<Record<string, unknown>> {
    return this.post("register_tool", params);
  }

  /** List available tools */
  async listTools(params: {
    cluster_id?: string;
    query?: string;
    type?: "default" | "third_party" | "all";
    min_reputation?: number;
    limit?: number;
    cursor?: string;
  } = {}): Promise<Record<string, unknown>> {
    return this.post("list_tools", params);
  }

  /** Invoke a tool */
  async invokeTool(toolId: string, input: unknown): Promise<Record<string, unknown>> {
    return this.post("tool/invoke", { tool_id: toolId, input });
  }

  /** Rate a tool */
  async toolFeedback(toolId: string, rating: "positive" | "negative", comment?: string): Promise<Record<string, unknown>> {
    return this.post("tool/feedback", { tool_id: toolId, rating, ...(comment && { comment }) });
  }

  // ─── Analytics ──────────────────────────────────────────────────

  /** Personal insights */
  async myInsights(): Promise<Record<string, unknown>> {
    return this.post("my_insights");
  }

  // ─── Privacy ────────────────────────────────────────────────────

  /** Export all your data */
  async exportData(format?: "json" | "csv"): Promise<Record<string, unknown>> {
    return this.post("export", { ...(format && { format }) });
  }

  /** Permanently delete account */
  async deleteAccount(): Promise<Record<string, unknown>> {
    return this.post("delete_account", { confirmation: "PERMANENTLY_DELETE" });
  }
}
