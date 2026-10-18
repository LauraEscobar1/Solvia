import { invoke, isTauri } from '@tauri-apps/api/core'

export async function exportTextFile(fileName: string, contents: string, type: string): Promise<string | null> {
  if (isTauri()) return invoke<string>('plugin:exports|save_export', { fileName, contents })
  const url = URL.createObjectURL(new Blob([contents], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
  return null
}
