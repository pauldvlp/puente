import { expect, test, type Locator, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// Client workspaces: several Cloudflare accounts side by side. The assertion that matters is
// isolation — one client's node must never appear under another client's name — because that is
// the promise an agency is buying, and the failure mode is showing someone else's infrastructure.

const USER = 'admin';
const PASS = 'e2e-password-123';

const SIGNING_KEY =
  process.env.PUENTE_LICENSE_SIGNING_KEY ?? join(homedir(), '.puente-licensing', 'signing-key.pem');
const CAN_ISSUE = existsSync(SIGNING_KEY);
const ISSUER = resolve(process.cwd(), 'scripts/license/issue.mjs');

async function openSettings(page: Page): Promise<Locator> {
  await page.goto('/login');
  await page.fill('#username', USER);
  await page.fill('#password', PASS);
  if (await page.locator('#confirm').count()) await page.fill('#confirm', PASS);
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/127\.0\.0\.1:\d+\/$/);
  await page.locator('a[href="/settings"]').first().click();
  const main = page.getByRole('main');
  await expect(main.getByRole('heading', { name: 'Settings' })).toBeVisible();
  return main;
}

const workspacesCard = (main: Locator) =>
  main.locator('[data-slot="card"]').filter({ hasText: 'Workspaces' });

/** The sidebar switcher. `getByLabel` would also match the "New workspace" field. */
const switcher = (page: Page) => page.getByRole('combobox', { name: 'Workspace' });

const licenceCard = (main: Locator) =>
  main
    .locator('[data-slot="card"]')
    .filter({ hasText: /License/ })
    .first();

/** Idempotent: these specs share one database, so the licence may already be activated. */
async function activateAgency(main: Locator): Promise<void> {
  const agencyBadge = main.locator('[data-slot="badge"]').filter({ hasText: 'puente Agency' });
  if (await agencyBadge.count()) return;

  // A licence from another spec (Pro, say) has to go before an Agency one can be pasted.
  const remove = licenceCard(main).getByRole('button', { name: 'Remove' });
  if (await remove.count()) await remove.first().click();
  await expect(main.locator('#license-key')).toBeVisible();

  const key = execFileSync(
    process.execPath,
    [
      ISSUER,
      '--licensee',
      'Workspaces E2E',
      '--email',
      'e2e@example.com',
      '--plan',
      'agency',
      '--key',
      SIGNING_KEY,
    ],
    { encoding: 'utf8' },
  ).trim();
  await main.locator('#license-key').fill(key);
  await main.getByRole('button', { name: 'Activate' }).click();
  await expect(
    main.locator('[data-slot="badge"]').filter({ hasText: 'puente Agency' }),
  ).toBeVisible();
}

