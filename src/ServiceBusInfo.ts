import type {
  QueueRuntimeProperties,
  ServiceBusReceivedMessage,
  SubscriptionRuntimeProperties,
  TopicRuntimeProperties,
} from '@azure/service-bus'

export type ServiceBusInfo = {
  connectionString: string
  serviceBusName: string
  queues: QueueRuntimeProperties[]
  topics: TopicCustomProperties[]
}

export type TopicCustomProperties = {
  properties: TopicRuntimeProperties
  subscriptions: SubscriptionRuntimeProperties[]
}

export type ServiceBusMessageDetails = {
  messages: ServiceBusReceivedMessage[]
  deadletter: ServiceBusReceivedMessage[]
}
