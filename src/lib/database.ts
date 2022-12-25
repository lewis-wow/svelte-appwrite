import { writable } from 'svelte/store'
import { client } from './settings'
import { Query, Databases, ID } from 'appwrite'

import type { Writable } from 'svelte/store'
import type { Models, RealtimeResponseEvent } from 'appwrite'

const databases = new Databases(client)

class Collection {
	constructor(protected databaseId: string, protected collectionId: string) { }

	createDocument(data: { [key: string]: any } = {}, permissions: string[] = null) {
		return databases.createDocument(this.databaseId, this.collectionId, ID.unique(), data, permissions)
	}

	updateDocument(documentId: string, data: { [key: string]: any } = {}, permissions: string[] = null) {
		if (permissions.length === 0 && Object.keys(data).length === 0) return

		return databases.updateDocument(this.databaseId, this.collectionId, documentId, data, permissions)
	}

	deleteDocument(documentId: string) {
		return databases.deleteDocument(this.databaseId, this.collectionId, documentId)
	}

	createObserver() {
		const dataStore = writable<Models.Document[]>([])

		client.subscribe(`databases.${this.databaseId}.collections.${this.collectionId}.documents`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.*.create`)) {
				dataStore.update(current => {
					current.push(response.payload)
					return current
				})

				this.subscribeCollectionUpdate(response.payload, dataStore)
			}
		})

		return { subscribe: dataStore.subscribe }
	}

	createSubscriber(queries: string[] = []) {
		const loadingStore = writable(true)
		const dataStore = writable<Models.Document[]>([])

		databases.listDocuments(this.databaseId, this.collectionId, queries).then(data => {
			data.documents.forEach((document) => this.subscribeCollectionUpdate(document, dataStore))

			dataStore.set(data.documents)
			loadingStore.set(false)
		})

		return [{ subscribe: dataStore.subscribe }, { subscribe: loadingStore.subscribe }] as const
	}

	createPaginate(limit: number, queries: string[] = []) {
		const dataStore = writable<Models.Document[]>([])
		const loadingStore = writable(true)
		let offset = 0

		const store = {
			subscribe: dataStore.subscribe,
			async next() {
				const data = await databases.listDocuments(this.databaseId, this.collectionId, [...queries, Query.limit(limit), Query.offset(offset)])
				data.documents.forEach((document) => this.subscribeCollectionUpdate(document, dataStore))

				dataStore.update(current => [...current, ...data.documents])
				offset += limit
			}
		}

		store.next().then(() => loadingStore.set(false))

		return [store, { subscribe: loadingStore.subscribe }] as const
	}

	createInfinityScrollDispatcher(limit: number, queries: string[] = [], observerOptions: IntersectionObserverInit = {}) {
		const dataStore = writable<Models.Document[]>([])
		let lastId: string = null

		databases.listDocuments(this.databaseId, this.collectionId, [...queries, Query.limit(limit)]).then(firstData => {
			dataStore.set(firstData.documents)
			firstData.documents.forEach((document) => this.subscribeCollectionUpdate(document, dataStore))
			lastId = firstData.documents[firstData.documents.length - 1].$id
		})

		const observer = new IntersectionObserver((entries, me) => {
			if (lastId === null) return

			entries.forEach(entry => {
				if (!entry.isIntersecting) return

				databases.listDocuments(this.databaseId, this.collectionId, [...queries, Query.limit(limit), Query.cursorAfter(lastId)]).then((data) => {
					dataStore.update(current => {
						current.push(...data.documents)
						lastId = current[current.length - 1].$id
						return current
					})

					data.documents.forEach((document) => this.subscribeCollectionUpdate(document, dataStore))

					entry.target.dispatchEvent(new CustomEvent('fetch', entry.target as CustomEventInit<HTMLElement>))
				})
			})
		}, observerOptions)

		const directive = (node: HTMLElement) => {
			observer.observe(node)

			return {
				destroy() {
					observer.disconnect()
				}
			}
		}

		return [{ subscribe: dataStore.subscribe }, directive] as const
	}

	protected subscribeCollectionUpdate(document: Models.Document, store: Writable<Models.Document[]>) {
		client.subscribe(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}.delete`)) {
				store.update(current => {
					current.splice(current.indexOf(document), 1)
					return current
				})
				return
			}

			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}.update`)) {
				store.update(current => {
					current[current.indexOf(document)] = response.payload
					return current
				})
				return
			}
		})
	}
}

class Document {
	protected databaseId: string
	protected collectionId: string
	protected documentId: string

	constructor(databaseId: string, collectionId: string, documentId: string)
	constructor(document: Models.Document)
	constructor(databaseId: string | Models.Document, collectionId?: string, documentId?: string) {
		this.databaseId = typeof databaseId === 'string' ? databaseId : databaseId.$database
		this.collectionId = typeof databaseId === 'string' ? collectionId : databaseId.$collection
		this.documentId = typeof databaseId === 'string' ? documentId : databaseId.$id
	}

	createSubscriber() {
		const dataStore = writable<Models.Document>(null)
		const loadingStore = writable(true)

		databases.getDocument(this.databaseId, this.collectionId, this.documentId).then(data => {
			dataStore.set(data)
			loadingStore.set(false)
		})

		client.subscribe(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${this.documentId}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${this.documentId}.update`)) {
				dataStore.set(response.payload)
				return
			}

			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${this.documentId}.delete`)) {
				dataStore.set(null)
				return
			}
		})

		return [{ subscribe: dataStore.subscribe }, { subscribe: loadingStore.subscribe }] as const
	}

	delete() {
		return databases.deleteDocument(this.databaseId, this.collectionId, this.documentId)
	}

	update(data: { [key: string]: any } = {}, permissions: string[] = []) {
		if (permissions.length === 0 && Object.keys(data).length === 0) return

		return databases.updateDocument(this.databaseId, this.collectionId, this.documentId, data, permissions)
	}

	static async create(databaseId: string, collectionId: string, data: { [key: string]: any } = {}, permissions: string[] = []) {
		const created = await databases.createDocument(databaseId, collectionId, ID.unique(), data, permissions)
		return new Document(created)
	}
}

export { Collection, Document, databases }
