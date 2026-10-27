const assert = require('node:assert/strict')
const childProcess = require('node:child_process')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { describe, test, mock } = require('node:test')

const launchEditor = require('./index.js')

const UNC_ERROR = 'UNC paths are not supported on Windows to avoid security issues.'

// Stands in for the editor process, so that the tests never start a real editor.
const fakeEditorProcess = { on () {}, kill () {} }

describe('launchEditor UNC path guard', () => {
  if (process.platform === 'win32') {
    test('rejects UNC paths on Windows via the error callback', () => {
      const onError = mock.fn()

      launchEditor('\\\\server\\share\\file.js', 'vim', onError)

      assert.equal(onError.mock.callCount(), 1)
      const [fileName, message] = onError.mock.calls[0].arguments
      assert.equal(fileName, '\\\\server\\share\\file.js')
      assert.ok(message.includes(UNC_ERROR))
    })

    test('strips the position suffix before reporting the rejected UNC path', () => {
      const onError = mock.fn()

      launchEditor('\\\\server\\share\\file.js:10:5', 'vim', onError)

      assert.equal(onError.mock.callCount(), 1)
      const [fileName, message] = onError.mock.calls[0].arguments
      assert.equal(fileName, '\\\\server\\share\\file.js')
      assert.ok(message.includes(UNC_ERROR))
    })

    test('does not treat a normal absolute Windows path as UNC', () => {
      const onError = mock.fn()

      // Non-existent file: without the UNC guard firing, launchEditor returns
      // silently at the `fs.existsSync` check without invoking the callback.
      launchEditor('C:\\Users\\me\\does-not-exist-xyz.js', 'vim', onError)

      assert.equal(onError.mock.callCount(), 0)
    })

    // Each of these spellings reaches a remote host over SMB as soon as it is
    // handed to the filesystem, which leaks the user's NTLM credentials.
    const uncSpellings = [
      '\\\\127.0.0.1\\share\\test.txt',
      '//server/share/file.js',
      '/\\server\\share/file.js',
      '\\\\?\\UNC\\server\\share\\file.js',
      'file://server/share/file.js'
    ]
    for (const file of uncSpellings) {
      test(`rejects ${file} without touching the filesystem`, (t) => {
        const existsSync = t.mock.method(fs, 'existsSync', () => false)
        const onError = mock.fn()

        launchEditor(file, 'vim', onError)

        assert.equal(existsSync.mock.callCount(), 0)
        assert.equal(onError.mock.callCount(), 1)
        assert.ok(onError.mock.calls[0].arguments[1].includes(UNC_ERROR))
      })
    }

    test('reports the rejected UNC path to an error callback passed as the second argument', () => {
      const onError = mock.fn()

      launchEditor('\\\\server\\share\\file.js', onError)

      assert.equal(onError.mock.callCount(), 1)
      const [fileName, message] = onError.mock.calls[0].arguments
      assert.equal(fileName, '\\\\server\\share\\file.js')
      assert.ok(message.includes(UNC_ERROR))
    })

    test('does not throw on a rejected UNC path when no error callback is given', () => {
      assert.doesNotThrow(() => launchEditor('\\\\server\\share\\file.js'))
    })
  } else {
    test('does not apply the UNC guard on non-Windows platforms', () => {
      const onError = mock.fn()

      launchEditor('\\\\server\\share\\does-not-exist-xyz.js', 'vim', onError)

      assert.equal(onError.mock.callCount(), 0)
    })
  }
})

describe('launchEditor CMD argument guard', () => {
  if (process.platform === 'win32') {
    for (const [name, lineBreak] of [
      ['carriage returns', '\r'],
      ['line feeds', '\n']
    ]) {
      test(`rejects ${name} in arguments`, (t) => {
        t.mock.method(fs, 'existsSync', () => true)
        const onError = mock.fn()

        launchEditor(`C:\\project\\file.js${lineBreak}calc.exe`, 'code', onError)

        assert.equal(onError.mock.callCount(), 1)
        assert.match(onError.mock.calls[0].arguments[1], /argument containing a line break/)
      })
    }

    test('rejects percent signs in arguments', (t) => {
      t.mock.method(fs, 'existsSync', () => true)
      const onError = mock.fn()

      launchEditor('C:\\project\\100%\\file.js', 'code', onError)

      assert.equal(onError.mock.callCount(), 1)
      assert.match(onError.mock.calls[0].arguments[1], /argument containing "%"/)
    })

    test('rejects CMD variable modifiers', (t) => {
      t.mock.method(fs, 'existsSync', () => true)
      const onError = mock.fn()

      launchEditor('C:\\project\\%VAR:old=new%', 'code', onError)

      assert.equal(onError.mock.callCount(), 1)
      assert.match(onError.mock.calls[0].arguments[1], /argument containing "%"/)
    })
  }
})

