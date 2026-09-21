import { ServiceBusProvider } from '../serviceBusProvider'

export interface IInteractableItem {
  show(provider: ServiceBusProvider): Promise<void>
  transfer: (provider: ServiceBusProvider) => Promise<void>
  purge: (provider: ServiceBusProvider) => Promise<void>
  purgeDl: (provider: ServiceBusProvider) => Promise<void>
  deleteMessage: (provider: ServiceBusProvider, sequenceNumber: string, fromDeadletter: boolean) => Promise<void>
  requeueDlMessage: (provider: ServiceBusProvider, sequenceNumber: string) => Promise<void>
}
