import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const browserPath = process.env.AUTH_TEST_BROWSER;
test('campaign launch shows save errors and retries without attachments, importing roles', {
  skip: !browserPath || !existsSync(browserPath), timeout: 60000,
}, async () => {
  const output = await build({
    stdin: { contents: `
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      import { CreateCampaignModal } from './src/components/campaigns/CreateCampaignModal';
      import { CampaignInitializationService as Service } from './src/services/campaignInitializationService';
      Service.prepareCampaignPreview = async year => ({
        year, totalCandidatesParsed: 1,
        candidatesToProcess: [{ idProfil: 'candidate', nom: 'Candidate', prenom: 'Test', displayName: 'Test Candidate', email: 'candidate@example.test', grade: 'Senior', currentSalary: 50000, currentTJM: 650, action: 'CREATE' }],
        evaluatorsToProcess: [{ idProfil: 'jury', nom: 'Jury', prenom: 'Test', displayName: 'Test Jury', email: 'jury@example.test', isCandidate: false, assignedCandidateIds: ['candidate'] }],
        assignmentsByCandidate: { candidate: ['jury'] }, warnings: [], blockingErrors: [], canProceed: true,
        newPersonnesCount: 2, existingPersonnesCount: 0, participantsToCreateCount: 2, participantsToUpdateCount: 0,
        evaluatorsCount: 1, newEvaluatorsOnlyCount: 1, newUsersCount: 2, totalPrimesParsed: 1, activePrimesCount: 1, expiredPrimesCount: 0
      });
      const save = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === 'app_local_database_v2' && value.includes('data:')) throw new DOMException('Quota exceeded', 'QuotaExceededError');
        return save.call(this, key, value);
      };
      window.__toasts = [];
      createRoot(document.getElementById('root')).render(<CreateCampaignModal isOpen={true} existingYears={[]} onClose={() => window.__closed = true} onShowToast={(type, message) => window.__toasts.push({type, message})} />);
    `, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, logLevel: 'silent',
  });
  const script = output.outputFiles[0].text;
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    if (request.url === '/app.js') {
      response.setHeader('Content-Type', 'text/javascript');
      response.end(script);
      return;
    }
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(`<!doctype html><div id="root"></div><script>
      window.__authScenario = JSON.parse(new URL(location.href).searchParams.get('scenario') || '{}');
      window.__unhandled = [];
      addEventListener('unhandledrejection', event => window.__unhandled.push(String(event.reason)));
      const storage = window.localStorage;
      storage.clear();
      Object.defineProperty(window, 'localStorage', { get() {
        if (window.__authScenario.blockLocalStorage) throw new DOMException('Local storage access denied', 'SecurityError');
        return storage;
      }});
      if (window.__authScenario.blockSessionStorage) Object.defineProperty(window, 'sessionStorage', { get() {
        throw new DOMException('Session storage access denied', 'SecurityError');
      }});
    </script><script src="/app.js"></script>`);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const port = (server.address() as { port: number }).port;
  const profile = mkdtempSync(join(tmpdir(), 'jury-auth-browser-'));
  const browser = spawn(browserPath!, ['--headless', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true });
  let socket: WebSocket | undefined;
  try {
    const debuggerUrl = await new Promise<string>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Browser debugger did not start.')), 10000);
      browser.once('error', error => { clearTimeout(timeout); reject(error); });
      browser.stderr.on('data', chunk => {
        const match = chunk.toString().match(/DevTools listening on (ws:\/\/\S+)/);
        if (match) { clearTimeout(timeout); resolve(match[1]); }
      });
    });
    socket = new WebSocket(debuggerUrl);
    await new Promise<void>((resolve, reject) => {
      socket!.addEventListener('open', () => resolve(), { once: true });
      socket!.addEventListener('error', () => reject(new Error('Debugger connection failed.')), { once: true });
    });
    let counter = 0;
    const pending = new Map<number, { resolve: (value: any) => void; reject: (error: Error) => void }>();
    socket.addEventListener('message', event => {
      const message = JSON.parse(String(event.data));
      const waiting = pending.get(message.id);
      if (!waiting) return;
      pending.delete(message.id);
      if (message.error) waiting.reject(new Error(message.error.message)); else waiting.resolve(message.result);
    });
    const send = (method: string, params = {}, sessionId?: string) => new Promise<any>((resolve, reject) => {
      const id = ++counter;
      pending.set(id, { resolve, reject });
      socket!.send(JSON.stringify({ id, method, params, sessionId }));
    });
    const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
    const evaluate = async (expression: string) => {
      const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, sessionId);
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result.value;
    };
    const waitFor = async (expression: string) => {
      for (let i = 0; i < 50; i++) {
        if (await evaluate(expression)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      throw new Error(`Condition not met: ${expression}\n${await evaluate('document.body.innerText')}`);
    };
    await send('Page.navigate', { url: `http://127.0.0.1:${port}/` }, sessionId);
    await waitFor('document.querySelectorAll("input[type=file]").length >= 3');
    await evaluate(`const transfer = new DataTransfer(); transfer.items.add(new File(['test'], 'Analyse_Jury.xlsx'));
      const input = document.querySelectorAll('input[type=file]')[2]; input.files = transfer.files; input.dispatchEvent(new Event('change', {bubbles:true}));`);
    await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.includes('Analyser')).click()`);
    await waitFor('!!document.querySelector("button[aria-busy]")');
    await evaluate('document.querySelector("button[aria-busy]").click()');
    await waitFor('!!document.querySelector("[role=alert]")');
    assert.match(await evaluate('document.querySelector("[role=alert]").textContent'), /Enregistrement local impossible/);
    assert.equal(await evaluate('!!window.__closed'), false);
    assert.equal(await evaluate('document.querySelector("button[aria-busy]").disabled'), false);
    assert.equal(await evaluate('window.__toasts.some(t => t.type === "success")'), false);
    await evaluate('document.querySelector("input[type=checkbox]").click()');
    await evaluate('document.querySelector("button[aria-busy]").click()');
    await waitFor('!!window.__closed');
    const saved = await evaluate('JSON.parse(localStorage.getItem("app_local_database_v2"))');
    assert.deepEqual(saved.users.find(u => u.id === 'candidate').roles, ['CANDIDATE']);
    assert.deepEqual(saved.users.find(u => u.id === 'jury').roles, ['JURY']);
    assert.deepEqual(saved.dossiers.find(d => d.candidateId === 'candidate').assignedConsultantIds, ['jury']);
    assert.deepEqual(saved.campaigns.find(c => c.id === saved.dossiers.find(d => d.candidateId === 'candidate').campaignId).rhDocuments, []);
    assert.ok(saved.users.find(u => u.email === 'adam.nassir@logiclever.com').roles.includes('ADMIN'));
    assert.ok(saved.users.find(u => u.email === 'guillaume.best@logiclever.com').roles.includes('ADMIN'));
    assert.deepEqual(await evaluate('window.__unhandled'), []);
    await send('Browser.close');
  } finally {
    socket?.close();
    if (browser.exitCode === null) {
      const exited = once(browser, 'exit');
      browser.kill();
      await exited;
    }
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
    // This is the fresh temporary browser profile created by mkdtempSync above.
    rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
});

