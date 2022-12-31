import { Account, ID } from 'appwrite'
import { derived, writable } from 'svelte/store'
import { client } from './settings'

import type { Models, Client } from 'appwrite'
import type { Writable } from 'svelte/store'

const account = new Account(client)

class User extends Account {
	protected userStore: Writable<Models.Account<Models.Preferences>> = writable(null)
	public subscribe = this.userStore.subscribe

	protected isLoadingStore = writable(true)
	public isLoading = derived(this.isLoadingStore, $isLoadingStore => $isLoadingStore)

	constructor(client: Client) {
		super(client)

		this.__get().then(() => this.isLoadingStore.set(false))

		client.subscribe('account', (response) => {
			if (response.events.includes('users.*.update')) {
				return this.__get()
			}

			if (response.events.includes('users.*.delete')) {
				this.deleteSessions()
				return this.userStore.set(null)
			}
		})
	}

	async createEmailSession(email: string, password: string) {
		const session = await account.createEmailSession(email, password)
		await this.__get()
		return session
	}

	async deleteSession(sessionId: string) {
		const session = await account.deleteSession(sessionId) 
		this.userStore.set(null)
		return session
	}

	async deleteSessions() {
		const session = await account.deleteSessions()
		this.userStore.set(null)
		return session
	}

	async createAccount(email: string, password: string, name: string = null) {
		await account.create(ID.unique(), email, password, name)
	}

	protected async __get() {
		try {
			const user = await account.get()
			this.userStore.set(user)

			return user
		} catch(e) {
			this.userStore.set(null)
			return null
		}
	}
}

const user = new User(client)
const isLoading = user.isLoading

export { account, user, isLoading }
