// Environment bindings
export interface Env {
    DB: D1Database;
    ACCOUNT_ID: string;
    API_TOKEN: string;
    ANALYTICS_DATASET: string;
    DASHBOARD_PASSWORD: string;
}

// API User from D1
export interface ApiUser {
    api_key: string;
    email: string;
    name: string;
    organization: string;
    is_academic: boolean;
    max_per_second: number;
}

// Top user analytics result
export interface TopUser {
    apiKey: string;
    name: string | null;
    email: string | null;
    organization: string | null;
    requestCount: number;
    requestsPerSecond: number;
    avgResponseTime: number;
    successRate: number;
}

// Anonymous user analytics result
export interface TopAnonymousUser {
    bucket: string;
    ipSample: string | null;
    topIp: string | null;
    requestCount: number;
    requestsPerSecond: number;
    avgResponseTime: number;
    successRate: number;
}

// Timeline data point
export interface TimelineDataPoint {
    timestamp: string;
    requestCount: number;
    avgResponseTime: number;
}

// Query period type
export type Period = 'hour' | 'day';

// Status code breakdown item
export interface StatusCodeBreakdown {
    statusCode: number;
    requestCount: number;
    percentage: number;
}

// API response types
export interface TopUsersResponse {
    period: Period;
    data: TopUser[];
    timestamp: string;
}

export interface TopAnonymousResponse {
    period: Period;
    data: TopAnonymousUser[];
    timestamp: string;
}

export interface TimelineResponse {
    period: Period;
    data: TimelineDataPoint[];
    timestamp: string;
}
