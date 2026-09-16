import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Opt-in browser test: the real App and Firebase wrapper run against a simulated
// provider. No Google account, network credentials, or existing browser data is used.
const browserPath = process.env.AUTH_TEST_BROWSER;
const fakeProvider = `
  const state = { currentUser: null };
  const listeners = new Set();
  const scenario = window.__authScenario;
  const error = code => Object.assign(new Error('Firebase: Error (' + code + ').'), { code });
  const controls = window.__authControls = {};
  export const getAuth = () => state;
  export class GoogleAuthProvider {
    addScope() {}
    setCustomParameters() {}
    static credentialFromResult() { return { accessToken: 'test-token' }; }
  }
  export function onAuthStateChanged(auth, next) {
    listeners.add(next);
    queueMicrotask(() => { if (listeners.has(next)) next(auth.currentUser); });
    return () => listeners.delete(next);
  }
  export async function getRedirectResult() {
    if (scenario.redirectError) throw error(scenario.redirectError);
    return null;
  }
  export function signInWithPopup() {
    return new Promise((resolve, reject) => {
      controls.rejectPopup = code => reject(error(code));
      controls.resolvePopup = () => {
        state.currentUser = { uid: 'test-uid', email: 'browser-test@example.test', displayName: 'Browser Test' };
        listeners.forEach(next => next(state.currentUser));
        resolve({ user: state.currentUser });
      };
    });
  }
  export async function signInWithRedirect() { throw error('auth/operation-not-supported-in-this-environment'); }
  export async function signOut() {
    state.currentUser = null;
    listeners.forEach(next => next(null));
  }
`;

test('login UI exposes popup/redirect errors and profile failures, and supports retry', {
  skip: !browserPath || !existsSync(browserPath), timeout: 60000,
}, async () => {
  const output = await build({
    entryPoints: ['src/main.tsx'], bundle: true, write: false, format: 'iife', jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"test"' }, loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'simulated-auth', setup(build) {
      build.onResolve({ filter: /^firebase\/(auth|app)$/ }, args => ({ path: args.path, namespace: 'simulated-auth' }));
      build.onLoad({ filter: /.*/, namespace: 'simulated-auth' }, args => ({
        contents: args.path === 'firebase/app' ? 'export const initializeApp = () => ({});' : fakeProvider,
        loader: 'js',
      }));
    } }],
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
    const navigate = async (scenario: object = {}) => {
      const marker = String(Math.random());
      await send('Page.navigate', { url: `http://127.0.0.1:${port}/?scenario=${encodeURIComponent(JSON.stringify({ ...scenario, marker }))}` }, sessionId);
      await waitFor(`window.__authScenario?.marker === ${JSON.stringify(marker)} && !!document.querySelector('button[aria-busy]')`);
    };
    const clickSignIn = () => evaluate('document.querySelector("button[aria-busy]").click()');
    const body = () => evaluate('document.body.innerText');

    await navigate();
    await clickSignIn();
    await waitFor('document.querySelector("button[aria-busy]").disabled');
    assert.match(await body(), /Connexion en cours/);
    await evaluate('window.__authControls.rejectPopup("auth/unauthorized-domain")');
    await waitFor('!!document.querySelector("[role=alert]")');
    assert.match(await body(), /Connexion Google impossible/);
    assert.match(await body(), /auth\/unauthorized-domain/);
    assert.equal(await evaluate('document.querySelector("button[aria-busy]").disabled'), false);

    await clickSignIn();
    await waitFor('!document.querySelector("[role=alert]")');
    await evaluate('window.__authControls.rejectPopup("auth/popup-closed-by-user")');
    await waitFor('document.body.innerText.includes("auth/popup-closed-by-user")');
    assert.deepEqual(await evaluate('window.__unhandled'), []);

    await clickSignIn();
    await evaluate('window.__authControls.rejectPopup("auth/popup-blocked")');
    await waitFor('document.body.innerText.includes("auth/operation-not-supported-in-this-environment")');
    assert.deepEqual(await evaluate('window.__unhandled'), []);

    await navigate({ redirectError: 'auth/network-request-failed' });
    await waitFor('document.body.innerText.includes("auth/network-request-failed")');
    assert.deepEqual(await evaluate('window.__unhandled'), []);

    await navigate({ blockLocalStorage: true, blockSessionStorage: true });
    await clickSignIn();
    await evaluate('window.__authControls.resolvePopup()');
    await waitFor('document.body.innerText.includes("Impossible de charger votre profil local")');
    assert.match(await body(), /SecurityError.*Local storage access denied/);
    assert.doesNotMatch(await body(), /Connexion Google impossible/);
    assert.deepEqual(await evaluate('window.__unhandled'), []);
    await evaluate(`window.__authScenario.blockLocalStorage = false;
      [...document.querySelectorAll('button')].find(button => button.textContent.includes('Réessayer')).click()`);
    await waitFor('document.body.innerText.includes("Espace Candidat")');
    assert.equal(await evaluate('!!document.querySelector("[role=alert]")'), false);

    await navigate({ blockLocalStorage: true, blockSessionStorage: true });
    await clickSignIn();
    await evaluate('window.__authControls.resolvePopup()');
    await waitFor('document.body.innerText.includes("Impossible de charger votre profil local")');
    await evaluate(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('Se déconnecter')).click()`);
    await waitFor('!!document.querySelector("button[aria-busy]")');
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
