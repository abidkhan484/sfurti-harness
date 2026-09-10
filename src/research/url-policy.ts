import { isIP } from "node:net";

/** DNS is injected so SSRF decisions can be tested without network access. */
export type HostResolver = (hostname: string) => Promise<string[]>;

export type UrlAccessDecision =
  { allowed: true; url: URL; addresses: string[] } | { allowed: false; reason: string };

const metadataHosts = new Set([
  "metadata",
  "metadata.google.internal",
  "instance-data",
  "instance-data.ec2.internal",
]);

/**
 * Rejects non-public destinations before every request, including redirects.
 * Hostnames are resolved by the caller-supplied resolver; a hostname is safe
 * only when every returned address is a public unicast address.
 */
export async function publicUrlAccess(
  value: string,
  resolveHost: HostResolver
): Promise<UrlAccessDecision> {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return { allowed: false, reason: "invalid_url" };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:")
    return { allowed: false, reason: "unsupported_scheme" };
  if (url.username || url.password) return { allowed: false, reason: "credentials_in_url" };
  const hostname = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost"))
    return { allowed: false, reason: "localhost_destination" };
  if (metadataHosts.has(hostname)) return { allowed: false, reason: "metadata_destination" };

  const literalType = isIP(hostname);
  let addresses: string[];
  if (literalType) addresses = [hostname];
  else {
    try {
      addresses = await resolveHost(hostname);
    } catch {
      return { allowed: false, reason: "dns_unavailable" };
    }
  }
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address)))
    return { allowed: false, reason: "private_or_unresolvable_destination" };
  url.hostname = hostname;
  return { allowed: true, url, addresses };
}

/** Exported for focused policy tests and to keep redirect checks identical. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isPublicIpv4(address);
  if (family === 6) return isPublicIpv6(address);
  return false;
}

function isPublicIpv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (
    octets.length !== 4 ||
    octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)
  )
    return false;
  const [a, b] = octets;
  // RFC1918, loopback, link-local, carrier-grade NAT, documentation and other
  // non-routable ranges are intentionally unavailable to web collection.
  if (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0)
  )
    return false;
  return true;
}

function isPublicIpv6(address: string): boolean {
  const normalized = address.toLowerCase();
  if (normalized === "::" || normalized === "::1" || normalized.startsWith("::ffff:")) return false;
  // fc00::/7 unique-local, fe80::/10 link-local, ff00::/8 multicast.
  if (
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe8") ||
    normalized.startsWith("fe9") ||
    normalized.startsWith("fea") ||
    normalized.startsWith("feb") ||
    normalized.startsWith("ff")
  )
    return false;
  // IPv4-embedded forms are rejected rather than relying on a string prefix.
  return !normalized.includes(".");
}
