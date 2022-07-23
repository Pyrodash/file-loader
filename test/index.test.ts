import 'jest-extended'
import { join } from 'path'
import { Loader, LoaderOptions } from '../src/loader'
import { Person } from './types'

const singleFilesPath = join(__dirname, 'files')
const nestedFilesPath = join(__dirname, 'nesteda')

const loaderOptions: LoaderOptions = {
    path: '/',
    nested: false,
    mainFile: 'main.ts',
    ignored: [],
    autoLoad: false,
    classes: {
        instantiate: true,
        params: ['hello'],
    },
}

function mergeOptions<T>(
    base: LoaderOptions<T>,
    extra: Partial<LoaderOptions<T>>
): LoaderOptions<T> {
    extra.classes = {
        ...base.classes,
        ...extra.classes,
    }

    return {
        ...base,
        ...extra,
    }
}

function buildOptions<T>(extra: Partial<LoaderOptions<T>>): LoaderOptions<T> {
    return mergeOptions<T>(<LoaderOptions<T>>loaderOptions, extra)
}

const mapToArray = <K, V>(map: ReadonlyMap<K, V>) => Array.from(map.values())

describe('Loader', () => {
    type Item = Person

    let loader: Loader<Item>

    describe('Load', () => {
        it('can load files', async () => {
            loader = new Loader(
                buildOptions({
                    path: singleFilesPath,
                })
            )

            await loader.loadFiles()

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
                { name: 'B' },
            ])
        })

        it('can load nested files', async () => {
            loader = new Loader(
                buildOptions({
                    path: nestedFilesPath,
                    nested: true,
                })
            )

            await loader.loadFiles()

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
                { name: 'B' },
            ])
        })

        it('can load files from a non-preconfigured path', async () => {
            loader = new Loader(buildOptions({}))

            await loader.loadFiles(singleFilesPath, false)
            // await loader.reload('a')

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
                { name: 'B' },
            ])
        })

        it('can load files with a constructor finder (instead of only allowing the default export)', async () => {
            loader = new Loader(
                buildOptions({
                    classes: {
                        findConstructor(name, mdl) {
                            return mdl[name]
                        },
                    },
                })
            )

            await loader.loadFiles(singleFilesPath, false)
            // await loader.reload('a')

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A2' },
                { name: 'B2' },
            ])
        })

        it('can ignore certain files from being loaded', async () => {
            loader = new Loader(
                buildOptions({
                    path: singleFilesPath,
                    ignored: ['b.ts'],
                })
            )

            await loader.loadFiles()

            const { files } = loader

            expect(files.size).toEqual(1)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
            ])
        })

        it('can ignore certain files from being loaded (nested)', async () => {
            loader = new Loader(
                buildOptions({
                    path: nestedFilesPath,
                    nested: true,
                    ignored: ['b'],
                })
            )

            await loader.loadFiles()

            const { files } = loader

            expect(files.size).toEqual(1)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
            ])
        })
    })

    describe('Unload', () => {
        beforeEach(async () => {
            loader = new Loader(
                buildOptions({
                    path: singleFilesPath,
                })
            )

            await loader.loadFiles()
        })

        it('can unload a file by name', () => {
            loader.unload('a')

            const { files } = loader

            expect(files.size).toEqual(1)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'B' },
            ])
        })

        it('can unload a file by path', () => {
            loader.unloadFromPath(join(singleFilesPath, 'a.ts'))

            const { files } = loader

            expect(files.size).toEqual(1)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'B' },
            ])
        })
    })

    describe('Reload', () => {
        beforeEach(async () => {
            await loader.loadFiles(singleFilesPath, false)
        })

        it('can reload a file by name', async () => {
            await loader.reload('a')

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
                { name: 'B' },
            ])
        })

        it('can reload a file by path', async () => {
            await loader.reloadFromPath(join(singleFilesPath, 'a.ts'))

            const { files } = loader

            expect(files.size).toEqual(2)
            expect(mapToArray(files)).toIncludeAllPartialMembers([
                { name: 'A' },
                { name: 'B' },
            ])
        })
    })
})
