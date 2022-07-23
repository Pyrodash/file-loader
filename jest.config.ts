import type { Config } from '@jest/types'

const config: Config.InitialOptions = {
    verbose: true,
    transform: {
        '^.+\\.tsx?$': 'ts-jest',
    },
    setupFilesAfterEnv: ['jest-extended/all'],
}

export default config
