import { Account } from 'appwrite'
import { writable } from 'svelte/store'
import { client } from './settings'

import type { Models, RealtimeResponseEvent } from 'appwrite'
import type { Writable } from 'svelte/store'
import { databases } from './database'

const account = new Account(client)

class Auth {
	protected userStore: Writable<Models.Account<Models.Preferences>>
	protected isLoadingStore = writable(true)

	constructor() {
		client.subscribe('account', (response: RealtimeResponseEvent<any>) => {
			if (response.events.includes('users.*.sessions.*.delete')) {
				return this.userStore.set(null)
			}
		
			if (response.events.includes('users.*.sessions.*.update')) {
				return this.userStore.set(response.payload)
			}
		
			if (response.events.includes('users.*.sessions.*.create')) {
				return account.get().then(data => this.userStore.set(data))
			}
		})

		account.get().then(data => {
			this.userStore.set(data)
			this.isLoadingStore.set(false)
		}).catch(() => this.isLoadingStore.set(false))
	}

	get() {
		return [{ subscribe: this.userStore.subscribe }, { subscribe: this.isLoadingStore.subscribe }] as const
	}
}

export { account, Auth }
