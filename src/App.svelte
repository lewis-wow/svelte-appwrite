<script>
	import { Collection, setProject } from './lib/main'

	setProject('http://localhost/v1', '639f1cad34056246ee78')

	const collection = new Collection('639f1d0c659b270ff887', '639f1d1d0fedd9292469')

	const [items, loading] = collection.createPaginate(1)

	$: console.log($items, $loading)

	setTimeout(() => {
		items.next()
	}, 2000)
</script>

<main>
	{#each $items as item}
		<div>{item.name}</div>
	{/each}
</main>
