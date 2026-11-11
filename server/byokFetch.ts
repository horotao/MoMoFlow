import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import { Readable } from 'node:stream';

export class ApiConfigurationError extends Error {}

export function isPublicAddress(address: string): boolean {
  if (isIP(address) === 4) {
    const [a, b, c] = address.split('.').map(Number);
    return !(a === 0 || a === 10 || a === 127 || a >= 224
      || a === 169 && b === 254 || a === 172 && b >= 16 && b <= 31
      || a === 192 && (b === 168 || b === 0 || b === 88 && c === 99)
      || a === 100 && b >= 64 && b <= 127
      || a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)
      || a === 203 && b === 0 && c === 113);
  }
  if (isIP(address) === 6) {
    const first = parseInt(address.split(':')[0], 16);
    return first >= 0x2000 && first <= 0x3fff
      && !/^2001:(?::|0*0:|0*2:|0*10:|0*db8:)/i.test(address) && !/^2002:/i.test(address);
  }
  return false;
}

function isProxyDnsAddress(address: string): boolean {
  // Local VPNs use this reserved range as synthetic DNS answers. Permit it
  // only for a named HTTPS host, with ordinary TLS hostname verification.
  // Literal URLs in this range still fail the destination check above.
  const [a, b] = address.split('.').map(Number);
  return isIP(address) === 4 && a === 198 && (b === 18 || b === 19);
}

// Pin the validated DNS answer to this TLS connection. Redirects are returned
// to the caller, so a gateway cannot forward credentials to another host.
export const byokFetch: typeof fetch = async (input, init) => {
  const outgoing = new Request(input, init);
  const url = new URL(outgoing.url);
  if (url.protocol !== 'https:' || url.username || url.password) throw new ApiConfigurationError('Base URL 必须为 HTTPS 地址');
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local')
    || isIP(hostname) && !isPublicAddress(hostname)) throw new ApiConfigurationError('Base URL 不能指向本机或内网');
  outgoing.signal.throwIfAborted();
  const body = outgoing.body ? Buffer.from(await outgoing.arrayBuffer()) : undefined;
  outgoing.signal.throwIfAborted();
  return new Promise<Response>((resolve, reject) => {
    const upstream = request(url, {
      method: outgoing.method,
      headers: Object.fromEntries(outgoing.headers),
      signal: outgoing.signal,
      lookup(host, options, callback) {
        void lookup(host, { all: true }).then(addresses => {
          if (!addresses.length || addresses.some(item => !isPublicAddress(item.address) && !isProxyDnsAddress(item.address))) {
            callback(new ApiConfigurationError('Base URL 不能指向本机或内网'), '', 4);
            return;
          }
          if (options.all) callback(null, addresses);
          else callback(null, addresses[0].address, addresses[0].family);
        }, () => callback(new ApiConfigurationError('无法解析 Base URL，请检查地址'), '', 4));
      },
    }, incoming => {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) {
        if (Array.isArray(value)) value.forEach(item => headers.append(name, item));
        else if (value !== undefined) headers.set(name, value);
      }
      const status = incoming.statusCode ?? 502;
      const stream = [204, 205, 304].includes(status) ? null : Readable.toWeb(incoming) as ReadableStream<Uint8Array>;
      if (!stream) incoming.resume();
      resolve(new Response(stream, { status, headers }));
    });
    upstream.on('error', reject);
    upstream.end(body);
  });
};
