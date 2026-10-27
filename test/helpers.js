const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const isWindows = process.platform === 'win32'

// Create a throwaway directory to hold the fake editor and the demo file.
function makeSandbox () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'launch-editor-test-'))
}

// Write an executable that records the argv it was invoked with into `outFile`,
// and return the string to hand to `launchEditor` as the specified editor.
// `name` is the editor basename that `get-args` switches on, so the tests drive
// the per-editor argument mapping through the real entry point.
//
// The returned spec is double quoted on Windows: `guessEditor` runs the
// specified editor through `shell-quote`, which would otherwise eat the
// backslashes of a Windows path.
function makeFakeEditor (dir, name, outFile) {
  if (isWindows) {
    const file = path.join(dir, name + '.cmd')
    // The space before `>` matters: an argument ending in a digit would
    // otherwise be read by cmd as a redirection handle.
    fs.writeFileSync(file, '@echo off\r\necho %* >"' + outFile + '"\r\n')
    return '"' + file + '"'
  }
  const file = path.join(dir, name)
  fs.writeFileSync(file, "#!/bin/sh\nprintf '%s\\n' \"$@\" > '" + outFile + "'\n")
  fs.chmodSync(file, 0o755)
  return file
}

function sleep (ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// The editor is spawned detached from the caller, so poll for the recorded argv.
async function waitForFile (file, timeoutMs = 20000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf8')
      if (content.trim().length) return content
    }
    await sleep(50)
  }
  throw new Error('timed out waiting for ' + file)
}

module.exports = { isWindows, makeSandbox, makeFakeEditor, sleep, waitForFile }
