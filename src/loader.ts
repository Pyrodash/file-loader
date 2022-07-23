/* eslint-disable @typescript-eslint/no-explicit-any */
import path from 'path'
import { promises as fs } from 'fs'
import { EventEmitter } from 'events'
import chokidar from 'chokidar'
import {
    ConfigError,
    FileLoadError,
    FileNotFoundError,
    LoadFilesError,
} from './errors'

const fileExt = path.extname(__filename).toLowerCase()
const configError = new ConfigError()

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

const defaultWatcherOptions: chokidar.WatchOptions = {
    persistent: false,
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
    watch?: boolean
    watchOptions?: chokidar.WatchOptions
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
    private nameMap: Map<T, string> // Map<Instance, FileNameWithoutExt> - the instance is used as a key because object references are 8 bytes while a path will almost always be bigger than that
    private pathMap: Map<string, string> // Map<FileNameWithoutExt, FilePath>

    private watchOptions: chokidar.WatchOptions
    private watchList: Map<string, boolean> // map<Directory, IsNested>
    private watcher: chokidar.FSWatcher

    public get files(): ReadonlyMap<string, T> {
        return this.fileMap
    }

    private _ready = false

    public get ready(): boolean {
        return this._ready
    }

    constructor(opts: LoaderOptions<T, A>) {
        super()

        this.path = opts.path

        this.nested = opts.nested
        this.mainFile = opts.mainFile || 'index' + fileExt

        this.classes = opts.classes || <ClassOptions<T, A>>defaultClassOptions
        this.allowedFileExts = opts.allowedFileExts || defaultAllowedExts

        this.watchOptions = opts.watchOptions || defaultWatcherOptions
        this.ignored = opts.ignored || []

        this.fileMap = new Map()
        this.pathMap = new Map()
        this.nameMap = new Map()

        if (!this.path || (this.nested && !this.mainFile) || !this.files) {
            throw configError
        }

        if (opts.watch) {
            this.watchList = new Map()

            this.createWatcher()
        }

        if (opts.autoLoad !== false) {
            this.loadFiles()
        }
    }

    private createWatcher() {
        this.watcher = chokidar.watch([], this.watchOptions)
        this.watcher.on('change', (filePath) => {
            let nested: boolean
            let relPath: string

            for (const dir of this.watchList.keys()) {
                if (filePath.startsWith(dir)) {
                    nested = this.watchList.get(dir)
                    relPath = filePath.substring(dir.length, filePath.length)

                    if (nested) {
                        relPath = relPath.substring(
                            0,
                            relPath.indexOf(path.sep)
                        )

                        filePath = this.pathMap.get(relPath)
                    } else if (
                        relPath.indexOf(path.sep) !== -1 ||
                        !this.isFileValid(relPath, nested)
                    ) {
                        break
                    }

                    if (filePath) {
                        this.reloadFromPath(filePath, false)
                    }

                    break
                }
            }
        })
    }

    private findConstructor(name: string, mdl: any): ConstructorType<T> | null {
        if (this.classes?.findConstructor) {
            return this.classes.findConstructor(name, mdl)
        } else {
            return mdl.default
        }
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

    private isFileValid(file: string, nested = this.nested): boolean {
        const extname = path.extname(file)?.toLowerCase()

        if (
            (nested && extname) ||
            (!nested && !this.allowedFileExts.includes(extname))
        ) {
            return false
        }

        if (this.ignored.includes(file)) {
            return false
        }

        return true
    }

    async loadFiles(locPath = this.path, nested?: boolean): Promise<T[]> {
        if (this.nested && locPath === this.path) {
            nested = true
        }

        let files: string[]

        try {
            files = await fs.readdir(locPath)
        } catch (err) {
            throw new LoadFilesError(err, locPath)
        }

        this.watch(locPath, nested)

        const instances: T[] = []

        let filePath: string

        for (let fileName of files) {
            if (!this.isFileValid(fileName, nested)) {
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

            try {
                instances.push(await this.loadFromPath(filePath))
            } catch (err) {
                this.emit('error', err)
            }
        }

        this.emit('load-many', instances)

        if (!this._ready) {
            this._ready = true
            this.emit('ready')
        }

        return instances
    }

    async loadFromPath(filePath: string, name?: string): Promise<T> {
        let file

        try {
            file = await import(filePath)
        } catch (err) {
            throw new FileLoadError(err, filePath)
        }

        if (!name) {
            name = this.extractNameFromFilePath(filePath)
        }

        const oldInstance = this.fileMap.get(filePath)

        if (oldInstance) {
            this.classes?.destroy?.(oldInstance)
        }

        let constructor: ConstructorType<T>

        if (
            this.classes.instantiate &&
            typeof (constructor = this.findConstructor(name, file)) ===
                'function'
        ) {
            file = new constructor(...this.classes.params)

            if (oldInstance) {
                this.classes?.rebuild?.(file, oldInstance as unknown as A) // allows you to properly type the old instance how you want
            }

            this.pathMap.set(processName(name), filePath) // note: this is case insensitive
            this.nameMap.set(file, name)

            name = constructor.name
        }

        this.fileMap.set(filePath, file)

        if (oldInstance) {
            this.emit('reload', file)
        } else {
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

    reloadFromPath(filePath: string, autoLoad = true): Promise<T> {
        delete require.cache[filePath]

        const oldInstance = this.fileMap.get(filePath)

        if (oldInstance || autoLoad) {
            return this.loadFromPath(filePath, this.nameMap.get(oldInstance))
        }

        return Promise.resolve(null)
    }

    reload(name: string): Promise<T> {
        const filePath = this.findPathFromName(name)

        if (!filePath) {
            return Promise.reject(new FileNotFoundError(name))
        }

        return this.reloadFromPath(filePath)
    }

    watch(dir = this.path, nested = this.nested) {
        if (!dir.endsWith(path.sep)) {
            dir += path.sep
        }

        if (this.watcher) {
            if (this.watchList.has(dir)) {
                return
            }

            this.watchList.set(dir, nested)
            this.watcher.add(dir)
        }
    }

    unwatch(dir = this.path) {
        if (!dir.endsWith(path.sep)) {
            dir += path.sep
        }

        if (this.watcher) {
            this.watchList.delete(dir)
            this.watcher.unwatch(dir)
        }
    }

    onReady(cb: () => void) {
        if (this.ready) {
            cb()
        } else {
            this.once('ready', cb)
        }
    }

    async destroy() {
        await this.watcher.close()
    }
}
