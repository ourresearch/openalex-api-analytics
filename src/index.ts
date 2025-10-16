import type { Env, Period, TopUsersResponse, TopAnonymousResponse, TimelineResponse } from './types';
import { getTopUsers, getTopAnonymousUsers, getUsageTimeline, getUserStatusBreakdown, getAnonymousStatusBreakdown, getUserTimeline, getAnonymousTimeline } from './queries';

export default {
    async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
        const url = new URL(request.url);

        // CORS headers for API requests
        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
        };

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders
            });
        }

        // Route: API endpoints
        if (url.pathname.startsWith('/api/')) {
            return handleApiRequest(url, env, corsHeaders);
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

        // 404 for unknown routes
        return new Response('Not Found', { status: 404 });
    }
};

/**
 * Handle API requests
 */
async function handleApiRequest(url: URL, env: Env, corsHeaders: Record<string, string>): Promise<Response> {
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
    <div class="max-w-7xl mx-auto">
        <!-- Header -->
        <div class="glass rounded-lg shadow-xl p-6 mb-6">
            <div class="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 class="text-3xl font-bold text-gray-800">OpenAlex API Analytics</h1>
                    <p class="text-gray-600 mt-1">Real-time usage monitoring and insights</p>
                </div>
                <div class="flex gap-2">
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

        <!-- Loading Indicator -->
        <div id="loading" class="hidden flex items-center justify-center py-12">
            <div class="spinner"></div>
            <span class="ml-3 text-white font-medium">Loading analytics...</span>
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

        <!-- Usage Timeline Chart -->
        <div class="glass rounded-lg shadow-xl p-6 mb-6">
            <h2 class="text-xl font-bold text-gray-800 mb-4" id="timelineTitle">Usage Timeline</h2>
            <div class="relative h-80">
                <canvas id="timelineChart"></canvas>
            </div>
        </div>

        <!-- Tables Container -->
        <div id="mainView" class="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <!-- Top Authenticated Users -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top API Users</h2>
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
            </div>

            <!-- Top Anonymous Users -->
            <div class="glass rounded-lg shadow-xl p-6">
                <h2 class="text-xl font-bold text-gray-800 mb-4">Top Anonymous Users</h2>
                <div class="overflow-x-auto">
                    <table class="w-full text-sm">
                        <thead>
                            <tr class="border-b-2 border-gray-300">
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">#</th>
                                <th class="text-left py-2 px-2 font-semibold text-gray-700">Bucket</th>
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
            </div>
        </div>

        <!-- Status Breakdown Section (hidden by default) -->
        <div id="statusBreakdown" class="hidden grid grid-cols-1 lg:grid-cols-2 gap-6">
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

        // DOM elements
        const btnHour = document.getElementById('btnHour');
        const btnDay = document.getElementById('btnDay');
        const btnRefresh = document.getElementById('btnRefresh');
        const loading = document.getElementById('loading');
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
                    // Load overview data
                    const [usersData, anonymousData, timelineData] = await Promise.all([
                        fetch(\`/api/top-users?period=\${currentPeriod}\`).then(r => r.json()),
                        fetch(\`/api/top-anonymous?period=\${currentPeriod}\`).then(r => r.json()),
                        fetch(\`/api/usage-timeline?period=\${currentPeriod}\`).then(r => r.json())
                    ]);

                    // Update UI for overview
                    userContext.classList.add('hidden');
                    statusBreakdown.classList.add('hidden');
                    mainView.classList.remove('hidden');
                    document.getElementById('timelineTitle').textContent = 'Usage Timeline';

                    // Render data
                    renderTopUsers(usersData.data);
                    renderTopAnonymous(anonymousData.data);
                    renderOverviewTimeline(timelineData.data);

                } else if (currentView.type === 'user') {
                    // Load user-specific data
                    const [timelineResponse, statusResponse, usersData] = await Promise.all([
                        fetch(\`/api/user-timeline?apiKey=\${encodeURIComponent(currentView.apiKey)}&period=\${currentPeriod}\`).then(r => r.json()),
                        fetch(\`/api/user-status-breakdown?apiKey=\${encodeURIComponent(currentView.apiKey)}&period=\${currentPeriod}\`).then(r => r.json()),
                        fetch(\`/api/top-users?period=\${currentPeriod}\`).then(r => r.json())
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

                } else if (currentView.type === 'anonymous') {
                    // Load anonymous bucket data
                    const [timelineResponse, statusResponse] = await Promise.all([
                        fetch(\`/api/anonymous-timeline?bucket=\${encodeURIComponent(currentView.bucket)}&period=\${currentPeriod}\`).then(r => r.json()),
                        fetch(\`/api/anonymous-status-breakdown?bucket=\${encodeURIComponent(currentView.bucket)}&period=\${currentPeriod}\`).then(r => r.json())
                    ]);

                    // Update UI for anonymous view
                    userContext.classList.remove('hidden');
                    statusBreakdown.classList.remove('hidden');
                    mainView.classList.add('hidden');
                    document.getElementById('contextUserName').textContent = currentView.bucket;
                    document.getElementById('contextUserEmail').textContent = 'Anonymous User Group';
                    document.getElementById('timelineTitle').textContent = 'Request Timeline by Status Code';

                    // Render data
                    renderUserTimeline(timelineResponse.data);
                    renderStatusChart(statusResponse.data);
                    renderStatusTable(statusResponse.data);
                }

                lastUpdated.textContent = \`Last updated: \${new Date().toLocaleTimeString()}\`;
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
                return;
            }

            tbody.innerHTML = users.map((user, index) => \`
                <tr class="clickable-row border-b border-gray-200 hover:bg-gray-50"
                    data-type="user"
                    data-apikey="\${user.apiKey}"
                    data-name="\${(user.name || 'Unknown').replace(/"/g, '&quot;')}"
                    data-email="\${(user.email || '').replace(/"/g, '&quot;')}">
                    <td class="py-2 px-2 text-gray-600">\${index + 1}</td>
                    <td class="py-2 px-2">
                        <div class="font-medium text-gray-800">\${user.name || 'Unknown'}</div>
                        <div class="text-xs text-gray-500">\${user.email || user.organization || user.apiKey.substring(0, 12) + '...'}</div>
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
            \`).join('');
        }

        // Render top anonymous users table
        function renderTopAnonymous(users) {
            const tbody = document.getElementById('topAnonymousTable');
            if (!users || users.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No data available</td></tr>';
                return;
            }

            tbody.innerHTML = users.map((user, index) => \`
                <tr class="clickable-row border-b border-gray-200 hover:bg-gray-50"
                    data-type="anonymous"
                    data-bucket="\${user.bucket}">
                    <td class="py-2 px-2 text-gray-600">\${index + 1}</td>
                    <td class="py-2 px-2">
                        <div class="font-medium text-gray-800">\${user.bucket}</div>
                        <div class="text-xs text-gray-500">\${user.ipSample || 'Multiple IPs'}</div>
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
            \`).join('');
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
            loading.classList.toggle('hidden', !show);
            loading.classList.toggle('flex', show);
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
            console.log('Initializing row click handlers...');

            // Event delegation for table row clicks
            const usersTable = document.getElementById('topUsersTable');
            const anonymousTable = document.getElementById('topAnonymousTable');

            if (usersTable) {
                usersTable.addEventListener('click', (e) => {
                    const row = e.target.closest('tr.clickable-row');
                    if (row && row.dataset.type === 'user') {
                        console.log('User row clicked:', row.dataset);
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
                        console.log('Anonymous row clicked:', row.dataset);
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
    </script>
</body>
</html>`;
}
