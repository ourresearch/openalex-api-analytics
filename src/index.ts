import type { Env, Period, TopUsersResponse, TopAnonymousResponse, TimelineResponse } from './types';
import { getTopUsers, getTopAnonymousUsers, getUsageTimeline, getUserStatusBreakdown, getAnonymousStatusBreakdown, getUserTimeline, getAnonymousTimeline, getTopIpInBucket, getSampleUrlsForUser, getSampleUrlsForBucket, getTopUserAgentsForUser, getTopReferrersForUser, getTopUserAgentsForBucket, getTopReferrersForBucket, getTopUserAgentsAggregate, getTopReferrersAggregate } from './queries';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // CORS headers for API requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        // Check authentication
        const authResponse = checkAuth(request, env);
        if (authResponse) {
            return authResponse;
        }

        // Route: API endpoints
        if (url.pathname.startsWith('/api/')) {
            return handleApiRequest(request, url, env, corsHeaders);
        }

        // Route: Serve HTML dashboard
        if (url.pathname === '/' || url.pathname === '/index.html') {
            return new Response(getHtmlDashboard(), {
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                    'Cache-Control': 'no-cache'
                }
            });
        }

        // Route: Serve API Keys page
        if (url.pathname === '/api-keys' || url.pathname === '/api-keys.html') {
            return new Response(getApiKeysPage(), {
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                    'Cache-Control': 'no-cache'
                }
            });
        }

        // 404 for unknown routes
        return new Response('Not Found', { status: 404 });
    }
};

/**
 * Check HTTP Basic Authentication (password-only)
 * Username can be anything, only password is validated
 */
function checkAuth(request: Request, env: Env): Response | null {
    const authorization = request.headers.get('Authorization');

    if (!authorization) {
        return new Response('Authentication required', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
            }
        });
    }

    const [scheme, encoded] = authorization.split(' ');

    if (!scheme || scheme.toLowerCase() !== 'basic') {
        return new Response('Invalid authentication scheme', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
            }
        });
    }

    if (!encoded) {
        return new Response('Invalid authentication credentials', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
            }
        });
    }

    try {
        const decoded = atob(encoded);
        const colonIndex = decoded.indexOf(':');

        if (colonIndex === -1) {
            return new Response('Invalid authentication format', {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
                }
            });
        }

        // Extract password (everything after first colon)
        const password = decoded.substring(colonIndex + 1);

        // Validate password against environment variable
        if (password !== env.DASHBOARD_PASSWORD) {
            return new Response('Invalid password', {
                status: 401,
                headers: {
                    'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
                }
            });
        }

        // Authentication successful
        return null;
    } catch (error) {
        return new Response('Invalid authentication encoding', {
            status: 401,
            headers: {
                'WWW-Authenticate': 'Basic realm="Analytics Dashboard", charset="UTF-8"'
            }
        });
    }
}

/**
 * Handle API requests
 */
