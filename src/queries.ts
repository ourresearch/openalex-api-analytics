import type { Env, TopUser, TopAnonymousUser, TimelineDataPoint, Period, StatusCodeBreakdown } from './types';

/**
 * Analytics Engine SQL API response structure
 */
interface AnalyticsEngineResponse {
    data?: unknown[];
    meta?: {
        name: string;
        type: string;
    }[];
    rows?: number;
}

/**
 * Execute SQL query against Analytics Engine
 */
async function executeQuery(env: Env, query: string): Promise<any[]> {
    const apiUrl = `https://api.cloudflare.com/client/v4/accounts/${env.ACCOUNT_ID}/analytics_engine/sql`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${env.API_TOKEN}`,
        },
        body: query,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Analytics Engine query failed: ${response.status} ${errorText}`);
    }

    const result: AnalyticsEngineResponse = await response.json();
    return result.data || [];
}

/**
 * Get top authenticated API users
 *
 * Uses _sample_interval to account for sampling:
 * - COUNT() becomes SUM(_sample_interval)
 * - AVG(field) becomes SUM(field * _sample_interval) / SUM(_sample_interval)
 */
export async function getTopUsers(env: Env, period: Period = 'hour', limit: number = 10): Promise<TopUser[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';
    const periodDurationSeconds = period === 'hour' ? 3600 : 86400;

    // Query Analytics Engine for top users (authenticated only)
    // blob1 contains the API key for authenticated users, empty for anonymous
    // Use toUInt32 for type conversion and if() for conditional logic
    const query = `
        SELECT
            blob1 as apiKey,
            toUInt32(double2) as statusCode,
            SUM(_sample_interval) as requestCount,
            SUM(double1 * _sample_interval) / SUM(_sample_interval) as avgResponseTime,
            SUM(if(toUInt32(double2) >= 200 AND toUInt32(double2) < 300, _sample_interval, 0)) as successCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 != ''
        GROUP BY blob1, double2
        ORDER BY requestCount DESC
        LIMIT 10000
    `;

    try {
        const results = await executeQuery(env, query);

        // Aggregate by user
        const userMap = new Map<string, {
            totalRequests: number;
            successfulRequests: number;
            totalResponseTime: number;
        }>();

        for (const result of results) {
            const existing = userMap.get(result.apiKey);

            // Convert strings to numbers (Analytics Engine returns numbers as strings)
            const requestCount = Number(result.requestCount);
            const successCount = Number(result.successCount);
            const avgResponseTime = Number(result.avgResponseTime);

            if (existing) {
                existing.totalRequests += requestCount;
                existing.successfulRequests += successCount;
                existing.totalResponseTime += avgResponseTime * requestCount;
            } else {
                userMap.set(result.apiKey, {
                    totalRequests: requestCount,
                    successfulRequests: successCount,
                    totalResponseTime: avgResponseTime * requestCount
                });
            }
        }

        // Sort by total requests and take top N
        const sortedUsers = Array.from(userMap.entries())
            .sort((a, b) => b[1].totalRequests - a[1].totalRequests)
            .slice(0, limit);

        // Get user information from D1 for each API key
        const topUsers: TopUser[] = [];

        for (const [apiKey, stats] of sortedUsers) {
            // Look up user info in D1
            const userInfo = await env.DB
                .prepare('SELECT name, email, organization FROM api_keys WHERE api_key = ?')
                .bind(apiKey)
                .first<{ name: string; email: string; organization: string }>();

            topUsers.push({
                apiKey,
                name: userInfo?.name || null,
                email: userInfo?.email || null,
                organization: userInfo?.organization || null,
                requestCount: Math.round(stats.totalRequests),
                requestsPerSecond: Math.round((stats.totalRequests / periodDurationSeconds) * 100) / 100,
                avgResponseTime: Math.round((stats.totalResponseTime / stats.totalRequests) * 100) / 100,
                successRate: Math.round((stats.successfulRequests / stats.totalRequests) * 10000) / 100
            });
        }

        return topUsers;
    } catch (error) {
        console.error('Error querying top users:', error);
        throw error;
    }
}

/**
 * Get top anonymous users (by IP bucket)
 *
 * Anonymous users are indexed as anon_${bucket}_${statusCode}
 * We extract the bucket number and use _sample_interval for accurate counts
 */
