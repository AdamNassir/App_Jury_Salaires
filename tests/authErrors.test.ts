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