describe('launchEditor file names that look like editor options', () => {
  if (process.platform === 'win32') {
    // On Windows the editor is started through `childProcess.exec`, so the
    // file argument is checked within the launch command.
    const cases = [
      ['notepad++', '-multiInst'],
      ['vim', '+qa!'],
      ['code', '--new-window']
    ]

    for (const [editor, fileName] of cases) {
      for (const position of ['', ':10:5']) {
        test(`${editor} gets an absolute path for an option-like file name ${position ? 'with' : 'without'} a position`, (t) => {
          t.mock.method(fs, 'existsSync', () => true)
          const exec = t.mock.method(childProcess, 'exec', () => fakeEditorProcess)

          launchEditor(fileName + position, editor)

          assert.equal(exec.mock.callCount(), 1)
          const command = exec.mock.calls[0].arguments[0]
          assert.ok(command.includes(path.resolve(fileName)), `unsafe editor command: ${command}`)
          assert.ok(!command.split(' ').includes(fileName + position), `unsafe editor command: ${command}`)
        })
      }
    }
  } else {
    test('resolves a relative file name to an absolute path', (t) => {
      t.mock.method(fs, 'existsSync', () => true)
      const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

      launchEditor('file', 'vim')

      assert.equal(spawn.mock.callCount(), 1)
      assert.deepEqual(spawn.mock.calls[0].arguments[1], [path.resolve('file')])
    })

    test('keeps the position arguments in front of the absolute file name', (t) => {
      t.mock.method(fs, 'existsSync', () => true)
      const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

      launchEditor('file:10:5', 'vim')

      assert.equal(spawn.mock.callCount(), 1)
      assert.deepEqual(spawn.mock.calls[0].arguments[1], [
        '+call cursor(10, 5)',
        path.resolve('file')
      ])
    })

    const cases = [
      ['vim', '+call writefile(["marker"], "LAUNCH_EDITOR_MARKER")|qa!'],
      ['mvim', '-ccall writefile(["marker"], "LAUNCH_EDITOR_MARKER")|qa!'],
      ['gvim', '+call writefile(["marker"], "LAUNCH_EDITOR_MARKER")|qa!'],
      ['emacs', '--eval=(write-region "marker" nil "LAUNCH_EDITOR_MARKER")'],
      ['emacsclient', '-eatouch LAUNCH_EDITOR_MARKER'],
      ['notepad++', '-pluginMessage=LAUNCH_EDITOR_MARKER'],
      ['code', '--install-extension=LAUNCH_EDITOR_MARKER']
    ]

    for (const [editor, fileName] of cases) {
      for (const position of ['', ':10:5']) {
        test(`${editor} gets an absolute path for an option-like file name ${position ? 'with' : 'without'} a position`, (t) => {
          t.mock.method(fs, 'existsSync', () => true)
          const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

          launchEditor(fileName + position, editor)

          assert.equal(spawn.mock.callCount(), 1)
          const args = spawn.mock.calls[0].arguments[1]
          const fileArgument = args[args.length - 1]
          assert.ok(path.isAbsolute(fileArgument), `unsafe editor arguments: ${JSON.stringify(args)}`)
          assert.ok(
            fileArgument.startsWith(path.resolve(fileName)),
            `unexpected editor arguments: ${JSON.stringify(args)}`
          )
        })
      }
    }
  }
})

