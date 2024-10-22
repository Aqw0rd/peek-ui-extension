import { TreeItemCollapsibleState } from 'vscode'
import { ServiceBusInfo, TopicCustomProperties } from '../ServiceBusInfo'
import { QueueItem, ServiceBusItem, SubscriptionItem, TopicItem } from './dependencyModel'
import { QueueRuntimeProperties, SubscriptionRuntimeProperties } from '@azure/service-bus'

export const mapSbToDep = (sbInfo: ServiceBusInfo): ServiceBusItem => {
  return new ServiceBusItem(sbInfo.serviceBusName,
    sbInfo.connectionString,
    TreeItemCollapsibleState.Collapsed,
    sbInfo.queues,
    sbInfo.topics)
}

export const mapQueueToDep = (queue: QueueRuntimeProperties, connectionString: string): QueueItem => {
  return new QueueItem(queue.name,
    connectionString,
    queue.activeMessageCount,
    queue.deadLetterMessageCount)
}

export const mapTopicToDep = (topic: TopicCustomProperties, connectionString: string): TopicItem => {
  return new TopicItem(topic.properties.name,
    connectionString,
    topic.subscriptions.length < 1 ? TreeItemCollapsibleState.None : TreeItemCollapsibleState.Collapsed,
    topic.subscriptions)
}

export const mapSubscriptionToDep = (sub: SubscriptionRuntimeProperties, connectionString: string): SubscriptionItem => {
  return new SubscriptionItem(sub.subscriptionName,
    connectionString,
    sub.activeMessageCount,
    sub.deadLetterMessageCount,
    sub.topicName)
}
