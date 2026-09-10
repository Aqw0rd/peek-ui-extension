import * as vscode from 'vscode'

export const confirmDestructive = async (prompt: string, actionLabel: string): Promise<boolean> => {
  const choice = await vscode.window.showWarningMessage(prompt, { modal: true }, actionLabel)
  return choice === actionLabel
}

export const errorMessage = (err: unknown): string => err instanceof Error ? err.message : String(err)
