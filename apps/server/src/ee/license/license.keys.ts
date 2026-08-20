/**
 * Public half of the Ed25519 key that signs license keys. The private half never leaves the
 * maintainer's machine (`~/.puente-licensing/signing-key.pem`).
 *
 * Verification is entirely local: puente never contacts a license server, at any edition. That
 * is a feature, not an oversight — this software runs on air-gapped and locked-down networks.
 */
export const LICENSE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAF9Dn8d2f+1Hegp4EF7G+kkcv8trEgKFdfaYWlFKYKDQ=
-----END PUBLIC KEY-----
`;