export async function getTopAnonymousUsers(env: Env, period: Period = 'hour', limit: number = 10): Promise<TopAnonymousUser[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';
    const periodDurationSeconds = period === 'hour' ? 3600 : 86400;

    // Query Analytics Engine for anonymous users
    // blob1 is empty for anonymous users, so filter on that
    // Use toUInt32 for type conversion and if() for conditional logic
    const query = `
        SELECT
            index1 as indexKey,
            blob2 as ipSample,
            toUInt32(double2) as statusCode,
            SUM(_sample_interval) as requestCount,
            SUM(double1 * _sample_interval) / SUM(_sample_interval) as avgResponseTime,
            SUM(if(toUInt32(double2) >= 200 AND toUInt32(double2) < 300, _sample_interval, 0)) as successCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
        GROUP BY index1, blob2, double2
        ORDER BY requestCount DESC
        LIMIT 10000
    `;

    try {
        const results = await executeQuery(env, query);

        // Aggregate by bucket (multiple status codes per bucket)
        const bucketMap = new Map<string, {
            bucket: string;
            ipSample: string | null;
            requestCount: number;
            totalResponseTime: number;
            successfulRequests: number;
        }>();

        for (const result of results) {
            // Extract bucket from index (format: anon_123_200)
            const match = result.indexKey.match(/^anon_(\d+)_/);
            if (!match) continue;

            const bucket = `anon_${match[1]}`;
            const existing = bucketMap.get(bucket);

            // Convert strings to numbers (Analytics Engine returns numbers as strings)
            const requestCount = Number(result.requestCount);
            const successCount = Number(result.successCount);
            const avgResponseTime = Number(result.avgResponseTime);

            if (existing) {
                existing.requestCount += requestCount;
                existing.totalResponseTime += avgResponseTime * requestCount;
                existing.successfulRequests += successCount;
            } else {
                bucketMap.set(bucket, {
                    bucket,
                    ipSample: result.ipSample || null,
                    requestCount: requestCount,
                    totalResponseTime: avgResponseTime * requestCount,
                    successfulRequests: successCount
                });
            }
        }

        // Convert to array and calculate final metrics
        const topAnonymous = Array.from(bucketMap.values())
            .map(item => ({
                bucket: item.bucket,
                ipSample: item.ipSample,
                requestCount: Math.round(item.requestCount),
                requestsPerSecond: Math.round((item.requestCount / periodDurationSeconds) * 100) / 100,
                avgResponseTime: Math.round((item.totalResponseTime / item.requestCount) * 100) / 100,
                successRate: Math.round((item.successfulRequests / item.requestCount) * 10000) / 100
            }))
            .sort((a, b) => b.requestCount - a.requestCount)
            .slice(0, limit);

        return topAnonymous;
    } catch (error) {
        console.error('Error querying top anonymous users:', error);
        throw error;
    }
}

/**
 * Get usage timeline data
 *
 * Uses toStartOfInterval to bucket time series data
 * Accounts for sampling with _sample_interval
 */
export async function getUsageTimeline(env: Env, period: Period = 'hour'): Promise<TimelineDataPoint[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';
    const bucketInterval = period === 'hour' ? "INTERVAL '5' MINUTE" : "INTERVAL '1' HOUR";

    // Try using a subquery approach - compute the bucket in the inner query,
    // then group by the column name in the outer query
    const query = `
        SELECT
            timeBucket,
            SUM(sampleInterval) as requestCount,
            SUM(weightedResponseTime) / SUM(sampleInterval) as avgResponseTime
        FROM (
            SELECT
                toStartOfInterval(timestamp, ${bucketInterval}) as timeBucket,
                _sample_interval as sampleInterval,
                double1 * _sample_interval as weightedResponseTime
            FROM ${env.ANALYTICS_DATASET}
            WHERE timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
        )
        GROUP BY timeBucket
        ORDER BY timeBucket ASC
    `;

    try {
        const results = await executeQuery(env, query);

        return results.map((result: any) => ({
            timestamp: result.timeBucket,
            requestCount: Math.round(Number(result.requestCount)),
            avgResponseTime: Math.round(Number(result.avgResponseTime) * 100) / 100
        }));
    } catch (error) {
        console.error('Error querying usage timeline:', error);
        throw error;
    }
}

/**
 * Get status code breakdown for a specific API user
 */
