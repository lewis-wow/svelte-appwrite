import { client } from './settings'
import { ID, Storage } from 'appwrite'
import { writable } from 'svelte/store'

import type { Writable } from 'svelte/store'
import type { Models, RealtimeResponseEvent} from 'appwrite'

const storage = new Storage(client)

class Bucket {
	constructor(protected bucketId: string) { }

	createFile(file, permissions: string[] = []) {
		return storage.createFile(this.bucketId, ID.unique(), file, permissions)
	}

	deleteFile(file: string | Models.File) {
		return storage.deleteFile(this.bucketId, typeof file === 'string' ? file : file.$id)
	}

	updateFile(file: string | Models.File, permissions: string[] = []) {
		return storage.updateFile(this.bucketId, typeof file === 'string' ? file : file.$id, permissions)
	}

	getFilePreview(file: string | Models.File) {
		return storage.getFilePreview(this.bucketId, typeof file === 'string' ? file : file.$id)
	}

	getFileDownload(file: string | Models.File) {
		return storage.getFileDownload(this.bucketId, typeof file === 'string' ? file : file.$id)
	}

	getFileView(file: string | Models.File) {
		return storage.getFileView(this.bucketId, typeof file === 'string' ? file : file.$id)
	}

	getFileContent(file: string | Models.File) {
		const fileContent = writable('')
		const loading = writable(true)

		const { href } = storage.getFileView(this.bucketId, typeof file === 'string' ? file : file.$id)

		this.subscribeFileUpdateCallback(file, () => fetch(href).then(res => res.ok ? res.text() : null).then(res => {
			fileContent.set(res ?? '')
			loading.set(false)
		}))

		fetch(href).then(res => res.ok ? res.text() : null).then(res => {
			fileContent.set(res ?? '')
			loading.set(false)
		})

		return [{ subscribe: fileContent.subscribe }, { subscribe: loading.subscribe }] as const
	}

	createUploadDispatcher(acceptManyFiles = false) {
		let files = []

		const eventUploadDirective = (node: HTMLInputElement) => {
			const eventListener = (e) => files = acceptManyFiles ? Array.from(e.target.files) : [e.target.files[0]]

			node.addEventListener('change', eventListener)

			acceptManyFiles && node.setAttribute('multiple', 'multiple')

			return {
				destroy() {
					node.removeEventListener('change', eventListener)
				}
			}
		}

		const dispatchUpload = (permissions: string[] = []) => {
			return Promise.all(files.map(file => this.createFile(file, permissions)))
		}

		return [eventUploadDirective, dispatchUpload] as const
	}

	createSubsciber(queries: string[] = [], search = '') {
		const filesStore = writable<Models.File[]>([])
		const loadingStore = writable(true)

		storage.listFiles(this.bucketId, queries, search).then(({ files }) => {
			files.forEach(file => this.subscribeFileUpdate(file, filesStore))
			filesStore.set(files)
			loadingStore.set(false)
		})

		return [{ subscribe: filesStore.subscribe }, { subscribe: loadingStore.subscribe }] as const
	}

	createObserver() {
		const dataStore = writable<Models.File[]>([])

		client.subscribe(`buckets.${this.bucketId}.files`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`buckets.${this.bucketId}.files.*.create`)) {
				dataStore.update(current => {
					current.push(response.payload)
					return current
				})

				this.subscribeFileUpdate(response.payload, dataStore)
			}
		})

		return { subscribe: dataStore.subscribe }
	}

	protected subscribeFileUpdate(file: Models.File, filesStore: Writable<Models.File[]>) {
		this.subscribeFileUpdateCallback(file, ({ event }) => {
			if (event === 'update') return filesStore.update(current => {
				current[current.indexOf(file)] = file
				return current
			})

			filesStore.update(current => {
				current.splice(current.indexOf(file), 1)
				return current
			})
		})
	}

	protected subscribeFileUpdateCallback(file: string | Models.File, callback: ({ fileId, event }: { fileId: string, event: 'update' | 'delete' }) => any) {
		client.subscribe(`buckets.${this.bucketId}.files.${typeof file === 'string' ? file : file.$id}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`buckets.${this.bucketId}.files.${typeof file === 'string' ? file : file.$id}.update`)) {
				return callback({ fileId: typeof file === 'string' ? file : file.$id, event: 'update' })
			}

			if (response.events.includes(`buckets.${this.bucketId}.files.${typeof file === 'string' ? file : file.$id}.delete`)) {
				return callback({ fileId: typeof file === 'string' ? file : file.$id, event: 'delete' })
			}
		})
	}
}

class File {
	protected bucketId: string
	protected fileId: string

	constructor(bucketId: string, fileId: string)
	constructor(file: Models.File)
	constructor(bucketId: string | Models.File, fileId?: string) {
		this.bucketId = typeof bucketId === 'string' ? bucketId : bucketId.bucketId
		this.fileId = typeof bucketId === 'string' ? fileId : bucketId.$id
	}

	createSubscriber() {
		const fileStore = writable<Models.File>(null)
		const loadingStore = writable(true)

		storage.getFile(this.bucketId, this.fileId).then((result) => {
			fileStore.set(result)
			loadingStore.set(false)
		})

		client.subscribe(`buckets.${this.bucketId}.files.${this.fileId}`, (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes(`buckets.${this.bucketId}.files.${this.fileId}.update`)) {
				fileStore.set(response.payload)
				return
			}

			if (response.events.includes(`buckets.${this.bucketId}.files.${this.fileId}.delete`)) {
				fileStore.set(null)
				return
			}
		})

		return [{ subscribe: fileStore.subscribe }, { subscribe: loadingStore.subscribe }] as const
	}

	delete() {
		return storage.deleteFile(this.bucketId, this.fileId)
	}

	update(permissions: string[] = []) {
		return storage.updateFile(this.bucketId, this.fileId, permissions)
	}

	getPreview() {
		return storage.getFilePreview(this.bucketId, this.fileId)
	}

	getDownload() {
		return storage.getFileDownload(this.bucketId, this.fileId)
	}

	getView() {
		return storage.getFileView(this.bucketId, this.fileId)
	}

	async getContent() {
		const fileContent = writable('')
		const loading = writable(true)

		const { href } = storage.getFileView(this.bucketId, this.fileId)

		fetch(href).then(res => res.ok ? res.text() : null).then(res => {
			fileContent.set(res ?? '')
			loading.set(false)
		})

		return [{ subscribe: fileContent.subscribe }, { subscribe: loading.subscribe }] as const
	}

	static async create(bucketId: string, file, permissions: string[] = []) {
		const created = await storage.createFile(bucketId, ID.unique(), file, permissions)
		return new File(created)
	}
}

export { Bucket, File, storage }
