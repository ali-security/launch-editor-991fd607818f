const test = require('node:test')
const assert = require('node:assert')

const getArgumentsForPosition = require('../packages/launch-editor/get-args')

test('positional editors get file:line:column', () => {
  for (const editor of ['atom', 'subl', 'sublime_text', 'wstorm', 'charm', 'zed']) {
    assert.deepStrictEqual(
      getArgumentsForPosition(editor, '/tmp/foo.js', 12, 5),
      ['/tmp/foo.js:12:5']
    )
  }
})

test('vscode family gets -r -g file:line:column', () => {
  for (const editor of ['code', 'code-insiders', 'codium', 'cursor', 'vscodium']) {
    assert.deepStrictEqual(
      getArgumentsForPosition(editor, '/tmp/foo.js', 12, 5),
      ['-r', '-g', '/tmp/foo.js:12:5']
    )
  }
})

test('jetbrains family gets --line/--column', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('webstorm64', '/tmp/foo.js', 12, 5),
    ['--line', 12, '--column', 5, '/tmp/foo.js']
  )
})

test('vim gets a cursor command', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('vim', '/tmp/foo.js', 12, 5),
    ['+call cursor(12, 5)', '/tmp/foo.js']
  )
})

test('gvim and joe get +line', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('joe', '/tmp/foo.js', 12, 5),
    ['+12', '/tmp/foo.js']
  )
  assert.deepStrictEqual(
    getArgumentsForPosition('gvim', '/tmp/foo.js', 12, 5),
    ['+12', '/tmp/foo.js']
  )
})

test('emacs gets +line:column', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('emacsclient', '/tmp/foo.js', 12, 5),
    ['+12:5', '/tmp/foo.js']
  )
})

test('notepad++ gets -n/-c flags', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('notepad++', 'C:\\foo.js', 12, 5),
    ['-n12', '-c5', 'C:\\foo.js']
  )
})

test('mate family gets --line', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('rmate', '/tmp/foo.js', 12, 5),
    ['--line', 12, '/tmp/foo.js']
  )
})

test('the column number defaults to 1', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('code', '/tmp/foo.js', 12),
    ['-r', '-g', '/tmp/foo.js:12:1']
  )
})

// `path.basename` only splits on the separators of the host platform, so the
// path form here stays POSIX; the suffix stripping is checked on a bare name.
test('a full path is reduced to its basename, executable suffix stripped', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('/usr/local/bin/code', '/tmp/foo.js', 12, 5),
    ['-r', '-g', '/tmp/foo.js:12:5']
  )
  assert.deepStrictEqual(
    getArgumentsForPosition('Code.exe', 'C:\\foo.js', 12, 5),
    ['-r', '-g', 'C:\\foo.js:12:5']
  )
  assert.deepStrictEqual(
    getArgumentsForPosition('code.CMD', 'C:\\foo.js', 12, 5),
    ['-r', '-g', 'C:\\foo.js:12:5']
  )
})

test('an unknown editor only gets the file name', () => {
  assert.deepStrictEqual(
    getArgumentsForPosition('my-editor', '/tmp/foo.js', 12, 5),
    ['/tmp/foo.js']
  )
})

test('LAUNCH_EDITOR passes the position as separate arguments', () => {
  const previous = process.env.LAUNCH_EDITOR
  process.env.LAUNCH_EDITOR = 'my-editor'
  try {
    assert.deepStrictEqual(
      getArgumentsForPosition('my-editor', '/tmp/foo.js', 12, 5),
      ['/tmp/foo.js', 12, 5]
    )
  } finally {
    if (previous === undefined) {
      delete process.env.LAUNCH_EDITOR
    } else {
      process.env.LAUNCH_EDITOR = previous
    }
  }
})
