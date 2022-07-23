function createStackProxy(newStack: string, oldStack: string) {
    return newStack.split('\n').slice(0, 2).join('\n') + '\n' + oldStack
}

export class ConfigError extends Error {
    readonly name = 'ConfigError'

    constructor() {
        super('Bad config, failed to initialize loader')
    }
}

export class FileNotFoundError extends Error {
    readonly name = 'FileNotFoundError'
    readonly fileName: string

    constructor(fileName: string) {
        super('File not found')

        this.fileName = fileName
    }
}

export class FileLoadError extends Error {
    readonly name = 'FileLoadError'

    readonly err: Error
    readonly filePath: string

    constructor(err: Error, filePath: string) {
        super(err.message)

        this.err = err
        this.filePath = filePath

        this.stack = createStackProxy(this.stack, err.stack)
    }
}

export class LoadFilesError extends Error {
    readonly name = 'LoadFilesError'

    readonly err: Error
    readonly path: string

    constructor(err: Error, path: string) {
        super(err.message)

        this.err = err
        this.path = path

        this.stack = createStackProxy(this.stack, err.stack)
    }
}
