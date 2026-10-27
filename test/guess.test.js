const test = require('node:test')
const assert = require('node:assert')

const guessEditor = require('../packages/launch-editor/guess')

function withEnv (key, value, fn) {
  const previous = process.env[key]
  if (value === undefined) {
    delete process.env[key]
  } else {
    process.env[key] = value
  }
  try {
    return fn()
  } finally {
    if (previous === undefined) {
      delete process.env[key]
    } else {
      process.env[key] = previous
    }
  }
}

test('an explicit editor wins over everything else', () => {
  withEnv('LAUNCH_EDITOR', 'from-env', () => {
    assert.deepStrictEqual(guessEditor('code'), ['code'])
  })
})

test('an explicit editor is parsed as a shell command line', () => {
  assert.deepStrictEqual(guessEditor('code --wait'), ['code', '--wait'])
  assert.deepStrictEqual(
    guessEditor("'/path with space/code' --wait"),
    ['/path with space/code', '--wait']
  )
})

test('LAUNCH_EDITOR is taken verbatim, not shell-parsed', () => {
  withEnv('LAUNCH_EDITOR', '/path with space/code', () => {
    assert.deepStrictEqual(guessEditor(), ['/path with space/code'])
  })
})

test('the common editor tables are keyed by process name', () => {
  const macos = require('../packages/launch-editor/editor-info/macos')
  const linux = require('../packages/launch-editor/editor-info/linux')
  const windows = require('../packages/launch-editor/editor-info/windows')

  assert.ok(Object.keys(macos).length > 0)
  assert.ok(Object.keys(linux).length > 0)
  assert.ok(Object.keys(windows).length > 0)
  assert.ok(Object.values(linux).includes('code'))
})
