# Svelte + Appwrite

## Database subscribers

```svelte
<script>
  import { Collection } from '$lib/database'
  import { Query } from 'appwrite'

  const collection = new Collection('[database-id]', '[collection-id]')
  const [subscriber, loading] = collection.createSubscriber([Query.limit(5) /*, ...queries */])
  // listen changes (update, delete) in database and automatically rerender on change
  // current data = [{ name: 'John', lastName: 'Doe' }, ...]

  const insertSubscriber = collection.createObserver()
  // listen changes (create) in database and automatically rerender on change

  const [paginator, paginatorInitalLoading] = collection.createPaginate(10, [/* ...queries */])
  // paginate the collection of documents with limit and automatically rerender on change
  // paginator.next() makes the next request for items, paginator store automatically rerender on next load

  const [scrollData, scrollDispatch] = collection.createInfinityScrollDispatcher(10, [/* ...queries */], { /* intersection observer options */ })
  // load next data after scroll to anchor (scrollDispatch) element
</script>

<div>
  {#if $loading}
    <p>Loading data from database...</p>
  {:else}
    {#each [...$subscriber, ...$insertSubscriber] as item}
      <p>{item.name}</p>
    {/each}
  {/if}
</div>

<!-- scroll dispatcher example -->
<div>
  {#each $scrollData as item}
    <p>{item.name}</p>
  {/each}
  <div use:scrollDispatch on:fetch={(e) => console.log(e) /* on every fetch from scroll dispatcher do some action */} />
</div>
```

## Files subscribers

```svelte
<script>
  import { Bucket } from '$lib/storage'
  import { Query } from 'appwrite'

  const bucket = new Bucket('[bucket-id]')
  const [files, loading] = bucket.createSubscriber([Query.limit(5) /*, ...queries */])
  // listen changes (update, delete) in files and automatically rerender on change

  const insertSubscriber = bucket.createObserver()
  // listen changes (create) in files and automatically rerender on change

  const [upload, dispatch] = storage.createUploadDispatcher(/* many files ? true : false, default = false */)

  const [content, loading] = storage.getFileContent('6391f7c70ede82115575')
  // get file content and automatically rerender on file update
</script>

<div>
  <input type="file" use:upload />
  <button on:click={() => dispatch().then(uploadedFile => console.log(uploadedFile))}>Upload</button> 
</div>
```
