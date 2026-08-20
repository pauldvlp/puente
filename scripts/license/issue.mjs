#!/usr/bin/env node
/**
 * Issue a puente Pro license key.
 *
 * MAINTAINER TOOL. It needs the Ed25519 private key that the published binaries verify against;
 * that key lives at ~/.puente-licensing/signing-key.pem and must never enter this repository.
 *
 *   node scripts/license/issue.mjs --licensee "Acme GmbH" --email ops@acme.de --plan agency
 *   node scripts/license/issue.mjs --licensee "Acme" --email a@b.c --plan pro --months 12 --seats 10
 *
 * Flags:
 *   --licensee <name>     legal entity the license is granted to        (required)
 *   --email <address>     billing / delivery address                    (required)
 *   --plan <p>            pro | agency | enterprise                     (default: pro)
 *   --months <n>          subscription length                           (default: 12)
 *   --perpetual           never expires (use for lifetime deals only)
 *   --seats <n>           seat cap for the team feature                 (default: per plan)
 *   --nodes <n>           node cap                                      (default: unlimited)
 *   --features a,b,c      override the plan's feature list
 *   --key <path>          signing key                (default: ~/.puente-licensing/signing-key.pem)
 *   --json                print the whole record, not just the key
 */
import { createPrivateKey, randomUUID, sign } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PLANS = {
  pro: { features: ['team', 'audit', 'alerts', 'backup', 'api'], seats: 5 },
  agency: {
    features: ['team', 'audit', 'alerts', 'backup', 'api', 'workspaces', 'fleet'],
    seats: 15,
  },
  enterprise: {
    features: ['team', 'sso', 'audit', 'alerts', 'backup', 'api', 'workspaces', 'fleet'],
    seats: null,
  },
};

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const name = arg.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      out[name] = true;
    } else {
      out[name] = next;
      i += 1;
    }
  }
  return out;
}

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

const args = parseArgs(process.argv.slice(2));
if (args.help) {
  console.log(
    readFileSync(new URL(import.meta.url))
      .toString()
      .split('*/')[0]
      .slice(3),
  );
  process.exit(0);
}

const licensee = typeof args.licensee === 'string' ? args.licensee : null;
const email = typeof args.email === 'string' ? args.email : null;
if (!licensee) fail('--licensee is required');
if (!email) fail('--email is required');

const plan = typeof args.plan === 'string' ? args.plan : 'pro';
if (!PLANS[plan]) fail(`--plan must be one of ${Object.keys(PLANS).join(', ')}`);

const months = args.months ? Number(args.months) : 12;
if (!args.perpetual && (!Number.isInteger(months) || months < 1))
  fail('--months must be a positive integer');

const issuedAt = Date.now();
const expiresAt = args.perpetual
  ? null
  : new Date(issuedAt).setMonth(new Date(issuedAt).getMonth() + months);

const features =
  typeof args.features === 'string'
    ? args.features
        .split(',')
        .map((f) => f.trim())
        .filter(Boolean)
    : PLANS[plan].features;

const seats = args.seats ? Number(args.seats) : PLANS[plan].seats;
const nodes = args.nodes ? Number(args.nodes) : null;

const payload = {
  v: 1,
  id: `lic_${randomUUID().replace(/-/g, '').slice(0, 20)}`,
  licensee,
  email,
  plan,
  features,
  seats: seats ?? null,
  nodes: nodes ?? null,
  issuedAt,
  expiresAt,
};

const keyPath =
  (typeof args.key === 'string' && args.key) ||
  process.env.PUENTE_LICENSE_SIGNING_KEY ||
  join(homedir(), '.puente-licensing', 'signing-key.pem');

let privateKey;
try {
  privateKey = createPrivateKey(readFileSync(keyPath, 'utf8'));
} catch (err) {
  fail(`cannot read the signing key at ${keyPath} — ${err.message}`);
}

const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
const signature = sign(null, Buffer.from(encodedPayload, 'utf8'), privateKey).toString('base64url');
const key = `puente-lic-v1.${encodedPayload}.${signature}`;

if (args.json) {
  console.log(JSON.stringify({ ...payload, key }, null, 2));
} else {
  console.log(key);
}
