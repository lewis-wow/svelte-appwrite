<script>
	import { Collection } from './lib/main'
	import { user } from './lib/auth'

	const collection = new Collection('639f1d0c659b270ff887', '639f1d1d0fedd9292469')

	const [items, loading] = collection.createPaginate(1)

	$: console.log('user: ', $user)

	setTimeout(() => {
		items.next()
	}, 2000)
</script>

<main>
	<div>
		<button on:click={() => user.createAccount('example1@example.com', 'password')}>Register</button>
		<button on:click={() => user.createEmailSession('example@example.com', 'password')}>Login</button>
		<button on:click={() => user.deleteSession('current')}>Logout</button>
	</div>
	<div>
		{#each $items as item}
			<div>{item.name}</div>
		{/each}
	</div>
</main>
