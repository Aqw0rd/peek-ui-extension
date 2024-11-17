import * as vscode from 'vscode'
import { ServiceBusProvider } from './serviceBusProvider'
import { IInteractableItem } from './interfaces/IInteractableItem'
import { SbDependencyBase } from './models/SbDependencyBase'
import { ServiceBusItem } from './models/ServiceBusItem'

export function activate(context: vscode.ExtensionContext) {
  const servicebusProvider = new ServiceBusProvider(context)
  vscode.window.registerTreeDataProvider('anho.peek-ui', servicebusProvider)
  vscode.commands.registerCommand('anho.peek-ui.addConnection', () => {
    servicebusProvider.addConnection()
  })
  vscode.commands.registerCommand('anho.peek-ui.connect', (node: ServiceBusItem) => {
    node.connect(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.refresh', (node: SbDependencyBase) => {
    node.refresh(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.showMessages', async (node: IInteractableItem) => {
    await node.show()
  })
  vscode.commands.registerCommand('anho.peek-ui.transferDeadletterAll', async (node: IInteractableItem) => {
    await node.transfer(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.purgeMessages', async (node: IInteractableItem) => {
    await node.purge(servicebusProvider)
  })
  vscode.commands.registerCommand('anho.peek-ui.purgeDeadletter', async (node: IInteractableItem) => {
    await node.purgeDl(servicebusProvider)
  })
}

export function deactivate() { }