/** Talks to the API as the panel would, including the workspace header. */
async function apiFetch(
  page: Page,
  path: string,
  init: { method?: string; body?: unknown; workspace?: string } = {},
): Promise<{ status: number; json: unknown }> {
  return page.evaluate(
    async ({ path, init }) => {
      const headers: Record<string, string> = {
        Authorization: `Bearer ${localStorage.getItem('puente_token') ?? ''}`,
      };
      if (init.body !== undefined) headers['Content-Type'] = 'application/json';
      if (init.workspace) headers['x-puente-workspace'] = init.workspace;
      const res = await fetch(`/api${path}`, {
        method: init.method ?? 'GET',
        headers,
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const text = await res.text();
      return { status: res.status, json: text ? (JSON.parse(text) as unknown) : null };
    },
    { path, init },
  );
}

/**
 * These specs share one database and one panel, so each Pro test starts by putting the install
 * back to a single workspace instead of trusting whatever the previous one left behind.
 */
async function resetToSingleWorkspace(page: Page): Promise<void> {
  const list = await apiFetch(page, '/workspaces');
  const extras = (list.json as { id: string; isDefault: boolean }[]).filter((w) => !w.isDefault);
  for (const ws of extras) {
    const nodes = await apiFetch(page, '/nodes', { workspace: ws.id });
    for (const node of nodes.json as { id: string }[]) {
      await apiFetch(page, `/nodes/${node.id}`, { method: 'DELETE', workspace: ws.id });
    }
    await apiFetch(page, `/workspaces/${ws.id}`, { method: 'DELETE' });
  }
  await page.evaluate(() => localStorage.removeItem('puente_workspace'));
}

test('Community has a workspace, can name it, and is told what more would cost', async ({
  page,
}) => {
  const main = await openSettings(page);
  const card = workspacesCard(main);

  await expect(card.getByText('1 account')).toBeVisible();
  await expect(card.getByText(/Managing several Cloudflare accounts side by side/)).toBeVisible();
  // Nothing to tease: no creation field on Community.
  await expect(card.locator('#workspace-name')).toHaveCount(0);
  // Renaming is free, so the control is there.
  await expect(card.getByRole('button', { name: /^Rename/ })).toBeVisible();
  // A single-workspace install gets no switcher cluttering the sidebar.
  await expect(switcher(page)).toHaveCount(0);
});

test('the server refuses to create a second workspace without a licence', async ({ page }) => {
  await openSettings(page);
  // The real lock is server-side; the missing button is only the polite version of it.
  const res = await apiFetch(page, '/workspaces', {
    method: 'POST',
    body: { name: 'Sneaky Ltd' },
  });
  expect(res.status).toBe(403);
  expect(res.json).toMatchObject({ code: 'PRO_REQUIRED', feature: 'workspaces' });
});

test.describe('with workspaces unlocked', () => {
  test.skip(!CAN_ISSUE, `no signing key at ${SIGNING_KEY} — maintainer-only path`);

  test("a client's node never shows up under another client", async ({ page }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetToSingleWorkspace(page);

    // A node in the default workspace, created the way the panel does it.
    const created = await apiFetch(page, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'default-ws-node' },
    });
    expect(created.status).toBe(201);
    const nodeId = (created.json as { id: string }).id;

    const card = workspacesCard(main);
    await card.locator('#workspace-name').fill('Acme GmbH');
    await card.getByRole('button', { name: 'Add workspace' }).click();
    await expect(card.getByText('Acme GmbH')).toBeVisible();
    await expect(card.getByText('2 accounts')).toBeVisible();

    const acmeId = await page.evaluate(async () => {
      const res = await fetch('/api/workspaces', {
        headers: { Authorization: `Bearer ${localStorage.getItem('puente_token') ?? ''}` },
      });
      const list = (await res.json()) as { id: string; name: string }[];
      return list.find((w) => w.name === 'Acme GmbH')!.id;
    });

    // The isolation assertion, straight at the API: same request, different workspace.
    const inAcme = await apiFetch(page, '/nodes', { workspace: acmeId });
    expect(inAcme.json).toEqual([]);

    const inDefault = await apiFetch(page, '/nodes');
    expect((inDefault.json as { id: string }[]).map((n) => n.id)).toContain(nodeId);

    // And through the panel: switching hides it, switching back brings it home.
    await switcher(page).click();
    await page.getByRole('option', { name: 'Acme GmbH' }).click();
    await page.locator('a[href="/nodes"]').first().click();
    await expect(page.getByText('default-ws-node')).toHaveCount(0);

    await switcher(page).click();
    await page
      .getByRole('option', { name: /Default|Northwind/ })
      .first()
      .click();
    await expect(page.getByText('default-ws-node')).toBeVisible();

    // Clean up: the node first, because a workspace holding infrastructure cannot be deleted.
    await apiFetch(page, `/nodes/${nodeId}`, { method: 'DELETE' });
    await apiFetch(page, `/workspaces/${acmeId}`, { method: 'DELETE' });
  });

  test('deleting a workspace that still holds infrastructure is refused, with the count', async ({
    page,
  }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetToSingleWorkspace(page);

    const ws = await apiFetch(page, '/workspaces', { method: 'POST', body: { name: 'Beta Ltd' } });
    const betaId = (ws.json as { id: string }).id;

    const node = await apiFetch(page, '/nodes', {
      method: 'POST',
      body: { kind: 'local', name: 'beta-node' },
      workspace: betaId,
    });
    expect(node.status).toBe(201);

    const refused = await apiFetch(page, `/workspaces/${betaId}`, { method: 'DELETE' });
    expect(refused.status).toBe(400);
    expect(refused.json).toMatchObject({ code: 'WORKSPACE_NOT_EMPTY' });
    expect(String((refused.json as { message: string }).message)).toContain('1 node');

    // Empty it, and then it goes.
    await apiFetch(page, `/nodes/${(node.json as { id: string }).id}`, {
      method: 'DELETE',
      workspace: betaId,
    });
    const gone = await apiFetch(page, `/workspaces/${betaId}`, { method: 'DELETE' });
    expect(gone.status).toBe(200);
  });

  test('the last workspace can never be deleted', async ({ page }) => {
    const main = await openSettings(page);
    await activateAgency(main);
    await resetToSingleWorkspace(page);

    const list = await apiFetch(page, '/workspaces');
    const only = (list.json as { id: string }[])[0];
    expect((list.json as unknown[]).length).toBe(1);

    const res = await apiFetch(page, `/workspaces/${only.id}`, { method: 'DELETE' });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ code: 'WORKSPACE_LAST_ONE' });

    // Leave Community behind for whatever runs next.
    await licenceCard(main).getByRole('button', { name: 'Remove' }).first().click();
  });
});
