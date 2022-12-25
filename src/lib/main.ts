import { client, teams, functions, locale, avatars } from './settings'
import { account, Auth } from './auth'
import { Collection, Document, databases } from './database'
import { Bucket, File, storage } from './storage'

const setProject = (endpoint: string, projectId: string) => client.setEndpoint(endpoint).setProject(projectId)

export { setProject, client, teams, functions, locale, avatars, account, Auth, databases, storage, Collection, Document, Bucket, File }
