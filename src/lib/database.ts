import { get, writable } from 'svelte/store'
import { client } from './settings'
import { Query, Databases, ID } from 'appwrite';

import type { Writable } from 'svelte/store'
import type { Models, RealtimeResponseEvent } from 'appwrite'

const databases = new Databases(client)

class Collection {
	constructor(protected databaseId: string, protected collectionId: string) { }

	createDocument(data: { [key: string]: any } = {}, permissions: string[] = null) {
		return databases.createDocument(this.databaseId, this.collectionId, ID.unique(), data, permissions)
	}

	updateDocument(documentId: string | Models.Document, data: { [key: string]: any } = {}, permissions: string[] = null) {
		return databases.updateDocument(this.databaseId, this.collectionId, typeof documentId === 'string' ? documentId : documentId.$id, data, permissions)
	}

	deleteDocument(documentId: string | Models.Document) {
		return databases.deleteDocument(this.databaseId, this.collectionId, typeof documentId === 'string' ? documentId : documentId.$id)
	}

	subscribeInsert() {
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

	listDocuments(filters: string[] = [], offset: number = 0, limit: number = -1, orderType: 'ASC' | 'DESC' | null = null) {
		const loadingStore = writable(true)
		const dataStore = writable<Models.Document[]>([])

		if(Number.isInteger(offset) === false) throw new TypeError('offset must be a non-negative integer')
		if(offset < 0) throw new TypeError('limit must be a non-negative integer')
		if(Number.isInteger(limit) === false) throw new TypeError('limit must be a non-negative integer or -1')
		if(limit < -1) throw new TypeError('limit must be a non-negative integer or -1')

		const queries = [...filters, Query.offset(offset)]
		if (limit !== -1) queries.push(Query.limit(limit))
		if (orderType) queries.push(orderType === 'ASC' ? Query.orderAsc('') : Query.orderDesc(''))

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
			next: async () => {
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
				return store.update(current => {
					current.splice(current.indexOf(document), 1)
					return current
				})
			}

			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}.update`)) {
				return store.update(current => {
					current[current.indexOf(document)] = response.payload
					return current
				})
			}
		})
	}
}

class Document {
	protected store = writable<Models.Document>(null)
	public subscribe = this.store.subscribe

	constructor(document: Models.Document) {
		this.store.set(document)

		this.on('update', (response) => this.store.set(response))
		this.on('delete', () => this.store.set(undefined))
	}

	delete() {
		const document = this.toDocument()
		if(document === undefined) throw Error('Document doesn\'t exist')
		if (document === null) throw Error('Document is empty or loading')

		return databases.deleteDocument(document.$databaseId, document.$collectionId, document.$id)
	}

	update(data: { [key: string]: any } = {}, permissions: string[] = []) {
		const document = this.toDocument()
		if(document === undefined) throw Error('Document doesn\'t exist')
		if (document === null) throw Error('Document is empty or loading')
		
		return databases.updateDocument(document.$databaseId, document.$collectionId, document.$id, data, permissions)
	}

	on(event: 'update' | 'delete', callback: (data: Models.Document) => void) {
		const document = this.toDocument()
		return client.subscribe(`databases.${document.$databaseId}.collections.${document.$collectionId}.documents.${document.$id}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${document.$databaseId}.collections.${document.$collectionId}.documents.${document.$id}.${event}`)) {
				callback(response.payload)
			}
		})
	}

	toDocument() {
		return get(this.store)
	}

	static fetch(databaseId: string, collectionId: string, documentId: string) {
		const document = new Document(null)
		const loadingStore = writable(true)

		databases.getDocument(databaseId, collectionId, documentId).then(data => {
			document.store.set(data)
			loadingStore.set(false)
		})

		return [document, { subscribe: loadingStore.subscribe }] as const
	}

	static create(databaseId: string, collectionId: string, data: { [key: string]: any } = {}, permissions: string[] = []) {
		const document = new Document(null)
		const loadingStore = writable(true)

		databases.createDocument(databaseId, collectionId, ID.unique(), data, permissions).then(data => {
			document.store.set(data)
			loadingStore.set(false)
		})

		return [document, { subscribe: loadingStore.subscribe }] as const
	}
}

export { Collection, Document, databases }	
