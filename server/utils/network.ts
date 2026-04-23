import net from 'net';

import { AppError } from '../errors';

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split('.').map((part) => Number.parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
    return false;
  }

  if (parts[0] === 10) return true;
  if (parts[0] === 127) return true;
  if (parts[0] === 169 && parts[1] === 254) return true;
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  if (parts[0] === 192 && parts[1] === 168) return true;
  return false;
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.toLowerCase();
  return normalized === '::1' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe80:');
}

export function isPrivateOrLocalHostname(hostname: string) {
  const normalized = hostname.toLowerCase();

  if (
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    normalized.endsWith('.local')
  ) {
    return true;
  }

  if (net.isIP(normalized) === 4) {
    return isPrivateIpv4(normalized);
  }

  if (net.isIP(normalized) === 6) {
    return isPrivateIpv6(normalized);
  }

  return false;
}

export function matchesAllowedHostname(hostname: string, allowedHosts: Iterable<string>) {
  const normalized = hostname.toLowerCase();
  for (const allowedHost of allowedHosts) {
    const candidate = allowedHost.trim().toLowerCase();
    if (!candidate) continue;
    if (normalized === candidate || normalized.endsWith(`.${candidate}`)) {
      return true;
    }
  }
  return false;
}

export function parseHttpUrl(value: string, fieldName = 'url') {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new AppError(400, 'invalid_url', `${fieldName} must be a valid URL`, {
      cause: error,
    });
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new AppError(400, 'invalid_url', `${fieldName} must use http or https`);
  }

  return parsed;
}

export function assertSafeRemoteUrl(urlString: string, allowedHosts: Iterable<string>, fieldName = 'url') {
  const parsed = parseHttpUrl(urlString, fieldName);
  if (parsed.protocol !== 'https:') {
    throw new AppError(500, 'unsafe_remote_url', `${fieldName} must use https`);
  }
  if (isPrivateOrLocalHostname(parsed.hostname)) {
    throw new AppError(500, 'unsafe_remote_url', `${fieldName} cannot target a private or local address`);
  }
  if (!matchesAllowedHostname(parsed.hostname, allowedHosts)) {
    throw new AppError(500, 'unsafe_remote_url', `${fieldName} host is not allowlisted`);
  }
  return parsed;
}
