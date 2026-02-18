import process from 'node:process'
import { join } from 'pathe'

export function loadEnvFiles(cwd: string) {
  const files = ['.env', '.env.local']

  for (const file of files) {
    try {
      process.loadEnvFile(join(cwd, file))
    }
    catch (error) {
      const nodeError = error as NodeJS.ErrnoException
      if (nodeError.code !== 'ENOENT')
        throw error
    }
  }
}
