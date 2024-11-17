import { ServiceBusProvider } from '../serviceBusProvider'
import { MessagesWebView } from '../views/messagesWebView'

export interface IInteractableItem {
  show(): Promise<void>
  transfer: (provider: ServiceBusProvider) => Promise<void>
  purge: (provider: ServiceBusProvider) => Promise<void>
  purgeDl: (provider: ServiceBusProvider) => Promise<void>
}
