export function normalizeConfig<T extends object>(options: T): T {
  if ('default' in options)
    return options.default as T

  return options
}

export function requiredString(value: string | undefined, optionName: string) {
  if (!value)
    throw new Error(`Missing required option: --${optionName}`)

  return value
}

export function toPositiveInt(value: number | string | undefined, fallback: number, optionName: string) {
  if (value === undefined || value === '')
    return fallback

  const normalized = Number(value)
  if (!Number.isInteger(normalized) || normalized < 0)
    throw new Error(`${optionName} must be a non-negative integer`)

  return normalized
}

export function toIntegerInRange(value: number | string | undefined, fallback: number, min: number, max: number, optionName: string) {
  const normalized = toPositiveInt(value, fallback, optionName)
  if (normalized < min || normalized > max)
    throw new Error(`${optionName} must be an integer between ${min} and ${max}`)

  return normalized
}

export function toBoolean(value: boolean | string | undefined, fallback: boolean, optionName: string) {
  if (value === undefined || value === '')
    return fallback

  if (typeof value === 'boolean')
    return value

  const normalized = value.trim().toLowerCase()
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized))
    return true
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized))
    return false

  throw new Error(`${optionName} must be a boolean value`)
}
