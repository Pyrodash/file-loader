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

class ProxyError extends Error {
    readonly err: Error

    constructor(err: Error, message = err.message) {
        super(message)

        this.err = err
        this.stack = createStackProxy(this.stack, err.stack)
    }
}

export class FileLoadError extends ProxyError {
    readonly name = 'FileLoadError'
    readonly filePath: string

    constructor(err: Error, filePath: string) {
        super(err)

        this.filePath = filePath
    }
}

export class LoadFilesError extends ProxyError {
    readonly name = 'LoadFilesError'
    readonly path: string

    constructor(err: Error, path: string) {
        super(err)

        this.path = path
    }
}

export class DestroyFileError<T> extends ProxyError {
    readonly name = 'DestroyFileError'

    readonly path: string
    readonly instance: T

    constructor(err: Error, path: string, instance: T) {
        super(err)

        this.path = path
        this.instance = instance
    }
}
