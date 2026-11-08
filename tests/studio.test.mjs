import { _electron as electron } from 'playwright';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';

const temp = mkdtempSync(join(tmpdir(), 'hub-ag-ui-'));
const projDir = join(temp, 'MyDemoProject');
mkdirSync(join(projDir, 'src'), { recursive: true });
writeFileSync(join(projDir, 'src', 'hello.ts'), 'export const greeting = "Hello Antigravity";\nexport const version = 1;\n', 'utf8');
writeFileSync(join(projDir, 'README.md'), '# MyDemoProject\nAntigravity + ChatGPT workspace.\n', 'utf8');

const env = {
  ...process.env,
  AI_HUB_PORT: '3226',
  AI_HUB_DATA_DIR: join(temp, 'data'),
  AI_HUB_PROFILE_DIR: join(temp, 'profile'),
  AI_HUB_TEST_IMPORT: pathToFileURL(resolve('tests/mock-accounts.mjs')).href,
};
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({
  executablePath: resolve('win-app/AI Hub.exe'),
  env,
  timeout: 60000,
});
const pid = app.process().pid;

try {
  const p = await app.firstWindow();
  const errors = [];
  p.on('pageerror', e => errors.push(e.message));
  await p.getByRole('heading', { name: 'Один чат. Ваши модели.' }).waitFor({ timeout: 60000 });
  await p.locator('.model-trigger').filter({ hasText: 'gpt-6-astra' }).waitFor({ timeout: 30000 });
  await p.screenshot({ path: 'desktop-validation/antigravity-welcome.png' });

  // 1. Verify /api/projects persistence & /api/workspace path-traversal + secret-file block + proxy CSRF/DNS-rebinding protection
  assert.equal(await p.getByRole('navigation').locator('button').count(), 3);
  assert.equal(await p.evaluate(() => document.documentElement.dataset.glass), 'on');

  const saved = await p.evaluate(async (dir) => {
    const r = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: dir }),
    });
    return { status: r.status, body: await r.json() };
  }, projDir);
  assert.equal(saved.status, 200);
  assert.equal(saved.body.project.name, 'MyDemoProject');

  const traversal = await p.evaluate(async (dir) => {
    const r = await fetch(`/api/workspace?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent('../outside.txt')}`);
    return { status: r.status, body: await r.json() };
  }, projDir);
  assert.equal(traversal.status, 400);
  assert.match(traversal.body.error, /пределы папки/);

  writeFileSync(join(projDir, '.env'), 'SECRET_KEY=12345\n', 'utf8');
  const secretBlock = await p.evaluate(async (dir) => {
    const r = await fetch(`/api/workspace?dir=${encodeURIComponent(dir)}&file=${encodeURIComponent('.env')}`);
    return { status: r.status, body: await r.json() };
  }, projDir);
  assert.equal(secretBlock.status, 400);
  assert.match(secretBlock.body.error, /скрыт из проводника/);

  const csrfBlock = await p.request.post('http://127.0.0.1:3226/api/chats', {
    headers: { Origin: 'http://127.0.0.1:9999' },
    data: { title: 'Cross-port CSRF attempt' },
  });
  assert.equal(csrfBlock.status(), 403);

  const rebindBlock = await p.request.get('http://127.0.0.1:3226/api/auth', {
    headers: { Host: 'evil.rebind.example:3226' },
  });
  assert.equal(rebindBlock.status(), 421);

  // 2. Refresh UI to show saved project in Left Rail, click it to activate Agent + AuxPane
  await p.getByRole('button', { name: 'Обновить модели' }).click();
  await p.locator('.ag-project-row').filter({ hasText: 'MyDemoProject' }).waitFor();
  await p.locator('.ag-project-row button').first().click();

  if (!(await p.locator('.ag-aux-pane').isVisible())) {
    await p.getByRole('button', { name: 'Панель проекта' }).click();
  }
  await p.locator('.ag-aux-pane').waitFor();
  await p.locator('.ag-tree-item').filter({ hasText: 'README.md' }).waitFor();

  // Open src -> hello.ts in Explorer and inspect inline code viewer
  await p.locator('.ag-tree-item').filter({ hasText: 'src' }).click();
  await p.locator('.ag-tree-item').filter({ hasText: 'hello.ts' }).waitFor();
  await p.locator('.ag-tree-item').filter({ hasText: 'hello.ts' }).click();
  await p.locator('.ag-code-box').waitFor();
  assert.match(await p.locator('.ag-code-box').innerText(), /Hello Antigravity/);

  // 3. Test Slash Command popup
  const box = p.getByRole('textbox', { name: 'Сообщение', exact: true });
  await box.fill('/');
  await p.getByRole('listbox', { name: 'Быстрые команды' }).waitFor();
  assert.ok((await p.locator('.ag-popup-menu button').count()) >= 5);

  // 4. Test @ file mention autocomplete
  await box.fill('Проверь @hello');
  await p.getByRole('listbox', { name: 'Упоминание контекста' }).waitFor({ timeout: 10000 });
  await p.locator('.ag-popup-menu button').filter({ hasText: '@src/hello.ts' }).click();
  assert.match(await box.inputValue(), /@src\/hello\.ts/);

  // 5. Trigger Agent work approval with visual diff preview
  await p.getByRole('button', { name: 'Gemini Подключён', exact: true }).click();
  await box.fill('Mobile work test');
  await p.getByRole('button', { name: 'Отправить', exact: true }).click();
  const card = p.getByRole('region', { name: 'Разрешение действия' });
  await card.waitFor();
  await card.locator('.diff-preview').waitFor();
  assert.match(await card.locator('.diff-stats').innerText(), /\+1/);

  // Capture desktop screenshot of 3-pane Antigravity Studio with live Diff Approval + Code Viewer
  await p.screenshot({ path: 'desktop-validation/antigravity-studio.png' });

  // Approve action, verify StepCard + Changes tab in AuxPane
  await p.getByRole('button', { name: 'Разрешить один раз', exact: true }).click();
  await p.getByRole('button', { name: 'Отправить', exact: true }).waitFor();
  await p.locator('.ag-step-card').waitFor();
  await p.locator('.ag-aux-tabs button').filter({ hasText: 'Изменения' }).click();
  await p.locator('.ag-change-item').filter({ hasText: 'mobile-work.txt' }).waitFor();

  assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  assert.deepEqual(errors, []);
  console.log('PASS: Antigravity Studio 3-pane workspace, Explorer, @-mentions, /commands, visual Diff approval, StepCard, Changes tracker, and path-traversal block.');
} finally {
  await Promise.race([app.close(), new Promise(r => setTimeout(r, 10000))]).catch(() => {});
  if (pid) spawn('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  try { rmSync(temp, { recursive: true, force: true }); } catch {}
}