export async function getUserStatusBreakdown(env: Env, apiKey: string, period: Period = 'hour'): Promise<StatusCodeBreakdown[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            toUInt32(double2) as statusCode,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = '${apiKey}'
        GROUP BY double2
        ORDER BY requestCount DESC
    `;

    try {
        const results = await executeQuery(env, query);

        // Calculate total for percentages
        const total = results.reduce((sum, r) => sum + Number(r.requestCount), 0);

        return results.map(result => ({
            statusCode: Number(result.statusCode),
            requestCount: Math.round(Number(result.requestCount)),
            percentage: Math.round((Number(result.requestCount) / total) * 10000) / 100
        }));
    } catch (error) {
        console.error('Error querying user status breakdown:', error);
        throw error;
    }
}

/**
 * Get timeline data for a specific user with status code breakdown
 */
export async function getUserTimeline(env: Env, apiKey: string, period: Period = 'hour'): Promise<any[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';
    const bucketInterval = period === 'hour' ? "INTERVAL '5' MINUTE" : "INTERVAL '1' HOUR";

    const query = `
        SELECT
            timeBucket,
            statusCode,
            SUM(sampleInterval) as requestCount,
            SUM(weightedResponseTime) / SUM(sampleInterval) as avgResponseTime
        FROM (
            SELECT
                toStartOfInterval(timestamp, ${bucketInterval}) as timeBucket,
                toUInt32(double2) as statusCode,
                _sample_interval as sampleInterval,
                double1 * _sample_interval as weightedResponseTime
            FROM ${env.ANALYTICS_DATASET}
            WHERE timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
                AND blob1 = '${apiKey}'
        )
        GROUP BY timeBucket, statusCode
        ORDER BY timeBucket ASC, statusCode ASC
    `;

    try {
        const results = await executeQuery(env, query);

        return results.map((result: any) => ({
            timestamp: result.timeBucket,
            statusCode: Number(result.statusCode),
            requestCount: Math.round(Number(result.requestCount)),
            avgResponseTime: Math.round(Number(result.avgResponseTime) * 100) / 100
        }));
    } catch (error) {
        console.error('Error querying user timeline:', error);
        throw error;
    }
}

/**
 * Get the top IP address in an anonymous bucket
 */
export async function getTopIpInBucket(env: Env, bucket: string, period: Period = 'hour'): Promise<string | null> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    // Use prefix matching with string comparison
    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            blob2 as ipAddress,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
            AND index1 >= '${prefix}'
            AND index1 < '${prefixEnd}'
            AND blob2 != ''
        GROUP BY blob2
        ORDER BY requestCount DESC
        LIMIT 1
    `;

    try {
        const results = await executeQuery(env, query);
        return results.length > 0 ? results[0].ipAddress : null;
    } catch (error) {
        console.error('Error querying top IP in bucket:', error);
        throw error;
    }
}

/**
 * Get timeline data for a specific anonymous bucket with status code breakdown
 */
export async function getAnonymousTimeline(env: Env, bucket: string, period: Period = 'hour'): Promise<any[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';
    const bucketInterval = period === 'hour' ? "INTERVAL '5' MINUTE" : "INTERVAL '1' HOUR";

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    // Use prefix matching with string comparison
    // Match all entries from anon_N_ up to (but not including) anon_(N+1)_
    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            timeBucket,
            statusCode,
            SUM(sampleInterval) as requestCount,
            SUM(weightedResponseTime) / SUM(sampleInterval) as avgResponseTime
        FROM (
            SELECT
                toStartOfInterval(timestamp, ${bucketInterval}) as timeBucket,
                toUInt32(double2) as statusCode,
                _sample_interval as sampleInterval,
                double1 * _sample_interval as weightedResponseTime
            FROM ${env.ANALYTICS_DATASET}
            WHERE timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
                AND blob1 = ''
                AND index1 >= '${prefix}'
                AND index1 < '${prefixEnd}'
        )
        GROUP BY timeBucket, statusCode
        ORDER BY timeBucket ASC, statusCode ASC
    `;

    try {
        const results = await executeQuery(env, query);

        return results.map((result: any) => ({
            timestamp: result.timeBucket,
            statusCode: Number(result.statusCode),
            requestCount: Math.round(Number(result.requestCount)),
            avgResponseTime: Math.round(Number(result.avgResponseTime) * 100) / 100
        }));
    } catch (error) {
        console.error('Error querying anonymous timeline:', error);
        throw error;
    }
}

/**
 * Get sample URLs for a specific user
 */
export async function getSampleUrlsForUser(env: Env, apiKey: string, period: Period = 'hour', limit: number = 10): Promise<string[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            blob3 as url
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = '${apiKey}'
            AND blob3 != ''
        GROUP BY blob3
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => r.url);
    } catch (error) {
        console.error('Error querying sample URLs:', error);
        throw error;
    }
}

/**
 * Get sample URLs for an anonymous bucket
 */
export async function getSampleUrlsForBucket(env: Env, bucket: string, period: Period = 'hour', limit: number = 10): Promise<string[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            blob3 as url
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
            AND index1 >= '${prefix}'
            AND index1 < '${prefixEnd}'
            AND blob3 != ''
        GROUP BY blob3
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => r.url);
    } catch (error) {
        console.error('Error querying sample URLs:', error);
        throw error;
    }
}

/**
 * Get status code breakdown for a specific anonymous bucket
 */
export async function getAnonymousStatusBreakdown(env: Env, bucket: string, period: Period = 'hour'): Promise<StatusCodeBreakdown[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    // Use prefix matching with string comparison
    // Match all entries from anon_N_ up to (but not including) anon_(N+1)_
    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            toUInt32(double2) as statusCode,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
            AND index1 >= '${prefix}'
            AND index1 < '${prefixEnd}'
        GROUP BY double2
        ORDER BY requestCount DESC
    `;

    try {
        const results = await executeQuery(env, query);

        // Calculate total for percentages
        const total = results.reduce((sum, r) => sum + Number(r.requestCount), 0);

        return results.map(result => ({
            statusCode: Number(result.statusCode),
            requestCount: Math.round(Number(result.requestCount)),
            percentage: Math.round((Number(result.requestCount) / total) * 10000) / 100
        }));
    } catch (error) {
        console.error('Error querying anonymous status breakdown:', error);
        throw error;
    }
}

