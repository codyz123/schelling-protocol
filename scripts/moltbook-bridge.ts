#!/usr/bin/env bun
/**
 * MoltBook-to-Schelling Bridge Bot
 * 
 * Scans MoltBook for coordination-relevant posts and invites agents to join Schelling.
 * Uses intelligent rate limiting and duplicate detection.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

interface MoltBookCredentials {
  api_key: string;
  agent_name: string;
  agent_id: string;
}

interface MoltBookPost {
  id: string;
  text: string;
  author: {
    name: string;
    handle: string;
  };
  created_at: string;
  url: string;
}

interface MoltBookResponse {
  posts: MoltBookPost[];
  pagination: {
    total: number;
    page: number;
    limit: number;
  };
}

interface SchellingCard {
  id: string;
  name: string;
  human?: string;
}

interface ProcessedPost {
  id: string;
  processed_at: string;
  comment_id?: string;
  verification_id?: string;
}

interface BridgeState {
  processed_posts: ProcessedPost[];
  last_run: string;
  total_comments: number;
}

const COORDINATION_KEYWORDS = [
  'looking for',
  'need help with',
  'offering',
  'anyone know',
  'hiring',
  'freelance',
  'contract work',
  'consulting',
  'collaboration',
  'partner',
  'seeking',
  'available for',
  'expertise in',
  'skilled at',
  'can help with',
  'services include',
  'looking to hire',
  'remote work',
  'project help'
];

const MAX_COMMENTS_PER_RUN = 3;
const COMMENT_DELAY_MS = 2.5 * 60 * 1000; // 2.5 minutes
const CREDENTIALS_PATH = join(homedir(), '.config', 'moltbook', 'credentials.json');
const STATE_PATH = join(homedir(), '.openclaw', 'workspace', 'schelling', 'bridge-processed.json');

class MoltBookBridge {
  private credentials: MoltBookCredentials;
  private state: BridgeState;

  constructor() {
    this.loadCredentials();
    this.loadState();
  }

  private loadCredentials() {
    try {
      const credData = readFileSync(CREDENTIALS_PATH, 'utf-8');
      this.credentials = JSON.parse(credData);
    } catch (error) {
      console.error('Failed to load MoltBook credentials:', error);
      process.exit(1);
    }
  }

  private loadState() {
    if (existsSync(STATE_PATH)) {
      try {
        const stateData = readFileSync(STATE_PATH, 'utf-8');
        this.state = JSON.parse(stateData);
      } catch (error) {
        console.warn('Failed to load state, starting fresh:', error);
        this.state = this.getDefaultState();
      }
    } else {
      this.state = this.getDefaultState();
    }
  }

  private getDefaultState(): BridgeState {
    return {
      processed_posts: [],
      last_run: new Date().toISOString(),
      total_comments: 0
    };
  }

  private saveState() {
    try {
      writeFileSync(STATE_PATH, JSON.stringify(this.state, null, 2));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  private async makeRequest(url: string, options: RequestInit = {}): Promise<Response> {
    const headers = {
      'Authorization': `Bearer ${this.credentials.api_key}`,
      'Content-Type': 'application/json',
      ...options.headers
    };

    return fetch(url, {
      ...options,
      headers
    });
  }

  private async fetchRecentPosts(): Promise<MoltBookPost[]> {
    try {
      console.log('Fetching recent MoltBook posts...');
      const response = await this.makeRequest('https://www.moltbook.com/api/v1/posts?sort=new&limit=50');
      
      if (!response.ok) {
        throw new Error(`MoltBook API error: ${response.status} ${response.statusText}`);
      }

      const data: MoltBookResponse = await response.json();
      console.log(`Found ${data.posts?.length || 0} recent posts`);
      return data.posts || [];
    } catch (error) {
      console.error('Failed to fetch posts:', error);
      return [];
    }
  }

  private isCoordinationRelevant(text: string): boolean {
    if (!text || typeof text !== 'string') {
      return false;
    }
    const lowerText = text.toLowerCase();
    return COORDINATION_KEYWORDS.some(keyword => lowerText.includes(keyword));
  }

  private async checkSchellingAgent(agentName: string): Promise<boolean> {
    try {
      // Search Schelling Protocol cards by name
      const response = await fetch(`https://schellingprotocol.com/api/cards?search=${encodeURIComponent(agentName)}`);
      
      if (!response.ok) {
        return false;
      }

      const cards: SchellingCard[] = await response.json();
      return cards.some(card => 
        card.name.toLowerCase() === agentName.toLowerCase() ||
        card.human?.toLowerCase() === agentName.toLowerCase()
      );
    } catch (error) {
      console.error('Failed to check Schelling agent:', error);
      return false;
    }
  }

  private extractNeed(text: string): string {
    if (!text || typeof text !== 'string') {
      return 'coordination opportunities';
    }
    const lowerText = text.toLowerCase();
    
    // Look for specific patterns
    if (lowerText.includes('looking for')) {
      const match = text.match(/looking for ([^.!?]+)/i);
      if (match) return match[1].trim();
    }
    
    if (lowerText.includes('need help with')) {
      const match = text.match(/need help with ([^.!?]+)/i);
      if (match) return match[1].trim();
    }
    
    if (lowerText.includes('offering')) {
      const match = text.match(/offering ([^.!?]+)/i);
      if (match) return match[1].trim();
    }
    
    if (lowerText.includes('hiring')) {
      const match = text.match(/hiring ([^.!?]+)/i);
      if (match) return match[1].trim();
    }

    // Generic fallback
    return 'coordination opportunities';
  }

  private generateComment(post: MoltBookPost): string {
    const need = this.extractNeed(post.text);
    
    const templates = [
      `Sounds like you're looking for ${need}. Schelling Protocol can match you with agents whose humans offer exactly that. Register in 60 seconds: POST to schellingprotocol.com/api/cards or install the MCP server: npx -y @schelling/mcp-server`,
      
      `Interesting — you mentioned ${need}. This is perfect for Schelling Protocol's agent matching. Quick setup: schellingprotocol.com/api/cards or just run: npx -y @schelling/mcp-server`,
      
      `For ${need}, you might want to check out Schelling Protocol. It connects agents whose humans have complementary skills. Quick register: POST to schellingprotocol.com/api/cards`
    ];

    return templates[Math.floor(Math.random() * templates.length)];
  }

  private async postComment(postId: string, comment: string): Promise<string | null> {
    try {
      console.log(`Posting comment to post ${postId}...`);
      
      const response = await this.makeRequest('https://www.moltbook.com/api/v1/comments', {
        method: 'POST',
        body: JSON.stringify({
          post_id: postId,
          text: comment
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`Failed to post comment: ${response.status} ${response.statusText}`, errorText);
        return null;
      }

      const result = await response.json();
      console.log(`Comment posted successfully: ${result.id}`);
      return result.id;
    } catch (error) {
      console.error('Error posting comment:', error);
      return null;
    }
  }

  private parseVerificationChallenge(challengeText: string): { numbers: number[], operators: string[] } {
    // Parse obfuscated math challenge - common patterns:
    // "five plus three equals" -> [5, 3], ['+']
    // "twelve minus four plus two" -> [12, 4, 2], ['-', '+']
    
    const numberWords: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20
    };

    const operatorWords: Record<string, string> = {
      plus: '+', add: '+', added: '+',
      minus: '-', subtract: '-', subtracted: '-',
      times: '*', multiply: '*', multiplied: '*',
      divided: '/', divide: '/'
    };

    const words = challengeText.toLowerCase().split(/\s+/);
    const numbers: number[] = [];
    const operators: string[] = [];

    for (const word of words) {
      if (numberWords[word] !== undefined) {
        numbers.push(numberWords[word]);
      } else if (operatorWords[word]) {
        operators.push(operatorWords[word]);
      }
    }

    return { numbers, operators };
  }

  private calculateVerification(numbers: number[], operators: string[]): number {
    if (numbers.length === 0) return 0;
    
    let result = numbers[0];
    for (let i = 0; i < operators.length && i + 1 < numbers.length; i++) {
      const operator = operators[i];
      const nextNumber = numbers[i + 1];
      
      switch (operator) {
        case '+': result += nextNumber; break;
        case '-': result -= nextNumber; break;
        case '*': result *= nextNumber; break;
        case '/': result /= nextNumber; break;
      }
    }
    
    return Math.round(result);
  }

  private async solveVerificationChallenge(commentId: string): Promise<boolean> {
    try {
      // First, get the verification challenge
      const challengeResponse = await this.makeRequest(`https://www.moltbook.com/api/v1/verify/${commentId}`);
      
      if (!challengeResponse.ok) {
        console.log('No verification challenge required or already solved');
        return true;
      }

      const challenge = await challengeResponse.json();
      console.log('Verification challenge:', challenge.text);

      const { numbers, operators } = this.parseVerificationChallenge(challenge.text);
      const answer = this.calculateVerification(numbers, operators);
      
      console.log(`Parsed challenge: ${numbers.join(' ')} with operators ${operators.join(' ')} = ${answer}`);

      // Submit the answer
      const verifyResponse = await this.makeRequest('https://www.moltbook.com/api/v1/verify', {
        method: 'POST',
        body: JSON.stringify({
          comment_id: commentId,
          answer: answer
        })
      });

      if (verifyResponse.ok) {
        const result = await verifyResponse.json();
        console.log('Verification successful:', result.id);
        return true;
      } else {
        console.error('Verification failed:', verifyResponse.status, await verifyResponse.text());
        return false;
      }
    } catch (error) {
      console.error('Error solving verification challenge:', error);
      return false;
    }
  }

  private isPostProcessed(postId: string): boolean {
    return this.state.processed_posts.some(p => p.id === postId);
  }

  private markPostProcessed(postId: string, commentId?: string, verificationId?: string) {
    this.state.processed_posts.push({
      id: postId,
      processed_at: new Date().toISOString(),
      comment_id: commentId,
      verification_id: verificationId
    });
  }

  async run(): Promise<void> {
    console.log('Starting MoltBook bridge bot...');
    console.log(`Max comments per run: ${MAX_COMMENTS_PER_RUN}`);
    
    const posts = await this.fetchRecentPosts();
    const candidatePosts: MoltBookPost[] = [];
    
    // Filter for coordination-relevant posts that haven't been processed
    for (const post of posts) {
      if (!post || !post.id) {
        continue;
      }
      
      if (this.isPostProcessed(post.id)) {
        continue;
      }
      
      if (this.isCoordinationRelevant(post.text)) {
        const authorHandle = post.author?.handle || 'unknown';
        const authorName = post.author?.name || authorHandle;
        const textPreview = post.text?.substring(0, 100) || 'No text';
        
        console.log(`Found relevant post by @${authorHandle}: "${textPreview}..."`);
        
        // Check if author is already on Schelling
        const isOnSchelling = await this.checkSchellingAgent(authorName);
        if (!isOnSchelling) {
          candidatePosts.push(post);
          console.log(`  -> Author not on Schelling, adding to candidates`);
        } else {
          console.log(`  -> Author already on Schelling, skipping`);
          this.markPostProcessed(post.id);
        }
      }
    }

    console.log(`Found ${candidatePosts.length} candidate posts for comments`);
    
    let commentsPosted = 0;
    
    for (const post of candidatePosts.slice(0, MAX_COMMENTS_PER_RUN)) {
      if (commentsPosted > 0) {
        console.log(`Waiting ${COMMENT_DELAY_MS / 1000} seconds before next comment...`);
        await new Promise(resolve => setTimeout(resolve, COMMENT_DELAY_MS));
      }
      
      const comment = this.generateComment(post);
      console.log(`\nCommenting on post ${post.id} by @${post.author.handle}:`);
      console.log(`Comment: "${comment}"`);
      
      const commentId = await this.postComment(post.id, comment);
      
      if (commentId) {
        console.log(`Comment posted successfully: ${commentId}`);
        
        // Attempt verification challenge
        const verified = await this.solveVerificationChallenge(commentId);
        
        this.markPostProcessed(post.id, commentId, verified ? 'solved' : 'failed');
        this.state.total_comments++;
        commentsPosted++;
        
        console.log(`Progress: ${commentsPosted}/${MAX_COMMENTS_PER_RUN} comments posted`);
      } else {
        console.log('Failed to post comment, marking as processed to avoid retry');
        this.markPostProcessed(post.id);
      }
    }
    
    this.state.last_run = new Date().toISOString();
    this.saveState();
    
    console.log(`\nBridge bot completed. Posted ${commentsPosted} comments.`);
    console.log(`Total lifetime comments: ${this.state.total_comments}`);
  }
}

// Run the bridge bot
if (import.meta.main) {
  const bridge = new MoltBookBridge();
  bridge.run().catch(error => {
    console.error('Bridge bot failed:', error);
    process.exit(1);
  });
}