async function handleApiRequest(request: Request, url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
    try {
        const period = (url.searchParams.get('period') || 'hour') as Period;
        const limit = parseInt(url.searchParams.get('limit') || '10', 10);

        // Validate period
        if (period !== 'hour' && period !== 'day') {
            return jsonResponse({ error: 'Invalid period. Use "hour" or "day".' }, 400, corsHeaders);
        }

        // Route: Top authenticated users
        if (url.pathname === '/api/top-users') {
            const data = await getTopUsers(env, period, limit);
            const response: TopUsersResponse = {
                period,
                data,
                timestamp: new Date().toISOString()
            };
            return jsonResponse(response, 200, corsHeaders);
        }

        // Route: Top anonymous users
        if (url.pathname === '/api/top-anonymous') {
            const data = await getTopAnonymousUsers(env, period, limit);
            const response: TopAnonymousResponse = {
                period,
                data,
                timestamp: new Date().toISOString()
            };
            return jsonResponse(response, 200, corsHeaders);
        }

        // Route: Usage timeline
        if (url.pathname === '/api/usage-timeline') {
            const data = await getUsageTimeline(env, period);
            const response: TimelineResponse = {
                period,
                data,
                timestamp: new Date().toISOString()
            };
            return jsonResponse(response, 200, corsHeaders);
        }

        // Route: User status breakdown
        if (url.pathname === '/api/user-status-breakdown') {
            const apiKey = url.searchParams.get('apiKey');
            if (!apiKey) {
                return jsonResponse({ error: 'apiKey parameter is required' }, 400, corsHeaders);
            }
            const data = await getUserStatusBreakdown(env, apiKey, period);
            return jsonResponse({ period, data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Anonymous user status breakdown
        if (url.pathname === '/api/anonymous-status-breakdown') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const data = await getAnonymousStatusBreakdown(env, bucket, period);
            return jsonResponse({ period, data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: User timeline with status code breakdown
        if (url.pathname === '/api/user-timeline') {
            const apiKey = url.searchParams.get('apiKey');
            if (!apiKey) {
                return jsonResponse({ error: 'apiKey parameter is required' }, 400, corsHeaders);
            }
            const data = await getUserTimeline(env, apiKey, period);
            return jsonResponse({ period, data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Anonymous timeline with status code breakdown
        if (url.pathname === '/api/anonymous-timeline') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const data = await getAnonymousTimeline(env, bucket, period);
            return jsonResponse({ period, data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top IP in anonymous bucket
        if (url.pathname === '/api/top-ip-in-bucket') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const ipAddress = await getTopIpInBucket(env, bucket, period);
            return jsonResponse({ bucket, ipAddress, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get sample URLs for user
        if (url.pathname === '/api/sample-urls-user') {
            const apiKey = url.searchParams.get('apiKey');
            if (!apiKey) {
                return jsonResponse({ error: 'apiKey parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const urls = await getSampleUrlsForUser(env, apiKey, period, limit);
            return jsonResponse({ urls, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get sample URLs for anonymous bucket
        if (url.pathname === '/api/sample-urls-bucket') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const urls = await getSampleUrlsForBucket(env, bucket, period, limit);
            return jsonResponse({ urls, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top user agents for user
        if (url.pathname === '/api/user-agents-user') {
            const apiKey = url.searchParams.get('apiKey');
            if (!apiKey) {
                return jsonResponse({ error: 'apiKey parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopUserAgentsForUser(env, apiKey, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top referrers for user
        if (url.pathname === '/api/referrers-user') {
            const apiKey = url.searchParams.get('apiKey');
            if (!apiKey) {
                return jsonResponse({ error: 'apiKey parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopReferrersForUser(env, apiKey, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top user agents for anonymous bucket
        if (url.pathname === '/api/user-agents-bucket') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopUserAgentsForBucket(env, bucket, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top referrers for anonymous bucket
        if (url.pathname === '/api/referrers-bucket') {
            const bucket = url.searchParams.get('bucket');
            if (!bucket) {
                return jsonResponse({ error: 'bucket parameter is required' }, 400, corsHeaders);
            }
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopReferrersForBucket(env, bucket, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top user agents (aggregate across all requests)
        if (url.pathname === '/api/user-agents-aggregate') {
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopUserAgentsAggregate(env, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get top referrers (aggregate across all requests)
        if (url.pathname === '/api/referrers-aggregate') {
            const limit = parseInt(url.searchParams.get('limit') || '10', 10);
            const data = await getTopReferrersAggregate(env, period, limit);
            return jsonResponse({ data, timestamp: new Date().toISOString() }, 200, corsHeaders);
        }

        // Route: Get IP geolocation info
        if (url.pathname === '/api/ip-info') {
            const ip = url.searchParams.get('ip');
            if (!ip) {
                return jsonResponse({ error: 'ip parameter is required' }, 400, corsHeaders);
            }

            try {
                // Check cache first
                const cached = getCachedIpInfo(ip);
                if (cached) {
                    return jsonResponse(cached, 200, corsHeaders);
                }

                // Use ip-api.com for geolocation (free, no API key needed, 45 req/min limit)
                const ipApiUrl = `http://ip-api.com/json/${ip}?fields=status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query`;
                const ipApiResponse = await fetch(ipApiUrl);

                // Check if response is OK
                if (!ipApiResponse.ok) {
                    // Return minimal info with just the IP
                    const fallback = { query: ip, status: 'fail', message: 'Rate limited or unavailable' };
                    setCachedIpInfo(ip, fallback);
                    return jsonResponse(fallback, 200, corsHeaders);
                }

                const responseText = await ipApiResponse.text();

                // Try to parse JSON, handle rate limiting
                let ipData;
                try {
                    ipData = JSON.parse(responseText);
                } catch (parseError) {
                    // Return minimal info with just the IP
                    const fallback = { query: ip, status: 'fail', message: 'Invalid response' };
                    setCachedIpInfo(ip, fallback);
                    return jsonResponse(fallback, 200, corsHeaders);
                }

                if (ipData.status === 'fail') {
                    // Still cache the failure to avoid repeated requests
                    setCachedIpInfo(ip, ipData);
                    return jsonResponse(ipData, 200, corsHeaders);
                }

                // Cache the successful result
                setCachedIpInfo(ip, ipData);

                return jsonResponse(ipData, 200, corsHeaders);
            } catch (error) {
                console.error('Error looking up IP:', error);
                // Return minimal info instead of error
                const fallback = { query: ip, status: 'fail', message: 'Lookup failed' };
                return jsonResponse(fallback, 200, corsHeaders);
            }
        }

        // Route: Get all API keys
        if (url.pathname === '/api/api-keys') {
            if (request.method === 'GET') {
                try {
                    const result = await env.DB
                        .prepare(`
                            SELECT
                                id,
                                api_key,
                                email,
                                name,
                                organization,
                                is_academic,
                                max_per_second,
                                max_per_day,
                                premium_domain,
                                created_at,
                                expires_at,
                                credit_card_on_file
                            FROM api_keys_archive
                            ORDER BY created_at DESC
                        `)
                        .all();

                    return jsonResponse({
                        data: result.results,
                        count: result.results.length,
                        timestamp: new Date().toISOString()
                    }, 200, corsHeaders);
                } catch (error) {
                    console.error('Error fetching API keys:', error);
                    return jsonResponse({
                        error: 'Failed to fetch API keys',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }, 500, corsHeaders);
                }
            }

            if (request.method === 'PATCH') {
                try {
                    const body = await request.json() as { id: number; name?: string; max_per_second?: number };

                    if (!body.id) {
                        return jsonResponse({
                            error: 'Missing required field: id'
                        }, 400, corsHeaders);
                    }

                    // Build update query based on provided fields
                    const updates: string[] = [];
                    const values: any[] = [];

                    if (body.name !== undefined) {
                        updates.push('name = ?');
                        values.push(body.name);
                    }

                    if (body.max_per_second !== undefined) {
                        updates.push('max_per_second = ?');
                        values.push(body.max_per_second);
                    }

                    if (updates.length === 0) {
                        return jsonResponse({
                            error: 'No fields to update'
                        }, 400, corsHeaders);
                    }

                    // Add id to values for WHERE clause
                    values.push(body.id);

                    const updateQuery = `
                        UPDATE api_keys_archive
                        SET ${updates.join(', ')}
                        WHERE id = ?
                    `;

                    await env.DB
                        .prepare(updateQuery)
                        .bind(...values)
                        .run();

                    return jsonResponse({
                        success: true,
                        message: 'API key updated successfully'
                    }, 200, corsHeaders);
                } catch (error) {
                    console.error('Error updating API key:', error);
                    return jsonResponse({
                        error: 'Failed to update API key',
                        message: error instanceof Error ? error.message : 'Unknown error'
                    }, 500, corsHeaders);
                }
            }
        }

        return jsonResponse({ error: 'API endpoint not found' }, 404, corsHeaders);

    } catch (error) {
        console.error('API error:', error);
        return jsonResponse({
            error: 'Internal server error',
            message: error instanceof Error ? error.message : 'Unknown error'
        }, 500, corsHeaders);
    }
}

/**
 * JSON response helper
 */
function jsonResponse(data: unknown, status: number = 200, additionalHeaders: Record<string, string> = {}): Response {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json',
            ...additionalHeaders
        }
    });
}

/**
 * Simple in-memory cache for IP lookups (valid for current Worker instance)
 */
const ipCache = new Map<string, { data: any; timestamp: number }>();
const IP_CACHE_TTL = 3600000; // 1 hour in milliseconds

function getCachedIpInfo(ip: string): any | null {
    const cached = ipCache.get(ip);
    if (cached && Date.now() - cached.timestamp < IP_CACHE_TTL) {
        return cached.data;
    }
    if (cached) {
        ipCache.delete(ip); // Remove expired entry
    }
    return null;
}

function setCachedIpInfo(ip: string, data: any): void {
    ipCache.set(ip, { data, timestamp: Date.now() });
}

/**
 * HTML Dashboard
 */
function getHtmlDashboard(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OpenAlex API Analytics Dashboard</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .glass {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .stat-card {
            transition: transform 0.2s;
        }
        .stat-card:hover {
            transform: translateY(-2px);
        }
        .spinner {
            border: 3px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            border-top: 3px solid #667eea;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        .clickable-row {
            cursor: pointer;
            transition: background-color 0.2s;
        }
        .clickable-row:hover {
            background-color: rgba(102, 126, 234, 0.1) !important;
        }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-[88rem] mx-auto">
        <!-- Header -->
        <div class="glass rounded-lg shadow-xl p-6 mb-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">OpenAlex API Analytics</h1>
                    <p class="text-gray-600 mt-1">Real-time usage monitoring and insights</p>
                </div>
                <div class="flex gap-2">
                    <a href="/api-keys" class="px-4 py-2 rounded-lg bg-purple-600 text-white font-medium hover:bg-purple-700 transition">
                        API Keys
                    </a>
                    <button id="btnHour" class="px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition">
                        Last Hour
                    </button>
                    <button id="btnDay" class="px-4 py-2 rounded-lg bg-white text-gray-700 font-medium border border-gray-300 hover:bg-gray-50 transition">
                        Last 24 Hours
                    </button>
                    <button id="btnRefresh" class="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition">
                        Refresh
                    </button>
                </div>
            </div>
            <div id="lastUpdated" class="text-sm text-gray-500 mt-2"></div>
        </div>

        <!-- Error Message -->
        <div id="error" class="hidden glass rounded-lg shadow-xl p-6 mb-6 bg-red-50 border-red-300">
            <p class="text-red-800 font-medium"></p>
        </div>

        <!-- User Context Banner (hidden by default) -->
        <div id="userContext" class="hidden glass rounded-lg shadow-xl p-4 mb-6 bg-gradient-to-r from-indigo-50 to-purple-50">
            <div class="flex items-center justify-between">
                <div>
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-600">Viewing:</span>
                        <h3 class="text-lg font-bold text-gray-800" id="contextUserName"></h3>
                    </div>
                    <p class="text-sm text-gray-600" id="contextUserEmail"></p>
                </div>
                <button id="backToOverview" class="px-4 py-2 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-700 transition">
                    ← Back to Overview
                </button>
            </div>
        </div>

        <!-- Usage Chart -->
        <div class="glass rounded-lg shadow-xl p-6 mb-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-gray-800" id="timelineTitle">Usage</h2>
                <div id="chartLoading" class="hidden">
                    <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
                </div>
            </div>
            <div class="relative h-64">
                <canvas id="timelineChart"></canvas>
            </div>
        </div>

        <!-- Tables Container -->
        <div id="mainView" class="grid grid-cols-1 lg:grid-cols-2 gap-6" style="grid-auto-rows: auto;">
            <!-- Top Authenticated Users -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top API Key Users</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b-2 border-gray-300">
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">#</th>
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">User</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">RPS</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Avg Time</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Success</th>
                            </tr>
                        </thead>
                        <tbody id="topUsersTable">
                            <tr>
                                <td colspan="6" class="text-center py-8 text-gray-500">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- Pagination Controls -->
                <div id="usersPagination" class="mt-4 flex items-center justify-between text-sm text-gray-600">
                    <div id="usersPageInfo"></div>
                    <div class="flex gap-2">
                        <button id="usersPrevPage" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            ← Previous
                        </button>
                        <button id="usersNextPage" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            <!-- Top Anonymous Users -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top Anonymous Users</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b-2 border-gray-300">
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">#</th>
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">IP</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">RPS</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Avg Time</th>
                                <th class="text-right py-2 px-2 font-semibold text-gray-700">Success</th>
                            </tr>
                        </thead>
                        <tbody id="topAnonymousTable">
                            <tr>
                                <td colspan="6" class="text-center py-8 text-gray-500">Loading...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <!-- Pagination Controls -->
                <div id="anonymousPagination" class="mt-4 flex items-center justify-between text-sm text-gray-600">
                    <div id="anonymousPageInfo"></div>
                    <div class="flex gap-2">
                        <button id="anonymousPrevPage" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            ← Previous
                        </button>
                        <button id="anonymousNextPage" class="px-3 py-1 rounded bg-gray-200 hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed">
                            Next →
                        </button>
                    </div>
                </div>
            </div>

            <!-- Top Referrers (Aggregate) -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top Referrers</h2>
                <div id="aggregateReferrersContainer" class="text-sm">
                    <p class="text-gray-500">Loading...</p>
                </div>
            </div>

            <!-- Top User Agents (Aggregate) -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top User Agents</h2>
                <div id="aggregateUserAgentsContainer" class="text-sm">
                    <p class="text-gray-500">Loading...</p>
                </div>
            </div>
        </div>

        <!-- Status Breakdown Section (hidden by default) -->
        <div id="statusBreakdown" class="hidden">
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <!-- Status Code Chart -->
                <div class="glass rounded-lg shadow-xl p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Status Code Distribution</h3>
                    <div class="relative h-64">
                        <canvas id="statusChart"></canvas>
                    </div>
                </div>

                <!-- Status Code Table -->
                <div class="glass rounded-lg shadow-xl p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Detailed Breakdown</h3>
                    <div id="statusTableContainer">
                        <!-- Will be populated dynamically -->
                    </div>
                </div>
            </div>

            <!-- Sample URLs -->
            <div class="glass rounded-lg shadow-xl p-6 mb-6">
                <h3 class="text-xl font-bold text-gray-800 mb-4">Sample URLs</h3>
                <div id="sampleUrlsContainer" class="text-sm">
                    <!-- Will be populated dynamically -->
                </div>
            </div>

            <!-- User Agents and Referrers -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <!-- Top User Agents -->
                <div class="glass rounded-lg shadow-xl p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Top User Agents</h3>
                    <div id="userAgentsContainer" class="text-sm">
                        <!-- Will be populated dynamically -->
                    </div>
                </div>

                <!-- Top Referrers -->
                <div class="glass rounded-lg shadow-xl p-6">
                    <h3 class="text-xl font-bold text-gray-800 mb-4">Top Referrers</h3>
                    <div id="referrersContainer" class="text-sm">
                        <!-- Will be populated dynamically -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        // State
        let currentPeriod = 'hour';
        let timelineChart = null;
        let currentView = {
            type: 'overview', // 'overview', 'user', or 'anonymous'
            apiKey: null,
            bucket: null,
            name: null,
            email: null
        };

        // Pagination state
        let allUsers = [];
        let allAnonymousUsers = [];
        let usersPage = 1;
        let anonymousPage = 1;
        const pageSize = 10;

        // Cache for enriched anonymous user data
        const topIpCache = new Map(); // bucket -> { ip, org, location, etc. }

        // DOM elements
        const btnHour = document.getElementById('btnHour');
        const btnDay = document.getElementById('btnDay');
        const btnRefresh = document.getElementById('btnRefresh');
        const chartLoading = document.getElementById('chartLoading');
        const error = document.getElementById('error');
        const lastUpdated = document.getElementById('lastUpdated');
        const userContext = document.getElementById('userContext');
        const statusBreakdown = document.getElementById('statusBreakdown');
        const mainView = document.getElementById('mainView');

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            loadFromURL(); // Check URL params first
        });

        // Event listeners
        function setupEventListeners() {
            btnHour.addEventListener('click', () => {
                currentPeriod = 'hour';
                updatePeriodButtons();
                loadData();
            });

            btnDay.addEventListener('click', () => {
                currentPeriod = 'day';
                updatePeriodButtons();
                loadData();
            });

            btnRefresh.addEventListener('click', () => {
                loadData();
            });

            // Back to overview button
            const backBtn = document.getElementById('backToOverview');
            if (backBtn) {
                backBtn.addEventListener('click', () => {
                    showOverview();
                });
            }

            // Handle browser back/forward
            window.addEventListener('popstate', (e) => {
                if (e.state) {
                    currentView = e.state;
                    loadData();
                } else {
                    loadFromURL();
                }
            });

            // Pagination event listeners
            document.getElementById('usersPrevPage').addEventListener('click', () => {
                if (usersPage > 1) {
                    usersPage--;
                    renderTopUsers(allUsers);
                }
            });

            document.getElementById('usersNextPage').addEventListener('click', () => {
                const totalPages = Math.ceil(allUsers.length / pageSize);
                if (usersPage < totalPages) {
                    usersPage++;
                    renderTopUsers(allUsers);
                }
            });

            document.getElementById('anonymousPrevPage').addEventListener('click', () => {
                if (anonymousPage > 1) {
                    anonymousPage--;
                    renderTopAnonymous(allAnonymousUsers, currentPeriod);
                }
            });

            document.getElementById('anonymousNextPage').addEventListener('click', () => {
                const totalPages = Math.ceil(allAnonymousUsers.length / pageSize);
                if (anonymousPage < totalPages) {
                    anonymousPage++;
                    renderTopAnonymous(allAnonymousUsers, currentPeriod);
                }
            });
        }

        // URL management
        function loadFromURL() {
            const params = new URLSearchParams(window.location.search);
            const apiKey = params.get('user');
            const bucket = params.get('anonymous');
            const period = params.get('period');

            if (period && (period === 'hour' || period === 'day')) {
                currentPeriod = period;
                updatePeriodButtons();
            }

            if (apiKey) {
                // Will load user data, but need to fetch user info first
                currentView = { type: 'user', apiKey, bucket: null, name: null, email: null };
                loadData();
            } else if (bucket) {
                currentView = { type: 'anonymous', apiKey: null, bucket, name: bucket, email: 'Anonymous User Group' };
                loadData();
            } else {
                showOverview();
            }
        }

        function updateURL(pushState = true) {
            const params = new URLSearchParams();
            params.set('period', currentPeriod);

            if (currentView.type === 'user' && currentView.apiKey) {
                params.set('user', currentView.apiKey);
            } else if (currentView.type === 'anonymous' && currentView.bucket) {
                params.set('anonymous', currentView.bucket);
            }

            const newURL = window.location.pathname + '?' + params.toString();

            if (pushState) {
                window.history.pushState(currentView, '', newURL);
            } else {
                window.history.replaceState(currentView, '', newURL);
            }
        }

        function showOverview() {
            currentView = { type: 'overview', apiKey: null, bucket: null, name: null, email: null };
            updateURL(true);
            loadData();
        }

        // Update period button styles
        function updatePeriodButtons() {
            if (currentPeriod === 'hour') {
                btnHour.className = 'px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition';
                btnDay.className = 'px-4 py-2 rounded-lg bg-white text-gray-700 font-medium border border-gray-300 hover:bg-gray-50 transition';
            } else {
                btnHour.className = 'px-4 py-2 rounded-lg bg-white text-gray-700 font-medium border border-gray-300 hover:bg-gray-50 transition';
                btnDay.className = 'px-4 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition';
            }
        }

        // Load all data
        async function loadData() {
            showLoading(true);
            hideError();

            try {
                if (currentView.type === 'overview') {
                    // Reset pagination when loading new data
                    usersPage = 1;
                    anonymousPage = 1;
                    topIpCache.clear(); // Clear cache when reloading data

                    // Load overview data (fetch 100 results for pagination)
                    const [usersData, anonymousData, timelineData, aggregateUserAgentsData, aggregateReferrersData] = await Promise.all([
                        fetch('/api/top-users?period=' + currentPeriod + '&limit=100').then(r => r.json()),
                        fetch('/api/top-anonymous?period=' + currentPeriod + '&limit=100').then(r => r.json()),
                        fetch('/api/usage-timeline?period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/user-agents-aggregate?period=' + currentPeriod + '&limit=10').then(r => r.json()),
                        fetch('/api/referrers-aggregate?period=' + currentPeriod + '&limit=10').then(r => r.json())
                    ]);

                    // Store all data for pagination
                    allUsers = usersData.data;
                    allAnonymousUsers = anonymousData.data;

                    // Update UI for overview
                    userContext.classList.add('hidden');
                    statusBreakdown.classList.add('hidden');
                    mainView.classList.remove('hidden');
                    document.getElementById('timelineTitle').textContent = 'Usage';

                    // Render data with pagination
                    renderTopUsers(allUsers);
                    renderTopAnonymous(allAnonymousUsers, currentPeriod);
                    renderOverviewTimeline(timelineData.data);
                    renderAggregateUserAgents(aggregateUserAgentsData.data);
                    renderAggregateReferrers(aggregateReferrersData.data);

                } else if (currentView.type === 'user') {
                    // Load user-specific data
                    const [timelineResponse, statusResponse, usersData, sampleUrlsResponse, userAgentsResponse, referrersResponse] = await Promise.all([
                        fetch('/api/user-timeline?apiKey=' + encodeURIComponent(currentView.apiKey) + '&period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/user-status-breakdown?apiKey=' + encodeURIComponent(currentView.apiKey) + '&period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/top-users?period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/sample-urls-user?apiKey=' + encodeURIComponent(currentView.apiKey) + '&period=' + currentPeriod + '&limit=10').then(r => r.json()),
                        fetch('/api/user-agents-user?apiKey=' + encodeURIComponent(currentView.apiKey) + '&period=' + currentPeriod + '&limit=10').then(r => r.json()),
                        fetch('/api/referrers-user?apiKey=' + encodeURIComponent(currentView.apiKey) + '&period=' + currentPeriod + '&limit=10').then(r => r.json())
                    ]);

                    // If we don't have name/email yet, get it from the users list
                    if (!currentView.name) {
                        const user = usersData.data.find(u => u.apiKey === currentView.apiKey);
                        if (user) {
                            currentView.name = user.name || 'Unknown';
                            currentView.email = user.email || '';
                        }
                    }

                    // Update UI for user view
                    userContext.classList.remove('hidden');
                    statusBreakdown.classList.remove('hidden');
                    mainView.classList.add('hidden');
                    document.getElementById('contextUserName').textContent = currentView.name || 'Unknown User';
                    document.getElementById('contextUserEmail').textContent = currentView.email || currentView.apiKey;
                    document.getElementById('timelineTitle').textContent = 'Request Timeline by Status Code';

                    // Render data
                    renderUserTimeline(timelineResponse.data);
                    renderStatusChart(statusResponse.data);
                    renderStatusTable(statusResponse.data);
                    renderSampleUrls(sampleUrlsResponse.urls);
                    renderUserAgents(userAgentsResponse.data);
                    renderReferrers(referrersResponse.data);

                } else if (currentView.type === 'anonymous') {
                    // Load anonymous bucket data with IP enrichment
                    const [timelineResponse, statusResponse, topIpResponse, sampleUrlsResponse, userAgentsResponse, referrersResponse] = await Promise.all([
                        fetch('/api/anonymous-timeline?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/anonymous-status-breakdown?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/top-ip-in-bucket?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod).then(r => r.json()),
                        fetch('/api/sample-urls-bucket?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod + '&limit=10').then(r => r.json()),
                        fetch('/api/user-agents-bucket?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod + '&limit=10').then(r => r.json()),
                        fetch('/api/referrers-bucket?bucket=' + encodeURIComponent(currentView.bucket) + '&period=' + currentPeriod + '&limit=10').then(r => r.json())
                    ]);

                    // Get IP geolocation info if we have an IP
                    let ipInfo = null;
                    if (topIpResponse.ipAddress) {
                        try {
                            const ipInfoResponse = await fetch('/api/ip-info?ip=' + encodeURIComponent(topIpResponse.ipAddress));
                            ipInfo = await ipInfoResponse.json();
                        } catch (err) {
                            // Failed to lookup IP info
                        }
                    }

                    // Build display name from IP info
                    let displayName = currentView.bucket;
                    let displayDetails = 'Anonymous User Group';

                    if (ipInfo && ipInfo.query) {
                        displayName = ipInfo.query;
                        const locationParts = [];
                        if (ipInfo.city) locationParts.push(ipInfo.city);
                        if (ipInfo.regionName) locationParts.push(ipInfo.regionName);
                        if (ipInfo.country) locationParts.push(ipInfo.country);

                        const location = locationParts.join(', ');
                        const org = ipInfo.org || ipInfo.isp;

                        if (org && location) {
                            displayDetails = org + ' • ' + location;
                        } else if (org) {
                            displayDetails = org;
                        } else if (location) {
                            displayDetails = location;
                        }
                    }

                    // Update UI for anonymous view
                    userContext.classList.remove('hidden');
                    statusBreakdown.classList.remove('hidden');
                    mainView.classList.add('hidden');
                    document.getElementById('contextUserName').textContent = displayName;
                    document.getElementById('contextUserEmail').textContent = displayDetails;
                    document.getElementById('timelineTitle').textContent = 'Request Timeline by Status Code';

                    // Render data
                    renderUserTimeline(timelineResponse.data);
                    renderStatusChart(statusResponse.data);
                    renderStatusTable(statusResponse.data);
                    renderSampleUrls(sampleUrlsResponse.urls);
                    renderUserAgents(userAgentsResponse.data);
                    renderReferrers(referrersResponse.data);
                }

                lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
                updateURL(false); // Update URL without pushing to history

            } catch (err) {
                showError('Failed to load analytics data. Please try again.');
                console.error('Error loading data:', err);
            } finally {
                showLoading(false);
            }
        }

        // Render top authenticated users table
        function renderTopUsers(users) {
            const tbody = document.getElementById('topUsersTable');
            if (!users || users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No data available</td></tr>';
                updateUsersPagination(0, 0);
                return;
            }

            // Calculate pagination
            const startIndex = (usersPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedUsers = users.slice(startIndex, endIndex);

            // Render paginated data
            tbody.innerHTML = paginatedUsers.map((user, index) => {
                // Build display name: organization - name
                let displayName = '';
                if (user.organization && user.name) {
                    displayName = \`\${user.organization} - \${user.name}\`;
                } else if (user.organization) {
                    displayName = user.organization;
                } else if (user.name) {
                    displayName = user.name;
                } else {
                    displayName = 'Unknown';
                }

                return \`
                <tr class="clickable-row border-b border-gray-200 hover:bg-gray-50"
                    data-type="user"
                    data-apikey="\${user.apiKey}"
                    data-name="\${(user.name || 'Unknown').replace(/"/g, '&quot;')}"
                    data-email="\${(user.email || '').replace(/"/g, '&quot;')}">
                    <td class="py-2 px-2 text-gray-600">\${startIndex + index + 1}</td>
                    <td class="py-2 px-2">
                        <div class="font-medium text-gray-800">\${displayName}</div>
                        <div class="text-xs text-gray-500">\${user.email || user.apiKey.substring(0, 12) + '...'}</div>
                    </td>
                    <td class="py-2 px-2 text-right font-semibold text-gray-800">\${user.requestCount.toLocaleString()}</td>
                    <td class="py-2 px-2 text-right text-indigo-600 font-medium">\${user.requestsPerSecond.toFixed(2)}</td>
                    <td class="py-2 px-2 text-right text-gray-600">\${user.avgResponseTime.toFixed(0)}ms</td>
                    <td class="py-2 px-2 text-right">
                        <span class="inline-block px-2 py-1 rounded text-xs font-medium \${user.successRate >= 95 ? 'bg-green-100 text-green-800' : user.successRate >= 80 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                            \${user.successRate.toFixed(1)}%
                        </span>
                    </td>
                </tr>
                \`;
            }).join('');

            // Update pagination info
            updateUsersPagination(users.length, startIndex + 1, endIndex);
        }

        // Render top anonymous users table (with IP enrichment)
        async function renderTopAnonymous(users, period) {
            const tbody = document.getElementById('topAnonymousTable');
            if (!users || users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No data available</td></tr>';
                updateAnonymousPagination(0, 0);
                return;
            }

            // Calculate pagination
            const startIndex = (anonymousPage - 1) * pageSize;
            const endIndex = startIndex + pageSize;
            const paginatedUsers = users.slice(startIndex, endIndex);

            // Render table immediately with IP addresses if available
            tbody.innerHTML = paginatedUsers.map((user, index) => {
                // Show IP sample if available, otherwise bucket name
                const initialName = user.ipSample || user.bucket;
                const initialDetails = 'Loading...';

                return \`
                    <tr class="clickable-row border-b border-gray-200 hover:bg-gray-50"
                        data-type="anonymous"
                        data-bucket="\${user.bucket}">
                        <td class="py-2 px-2 text-gray-600">\${startIndex + index + 1}</td>
                        <td class="py-2 px-2" id="anon-name-\${startIndex + index}">
                            <div class="font-medium text-gray-800">\${initialName}</div>
                            <div class="text-xs text-gray-500">\${initialDetails}</div>
                        </td>
                        <td class="py-2 px-2 text-right font-semibold text-gray-800">\${user.requestCount.toLocaleString()}</td>
                        <td class="py-2 px-2 text-right text-indigo-600 font-medium">\${user.requestsPerSecond.toFixed(2)}</td>
                        <td class="py-2 px-2 text-right text-gray-600">\${user.avgResponseTime.toFixed(0)}ms</td>
                        <td class="py-2 px-2 text-right">
                            <span class="inline-block px-2 py-1 rounded text-xs font-medium \${user.successRate >= 95 ? 'bg-green-100 text-green-800' : user.successRate >= 80 ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}">
                                \${user.successRate.toFixed(1)}%
                            </span>
                        </td>
                    </tr>
                \`;
            }).join('');

            // Update pagination info
            updateAnonymousPagination(users.length, startIndex + 1, endIndex);

            // Enrich with IP data in background
            enrichAnonymousUsers(paginatedUsers, startIndex, period);
        }

        // Enrich anonymous users with IP and geolocation data (with caching)
        async function enrichAnonymousUsers(users, startIndex, period) {
            // Batch fetch top IPs for users not in cache
            const usersNeedingLookup = users.filter(user => !topIpCache.has(user.bucket));

            if (usersNeedingLookup.length > 0) {
                // Fetch top IPs in parallel
                await Promise.all(usersNeedingLookup.map(async (user) => {
                    try {
                        const topIpRes = await fetch('/api/top-ip-in-bucket?bucket=' + encodeURIComponent(user.bucket) + '&period=' + period);
                        const topIpData = await topIpRes.json();

                        let foundIp = null;
                        if (topIpData.ipAddress) {
                            foundIp = topIpData.ipAddress;
                        } else if (user.ipSample) {
                            foundIp = user.ipSample;
                        }

                        if (foundIp) {
                            // Fetch geolocation
                            try {
                                const ipInfoRes = await fetch('/api/ip-info?ip=' + encodeURIComponent(foundIp));
                                const ipInfo = await ipInfoRes.json();

                                // Cache the enriched data
                                topIpCache.set(user.bucket, {
                                    ip: foundIp,
                                    ipInfo: ipInfo && ipInfo.status !== 'fail' ? ipInfo : null
                                });
                            } catch (ipErr) {
                                // Cache with just IP, no geo data
                                topIpCache.set(user.bucket, {
                                    ip: foundIp,
                                    ipInfo: null
                                });
                            }
                        } else {
                            // No IP found
                            topIpCache.set(user.bucket, {
                                ip: null,
                                ipInfo: null
                            });
                        }
                    } catch (err) {
                        // Cache empty result to avoid retry
                        topIpCache.set(user.bucket, {
                            ip: user.ipSample || null,
                            ipInfo: null
                        });
                    }
                }));
            }

            // Update UI with cached data
            users.forEach((user, index) => {
                const actualIndex = startIndex + index;
                const cached = topIpCache.get(user.bucket);

                let displayName = user.bucket;
                let displayDetails = 'Multiple IPs';

                if (cached && cached.ip) {
                    displayName = cached.ip;

                    if (cached.ipInfo) {
                        const ipInfo = cached.ipInfo;
                        if (ipInfo.query) {
                            displayName = ipInfo.query;
                        }

                        const locationParts = [];
                        if (ipInfo.city) locationParts.push(ipInfo.city);
                        if (ipInfo.country) locationParts.push(ipInfo.country);
                        const location = locationParts.join(', ');
                        const org = ipInfo.org || ipInfo.isp;

                        if (org && location) {
                            displayDetails = org + ' • ' + location;
                        } else if (org) {
                            displayDetails = org;
                        } else if (location) {
                            displayDetails = location;
                        } else {
                            displayDetails = 'IP address';
                        }
                    } else {
                        displayDetails = 'IP address';
                    }
                }

                // Update the cell
                const nameCell = document.getElementById('anon-name-' + actualIndex);
                if (nameCell) {
                    nameCell.innerHTML = \`
                        <div class="font-medium text-gray-800">\${displayName}</div>
                        <div class="text-xs text-gray-500">\${displayDetails}</div>
                    \`;
                }
            });
        }

        // Render overview timeline chart (aggregate)
        function renderOverviewTimeline(data) {
            const ctx = document.getElementById('timelineChart');

            if (timelineChart) {
                timelineChart.destroy();
            }

            const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            }));
            const requests = data.map(d => d.requestCount);

            timelineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Requests',
                        data: requests,
                        borderColor: 'rgb(102, 126, 234)',
                        backgroundColor: 'rgba(102, 126, 234, 0.1)',
                        fill: true,
                        tension: 0.4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
        }

        // Render user timeline with status codes overlaid
        function renderUserTimeline(data) {
            const ctx = document.getElementById('timelineChart');

            if (timelineChart) {
                timelineChart.destroy();
            }

            // Group data by status code
            const statusCodes = [...new Set(data.map(d => d.statusCode))].sort((a, b) => a - b);
            const timestamps = [...new Set(data.map(d => d.timestamp))].sort();

            // Create datasets for each status code
            const datasets = statusCodes.map(statusCode => {
                const color = getStatusCodeColor(statusCode);
                const dataPoints = timestamps.map(timestamp => {
                    const point = data.find(d => d.timestamp === timestamp && d.statusCode === statusCode);
                    return point ? point.requestCount : 0;
                });

                return {
                    label: \`\${statusCode} - \${getStatusCodeLabel(statusCode)}\`,
                    data: dataPoints,
                    borderColor: color.border,
                    backgroundColor: color.bg,
                    fill: true,
                    tension: 0.4,
                    borderWidth: 2
                };
            });

            const labels = timestamps.map(ts => new Date(ts).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit'
            }));

            timelineChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: datasets
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: {
                        mode: 'index',
                        intersect: false
                    },
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 15,
                                font: { size: 11 },
                                usePointStyle: true
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.dataset.label || '';
                                    const value = context.parsed.y || 0;
                                    return \`\${label}: \${value.toLocaleString()} requests\`;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            stacked: false
                        },
                        y: {
                            stacked: false,
                            beginAtZero: true,
                            ticks: {
                                precision: 0
                            }
                        }
                    }
                }
            });
        }

        // UI helpers
        function showLoading(show) {
            chartLoading.classList.toggle('hidden', !show);
        }

        function showError(message) {
            error.classList.remove('hidden');
            error.querySelector('p').textContent = message;
        }

        function hideError() {
            error.classList.add('hidden');
        }

        // Status breakdown functionality
        let statusChart = null;

        // Initialize row click handlers after DOM is ready
        function initRowClickHandlers() {
            // Event delegation for table row clicks
            const usersTable = document.getElementById('topUsersTable');
            const anonymousTable = document.getElementById('topAnonymousTable');

            if (usersTable) {
                usersTable.addEventListener('click', (e) => {
                    const row = e.target.closest('tr.clickable-row');
                    if (row && row.dataset.type === 'user') {
                        currentView = {
                            type: 'user',
                            apiKey: row.dataset.apikey,
                            bucket: null,
                            name: row.dataset.name,
                            email: row.dataset.email
                        };
                        updateURL(true); // Push to history
                        loadData();
                    }
                });
            }

            if (anonymousTable) {
                anonymousTable.addEventListener('click', (e) => {
                    const row = e.target.closest('tr.clickable-row');
                    if (row && row.dataset.type === 'anonymous') {
                        currentView = {
                            type: 'anonymous',
                            apiKey: null,
                            bucket: row.dataset.bucket,
                            name: row.dataset.bucket,
                            email: 'Anonymous User Group'
                        };
                        updateURL(true); // Push to history
                        loadData();
                    }
                });
            }
        }

        // Call after DOM loads
        setTimeout(initRowClickHandlers, 100);

        function getStatusCodeColor(code) {
            if (code >= 200 && code < 300) return { bg: 'rgba(34, 197, 94, 0.8)', border: 'rgb(34, 197, 94)' };
            if (code >= 300 && code < 400) return { bg: 'rgba(59, 130, 246, 0.8)', border: 'rgb(59, 130, 246)' };
            if (code >= 400 && code < 500) return { bg: 'rgba(251, 191, 36, 0.8)', border: 'rgb(251, 191, 36)' };
            return { bg: 'rgba(239, 68, 68, 0.8)', border: 'rgb(239, 68, 68)' };
        }

        function getStatusCodeLabel(code) {
            const labels = {
                200: 'OK', 201: 'Created', 204: 'No Content',
                301: 'Moved Permanently', 302: 'Found', 304: 'Not Modified',
                400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden',
                404: 'Not Found', 429: 'Rate Limited',
                500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
            };
            return labels[code] || 'Unknown';
        }

        function renderStatusChart(data) {
            const ctx = document.getElementById('statusChart');

            if (statusChart) {
                statusChart.destroy();
            }

            const colors = data.map(item => getStatusCodeColor(item.statusCode));

            statusChart = new Chart(ctx, {
                type: 'doughnut',
                data: {
                    labels: data.map(item => \`\${item.statusCode} - \${getStatusCodeLabel(item.statusCode)}\`),
                    datasets: [{
                        data: data.map(item => item.requestCount),
                        backgroundColor: colors.map(c => c.bg),
                        borderColor: colors.map(c => c.border),
                        borderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                boxWidth: 15,
                                font: { size: 11 }
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    const label = context.label || '';
                                    const value = context.parsed || 0;
                                    const percentage = data[context.dataIndex].percentage;
                                    return \`\${label}: \${value.toLocaleString()} (\${percentage.toFixed(1)}%)\`;
                                }
                            }
                        }
                    }
                }
            });
        }

        function renderStatusTable(data) {
            const container = document.getElementById('statusTableContainer');
            container.innerHTML = \`
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b-2 border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Status</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">%</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${data.map(item => {
                            const color = getStatusCodeColor(item.statusCode);
                            const isSuccess = item.statusCode >= 200 && item.statusCode < 300;
                            const isError = item.statusCode >= 400;
                            const colorClass = isSuccess ? 'text-green-700' : isError ? 'text-red-700' : 'text-blue-700';
                            return \`
                                <tr class="border-b border-gray-200">
                                    <td class="py-2 px-2">
                                        <span class="font-semibold \${colorClass}">\${item.statusCode}</span>
                                        <span class="text-xs text-gray-600 ml-2">\${getStatusCodeLabel(item.statusCode)}</span>
                                    </td>
                                    <td class="py-2 px-2 text-right font-semibold">\${item.requestCount.toLocaleString()}</td>
                                    <td class="py-2 px-2 text-right text-gray-600">\${item.percentage.toFixed(1)}%</td>
                                </tr>
                            \`;
                        }).join('')}
                    </tbody>
                </table>
            \`;
        }

        function renderSampleUrls(urls) {
            const container = document.getElementById('sampleUrlsContainer');
            if (!urls || urls.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No sample URLs available</p>';
                return;
            }

            container.innerHTML = \`
                <ul class="space-y-2">
                    \${urls.map(url => \`
                        <li class="flex items-start gap-2">
                            <span class="text-gray-400 mt-1">•</span>
                            <code class="text-xs bg-gray-100 px-2 py-1 rounded flex-1 overflow-x-auto break-all">\${url}</code>
                        </li>
                    \`).join('')}
                </ul>
            \`;
        }

        function renderUserAgents(data) {
            const container = document.getElementById('userAgentsContainer');
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No user agent data available</p>';
                return;
            }

            container.innerHTML = \`
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">User Agent</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${data.map(item => \`
                            <tr class="border-b border-gray-200">
                                <td class="py-2 px-2">
                                    <div class="truncate max-w-md" title="\${item.userAgent.replace(/"/g, '&quot;')}">\${item.userAgent}</div>
                                </td>
                                <td class="py-2 px-2 text-right font-medium text-gray-800">\${item.requestCount.toLocaleString()}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        function renderReferrers(data) {
            const container = document.getElementById('referrersContainer');
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No referrer data available</p>';
                return;
            }

            container.innerHTML = \`
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Referrer</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${data.map(item => \`
                            <tr class="border-b border-gray-200">
                                <td class="py-2 px-2">
                                    <div class="truncate max-w-md" title="\${item.referrer.replace(/"/g, '&quot;')}">\${item.referrer}</div>
                                </td>
                                <td class="py-2 px-2 text-right font-medium text-gray-800">\${item.requestCount.toLocaleString()}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        function renderAggregateUserAgents(data) {
            const container = document.getElementById('aggregateUserAgentsContainer');
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No user agent data available</p>';
                return;
            }

            container.innerHTML = \`
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">User Agent</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${data.map(item => \`
                            <tr class="border-b border-gray-200">
                                <td class="py-2 px-2">
                                    <div class="truncate max-w-md" title="\${item.userAgent.replace(/"/g, '&quot;')}">\${item.userAgent}</div>
                                </td>
                                <td class="py-2 px-2 text-right font-medium text-gray-800">\${item.requestCount.toLocaleString()}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        function renderAggregateReferrers(data) {
            const container = document.getElementById('aggregateReferrersContainer');
            if (!data || data.length === 0) {
                container.innerHTML = '<p class="text-gray-500">No referrer data available</p>';
                return;
            }

            container.innerHTML = \`
                <table class="w-full text-xs">
                    <thead>
                        <tr class="border-b border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Referrer</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Requests</th>
                        </tr>
                    </thead>
                    <tbody>
                        \${data.map(item => \`
                            <tr class="border-b border-gray-200">
                                <td class="py-2 px-2">
                                    <div class="truncate max-w-md" title="\${item.referrer.replace(/"/g, '&quot;')}">\${item.referrer}</div>
                                </td>
                                <td class="py-2 px-2 text-right font-medium text-gray-800">\${item.requestCount.toLocaleString()}</td>
                            </tr>
                        \`).join('')}
                    </tbody>
                </table>
            \`;
        }

        // Pagination helpers
        function updateUsersPagination(total, start, end) {
            const pageInfo = document.getElementById('usersPageInfo');
            const prevBtn = document.getElementById('usersPrevPage');
            const nextBtn = document.getElementById('usersNextPage');

            if (total === 0) {
                pageInfo.textContent = 'No results';
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            const actualEnd = Math.min(end, total);
            pageInfo.textContent = 'Showing ' + start + '-' + actualEnd + ' of ' + total;

            const totalPages = Math.ceil(total / pageSize);
            prevBtn.disabled = usersPage <= 1;
            nextBtn.disabled = usersPage >= totalPages;
        }

        function updateAnonymousPagination(total, start, end) {
            const pageInfo = document.getElementById('anonymousPageInfo');
            const prevBtn = document.getElementById('anonymousPrevPage');
            const nextBtn = document.getElementById('anonymousNextPage');

            if (total === 0) {
                pageInfo.textContent = 'No results';
                prevBtn.disabled = true;
                nextBtn.disabled = true;
                return;
            }

            const actualEnd = Math.min(end, total);
            pageInfo.textContent = 'Showing ' + start + '-' + actualEnd + ' of ' + total;

            const totalPages = Math.ceil(total / pageSize);
            prevBtn.disabled = anonymousPage <= 1;
            nextBtn.disabled = anonymousPage >= totalPages;
        }
    </script>
</body>
</html>`;
}

/**
 * API Keys Page
 */
function getApiKeysPage(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>API Keys - OpenAlex</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        body {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
        }
        .glass {
            background: rgba(255, 255, 255, 0.95);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.3);
        }
        .spinner {
            border: 3px solid rgba(0, 0, 0, 0.1);
            border-radius: 50%;
            border-top: 3px solid #667eea;
            width: 30px;
            height: 30px;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
</head>
<body class="p-4 md:p-8">
    <div class="max-w-[88rem] mx-auto">
        <!-- Header -->
        <div class="glass rounded-lg shadow-xl p-6 mb-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">API Keys</h1>
                    <p class="text-gray-600 mt-1">Manage OpenAlex API keys</p>
                </div>
                <div class="flex gap-2">
                    <a href="/" class="px-4 py-2 rounded-lg bg-gray-600 text-white font-medium hover:bg-gray-700 transition">
                        Back to Dashboard
                    </a>
                    <button id="btnRefresh" class="px-4 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition">
                        Refresh
                    </button>
                </div>
            </div>
            <div id="lastUpdated" class="text-sm text-gray-500 mt-2"></div>
        </div>

        <!-- Error Message -->
        <div id="error" class="hidden glass rounded-lg shadow-xl p-6 mb-6 bg-red-50 border-red-300">
            <p class="text-red-800 font-medium"></p>
        </div>

        <!-- API Keys Table -->
        <div class="glass rounded-lg shadow-xl p-6">
            <div class="flex justify-between items-center mb-4">
                <h2 class="text-xl font-bold text-gray-800">All API Keys</h2>
                <div id="loading" class="hidden">
                    <div class="spinner" style="width: 20px; height: 20px; border-width: 2px;"></div>
                </div>
            </div>
            <div class="overflow-x-auto">
                <table class="w-full text-sm">
                    <thead>
                        <tr class="border-b-2 border-gray-300">
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">#</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">API Key</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Organization</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Name</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Email</th>
                            <th class="text-center py-2 px-2 font-semibold text-gray-700">Academic</th>
                            <th class="text-right py-2 px-2 font-semibold text-gray-700">Rate Limit</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Created</th>
                            <th class="text-left py-2 px-2 font-semibold text-gray-700">Expires</th>
                        </tr>
                    </thead>
                    <tbody id="apiKeysTable">
                        <tr>
                            <td colspan="9" class="text-center py-8 text-gray-500">Loading...</td>
                        </tr>
                    </tbody>
                </table>
            </div>
            <div id="summary" class="mt-4 text-sm text-gray-600"></div>
        </div>
    </div>

    <script>
        // DOM elements
        const btnRefresh = document.getElementById('btnRefresh');
        const loading = document.getElementById('loading');
        const error = document.getElementById('error');
        const lastUpdated = document.getElementById('lastUpdated');
        const apiKeysTable = document.getElementById('apiKeysTable');
        const summary = document.getElementById('summary');

        // Initialize
        document.addEventListener('DOMContentLoaded', () => {
            setupEventListeners();
            loadApiKeys();
        });

        // Event listeners
        function setupEventListeners() {
            btnRefresh.addEventListener('click', () => {
                loadApiKeys();
            });
        }

        // Load API keys
        async function loadApiKeys() {
            showLoading(true);
            hideError();

            try {
                const response = await fetch('/api/api-keys');
                if (!response.ok) {
                    throw new Error('Failed to fetch API keys');
                }

                const result = await response.json();
                renderApiKeys(result.data);
                summary.textContent = \`Total: \${result.count} API key\${result.count !== 1 ? 's' : ''}\`;
                lastUpdated.textContent = 'Last updated: ' + new Date().toLocaleTimeString();
            } catch (err) {
                showError('Failed to load API keys. Please try again.');
                console.error('Error loading API keys:', err);
            } finally {
                showLoading(false);
            }
        }

        // Store all keys globally
        let allKeys = [];

        // Render API keys table
        function renderApiKeys(keys) {
            allKeys = keys; // Store for editing

            if (!keys || keys.length === 0) {
                apiKeysTable.innerHTML = '<tr><td colspan="9" class="text-center py-8 text-gray-500">No API keys found</td></tr>';
                return;
            }

            apiKeysTable.innerHTML = keys.map((key, index) => \`
                <tr class="border-b border-gray-200 hover:bg-gray-50" data-key-id="\${key.id}">
                    <td class="py-2 px-2 text-gray-600">\${index + 1}</td>
                    <td class="py-2 px-2">
                        <code class="text-xs bg-gray-100 px-2 py-1 rounded">\${key.api_key || 'N/A'}</code>
                    </td>
                    <td class="py-2 px-2 text-gray-800">\${key.organization || 'N/A'}</td>
                    <td class="py-2 px-2 text-gray-800 editable cursor-pointer hover:bg-blue-50" data-field="name" data-type="text" title="Click to edit">
                        <div class="flex items-center gap-2">
                            <span class="value">\${key.name || 'N/A'}</span>
                            <span class="text-gray-400 text-xs">✎</span>
                        </div>
                    </td>
                    <td class="py-2 px-2 text-gray-800">\${key.email || 'N/A'}</td>
                    <td class="py-2 px-2 text-center">
                        <span class="inline-block px-2 py-1 rounded text-xs font-medium \${key.is_academic ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}">
                            \${key.is_academic ? 'Yes' : 'No'}
                        </span>
                    </td>
                    <td class="py-2 px-2 text-right text-gray-800 editable cursor-pointer hover:bg-blue-50" data-field="max_per_second" data-type="number" title="Click to edit">
                        <div class="flex items-center justify-end gap-2">
                            <span class="value">\${key.max_per_second || 'N/A'}/s</span>
                            <span class="text-gray-400 text-xs">✎</span>
                        </div>
                        <div class="text-xs text-gray-500">\${key.max_per_day ? (key.max_per_day.toLocaleString() + '/day') : 'N/A'}</div>
                    </td>
                    <td class="py-2 px-2 text-gray-600 text-xs">
                        \${key.created_at ? new Date(key.created_at).toLocaleString() : 'N/A'}
                    </td>
                    <td class="py-2 px-2 text-xs">
                        \${key.expires_at ?
                            (\`<span class="text-red-600">\${new Date(key.expires_at).toLocaleString()}</span>\`) :
                            ('<span class="text-green-600">Never</span>')
                        }
                    </td>
                </tr>
            \`).join('');

            // Set up inline editing
            setupInlineEditing();
        }

        // UI helpers
        function showLoading(show) {
            loading.classList.toggle('hidden', !show);
        }

        function showError(message) {
            error.classList.remove('hidden');
            error.querySelector('p').textContent = message;
        }

        function hideError() {
            error.classList.add('hidden');
        }

        // Inline editing functionality
        function setupInlineEditing() {
            const editableCells = document.querySelectorAll('.editable');

            editableCells.forEach(cell => {
                cell.addEventListener('click', function() {
                    // Don't create multiple inputs
                    if (this.querySelector('input')) return;

                    const row = this.closest('tr');
                    const keyId = row.dataset.keyId;
                    const field = this.dataset.field;
                    const type = this.dataset.type;
                    const valueSpan = this.querySelector('.value');

                    // Get current value
                    let currentValue = valueSpan.textContent;
                    if (field === 'max_per_second') {
                        currentValue = currentValue.replace('/s', '').trim();
                    }
                    if (currentValue === 'N/A') {
                        currentValue = '';
                    }

                    // Create input
                    const input = document.createElement('input');
                    input.type = type;
                    input.value = currentValue;
                    input.className = 'w-full px-2 py-1 border border-blue-400 rounded focus:outline-none focus:border-blue-600';

                    // Save original content
                    const originalContent = this.innerHTML;

                    // Replace content with input
                    this.innerHTML = '';
                    this.appendChild(input);
                    input.focus();
                    input.select();

                    // Save function
                    const save = async () => {
                        const newValue = input.value.trim();

                        // Skip if no change
                        if (newValue === currentValue || (newValue === '' && currentValue === '')) {
                            this.innerHTML = originalContent;
                            return;
                        }

                        try {
                            // Prepare update data
                            const updateData = {
                                id: parseInt(keyId)
                            };

                            if (field === 'name') {
                                updateData.name = newValue;
                            } else if (field === 'max_per_second') {
                                updateData.max_per_second = newValue === '' ? null : parseInt(newValue);
                            }

                            // Show loading
                            this.innerHTML = '<span class="text-gray-500">Saving...</span>';

                            // Send update request
                            const response = await fetch('/api/api-keys', {
                                method: 'PATCH',
                                headers: {
                                    'Content-Type': 'application/json'
                                },
                                body: JSON.stringify(updateData)
                            });

                            if (!response.ok) {
                                throw new Error('Failed to update');
                            }

                            // Update local data
                            const key = allKeys.find(k => k.id === parseInt(keyId));
                            if (key) {
                                if (field === 'name') {
                                    key.name = newValue;
                                } else if (field === 'max_per_second') {
                                    key.max_per_second = newValue === '' ? null : parseInt(newValue);
                                }
                            }

                            // Update display
                            if (field === 'name') {
                                this.innerHTML = \`
                                    <div class="flex items-center gap-2">
                                        <span class="value">\${newValue || 'N/A'}</span>
                                        <span class="text-gray-400 text-xs">✎</span>
                                    </div>
                                \`;
                            } else if (field === 'max_per_second') {
                                this.innerHTML = \`
                                    <div class="flex items-center justify-end gap-2">
                                        <span class="value">\${newValue || 'N/A'}/s</span>
                                        <span class="text-gray-400 text-xs">✎</span>
                                    </div>
                                    <div class="text-xs text-gray-500">\${key.max_per_day ? (key.max_per_day.toLocaleString() + '/day') : 'N/A'}</div>
                                \`;
                            }

                            // Show success message briefly
                            const successMsg = document.createElement('span');
                            successMsg.textContent = '✓ Saved';
                            successMsg.className = 'text-green-600 text-xs ml-2';
                            this.querySelector('.value').parentElement.appendChild(successMsg);
                            setTimeout(() => successMsg.remove(), 2000);

                        } catch (err) {
                            console.error('Error updating:', err);
                            showError('Failed to update. Please try again.');
                            this.innerHTML = originalContent;
                        }
                    };

                    // Cancel function
                    const cancel = () => {
                        this.innerHTML = originalContent;
                    };

                    // Handle key events
                    input.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') {
                            e.preventDefault();
                            save();
                        } else if (e.key === 'Escape') {
                            e.preventDefault();
                            cancel();
                        }
                    });

                    // Handle blur (click outside)
                    input.addEventListener('blur', () => {
                        // Small delay to allow Enter to process first
                        setTimeout(save, 100);
                    });
                });
            });
        }
    </script>
</body>
</html>`;
}
