const test = require('node:test')
const assert = require('node:assert')
const fs = require('node:fs')
const path = require('node:path')

const launchEditor = require('../packages/launch-editor')
const { makeSandbox, makeFakeEditor, sleep, waitForFile } = require('./helpers')

// End-to-end: `launchEditor` really spawns the editor, so the fake editor below
// records the argv it was handed and the assertions read it back.
test('it spawns the editor with the file name', async () => {
  const dir = makeSandbox()
  const demo = path.join(dir, 'demo.js')
  const out = path.join(dir, 'argv-plain.txt')
  fs.writeFileSync(demo, 'module.exports = 1\n')
  const editor = makeFakeEditor(dir, 'my-editor', out)

  launchEditor(demo, editor)

  const argv = await waitForFile(out)
  assert.ok(argv.includes(demo), argv)
})

test('it maps the position onto the editor arguments', async () => {
  const dir = makeSandbox()
  const demo = path.join(dir, 'demo.js')
  const out = path.join(dir, 'argv-position.txt')
  fs.writeFileSync(demo, 'module.exports = 1\n')
  // `code` is one of the editors `get-args` knows how to pass a position to.
  const editor = makeFakeEditor(dir, 'code', out)

  launchEditor(`${demo}:12:5`, editor)

  const argv = await waitForFile(out)
  assert.ok(argv.includes('-r'), argv)
  assert.ok(argv.includes('-g'), argv)
  assert.ok(argv.includes(`${demo}:12:5`), argv)
})

test('it accepts a file:// url', async () => {
  const dir = makeSandbox()
  const demo = path.join(dir, 'demo.js')
  const out = path.join(dir, 'argv-url.txt')
  fs.writeFileSync(demo, 'module.exports = 1\n')
  const editor = makeFakeEditor(dir, 'my-editor', out)

  launchEditor(require('node:url').pathToFileURL(demo).href, editor)

  const argv = await waitForFile(out)
  assert.ok(argv.includes(demo), argv)
})

test('it does nothing when the file does not exist', async () => {
  const dir = makeSandbox()
  const out = path.join(dir, 'argv-missing.txt')
  const editor = makeFakeEditor(dir, 'my-editor', out)

  let called = false
  launchEditor(path.join(dir, 'nope.js'), editor, () => {
    called = true
  })

  await sleep(1000)
  assert.strictEqual(fs.existsSync(out), false)
  assert.strictEqual(called, false)
})

test('it reports an editor that cannot be launched', async () => {
  const dir = makeSandbox()
  const demo = path.join(dir, 'demo.js')
  fs.writeFileSync(demo, 'module.exports = 1\n')

  const reported = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the error callback was never called')), 20000)
    launchEditor(demo, 'launch-editor-no-such-binary', (fileName, errorMessage) => {
      clearTimeout(timer)
      resolve({ fileName, errorMessage })
    })
  })

  assert.strictEqual(reported.fileName, demo)
  assert.ok(reported.errorMessage, 'an error message is reported')
})