/**
 * Get top user agents for a specific user
 */
export async function getTopUserAgentsForUser(env: Env, apiKey: string, period: Period = 'hour', limit: number = 10): Promise<{ userAgent: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            blob6 as userAgent,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = '${apiKey}'
            AND blob6 != ''
        GROUP BY blob6
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            userAgent: r.userAgent,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top user agents:', error);
        throw error;
    }
}

/**
 * Get top referrers for a specific user
 */
export async function getTopReferrersForUser(env: Env, apiKey: string, period: Period = 'hour', limit: number = 10): Promise<{ referrer: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            blob7 as referrer,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = '${apiKey}'
            AND blob7 != ''
        GROUP BY blob7
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            referrer: r.referrer,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top referrers:', error);
        throw error;
    }
}

/**
 * Get top user agents for an anonymous bucket
 */
export async function getTopUserAgentsForBucket(env: Env, bucket: string, period: Period = 'hour', limit: number = 10): Promise<{ userAgent: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            blob6 as userAgent,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
            AND index1 >= '${prefix}'
            AND index1 < '${prefixEnd}'
            AND blob6 != ''
        GROUP BY blob6
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            userAgent: r.userAgent,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top user agents for bucket:', error);
        throw error;
    }
}

/**
 * Get top referrers for an anonymous bucket
 */
export async function getTopReferrersForBucket(env: Env, bucket: string, period: Period = 'hour', limit: number = 10): Promise<{ referrer: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    // Extract bucket number from format "anon_123"
    const bucketMatch = bucket.match(/^anon_(\d+)$/);
    if (!bucketMatch) {
        throw new Error('Invalid bucket format');
    }

    const bucketNum = parseInt(bucketMatch[1]);
    const nextBucketNum = bucketNum + 1;
    const prefix = `anon_${bucketNum}_`;
    const prefixEnd = `anon_${nextBucketNum}_`;

    const query = `
        SELECT
            blob7 as referrer,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob1 = ''
            AND index1 >= '${prefix}'
            AND index1 < '${prefixEnd}'
            AND blob7 != ''
        GROUP BY blob7
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            referrer: r.referrer,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top referrers for bucket:', error);
        throw error;
    }
}

/**
 * Get top user agents across all requests (aggregate)
 */
export async function getTopUserAgentsAggregate(env: Env, period: Period = 'hour', limit: number = 10): Promise<{ userAgent: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            blob6 as userAgent,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob6 != ''
        GROUP BY blob6
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            userAgent: r.userAgent,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top user agents aggregate:', error);
        throw error;
    }
}

/**
 * Get top referrers across all requests (aggregate)
 */
export async function getTopReferrersAggregate(env: Env, period: Period = 'hour', limit: number = 10): Promise<{ referrer: string; requestCount: number }[]> {
    const interval = period === 'hour' ? '1' : '1';
    const intervalUnit = period === 'hour' ? 'HOUR' : 'DAY';

    const query = `
        SELECT
            blob7 as referrer,
            SUM(_sample_interval) as requestCount
        FROM ${env.ANALYTICS_DATASET}
        WHERE
            timestamp > NOW() - INTERVAL '${interval}' ${intervalUnit}
            AND blob7 != ''
        GROUP BY blob7
        ORDER BY requestCount DESC
        LIMIT ${limit}
    `;

    try {
        const results = await executeQuery(env, query);
        return results.map(r => ({
            referrer: r.referrer,
            requestCount: Math.round(Number(r.requestCount))
        }));
    } catch (error) {
        console.error('Error querying top referrers aggregate:', error);
        throw error;
    }
}
