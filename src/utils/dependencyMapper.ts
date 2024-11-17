import { TreeItemCollapsibleState } from 'vscode'
import { ServiceBusInfo, TopicCustomProperties } from '../interfaces/ServiceBusInfo'
import { QueueRuntimeProperties, SubscriptionRuntimeProperties } from '@azure/service-bus'
import { QueueItem } from '../models/QueueItem'
import { ServiceBusItem } from '../models/ServiceBusItem'
import { SubscriptionItem } from '../models/SubscriptionItem'
import { TopicItem } from '../models/TopicItem'

export const mapSbToDep = (sbInfo: ServiceBusInfo, isConnected: boolean): ServiceBusItem => {
  return new ServiceBusItem(sbInfo.serviceBusName,
    sbInfo.connectionString,
    TreeItemCollapsibleState.Collapsed,
    isConnected,
    sbInfo.queues,
    sbInfo.topics)
}

export const mapUnconnectedSbToDep = (name: string, connectionString: string): ServiceBusItem => {
  return new ServiceBusItem(name,
    connectionString,
    TreeItemCollapsibleState.None,
    false)
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