describe('launchEditor WSL handling', () => {
  if (process.platform !== 'linux') {
    return
  }

  test('uses a relative path for files on a Windows drive in WSL', (t) => {
    t.mock.method(process, 'cwd', () => '/home/user/project')
    t.mock.method(os, 'release', () => '4.4.0-43-Microsoft')
    t.mock.method(fs, 'existsSync', () => true)
    const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

    launchEditor('/mnt/c/project/file.js', 'vim')

    assert.equal(spawn.mock.callCount(), 1)
    assert.deepEqual(spawn.mock.calls[0].arguments[1], ['./../../../mnt/c/project/file.js'])
  })

  test('resolves a relative path before converting it for WSL', (t) => {
    t.mock.method(process, 'cwd', () => '/mnt/c/project')
    t.mock.method(os, 'release', () => '4.4.0-43-Microsoft')
    t.mock.method(fs, 'existsSync', () => true)
    const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

    launchEditor('file.js', 'vim')

    assert.equal(spawn.mock.callCount(), 1)
    assert.deepEqual(spawn.mock.calls[0].arguments[1], ['./file.js'])
  })

  test('prefixes an option-like relative path on a Windows drive in WSL', (t) => {
    t.mock.method(process, 'cwd', () => '/mnt/c/project')
    t.mock.method(os, 'release', () => '4.4.0-43-Microsoft')
    t.mock.method(fs, 'existsSync', () => true)
    const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

    launchEditor('+call system("touch LAUNCH_EDITOR_MARKER")', 'vim')

    assert.equal(spawn.mock.callCount(), 1)
    assert.deepEqual(spawn.mock.calls[0].arguments[1], [
      './+call system("touch LAUNCH_EDITOR_MARKER")'
    ])
  })

  test('prefixes an option-like relative path with a position in WSL', (t) => {
    t.mock.method(process, 'cwd', () => '/mnt/c/project')
    t.mock.method(os, 'release', () => '4.4.0-43-Microsoft')
    t.mock.method(fs, 'existsSync', () => true)
    const spawn = t.mock.method(childProcess, 'spawn', () => fakeEditorProcess)

    launchEditor('-ccall system("touch LAUNCH_EDITOR_MARKER"):10:5', 'vim')

    assert.equal(spawn.mock.callCount(), 1)
    assert.deepEqual(spawn.mock.calls[0].arguments[1], [
      '+call cursor(10, 5)',
      './-ccall system("touch LAUNCH_EDITOR_MARKER")'
    ])
  })
})

describe('launchEditor existence check', () => {
  // A position suffix can turn the last path component into `..` once it is stripped,
  // e.g. `<project>\& calc.exe\..:1:1`. Windows normalizes `..` lexically, so checking the
  // unresolved file name lets a component that does not exist on disk pass the check.
  const project = path.resolve('project')
  const file = `${project}${path.sep}attacker-controlled${path.sep}..:1:1`

  test('checks the existence of the resolved file name', (t) => {
    const existsSync = t.mock.method(fs, 'existsSync', () => false)
    const onError = mock.fn()

    launchEditor(file, 'code', onError)

    assert.equal(existsSync.mock.callCount(), 1)
    assert.equal(existsSync.mock.calls[0].arguments[0], project)
    assert.equal(onError.mock.callCount(), 0)
  })

  test('hands the resolved file name to the editor and the error callback', (t) => {
    t.mock.method(fs, 'existsSync', () => true)
    // Records the listeners, so that the editor can be made to exit with an error and the
    // file name reported to the error callback can be checked.
    const listeners = {}
    const editorProcess = {
      on (event, listener) {
        listeners[event] = listener
      },
      kill () {}
    }
    const launch = t.mock.method(
      childProcess,
      process.platform === 'win32' ? 'exec' : 'spawn',
      () => editorProcess
    )
    const onError = mock.fn()

    launchEditor(file, 'code', onError)
    listeners.exit(1)

    assert.equal(launch.mock.callCount(), 1)
    const launched = JSON.stringify(launch.mock.calls[0].arguments.slice(0, 2))
    assert.ok(!launched.includes('attacker-controlled'), `unsafe editor launch: ${launched}`)
    if (process.platform !== 'win32') {
      assert.deepEqual(launch.mock.calls[0].arguments[1], ['-r', '-g', `${project}:1:1`])
    }
    assert.equal(onError.mock.callCount(), 1)
    assert.equal(onError.mock.calls[0].arguments[0], project)
  })

  if (process.platform === 'win32') {
    test('does not let a shell payload hidden behind `..` pass the existence check', (t) => {
      // Mirrors how Windows answers `fs.existsSync()`: `..` is collapsed before the lookup,
      // so only `C:\project` has to exist for the unresolved name to be reported as present.
      const existsSync = t.mock.method(
        fs,
        'existsSync',
        (p) => path.win32.resolve(p) === 'C:\\project'
      )
      const exec = t.mock.method(childProcess, 'exec', () => fakeEditorProcess)
      const onError = mock.fn()

      launchEditor('C:\\project\\& calc.exe & rem \\..:1:1', 'code', onError)

      assert.equal(existsSync.mock.callCount(), 1)
      assert.equal(existsSync.mock.calls[0].arguments[0], 'C:\\project')
      assert.equal(onError.mock.callCount(), 0)
      assert.equal(exec.mock.callCount(), 1)
      const command = exec.mock.calls[0].arguments[0]
      assert.ok(!command.includes('calc.exe'), `unsafe editor command: ${command}`)
    })
  }
})
