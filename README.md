# @pyrodash/file-loader

A module that allows you to load files and instantiate classes dynamically at runtime, with support for hot reloading files.

## Install
`npm install @pyrodash/file-loader`

## Notes

### Nested mode
The loader can index and load files at the root level of a directory (`nested: false`), and it can also index and load files nested inside folders (`nested: true`) such as the following structure:
```markdown
└── modules
    ├── bakery
        └── main.ts
    ├── cafe
        └── main.ts
    └── store
        └── main.ts
```

### Terminology
__Filenames__ used by the parameters of functions like `loadFromFileName()` and the `ignored` config property, do not always refer to filenames. In nested mode, they refer to the name of the folder (e.g. bakery, cafe and store in the previous example). When nested mode is turned off, they just refer to filenames.

__Names,__ which are used in the parameters of functions like `unload()` and `reload()`, are identical to filenames, but they have the file extension omitted.

## Examples
With `nested: true`
```ts
import { Loader } from '@pyrodash/file-loader'

const loader = new Loader({
    path: '/path/to/directory',
    nested: true,
    mainFile: 'main.ts',
    ignored: ['hello'],
    classes: {
        instantiate: true,
        params: ['param 1', 'param 2'], // these parameters are passed to class constructors
    },
})
```

With `nested: false`
```ts
import { Loader } from '@pyrodash/file-loader'

const loader = new Loader({
    path: '/path/to/files',
    nested: false,
    ignored: ['hello.ts'],
    classes: {
        instantiate: true,
        params: ['param 1', 'param 2'], // these parameters are passed to class constructors
    },
})
```

## API

```ts
loader.onReady(() => ...)

// loading files
await loader.loadFiles('/path/to/files', isNested) // use this when you have autoLoad off and want to run/await the initial loading
await loader.loadFiles() // defaults to configured path and nested properties

await loader.loadFromFileName(name)
await loader.loadFromPath(path)
await loader.loadFromPath(path, name) // explicitly pass a name when loading a file that doesn't follow your configuration (e.g. your loader is in nested mode, but the path you're loading isn't meant to be named like such)

// unloading files (note that this is only really async if you have an async destroy function configured)
await loader.unloadFromPath(path)
await loader.unload(name)

// reloading files
await loader.reloadFromPath(path)
await loader.reload(name)

// events
loader.on('ready', () => ...) // emitted after first initial loading
loader.on('error', (err) => ...)
loader.on('load-many', (files) => ...) // emitted after loadFiles() runs
loader.on('load', (name, file) => ...)
loader.on('unload', (file) => ...)
loader.on('reload', (newFile, oldFile) => ...)
```

### LoaderConfig
- `path`: string

Directory to load files from

- `nested?`: boolean

Whether or not to enable nested mode

- `mainFile?`: string | ((file: string) => string)

Refers to the actual name of the main file inside nested files, can be a string or a function that takes an absolute folder path and returns an absolute path to the main file

- `ignored?`: string[]

An array of filenames (folder names in case of nested mode, filenames otherwise) to be ignored by the loader

- `autoLoad?`: boolean

Whether or not the loader should immediately begin loading files automatically

- `classes?`: [ClassOptions](#classoptions)
- `allowedFileExts?`: string[]

File extensions loaded by the loader

#### Defaults
```js
{
    nested: false,
    mainFile: 'index.js' | 'index.ts', // depends on if you're running in js or ts at runtime
    ignored: [],
    autoLoad: true,
    classes: {
        instantiate: true,
        params: [],
    },
    allowedFileExts: ['.js', '.ts']
}
```

### ClassOptions[T]
- `instantiate?`: boolean

Whether or not to instantiate the class

- `params?`: unknown[]

Parameters to be passed the class constructors

- `findConstructor?`: (name: string, mdl: any) => ConstructorType[T] | null

A function to extract a constructor from a module's exports

- `destroy?`: (instance: T) => void | Promise[void]

A function to destroy/deconstruct an instance when it's being unloaded

## TODO
- Improve unit tests
- Watch loaded files for changes