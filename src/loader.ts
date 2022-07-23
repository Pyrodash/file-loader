/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path'
import { promises as fs } from 'fs'
import { EventEmitter } from 'events'

const fileExt = path.extname(__filename).toLowerCase()
const configError = new Error('bad config, failed to initialize loader')

export type ConstructorType<T> = new (...args: any[]) => T

export interface ClassOptions<T = unknown, A = T> {
    instantiate?: boolean
    params?: Array<unknown>
    findConstructor?: (name: string, mdl: any) => ConstructorType<T> | null
    destroy?: (instance: T) => void
    rebuild?: (newInstance: T, oldInstance: A) => void
}

const processName = (name: string) => name.toLowerCase()

const defaultClassOptions: ClassOptions = {
    instantiate: true,
    params: [],
}

const defaultAllowedExts = ['.js', '.ts']

export interface LoaderOptions<T = unknown, A = T> {
    path: string
    nested?: boolean
    mainFile?: string | ((file: string) => string)
    ignored?: Array<string>
    autoLoad?: boolean
    classes?: ClassOptions<T, A>
    allowedFileExts?: string[]
}

export class Loader<T, A = T> extends EventEmitter {
    private path: string

    private nested: boolean
    private mainFile: string | ((file: string) => string)

    private classes: ClassOptions<T, A>
    private allowedFileExts: string[]

    protected ignored: string[]

    protected fileMap: Map<string, T> // Map<FilePath, Instance>

    // TODO: Rethink this method of storing metadata
    // The philosophy behind this is that we need to be able to access a file's "name" by the path, and the file path by the "name" in a timely fashion, so two maps are used for *hopefully* the best performance
    // I'm not sure if this will work well at scale in terms of memory usage, but I can't think of other solutions
    protected nameMap: Map<T, string> // Map<Instance, FileNameWithoutExt> - the instance is used as a key because object references are 8 bytes while a path will almost always be bigger than that
    protected pathMap: Map<string, string> // Map<FileNameWithoutExt, FilePath>

    public get files(): ReadonlyMap<string, T> {
        return this.fileMap
    }

    public ready = false

    constructor(opts: LoaderOptions<T, A>) {
        super()

        this.path = opts.path

        this.nested = opts.nested
        this.mainFile = opts.mainFile || 'index' + fileExt

        this.classes = opts.classes || <ClassOptions<T, A>>defaultClassOptions
        this.allowedFileExts = opts.allowedFileExts || defaultAllowedExts

        this.ignored = opts.ignored || []

        this.fileMap = new Map()
        this.pathMap = new Map()
        this.nameMap = new Map()

        if (!this.path || (this.nested && !this.mainFile) || !this.files) {
            throw configError
        }

        if (opts.autoLoad !== false) {
            this.loadFiles()
        }
    }

    private findConstructor(name: string, mdl: any): ConstructorType<T> | null {
        return this.classes?.findConstructor?.(name, mdl) || mdl.default
    }

    private findPathFromName(name: string): string | null {
        return this.pathMap.get(processName(name))
    }

    // this method should ONLY be used for files loaded by this.loadFiles
    private extractNameFromFilePath(filePath: string): string {
        return this.nested
            ? path.dirname(filePath)
            : path.basename(filePath, path.extname(filePath))
    }

    async loadFiles(locPath = this.path, nested?: boolean): Promise<T[]> {
        if (this.nested && locPath === this.path) {
            nested = true
        }

        const files = await fs.readdir(locPath)
        const promises = []

        let extname: string
        let filePath: string

        for (let fileName of files) {
            extname = path.extname(fileName)?.toLowerCase()

            if (
                (nested && extname) ||
                (!nested && !this.allowedFileExts.includes(extname))
            ) {
                continue
            }

            if (this.ignored.includes(fileName)) {
                continue
            }

            if (nested) {
                if (typeof this.mainFile === 'function') {
                    fileName = this.mainFile(fileName)
                } else {
                    fileName = path.join(fileName, this.mainFile)
                }
            }

            filePath = path.join(locPath, fileName)

            promises.push(this.loadFromPath(filePath))
        }

        const instances = await Promise.all(promises)

        this.emit('load-many', instances)

        if (!this.ready) {
            this.ready = true
            this.emit('ready')
        }

        return instances
    }

    async loadFromPath(
        filePath: string,
        name?: string,
        emit = true
    ): Promise<T> {
        let file = await import(filePath)

        if (!name) {
            name = this.extractNameFromFilePath(filePath)
        }

        let constructor: ConstructorType<T>

        if (
            this.classes.instantiate &&
            typeof (constructor = this.findConstructor(name, file)) ===
                'function'
        ) {
            file = new constructor(...this.classes.params)

            this.pathMap.set(processName(name), filePath) // note: this is case insensitive

            name = constructor.name
        }

        this.fileMap.set(filePath, file)

        if (emit !== false) {
            this.emit('load', name, file)
        }

        return file
    }

    loadFromFileName(fileName: string): Promise<T> {
        return this.loadFromPath(path.join(this.path, fileName))
    }

    unloadFromPath(filePath: string): T | null {
        const instance = this.fileMap.get(filePath)

        if (instance) {
            const name = this.nameMap.get(instance)

            this.classes?.destroy?.(instance)

            this.fileMap.delete(filePath)
            this.pathMap.delete(name)
            this.nameMap.delete(instance)

            this.emit('unload', instance)
        }

        return instance
    }

    unload(name: string): T | null {
        const filePath = this.findPathFromName(name)

        if (!filePath) {
            return null
        }

        return this.unloadFromPath(filePath)
    }

    async reloadFromPath(filePath: string): Promise<T> {
        delete require.cache[filePath]

        const oldInstance = this.unloadFromPath(filePath)
        const newInstance = await this.loadFromPath(
            filePath,
            this.nameMap.get(oldInstance),
            Boolean(oldInstance)
        )

        if (oldInstance) {
            this.classes?.rebuild?.(newInstance, oldInstance as unknown as A) // allows you to properly type the old instance how you want
            this.emit('reload', newInstance)
        }

        return newInstance
    }

    reload(name: string): Promise<T> {
        const filePath = this.findPathFromName(name)

        if (!filePath) {
            return Promise.reject('File not found')
        }

        return this.reloadFromPath(filePath)
    }

    onReady(cb: () => void) {
        if (this.ready) {
            cb()
        } else {
            this.once('ready', cb)
        }
    }
}
