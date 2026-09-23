const dns = require('dns').promises;
const net = require('net');

class UrlGuardError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UrlGuardError';
  }
}

function normalizeHostname(hostname) {
  return String(hostname || '')
    .toLowerCase()
    .replace(/\.$/, '');
}

function normalizeUrlKey(urlString) {
  try {
    const u = new URL(urlString);
    u.hash = '';
    return u.href;
  } catch {
    return String(urlString || '').trim();
  }
}

/** B′/B″: URLs legibles del turno (fichas + eventos con allow_url_reading). */
function buildReadableUrlPolicy(instructions = [], events = []) {
  const exactUrls = new Set();
  const hosts = new Set();

  function add(url) {
    if (!url) return;
    const trimmed = String(url).trim();
    if (!trimmed) return;
    exactUrls.add(trimmed);
    exactUrls.add(normalizeUrlKey(trimmed));
    try {
      hosts.add(normalizeHostname(new URL(trimmed).hostname));
    } catch {
      // URL malformada en ficha: se ignora para hosts
    }
  }

  for (const instr of instructions) {
    if (instr.allow_url_reading && instr.associated_url) add(instr.associated_url);
  }
  for (const ev of events) {
    if (ev.allow_url_reading && ev.url) add(ev.url);
  }

  return { exactUrls, hosts };
}

/** B′ exacta o B″ mismo hostname que una URL autorizada. */
function isUrlAllowedByPolicy(urlString, policy) {
  if (!policy || !policy.exactUrls || !policy.hosts) return false;

  const trimmed = String(urlString || '').trim();
  if (!trimmed) return false;
  if (policy.exactUrls.has(trimmed) || policy.exactUrls.has(normalizeUrlKey(trimmed))) {
    return true;
  }

  try {
    const host = normalizeHostname(new URL(trimmed).hostname);
    return policy.hosts.has(host);
  } catch {
    return false;
  }
}

function ipv4ToInt(ip) {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number(oct), 0) >>> 0;
}

function isPrivateOrBlockedIp(ip) {
  if (net.isIPv4(ip)) {
    const n = ipv4ToInt(ip);
    if (n === 0) return true; // 0.0.0.0
    if ((n >>> 24) === 127) return true; // loopback
    if ((n >>> 24) === 10) return true;
    if ((n >>> 24) === 169 && ((n >>> 16) & 0xff) === 254) return true; // link-local / metadata
    if ((n >>> 20) === 0xac1) return true; // 172.16/12
    if ((n >>> 16) === 0xc0a8) return true; // 192.168/16
    if ((n >>> 24) === 100 && ((n >>> 16) & 0xff) >= 64 && ((n >>> 16) & 0xff) <= 127) {
      return true; // CGNAT 100.64/10
    }
    return false;
  }

  if (net.isIPv6(ip)) {
    const normalized = ip.toLowerCase();
    if (normalized === '::1' || normalized === '::') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true; // ULA
    if (normalized.startsWith('fe8') || normalized.startsWith('fe9')
      || normalized.startsWith('fea') || normalized.startsWith('feb')) {
      return true; // link-local
    }
    // IPv4-mapped
    if (normalized.startsWith('::ffff:')) {
      const mapped = normalized.slice(7);
      if (net.isIPv4(mapped)) return isPrivateOrBlockedIp(mapped);
    }
    return false;
  }

  return true;
}

/**
 * C: solo http(s), DNS a IP pública, sin localhost/metadata.
 * Llamar antes de cada hop (URL inicial y redirects).
 */
async function assertSafeNetworkTarget(urlString) {
  let parsed;
  try {
    parsed = new URL(urlString);
  } catch {
    throw new UrlGuardError('URL no válida.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new UrlGuardError('Solo se permiten URLs http o https.');
  }

  const hostname = normalizeHostname(parsed.hostname);
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new UrlGuardError('Host no permitido.');
  }

  if (net.isIP(hostname)) {
    if (isPrivateOrBlockedIp(hostname)) {
      throw new UrlGuardError('Destino de red no permitido.');
    }
    return;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new UrlGuardError('No se pudo resolver el host de la URL.');
  }

  if (!addresses.length) {
    throw new UrlGuardError('No se pudo resolver el host de la URL.');
  }

  for (const { address } of addresses) {
    if (isPrivateOrBlockedIp(address)) {
      throw new UrlGuardError('Destino de red no permitido.');
    }
  }
}

async function assertFetchableUrl(urlString, policy) {
  if (!isUrlAllowedByPolicy(urlString, policy)) {
    throw new UrlGuardError('URL no permitida para este agente.');
  }
  await assertSafeNetworkTarget(urlString);
}

// Dispatcher Undici: el lookup de conexión vuelve a rechazar IPs privadas
// (segunda comprobación, en el momento de conectar; la primera es assertSafeNetworkTarget).
let safeDispatcher;

function createSafeLookup() {
  const dnsCb = require('dns');
  return function safeLookup(hostname, options, callback) {
    const cb = typeof options === 'function' ? options : callback;
    const opts = typeof options === 'function' ? undefined : options;
    dnsCb.lookup(hostname, opts || {}, (err, address, family) => {
      if (err) return cb(err);
      if (typeof address === 'string') {
        if (isPrivateOrBlockedIp(address)) {
          return cb(new UrlGuardError('Destino de red no permitido.'));
        }
        return cb(null, address, family);
      }
      // all: true → address es array de { address, family }
      if (Array.isArray(address)) {
        for (const entry of address) {
          if (isPrivateOrBlockedIp(entry.address)) {
            return cb(new UrlGuardError('Destino de red no permitido.'));
          }
        }
      }
      return cb(null, address, family);
    });
  };
}

function getSafeFetchDispatcher() {
  if (!safeDispatcher) {
    const { Agent } = require('undici');
    safeDispatcher = new Agent({
      connect: {
        lookup: createSafeLookup(),
      },
    });
  }
  return safeDispatcher;
}

module.exports = {
  UrlGuardError,
  buildReadableUrlPolicy,
  isUrlAllowedByPolicy,
  assertFetchableUrl,
  getSafeFetchDispatcher,
};
