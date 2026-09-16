import assert from 'node:assert/strict';
import { test } from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeAuthError } from '../src/lib/authErrors';
import { AuthErrorNotice } from '../src/components/AuthErrorNotice';

test('authentication error notice includes the exact code and provider message', () => {
  const message = describeAuthError({ code: 'auth/unauthorized-domain', message: 'This domain is not authorized.', customData: { token: 'must-not-be-displayed' } });
  const markup = renderToStaticMarkup(React.createElement(AuthErrorNotice, { title: 'Connexion Google impossible', message }));
  assert.match(markup, /role="alert"/);
  assert.match(markup, /auth\/unauthorized-domain/);
  assert.match(markup, /This domain is not authorized\./);
  assert.doesNotMatch(markup, /must-not-be-displayed/);
  assert.match(markup, /console\.firebase\.google\.com\/project\/gen-lang-client-0443495057\/authentication\/settings/);
  assert.match(markup, /Domaines autorisés/);
});

test('unauthorized domain guidance uses the preview hostname, not the editor address', () => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { hostname: 'preview.example.test' } } });
  try {
    const markup = renderToStaticMarkup(React.createElement(AuthErrorNotice, { title: 'Error', message: 'auth/unauthorized-domain' }));
    assert.match(markup, /preview\.example\.test/);
    const other = renderToStaticMarkup(React.createElement(AuthErrorNotice, { title: 'Error', message: 'auth/network-request-failed' }));
    assert.doesNotMatch(other, /Domaines autorisés/);
  } finally {
    if (previous) Object.defineProperty(globalThis, 'window', previous);
    else Reflect.deleteProperty(globalThis, 'window');
  }
});

test('existing Firebase messages do not repeat the code', () => {
  const message = 'Firebase: Error (auth/popup-closed-by-user).';
  assert.equal(describeAuthError({ code: 'auth/popup-closed-by-user', message }), message);
});

test('profile storage failures retain their original error name and message', () => {
  const error = new DOMException('Access to localStorage is denied.', 'SecurityError');
  assert.equal(describeAuthError(error), 'SecurityError : Access to localStorage is denied.');
});

test('plain, code-only and unknown errors have readable fallbacks', () => {
  assert.equal(describeAuthError('Connection failed'), 'Connection failed');
  assert.equal(describeAuthError({ code: 'auth/network-request-failed' }), 'auth/network-request-failed');
  assert.match(describeAuthError(undefined), /Veuillez réessayer/);
});

test('provider messages are rendered as text, never executable HTML', () => {
  const markup = renderToStaticMarkup(React.createElement(AuthErrorNotice, { title: 'Error', message: '<script>alert(1)</script>' }));
  assert.doesNotMatch(markup, /<script>/);
  assert.match(markup, /&lt;script&gt;/);
});
