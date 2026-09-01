import test from 'node:test';
import assert from 'node:assert/strict';
import { parseGitHubRepository } from './analyzer.mjs';

test('accepts a canonical public GitHub URL', () => {
  assert.deepEqual(parseGitHubRepository('https://github.com/openai/openai-node'), {
    owner: 'openai',
    repo: 'openai-node',
    url: 'https://github.com/openai/openai-node',
  });
});

test('normalizes shorthand and .git suffix', () => {
  assert.equal(parseGitHubRepository('github.com/openai/openai-node.git').url, 'https://github.com/openai/openai-node');
});

for (const value of [
  'http://github.com/openai/openai-node',
  'https://example.com/openai/openai-node',
  'https://github.com/openai/openai-node/issues',
  'https://github.com/openai/openai-node?token=secret',
  'https://user:secret@github.com/openai/openai-node',
]) {
  test(`rejects unsafe or unsupported URL: ${value}`, () => {
    assert.throws(() => parseGitHubRepository(value));
  });
}
