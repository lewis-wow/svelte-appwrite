import { writable } from 'svelte/store'
import { Query, ID } from 'appwrite';

import type { Writable } from 'svelte/store'
import type { Models, RealtimeResponseEvent, Client, Databases } from 'appwrite'

export default (client: Client, databases: Databases) => class {
	constructor(protected databaseId: string, protected collectionId: string) { }

	createDocument(data: { [key: string]: any } = {}, permissions: string[] = null, id: string = ID.unique()) {
		return databases.createDocument(this.databaseId, this.collectionId, id, data, permissions)
	}

	updateDocument(documentId: string | Models.Document, data: { [key: string]: any } = {}, permissions: string[] = null) {
		return databases.updateDocument(this.databaseId, this.collectionId, typeof documentId === 'string' ? documentId : documentId.$id, data, permissions)
	}

	deleteDocument(documentId: string | Models.Document) {
		return databases.deleteDocument(this.databaseId, this.collectionId, typeof documentId === 'string' ? documentId : documentId.$id)
	}

	listenInsert(filter: (document: Models.Document) => boolean = () => true) {
		const dataStore = writable<Models.Document[]>([])

		client.subscribe(`databases.${this.databaseId}.collections.${this.collectionId}.documents`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.*.create`)) {
				if(filter(response.payload) === false) return

				dataStore.update(current => {
					current.push(response.payload)
					return current
				})

				this.subscribeCollectionUpdate(response.payload, dataStore)
			}
		})

		return { subscribe: dataStore.subscribe }
	}

	getDocument(documentId: string)
	getDocument(filters: string[])
	getDocument(documentId: string | string[]) {
		const store = writable<Models.Document>(null)
		const loading = writable(true)

		if (typeof documentId === 'string') {
			databases.getDocument(this.databaseId, this.collectionId, documentId).then(data => {
				store.set(data)
				loading.set(false)

				this.subscribeCollectionUpdate(data, store)
			})
		} else {
			databases.listDocuments(this.databaseId, this.collectionId, documentId).then(data => {
				if(data.total < 1) throw new Error('Document that matches the query not found')
				if(data.total > 1) throw new Error('Multiple documents found, use listDocuments instead or try to be more specific in your query')

				store.set(data.documents[0])
				loading.set(false)

				this.subscribeCollectionUpdate(data.documents[0], store)
			})
		}

		return [{ subscribe: store.subscribe }, { subscribe: loading.subscribe }] as const
	}

	listDocuments(filters: string[] = [], offset: number = 0, limit: number = -1, orderType: 'ASC' | 'DESC' = null) {
		const loadingStore = writable(true)
		const dataStore = writable<Models.Document[]>([])

		if(Number.isInteger(offset) === false) throw new TypeError('offset must be a non-negative integer')
		if(offset < 0) throw new TypeError('limit must be a non-negative integer')
		if(Number.isInteger(limit) === false) throw new TypeError('limit must be a non-negative integer or -1')
		if(limit < -1) throw new TypeError('limit must be a non-negative integer or -1')

		const queries = [...filters]
		if(offset > 0) queries.push(Query.offset(offset))
		if (limit !== -1) queries.push(Query.limit(limit))
		if (orderType !== null) queries.push(orderType === 'ASC' ? Query.orderAsc('') : Query.orderDesc(''))

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

	protected subscribeCollectionUpdate(document: Models.Document, store: Writable<Models.Document[]>)
	protected subscribeCollectionUpdate(document: Models.Document, store: Writable<Models.Document>)
	protected subscribeCollectionUpdate(document: Models.Document, store: Writable<Models.Document[]> | Writable<Models.Document>) {
		client.subscribe(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}.delete`)) {
				return store.update(current => {
					if(Array.isArray(current) === false) return null

					current.splice(current.indexOf(document), 1)
					return current
				})
			}

			if (response.events.includes(`databases.${this.databaseId}.collections.${this.collectionId}.documents.${document.$id}.update`)) {
				return store.update(current => {
					if(Array.isArray(current) === false) return response.payload

					current[current.indexOf(document)] = response.payload
					return current
				})
			}
		})
	}
}
