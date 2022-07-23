/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path'
import { promises as fs } from 'fs'
import { EventEmitter } from 'events'

export type ConstructorType<T> = new (...args: any[]) => T

const fileExt = path.extname(__filename).toLowerCase()
const configError = new Error('bad config, failed to initialize loader')

interface FileMetadata {
    name: string
    path: string
}

export interface ClassOptions<T = unknown> {
    instantiate?: boolean
    params?: Array<unknown>
    findConstructor?: (name: string, mdl: any) => ConstructorType<T> | null
}

const defaultClassOptions: ClassOptions = {
    instantiate: true,
    params: [],
}

const defaultAllowedExts = ['.js', '.ts']

export interface LoaderOptions<T = unknown> {
    path: string
    nested?: boolean
    mainFile?: string | ((file: string) => string)
    ignored?: Array<string>
    autoLoad?: boolean
    classes?: ClassOptions<T>
    allowedFileExts?: string[]
}

export default class Loader<T> extends EventEmitter {
    private path: string

    private nested: boolean
    private mainFile: string | ((file: string) => string)

    private classes: ClassOptions<T>
    private allowedFileExts: string[]

    protected ignored: string[]
    protected storage: T[]

    public get files(): ReadonlyArray<T> {
        return this.storage
    }

    public ready = false

    constructor(opts: LoaderOptions<T>) {
        super()

        this.path = opts.path

        this.nested = opts.nested
        this.mainFile = opts.mainFile || 'index' + fileExt

        this.classes = opts.classes || <ClassOptions<T>>defaultClassOptions
        this.allowedFileExts = opts.allowedFileExts || defaultAllowedExts

        this.ignored = opts.ignored || []
        this.storage = []

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

    async loadFiles(locPath = this.path, nested?: boolean): Promise<T[]> {
        if (this.nested && locPath === this.path) {
            nested = true
        }

        const files = await fs.readdir(locPath)
        const promises = []

        for (let fileName of files) {
            const extname = path.extname(fileName)?.toLowerCase()

            if (
                (nested && extname) ||
                (!nested && !this.allowedFileExts.includes(extname))
            ) {
                continue
            }

            if (this.ignored.includes(fileName)) {
                continue
            }

            if (this.nested) {
                if (typeof this.mainFile === 'function') {
                    fileName = this.mainFile(fileName)
                } else {
                    fileName = path.join(fileName, this.mainFile)
                }
            }

            promises.push(this.load(fileName))
        }

        const instances = await Promise.all(promises)

        this.emit('load-many', instances)

        if (!this.ready) {
            this.ready = true
            this.emit('ready')
        }

        return instances
    }

    async load(fileName: string): Promise<T> {
        const filePath = path.join(this.path, fileName)

        let file = await import(filePath)
        let name = this.nested
            ? path.dirname(fileName)
            : path.basename(fileName, path.extname(fileName))

        let constructor: ConstructorType<T>

        if (
            this.classes.instantiate &&
            typeof (constructor = this.findConstructor(name, file)) ===
                'function'
        ) {
            file = new constructor(...this.classes.params)
            name = constructor.name
        }

        this.storage.push(file)
        this.emit('load', name, file)

        return file
    }

    onReady(cb: () => void) {
        if (this.ready) {
            cb()
        } else {
            this.once('ready', cb)
        }
    }
}
