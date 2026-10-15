import { describe, expect, it } from 'vitest'
import { NAMESPACES, resources } from '@/locales'

function flattenKeys(tree: object, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]: [string, unknown]) =>
    typeof value === 'object' && value !== null
      ? flattenKeys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function flattenValues(tree: object): unknown[] {
  return Object.values(tree).flatMap((value: unknown) =>
    typeof value === 'object' && value !== null ? flattenValues(value) : [value],
  )
}

describe('archivos de traducción', () => {
  it.each(NAMESPACES)('es y en tienen las mismas claves en "%s"', (namespace) => {
    expect(flattenKeys(resources.en[namespace]).sort()).toEqual(
      flattenKeys(resources.es[namespace]).sort(),
    )
  })

  it.each(NAMESPACES)('no hay textos vacíos en "%s"', (namespace) => {
    for (const language of ['es', 'en'] as const) {
      for (const value of flattenValues(resources[language][namespace])) {
        expect(typeof value === 'string' && value.trim().length > 0).toBe(true)
      }
    }
  })
})
