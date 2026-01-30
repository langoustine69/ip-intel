import { createAgent } from '@lucid-agents/core';
import { http } from '@lucid-agents/http';
import { createAgentApp } from '@lucid-agents/hono';
import { payments, paymentsFromEnv } from '@lucid-agents/payments';
import { z } from 'zod';

const agent = await createAgent({
  name: 'ip-intel',
  version: '1.0.0',
  description: 'IP Intelligence API - Geolocation, ISP, timezone data for any IP address. Essential for security agents, fraud detection, and location-aware applications.',
})
  .use(http())
  .use(payments({ config: paymentsFromEnv() }))
  .build();

const { app, addEntrypoint } = await createAgentApp(agent);

// === HELPER: Fetch IP data from ip-api.com ===
async function fetchIPData(ip: string, fields?: string) {
  const defaultFields = 'status,message,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp,org,as,query';
  const url = `http://ip-api.com/json/${ip}?fields=${fields || defaultFields}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`API error: ${response.status}`);
  const data = await response.json();
  if (data.status === 'fail') throw new Error(data.message || 'Invalid IP address');
  return data;
}

// Validate IP address format
function isValidIP(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::(?:[0-9a-fA-F]{1,4}:){0,6}[0-9a-fA-F]{1,4}$|^(?:[0-9a-fA-F]{1,4}:){1,7}:$|^(?:[0-9a-fA-F]{1,4}:){0,6}::(?:[0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}$/;
  return ipv4Regex.test(ip) || ipv6Regex.test(ip);
}

// === FREE ENDPOINT: Overview ===
addEntrypoint({
  key: 'overview',
  description: 'Free overview - sample IP lookup and service info. Try before you buy.',
  input: z.object({}),
  price: { amount: 0 },
  handler: async () => {
    // Sample lookup using Google's public DNS
    const sample = await fetchIPData('8.8.8.8');
    return {
      output: {
        service: 'IP Intelligence Agent',
        description: 'Real-time IP geolocation, ISP info, and timezone data',
        dataSource: 'ip-api.com (live)',
        sampleLookup: {
          ip: sample.query,
          country: sample.country,
          city: sample.city,
          isp: sample.isp,
        },
        endpoints: {
          lookup: 'Single IP lookup - $0.001',
          bulk: 'Bulk IP lookup (up to 10) - $0.003',
          geolocate: 'Detailed geolocation - $0.002',
          timezone: 'Timezone info - $0.001',
          'isp-info': 'ISP/Organization details - $0.002',
        },
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 1: Single IP Lookup ($0.001) ===
addEntrypoint({
  key: 'lookup',
  description: 'Look up geolocation and network info for a single IP address',
  input: z.object({
    ip: z.string().describe('IPv4 or IPv6 address to look up'),
  }),
  price: { amount: 1000 },
  handler: async (ctx) => {
    if (!isValidIP(ctx.input.ip)) {
      throw new Error('Invalid IP address format');
    }
    const data = await fetchIPData(ctx.input.ip);
    return {
      output: {
        ip: data.query,
        country: data.country,
        countryCode: data.countryCode,
        region: data.regionName,
        city: data.city,
        zip: data.zip,
        coordinates: { lat: data.lat, lon: data.lon },
        timezone: data.timezone,
        isp: data.isp,
        organization: data.org,
        asn: data.as,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 2: Bulk IP Lookup ($0.003) ===
addEntrypoint({
  key: 'bulk',
  description: 'Look up multiple IP addresses at once (max 10)',
  input: z.object({
    ips: z.array(z.string()).min(1).max(10).describe('Array of IP addresses to look up'),
  }),
  price: { amount: 3000 },
  handler: async (ctx) => {
    const results = await Promise.all(
      ctx.input.ips.map(async (ip) => {
        if (!isValidIP(ip)) {
          return { ip, error: 'Invalid IP format' };
        }
        try {
          const data = await fetchIPData(ip);
          return {
            ip: data.query,
            country: data.country,
            countryCode: data.countryCode,
            city: data.city,
            isp: data.isp,
            coordinates: { lat: data.lat, lon: data.lon },
          };
        } catch (err: any) {
          return { ip, error: err.message };
        }
      })
    );
    return {
      output: {
        count: results.length,
        results,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 3: Detailed Geolocation ($0.002) ===
addEntrypoint({
  key: 'geolocate',
  description: 'Get detailed geographic location for an IP with coordinates and regional data',
  input: z.object({
    ip: z.string().describe('IP address to geolocate'),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    if (!isValidIP(ctx.input.ip)) {
      throw new Error('Invalid IP address format');
    }
    const data = await fetchIPData(ctx.input.ip);
    return {
      output: {
        ip: data.query,
        location: {
          country: data.country,
          countryCode: data.countryCode,
          region: data.region,
          regionName: data.regionName,
          city: data.city,
          postalCode: data.zip,
        },
        coordinates: {
          latitude: data.lat,
          longitude: data.lon,
          mapsUrl: `https://www.google.com/maps?q=${data.lat},${data.lon}`,
        },
        timezone: data.timezone,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 4: Timezone Info ($0.001) ===
addEntrypoint({
  key: 'timezone',
  description: 'Get timezone information for an IP address',
  input: z.object({
    ip: z.string().describe('IP address to get timezone for'),
  }),
  price: { amount: 1000 },
  handler: async (ctx) => {
    if (!isValidIP(ctx.input.ip)) {
      throw new Error('Invalid IP address format');
    }
    const data = await fetchIPData(ctx.input.ip, 'status,message,query,timezone,countryCode,city');
    
    // Calculate offset from timezone
    const now = new Date();
    const localTime = now.toLocaleString('en-US', { timeZone: data.timezone });
    
    return {
      output: {
        ip: data.query,
        timezone: data.timezone,
        country: data.countryCode,
        city: data.city,
        currentLocalTime: localTime,
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

// === PAID ENDPOINT 5: ISP/Organization Info ($0.002) ===
addEntrypoint({
  key: 'isp-info',
  description: 'Get ISP and organization details for an IP address - useful for fraud detection and security',
  input: z.object({
    ip: z.string().describe('IP address to get ISP info for'),
  }),
  price: { amount: 2000 },
  handler: async (ctx) => {
    if (!isValidIP(ctx.input.ip)) {
      throw new Error('Invalid IP address format');
    }
    const data = await fetchIPData(ctx.input.ip, 'status,message,query,isp,org,as,asname,mobile,proxy,hosting');
    return {
      output: {
        ip: data.query,
        isp: data.isp,
        organization: data.org,
        asn: data.as,
        asName: data.asname,
        flags: {
          mobile: data.mobile || false,
          proxy: data.proxy || false,
          hosting: data.hosting || false,
        },
        fetchedAt: new Date().toISOString(),
      },
    };
  },
});

const port = Number(process.env.PORT ?? 3000);
console.log(`🌐 IP Intel Agent running on port ${port}`);

export default { port, fetch: app.fetch };
